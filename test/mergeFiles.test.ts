import { describe, expect, it } from "vitest";
import { mergeFiles } from "../src/core/mergeFiles.js";

describe("mergeFiles", () => {
  const existing = [
    { path: "a.js", content: "old-a" },
    { path: "b.js", content: "old-b" },
  ];

  it("replaces the content of an existing file", () => {
    const result = mergeFiles(existing, [{ path: "a.js", content: "new-a" }], []);
    expect(result).toEqual([
      { path: "a.js", content: "new-a" },
      { path: "b.js", content: "old-b" },
    ]);
  });

  it("appends new files not previously present", () => {
    const result = mergeFiles(existing, [{ path: "c.js", content: "new-c" }], []);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ path: "c.js", content: "new-c" });
  });

  it("removes deleted files", () => {
    const result = mergeFiles(existing, [], ["b.js"]);
    expect(result).toEqual([{ path: "a.js", content: "old-a" }]);
  });

  it("handles a file replaced and others deleted in the same turn", () => {
    const result = mergeFiles(
      existing,
      [{ path: "a.js", content: "new-a" }],
      ["b.js"]
    );
    expect(result).toEqual([{ path: "a.js", content: "new-a" }]);
  });

  it("preserves original ordering for untouched files", () => {
    const threeFiles = [
      { path: "a.js", content: "1" },
      { path: "b.js", content: "2" },
      { path: "c.js", content: "3" },
    ];
    const result = mergeFiles(threeFiles, [{ path: "b.js", content: "2-new" }], []);
    expect(result.map((f) => f.path)).toEqual(["a.js", "b.js", "c.js"]);
  });
});
