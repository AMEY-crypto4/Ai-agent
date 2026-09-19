import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { slugify, writeGeneratedFiles } from "../src/core/writeFiles.js";

describe("slugify", () => {
  it("lowercases and hyphenates arbitrary text", () => {
    expect(slugify("My Cool Module!!")).toBe("my-cool-module");
  });

  it("falls back to 'module' for empty input", () => {
    expect(slugify("   ")).toBe("module");
  });
});

describe("writeGeneratedFiles", () => {
  let base: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "ai-agent-test-"));
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("writes nested files under the project directory", async () => {
    const root = await writeGeneratedFiles(base, "my-project", [
      { path: "src/index.js", content: "console.log(1);" },
      { path: "README.md", content: "# hi" },
    ]);

    expect(await readFile(join(root, "src/index.js"), "utf8")).toBe("console.log(1);");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("# hi");
  });
});
