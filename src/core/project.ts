import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProjectMetadata } from "./types.js";

const META_FILENAME = ".agent-meta.json";
export const PROJECT_ID_RE = /^[a-z0-9-]+$/;

export function isValidProjectId(projectId: string): boolean {
  return PROJECT_ID_RE.test(projectId);
}

function metaPath(baseDir: string, projectId: string): string {
  return resolve(baseDir, projectId, META_FILENAME);
}

export async function saveProject(baseDir: string, meta: ProjectMetadata): Promise<void> {
  const dir = resolve(baseDir, meta.projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(metaPath(baseDir, meta.projectId), JSON.stringify(meta, null, 2), "utf8");
}

export async function loadProject(
  baseDir: string,
  projectId: string
): Promise<ProjectMetadata | null> {
  if (!isValidProjectId(projectId)) return null;
  try {
    const raw = await readFile(metaPath(baseDir, projectId), "utf8");
    return JSON.parse(raw) as ProjectMetadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listProjects(baseDir: string): Promise<ProjectMetadata[]> {
  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const projects = await Promise.all(
    entries.filter(isValidProjectId).map((id) => loadProject(baseDir, id))
  );
  return projects
    .filter((p): p is ProjectMetadata => p !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
