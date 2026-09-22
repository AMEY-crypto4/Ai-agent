import { describe, expect, it } from "vitest";
import { parseGeneratedFiles, parseRefinementResponse } from "../src/core/parseResponse.js";

describe("parseGeneratedFiles", () => {
  it("extracts summary and files from a well-formed response", () => {
    const raw = `I built a small greeter module.

### FILE: index.js
console.log("hello");
### END FILE

### FILE: package.json
{
  "name": "greeter"
}
### END FILE
`;

    const result = parseGeneratedFiles(raw);

    expect(result.summary).toBe("I built a small greeter module.");
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toEqual({ path: "index.js", content: 'console.log("hello");' });
    expect(result.files[1].path).toBe("package.json");
    expect(result.files[1].content).toContain('"name": "greeter"');
  });

  it("strips a markdown code fence wrapped around file content", () => {
    const raw = `### FILE: index.js
\`\`\`js
console.log("hi");
\`\`\`
### END FILE
`;
    const result = parseGeneratedFiles(raw);
    expect(result.files[0].content).toBe('console.log("hi");');
  });

  it("throws when no file blocks are present", () => {
    expect(() => parseGeneratedFiles("just some prose, no files")).toThrow(/No files found/);
  });

  it("throws on path traversal attempts", () => {
    const raw = `### FILE: ../../etc/passwd
oops
### END FILE
`;
    expect(() => parseGeneratedFiles(raw)).toThrow(/path traversal/);
  });

  it("throws on absolute-looking duplicate paths", () => {
    const raw = `### FILE: a.js
one
### END FILE

### FILE: a.js
two
### END FILE
`;
    expect(() => parseGeneratedFiles(raw)).toThrow(/Duplicate file path/);
  });

  it("normalizes leading ./ segments", () => {
    const raw = `### FILE: ./src/./index.js
content
### END FILE
`;
    const result = parseGeneratedFiles(raw);
    expect(result.files[0].path).toBe("src/index.js");
  });

  it("refuses to overwrite the reserved metadata file", () => {
    const raw = `### FILE: .agent-meta.json
{}
### END FILE
`;
    expect(() => parseGeneratedFiles(raw)).toThrow(/reserved file/);
  });
});

describe("parseRefinementResponse", () => {
  it("extracts only the changed files plus any deletions", () => {
    const raw = `Added a --pretty flag and removed the old helper.

### FILE: index.js
console.log("updated");
### END FILE

### DELETE FILE: legacy-helper.js
`;
    const result = parseRefinementResponse(raw);

    expect(result.summary).toBe("Added a --pretty flag and removed the old helper.");
    expect(result.upserts).toEqual([{ path: "index.js", content: 'console.log("updated");' }]);
    expect(result.deletes).toEqual(["legacy-helper.js"]);
  });

  it("supports deletion-only responses", () => {
    const raw = `Removing an unused file.

### DELETE FILE: unused.js
`;
    const result = parseRefinementResponse(raw);
    expect(result.upserts).toEqual([]);
    expect(result.deletes).toEqual(["unused.js"]);
  });

  it("throws when a path is both updated and deleted", () => {
    const raw = `### FILE: a.js
new content
### END FILE

### DELETE FILE: a.js
`;
    expect(() => parseRefinementResponse(raw)).toThrow(/both updated and deleted/);
  });

  it("throws when there are no changes at all", () => {
    expect(() => parseRefinementResponse("just prose, nothing to do")).toThrow(/No changes found/);
  });
});
