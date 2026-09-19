import { describe, expect, it } from "vitest";
import { parseGeneratedFiles } from "../src/core/parseResponse.js";

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
});
