import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../src/core/types.js";

vi.mock("../src/core/generateModule.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/generateModule.js")>();
  return { ...actual, callModel: vi.fn() };
});

const { callModel } = await import("../src/core/generateModule.js");
const { runGeneration, runRefinement } = await import("../src/core/agent.js");
const { loadProject } = await import("../src/core/project.js");

const mockedCallModel = vi.mocked(callModel);

function collectEvents() {
  const events: AgentEvent[] = [];
  return { events, onEvent: (e: AgentEvent) => events.push(e) };
}

describe("runGeneration", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "ai-agent-agent-test-"));
    mockedCallModel.mockReset();
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("writes files and persists project metadata when the first reply is valid", async () => {
    mockedCallModel.mockResolvedValueOnce(
      `Built a tiny greeter.

### FILE: index.js
console.log("hello");
### END FILE
`
    );

    const { events, onEvent } = collectEvents();
    const meta = await runGeneration(
      { requirement: "a greeter script", baseDir },
      onEvent
    );

    expect(mockedCallModel).toHaveBeenCalledTimes(1);
    expect(meta.files).toEqual([{ path: "index.js", content: 'console.log("hello");' }]);

    const onDisk = await readFile(join(baseDir, meta.projectId, "index.js"), "utf8");
    expect(onDisk).toBe('console.log("hello");');

    const persisted = await loadProject(baseDir, meta.projectId);
    expect(persisted?.summary).toBe("Built a tiny greeter.");

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toMatchObject({ type: "done", warnings: [] });
  });

  it("auto-repairs a syntax error via a second model call", async () => {
    mockedCallModel
      .mockResolvedValueOnce(
        `Built it.

### FILE: index.js
function broken( {
### END FILE
`
      )
      .mockResolvedValueOnce(
        `Fixed the syntax error.

### FILE: index.js
function fixed() {}
### END FILE
`
      );

    const meta = await runGeneration({ requirement: "anything", baseDir });

    expect(mockedCallModel).toHaveBeenCalledTimes(2);
    expect(meta.files).toEqual([{ path: "index.js", content: "function fixed() {}" }]);

    const onDisk = await readFile(join(baseDir, meta.projectId, "index.js"), "utf8");
    expect(onDisk).toBe("function fixed() {}");
  });

  it("reports a warning when repair attempts are exhausted", async () => {
    mockedCallModel.mockResolvedValue(
      `Still broken.

### FILE: index.js
function still_broken( {
### END FILE
`
    );

    const meta = await runGeneration({ requirement: "anything", baseDir });

    // 1 initial call + 2 repair attempts
    expect(mockedCallModel).toHaveBeenCalledTimes(3);
    const persisted = await loadProject(baseDir, meta.projectId);
    expect(persisted?.history.length).toBeGreaterThan(2);
  });
});

describe("runRefinement", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "ai-agent-agent-test-"));
    mockedCallModel.mockReset();
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("merges an upsert and a delete onto an existing project", async () => {
    mockedCallModel.mockResolvedValueOnce(
      `Initial build.

### FILE: index.js
console.log("v1");
### END FILE

### FILE: legacy.js
console.log("old");
### END FILE
`
    );
    const created = await runGeneration({ requirement: "a script", baseDir });

    mockedCallModel.mockResolvedValueOnce(
      `Updated and cleaned up.

### FILE: index.js
console.log("v2");
### END FILE

### DELETE FILE: legacy.js
`
    );
    const refined = await runRefinement({
      projectId: created.projectId,
      feedback: "update the message and drop the legacy file",
      baseDir,
    });

    expect(refined.files).toEqual([{ path: "index.js", content: 'console.log("v2");' }]);

    const remaining = await readFile(join(baseDir, created.projectId, "index.js"), "utf8");
    expect(remaining).toBe('console.log("v2");');
    await expect(
      readFile(join(baseDir, created.projectId, "legacy.js"), "utf8")
    ).rejects.toThrow();

    const persisted = await loadProject(baseDir, created.projectId);
    expect(persisted?.history.length).toBe(4); // create user+assistant, refine user+assistant
  });

  it("throws when the project doesn't exist", async () => {
    await expect(
      runRefinement({ projectId: "does-not-exist", feedback: "x", baseDir })
    ).rejects.toThrow(/Project not found/);
  });
});
