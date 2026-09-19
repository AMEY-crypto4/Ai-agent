import Anthropic from "@anthropic-ai/sdk";
import { parseGeneratedFiles } from "./parseResponse.js";
import type { GenerateOptions, GenerationResult } from "./types.js";

const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_MAX_TOKENS = 8192;

const SYSTEM_PROMPT = `You are a senior software engineer acting as an autonomous build agent.
A non-technical or technical user will describe something they want built, in plain language.
Your job is to understand the requirement and produce a complete, working software module that
satisfies it — without asking the user any follow-up questions. Make reasonable assumptions and
state them briefly.

Rules for your reply:
1. Start with a short plain-language summary (a few sentences) of what you built and any
   assumptions you made.
2. Then output every file the module needs, each in exactly this format:

### FILE: relative/path/to/file.ext
<the complete file content, no markdown code fences>
### END FILE

3. Include everything needed to run the module: source code, a minimal README with run
   instructions, and a dependency manifest (e.g. package.json, requirements.txt) if applicable.
   Prefer small, dependency-light, self-contained solutions unless the requirement clearly calls
   for a specific framework.
4. Write real, complete, runnable code — no placeholders like "TODO" or "implement this later".
5. Do not include any file paths that start with "/" or contain "..".
6. Do not wrap file contents in markdown code fences inside the FILE blocks.`;

function buildUserPrompt(requirement: string, projectName?: string): string {
  const name = projectName ? `\n\nSuggested project/module name: ${projectName}` : "";
  return `Build the following as a software module:\n\n${requirement}${name}`;
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

export async function generateModule(
  options: GenerateOptions,
  client: Anthropic = createClient()
): Promise<GenerationResult> {
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const maxTokens =
    options.maxTokens ?? Number(process.env.MAX_OUTPUT_TOKENS ?? DEFAULT_MAX_TOKENS);

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(options.requirement, options.projectName),
      },
    ],
  });

  const raw = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return parseGeneratedFiles(raw);
}
