export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerationResult {
  summary: string;
  files: GeneratedFile[];
  raw: string;
}

export interface GenerateOptions {
  requirement: string;
  projectName?: string;
  model?: string;
  maxTokens?: number;
}
