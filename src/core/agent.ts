import {
  DEFAULT_MODEL,
  buildCreatePrompt,
  buildRefinePrompt,
  buildRepairPrompt,
  callModel,
} from "./generateModule.js";
import { mergeFiles } from "./mergeFiles.js";
import { parseGeneratedFiles, parseRefinementResponse } from "./parseResponse.js";
import { loadProject, saveProject } from "./project.js";
import { validateFiles } from "./validate.js";
import { deleteProjectFiles, slugify, writeGeneratedFiles } from "./writeFiles.js";
import type {
  AgentEventHandler,
  ConversationMessage,
  GeneratedFile,
  GenerateOptions,
  ProjectMetadata,
  RefineOptions,
} from "./types.js";

const MAX_REPAIR_ATTEMPTS = 2;

function noop(): void {}

interface ModelOptions {
  model?: string;
  maxTokens?: number;
}

interface RepairOutcome {
  files: GeneratedFile[];
  deletedPaths: string[];
  warnings: string[];
}

/**
 * Validates the current files and, while any fail a syntax check, sends the
 * errors back to the model and merges its fix — up to MAX_REPAIR_ATTEMPTS
 * times. Validation never executes generated code (see validate.ts); it
 * only parses/compiles it, so this loop can run unattended and safely.
 */
async function repairLoop(
  history: ConversationMessage[],
  startFiles: GeneratedFile[],
  opts: ModelOptions,
  onEvent: AgentEventHandler
): Promise<RepairOutcome> {
  let current = startFiles;
  const deletedPaths: string[] = [];
  const warnings: string[] = [];

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    onEvent({ type: "status", message: "Validating generated files..." });
    const validation = await validateFiles(current);
    if (validation.ok) {
      return { files: current, deletedPaths, warnings };
    }

    const paths = validation.errors.map((e) => e.path).join(", ");
    onEvent({
      type: "status",
      message: `Found syntax issue(s) in ${paths}; asking the agent to fix them (attempt ${attempt}/${MAX_REPAIR_ATTEMPTS})...`,
    });

    const repairPrompt = buildRepairPrompt(validation.errors);
    const raw = await callModel(history, repairPrompt, opts);

    let refinement;
    try {
      refinement = parseRefinementResponse(raw);
    } catch (error) {
      warnings.push(
        `Repair attempt ${attempt} did not produce a usable response (${
          error instanceof Error ? error.message : String(error)
        }); keeping the previous version of the affected file(s).`
      );
      break;
    }

    history.push({ role: "user", content: repairPrompt });
    history.push({ role: "assistant", content: raw });
    current = mergeFiles(current, refinement.upserts, refinement.deletes);
    deletedPaths.push(...refinement.deletes);
  }

  const finalValidation = await validateFiles(current);
  if (!finalValidation.ok) {
    const paths = finalValidation.errors.map((e) => e.path).join(", ");
    warnings.push(
      `${finalValidation.errors.length} file(s) still have syntax issues after ${MAX_REPAIR_ATTEMPTS} repair attempt(s): ${paths}. Review them before running the project.`
    );
  }

  return { files: current, deletedPaths, warnings };
}

export interface RunGenerationOptions extends GenerateOptions {
  baseDir: string;
}

export async function runGeneration(
  options: RunGenerationOptions,
  onEvent: AgentEventHandler = noop
): Promise<ProjectMetadata> {
  const { requirement, projectName, baseDir, model, maxTokens } = options;
  const modelOpts: ModelOptions = { model, maxTokens };

  onEvent({ type: "status", message: "Understanding your requirement..." });
  const createPrompt = buildCreatePrompt(requirement, projectName);
  const history: ConversationMessage[] = [];
  const raw = await callModel(history, createPrompt, modelOpts);

  onEvent({ type: "status", message: "Parsing the generated files..." });
  const parsed = parseGeneratedFiles(raw);
  history.push({ role: "user", content: createPrompt });
  history.push({ role: "assistant", content: raw });

  const repaired = await repairLoop(history, parsed.files, modelOpts, onEvent);

  const projectId = `${slugify(projectName ?? requirement)}-${Date.now().toString(36)}`;
  onEvent({ type: "status", message: `Writing ${repaired.files.length} file(s) to disk...` });
  await writeGeneratedFiles(baseDir, projectId, repaired.files);

  const now = new Date().toISOString();
  const meta: ProjectMetadata = {
    projectId,
    projectName,
    requirement,
    model: model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    summary: parsed.summary,
    history,
    files: repaired.files,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(baseDir, meta);

  for (const warning of repaired.warnings) onEvent({ type: "warning", message: warning });
  onEvent({
    type: "done",
    projectId,
    summary: parsed.summary,
    files: repaired.files,
    warnings: repaired.warnings,
  });

  return meta;
}

export interface RunRefinementOptions extends RefineOptions {
  baseDir: string;
  projectId: string;
}

export async function runRefinement(
  options: RunRefinementOptions,
  onEvent: AgentEventHandler = noop
): Promise<ProjectMetadata> {
  const { baseDir, projectId, feedback, model, maxTokens } = options;
  const modelOpts: ModelOptions = { model, maxTokens };

  const existing = await loadProject(baseDir, projectId);
  if (!existing) {
    throw new Error(`Project not found: "${projectId}"`);
  }

  onEvent({ type: "status", message: "Understanding your feedback..." });
  const refinePrompt = buildRefinePrompt(feedback);
  const history = [...existing.history];
  const raw = await callModel(history, refinePrompt, modelOpts);

  onEvent({ type: "status", message: "Parsing the changes..." });
  const parsed = parseRefinementResponse(raw);
  history.push({ role: "user", content: refinePrompt });
  history.push({ role: "assistant", content: raw });

  const merged = mergeFiles(existing.files, parsed.upserts, parsed.deletes);
  const repaired = await repairLoop(history, merged, modelOpts, onEvent);

  onEvent({ type: "status", message: "Updating files on disk..." });
  const allDeletes = [...new Set([...parsed.deletes, ...repaired.deletedPaths])];
  if (allDeletes.length > 0) {
    await deleteProjectFiles(baseDir, projectId, allDeletes);
  }
  await writeGeneratedFiles(baseDir, projectId, repaired.files);

  const now = new Date().toISOString();
  const meta: ProjectMetadata = {
    ...existing,
    summary: parsed.summary,
    history,
    files: repaired.files,
    updatedAt: now,
  };
  await saveProject(baseDir, meta);

  for (const warning of repaired.warnings) onEvent({ type: "warning", message: warning });
  onEvent({
    type: "done",
    projectId,
    summary: parsed.summary,
    files: repaired.files,
    warnings: repaired.warnings,
  });

  return meta;
}
