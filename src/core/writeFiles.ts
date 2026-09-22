import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { GeneratedFile } from "./types.js";

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 60) || "module";
}

function resolveWithinProject(root: string, relativePath: string): string {
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + "/")) {
    throw new Error(`Refusing to write outside project directory: "${relativePath}"`);
  }
  return target;
}

/**
 * Writes generated files under `baseDir/projectDir`, refusing to write
 * outside that directory even if a (sanitized) path tried to escape it.
 */
export async function writeGeneratedFiles(
  baseDir: string,
  projectDir: string,
  files: GeneratedFile[]
): Promise<string> {
  const root = resolve(baseDir, projectDir);
  for (const file of files) {
    const target = resolveWithinProject(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
  return root;
}

/** Removes files (e.g. ones deleted during a refinement) from a project directory. */
export async function deleteProjectFiles(
  baseDir: string,
  projectDir: string,
  paths: string[]
): Promise<void> {
  const root = resolve(baseDir, projectDir);
  for (const path of paths) {
    const target = resolveWithinProject(root, path);
    await rm(target, { force: true });
  }
}
