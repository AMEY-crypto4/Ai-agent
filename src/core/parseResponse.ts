import type { GeneratedFile, GenerationResult } from "./types.js";

const FILE_BLOCK_RE = /###\s*FILE:\s*(.+?)\s*\n([\s\S]*?)###\s*END FILE\s*(?:\n|$)/g;

function stripCodeFence(content: string): string {
  const fenced = content.match(/^```[^\n]*\n([\s\S]*?)\n?```\s*$/);
  return fenced ? fenced[1] : content;
}

function sanitizeRelativePath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/").trim();
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== ".");

  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Refusing unsafe file path (path traversal): "${rawPath}"`);
  }
  if (segments.length === 0) {
    throw new Error(`Refusing empty file path`);
  }
  return segments.join("/");
}

/**
 * Parses the model's reply into a human-readable summary plus a list of
 * generated files. Expects files delimited as:
 *
 *   ### FILE: path/to/file.ext
 *   <content>
 *   ### END FILE
 *
 * Any prose before the first file block is treated as the summary.
 */
export function parseGeneratedFiles(raw: string): GenerationResult {
  const files: GeneratedFile[] = [];
  const seenPaths = new Set<string>();

  const firstMatchIndex = raw.search(/###\s*FILE:/);
  const summary = (firstMatchIndex === -1 ? raw : raw.slice(0, firstMatchIndex)).trim();

  let match: RegExpExecArray | null;
  FILE_BLOCK_RE.lastIndex = 0;
  while ((match = FILE_BLOCK_RE.exec(raw)) !== null) {
    const path = sanitizeRelativePath(match[1]);
    const content = stripCodeFence(match[2].replace(/\n$/, ""));

    if (seenPaths.has(path)) {
      throw new Error(`Duplicate file path in generated output: "${path}"`);
    }
    seenPaths.add(path);
    files.push({ path, content });
  }

  if (files.length === 0) {
    throw new Error(
      "No files found in the model's response. Expected '### FILE: <path>' blocks."
    );
  }

  return { summary, files, raw };
}
