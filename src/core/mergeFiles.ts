import type { GeneratedFile } from "./types.js";

/**
 * Applies upserts and deletes from a refinement turn onto an existing file
 * set, returning the new full file list. Order is preserved for untouched
 * files; changed files keep their original position, new files are appended.
 */
export function mergeFiles(
  existing: GeneratedFile[],
  upserts: GeneratedFile[],
  deletes: string[]
): GeneratedFile[] {
  const deleteSet = new Set(deletes);
  const upsertMap = new Map(upserts.map((f) => [f.path, f]));
  const seen = new Set<string>();

  const merged: GeneratedFile[] = [];
  for (const file of existing) {
    if (deleteSet.has(file.path)) continue;
    const replacement = upsertMap.get(file.path);
    merged.push(replacement ?? file);
    seen.add(file.path);
  }

  for (const file of upserts) {
    if (!seen.has(file.path)) {
      merged.push(file);
    }
  }

  return merged;
}
