export interface GeneratedFile {
  path: string;
  content: string;
}

/** A parsed model reply for a fresh "create" turn: every file is a full file. */
export interface GenerationResult {
  summary: string;
  files: GeneratedFile[];
  raw: string;
}

/** A parsed model reply for a "refine" turn: only the files that changed. */
export interface RefinementResult {
  summary: string;
  upserts: GeneratedFile[];
  deletes: string[];
  raw: string;
}

export interface GenerateOptions {
  requirement: string;
  projectName?: string;
  model?: string;
  maxTokens?: number;
}

export interface RefineOptions {
  feedback: string;
  model?: string;
  maxTokens?: number;
}

export type ConversationRole = "user" | "assistant";

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export interface ProjectMetadata {
  projectId: string;
  projectName?: string;
  requirement: string;
  model: string;
  summary: string;
  history: ConversationMessage[];
  files: GeneratedFile[];
  createdAt: string;
  updatedAt: string;
}

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "warning"; message: string }
  | {
      type: "done";
      projectId: string;
      summary: string;
      files: GeneratedFile[];
      warnings: string[];
    }
  | { type: "error"; message: string };

export type AgentEventHandler = (event: AgentEvent) => void;
