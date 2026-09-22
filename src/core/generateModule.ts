import Anthropic from "@anthropic-ai/sdk";
import type { ConversationMessage, ValidationError } from "./types.js";

export const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_MAX_TOKENS = 8192;

export const SYSTEM_PROMPT = `You are a senior software engineer acting as an autonomous build agent.
A non-technical or technical user will describe something they want built, in plain language, and
may later ask for changes. Your job is to understand the requirement and produce a complete,
working software module that satisfies it — without asking the user any follow-up questions. Make
reasonable assumptions and state them briefly.

There are three kinds of turns in this conversation, and your reply format depends on which one
you are handling:

1. INITIAL BUILD — the user describes what they want for the first time. Reply with a short
   plain-language summary, then every file the module needs, each in exactly this format:

   ### FILE: relative/path/to/file.ext
   <the complete file content, no markdown code fences>
   ### END FILE

   Include everything needed to run the module: source code, a minimal README with run
   instructions, and a dependency manifest (e.g. package.json, requirements.txt) if applicable.
   Prefer small, dependency-light, self-contained solutions unless the requirement clearly calls
   for a specific framework.

2. REFINEMENT — the user asks for a change to a module you already built (you'll see the prior
   turns in this conversation). Reply with a short plain-language summary of what changed, then
   ONLY the files that are new or changed, using the same "### FILE: <path>" / "### END FILE"
   format as above (full new content for each such file — not a diff). If a file should be
   removed, add a line "### DELETE FILE: <path>" instead of a FILE block for it. Do not repeat
   files that did not change.

3. REPAIR — you'll be told that specific files failed a syntax check, with the error for each.
   Reply with a short summary, then corrected full versions of ONLY the broken files, using the
   same "### FILE: <path>" / "### END FILE" format. Do not repeat files that were not broken.

General rules for every turn:
- Write real, complete, runnable code — no placeholders like "TODO" or "implement this later".
- Do not include any file paths that start with "/" or contain "..".
- Do not wrap file contents in markdown code fences inside the FILE blocks.`;

export function buildCreatePrompt(requirement: string, projectName?: string): string {
  const name = projectName ? `\n\nSuggested project/module name: ${projectName}` : "";
  return `Build the following as a software module:\n\n${requirement}${name}`;
}

export function buildRefinePrompt(feedback: string): string {
  return `Please make the following change to the module you built:\n\n${feedback}`;
}

export function buildRepairPrompt(errors: ValidationError[]): string {
  const list = errors
    .map((e) => `- ${e.path}:\n${e.message}`)
    .join("\n\n");
  return `The following file(s) failed a syntax check. Please fix them.\n\n${list}`;
}

export interface AnthropicClientOptions {
  apiKey?: string;
}

export function createClient(options: AnthropicClientOptions = {}): Anthropic {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your Anthropic API key."
    );
  }
  return new Anthropic({ apiKey });
}

export interface CallModelOptions {
  model?: string;
  maxTokens?: number;
}

/**
 * Sends the conversation so far plus a new user message to Claude and
 * returns the raw assistant reply text. Does not mutate `history` — the
 * caller decides whether/how to append the turn once it has parsed the
 * reply successfully.
 */
export async function callModel(
  history: ConversationMessage[],
  newUserMessage: string,
  options: CallModelOptions = {},
  client: Anthropic = createClient()
): Promise<string> {
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const maxTokens =
    options.maxTokens ?? Number(process.env.MAX_OUTPUT_TOKENS ?? DEFAULT_MAX_TOKENS);

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [...history, { role: "user", content: newUserMessage }],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
