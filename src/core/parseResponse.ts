import type { GeneratedFile, GenerationResult, RefinementResult } from "./types.js";

const FILE_BLOCK_RE = /###\s*FILE:\s*(.+?)\s*\n([\s\S]*?)###\s*END FILE\s*(?:\n|$)/g;
const DELETE_LINE_RE = /###\s*DELETE FILE:\s*(.+?)\s*(?:\n|$)/g;
const ANY_DIRECTIVE_RE = /###\s*(FILE|DELETE FILE):/;

function stripCodeFence(content: string): string {
  const fenced = content.match(/^```[^\n]*\n([\s\S]*?)\n?```\s*$/);
  return fenced ? fenced[1] : content;
}

export function sanitizeRelativePath(rawPath: string): string {
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
  const joined = segments.join("/");
  if (joined === ".agent-meta.json") {
    throw new Error(`Refusing to overwrite reserved file: "${joined}"`);
  }
  return joined;
}

function extractSummary(raw: string): string {
  const firstMatchIndex = raw.search(ANY_DIRECTIVE_RE);
  return (firstMatchIndex === -1 ? raw : raw.slice(0, firstMatchIndex)).trim();
}

function extractFileBlocks(raw: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const seenPaths = new Set<string>();

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
  return files;
}

function extractDeleteLines(raw: string): string[] {
  const withoutFileBlocks = raw.replace(FILE_BLOCK_RE, "");
  const paths: string[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  DELETE_LINE_RE.lastIndex = 0;
  while ((match = DELETE_LINE_RE.exec(withoutFileBlocks)) !== null) {
    const path = sanitizeRelativePath(match[1]);
    if (seen.has(path)) {
      throw new Error(`Duplicate delete directive for path: "${path}"`);
    }
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

/**
 * Parses a "create" turn's reply into a human-readable summary plus the full
 * list of generated files. Expects files delimited as:
 *
 *   ### FILE: path/to/file.ext
 *   <content>
 *   ### END FILE
 *
 * Any prose before the first file block is treated as the summary.
 */
export function parseGeneratedFiles(raw: string): GenerationResult {
  const summary = extractSummary(raw);
  const files = extractFileBlocks(raw);

  if (files.length === 0) {
    throw new Error(
      "No files found in the model's response. Expected '### FILE: <path>' blocks."
    );
  }

  return { summary, files, raw };
}

/**
 * Parses a "refine" turn's reply into a summary, the files that were added
 * or changed (full new content each), and the paths that should be deleted,
 * marked as:
 *
 *   ### DELETE FILE: path/to/old-file.ext
 */
export function parseRefinementResponse(raw: string): RefinementResult {
  const summary = extractSummary(raw);
  const upserts = extractFileBlocks(raw);
  const deletes = extractDeleteLines(raw);

  const upsertPaths = new Set(upserts.map((f) => f.path));
  const overlap = deletes.filter((path) => upsertPaths.has(path));
  if (overlap.length > 0) {
    throw new Error(`File(s) both updated and deleted in the same response: ${overlap.join(", ")}`);
  }

  if (upserts.length === 0 && deletes.length === 0) {
    throw new Error(
      "No changes found in the model's response. Expected '### FILE:' or '### DELETE FILE:' directives."
    );
  }

  return { summary, upserts, deletes, raw };
}
