import "dotenv/config";
import type { Response } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import archiver from "archiver";
import cors from "cors";
import express from "express";
import { runGeneration, runRefinement } from "./core/agent.js";
import { isValidProjectId, listProjects, loadProject } from "./core/project.js";
import type { AgentEvent, ProjectMetadata } from "./core/types.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const GENERATED_DIR = resolve(process.cwd(), "generated");
const MAX_QUERY_LENGTH = 8000;

// No auth, no request quota, and no rate-limiting middleware is registered here
// by design: this app does not impose its own usage cap. Real-world usage is
// still bounded by whatever limits apply to the ANTHROPIC_API_KEY you provide.
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(resolve(process.cwd(), "public")));

function toPublicProject(meta: ProjectMetadata) {
  const { history: _history, ...rest } = meta;
  return rest;
}

function sendSSE(res: Response, event: AgentEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function startStream(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

// --- Non-streaming JSON API (simple to script against) ---------------------

app.post("/api/generate", async (req, res) => {
  const requirement = typeof req.body?.requirement === "string" ? req.body.requirement.trim() : "";
  const projectName =
    typeof req.body?.projectName === "string" ? req.body.projectName.trim() : undefined;

  if (!requirement) {
    res.status(400).json({ error: "Field 'requirement' (non-empty string) is required." });
    return;
  }

  try {
    const meta = await runGeneration({ requirement, projectName, baseDir: GENERATED_DIR });
    res.json(toPublicProject(meta));
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Generation failed." });
  }
});

app.post("/api/projects/:projectId/refine", async (req, res) => {
  const { projectId } = req.params;
  const feedback = typeof req.body?.feedback === "string" ? req.body.feedback.trim() : "";

  if (!isValidProjectId(projectId)) {
    res.status(400).json({ error: "Invalid project id." });
    return;
  }
  if (!feedback) {
    res.status(400).json({ error: "Field 'feedback' (non-empty string) is required." });
    return;
  }

  try {
    const meta = await runRefinement({ projectId, feedback, baseDir: GENERATED_DIR });
    res.json(toPublicProject(meta));
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Refinement failed." });
  }
});

// --- Streaming API (live progress, used by the web UI) ---------------------

app.get("/api/generate/stream", async (req, res) => {
  const requirement = typeof req.query.requirement === "string" ? req.query.requirement.trim() : "";
  const projectName =
    typeof req.query.projectName === "string" ? req.query.projectName.trim() : undefined;

  if (!requirement || requirement.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ error: "Field 'requirement' (1-8000 chars) is required." });
    return;
  }

  startStream(res);
  try {
    await runGeneration({ requirement, projectName, baseDir: GENERATED_DIR }, (event) =>
      sendSSE(res, event)
    );
  } catch (error) {
    console.error(error);
    sendSSE(res, {
      type: "error",
      message: error instanceof Error ? error.message : "Generation failed.",
    });
  } finally {
    res.end();
  }
});

app.get("/api/projects/:projectId/refine/stream", async (req, res) => {
  const { projectId } = req.params;
  const feedback = typeof req.query.feedback === "string" ? req.query.feedback.trim() : "";

  if (!isValidProjectId(projectId)) {
    res.status(400).json({ error: "Invalid project id." });
    return;
  }
  if (!feedback || feedback.length > MAX_QUERY_LENGTH) {
    res.status(400).json({ error: "Field 'feedback' (1-8000 chars) is required." });
    return;
  }

  startStream(res);
  try {
    await runRefinement({ projectId, feedback, baseDir: GENERATED_DIR }, (event) =>
      sendSSE(res, event)
    );
  } catch (error) {
    console.error(error);
    sendSSE(res, {
      type: "error",
      message: error instanceof Error ? error.message : "Refinement failed.",
    });
  } finally {
    res.end();
  }
});

// --- Project browsing --------------------------------------------------------

app.get("/api/projects", async (_req, res) => {
  const projects = await listProjects(GENERATED_DIR);
  res.json(projects.map(toPublicProject));
});

app.get("/api/projects/:projectId", async (req, res) => {
  const { projectId } = req.params;
  if (!isValidProjectId(projectId)) {
    res.status(400).json({ error: "Invalid project id." });
    return;
  }
  const meta = await loadProject(GENERATED_DIR, projectId);
  if (!meta) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  res.json(toPublicProject(meta));
});

app.get("/api/download/:projectId", (req, res) => {
  const { projectId } = req.params;
  if (!isValidProjectId(projectId)) {
    res.status(400).json({ error: "Invalid project id." });
    return;
  }

  const projectDir = resolve(GENERATED_DIR, projectId);
  if (!existsSync(projectDir)) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  res.attachment(`${projectId}.zip`);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => res.status(500).end(String(err)));
  archive.pipe(res);
  // dot:true includes legitimate dotfiles the agent generated (.gitignore, .env.example, ...);
  // ignore excludes only our own internal bookkeeping file.
  archive.glob("**/*", { cwd: projectDir, dot: true, ignore: [".agent-meta.json"] });
  archive.finalize();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`AI agent server listening on http://localhost:${PORT}`);
});
