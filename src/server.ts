import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import archiver from "archiver";
import cors from "cors";
import express from "express";
import { generateModule } from "./core/generateModule.js";
import { slugify, writeGeneratedFiles } from "./core/writeFiles.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const GENERATED_DIR = resolve(process.cwd(), "generated");
const PROJECT_ID_RE = /^[a-z0-9-]+$/;

// No auth, no request quota, and no rate-limiting middleware is registered here
// by design: this app does not impose its own usage cap. Real-world usage is
// still bounded by whatever limits apply to the ANTHROPIC_API_KEY you provide.
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(resolve(process.cwd(), "public")));

app.post("/api/generate", async (req, res) => {
  const requirement = typeof req.body?.requirement === "string" ? req.body.requirement.trim() : "";
  const projectNameInput =
    typeof req.body?.projectName === "string" ? req.body.projectName.trim() : undefined;

  if (!requirement) {
    res.status(400).json({ error: "Field 'requirement' (non-empty string) is required." });
    return;
  }

  try {
    const result = await generateModule({ requirement, projectName: projectNameInput });
    const projectId = `${slugify(projectNameInput ?? requirement)}-${Date.now().toString(36)}`;
    await writeGeneratedFiles(GENERATED_DIR, projectId, result.files);

    res.json({
      projectId,
      summary: result.summary,
      files: result.files,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Generation failed.";
    res.status(502).json({ error: message });
  }
});

app.get("/api/download/:projectId", (req, res) => {
  const { projectId } = req.params;
  if (!PROJECT_ID_RE.test(projectId)) {
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
  archive.directory(projectDir, false);
  archive.finalize();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`AI agent server listening on http://localhost:${PORT}`);
});
