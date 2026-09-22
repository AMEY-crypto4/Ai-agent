import { describe, expect, it } from "vitest";
import { validateFiles } from "../src/core/validate.js";

describe("validateFiles", () => {
  it("passes well-formed JS, TS, and JSON files", async () => {
    const result = await validateFiles([
      { path: "index.js", content: "console.log('hi');\nexport default 1;" },
      { path: "types.ts", content: "export interface Foo {\n  bar: number;\n}" },
      { path: "package.json", content: '{\n  "name": "x"\n}' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("flags a JS syntax error", async () => {
    const result = await validateFiles([{ path: "broken.js", content: "function f( {" }]);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe("broken.js");
  });

  it("flags invalid JSON", async () => {
    const result = await validateFiles([{ path: "bad.json", content: "{ not valid" }]);
    expect(result.ok).toBe(false);
    expect(result.errors[0].path).toBe("bad.json");
  });

  it("flags a TypeScript syntax error", async () => {
    const result = await validateFiles([
      { path: "broken.ts", content: "function f(x: number {" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0].path).toBe("broken.ts");
  });

  it("skips files with no known checker (e.g. Go)", async () => {
    const result = await validateFiles([{ path: "main.go", content: "not even close to go(" }]);
    expect(result.ok).toBe(true);
  });

  it("never executes the file content it checks", async () => {
    const marker = "AI_AGENT_TEST_SIDE_EFFECT";
    // If this ever ran instead of just parsing, it would throw and fail the test loudly.
    const result = await validateFiles([
      { path: "would-explode.js", content: `throw new Error("${marker}");` },
    ]);
    expect(result.ok).toBe(true);
  });
});
