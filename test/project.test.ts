import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isValidProjectId, listProjects, loadProject, saveProject } from "../src/core/project.js";
import type { ProjectMetadata } from "../src/core/types.js";

function makeMeta(overrides: Partial<ProjectMetadata> = {}): ProjectMetadata {
  const now = new Date().toISOString();
  return {
    projectId: "demo-project",
    requirement: "build a demo",
    model: "claude-sonnet-5",
    summary: "Built a demo.",
    history: [],
    files: [{ path: "index.js", content: "console.log(1);" }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("isValidProjectId", () => {
  it("accepts lowercase-alphanumeric-hyphen ids", () => {
    expect(isValidProjectId("my-project-1a2b")).toBe(true);
  });

  it("rejects ids with path separators or uppercase", () => {
    expect(isValidProjectId("../etc")).toBe(false);
    expect(isValidProjectId("My-Project")).toBe(false);
  });
});

describe("project persistence", () => {
  let base: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "ai-agent-project-test-"));
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("round-trips a saved project", async () => {
    const meta = makeMeta();
    await saveProject(base, meta);
    const loaded = await loadProject(base, meta.projectId);
    expect(loaded).toEqual(meta);
  });

  it("returns null for a project that doesn't exist", async () => {
    const loaded = await loadProject(base, "does-not-exist");
    expect(loaded).toBeNull();
  });

  it("returns null (not a throw) for an unsafe project id", async () => {
    const loaded = await loadProject(base, "../escape");
    expect(loaded).toBeNull();
  });

  it("lists saved projects newest-updated first", async () => {
    await saveProject(base, makeMeta({ projectId: "older", updatedAt: "2024-01-01T00:00:00.000Z" }));
    await saveProject(base, makeMeta({ projectId: "newer", updatedAt: "2024-06-01T00:00:00.000Z" }));

    const projects = await listProjects(base);
    expect(projects.map((p) => p.projectId)).toEqual(["newer", "older"]);
  });

  it("returns an empty list when the base directory doesn't exist yet", async () => {
    const projects = await listProjects(join(base, "nope"));
    expect(projects).toEqual([]);
  });
});
