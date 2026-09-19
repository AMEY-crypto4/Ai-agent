# Ai-agent

An AI agent that turns a plain-language requirement into a working software module.
Describe what you need — a script, a small service, a CLI tool, a library — and the
agent designs it, writes the code, and hands you back a runnable project. No account
setup, sign-off queue, or built-in usage cap stands between you and the next thing you
want to build.

## How it works

1. You describe a requirement in plain English (CLI argument or the web form).
2. The agent (`src/core/generateModule.ts`) sends it to Claude with a system prompt
   that asks for a short summary plus a complete set of files, each delimited as:
   ```
   ### FILE: relative/path/to/file.ext
   <file content>
   ### END FILE
   ```
3. `src/core/parseResponse.ts` parses that reply into `{ summary, files[] }`,
   rejecting anything that looks like a path-traversal attempt or a duplicate path.
4. The files are written to disk (`src/core/writeFiles.ts`), inside a project folder
   that can't escape the target directory even if a path were malicious.
5. You get the code back — via the CLI, or via the web UI with a per-file viewer and
   a one-click `.zip` download.

There's no multi-turn planning loop yet (each generation is a single request/response
pass) — see "What's not built yet" below for the natural next step.

## Setup

```bash
npm install
cp .env.example .env   # then add your ANTHROPIC_API_KEY
npm run build
```

You need an [Anthropic API key](https://console.anthropic.com/). This project is a
client of the Claude API — it doesn't bundle or proxy a model, so the underlying LLM
usage is billed to whichever API key you configure.

## Usage

### CLI

```bash
npm run cli -- generate "A CLI tool that converts CSV files to JSON, with a --pretty flag"
# or, after `npm run build`:
node dist/cli.js generate "A CLI tool that converts CSV files to JSON" --out ./my-projects --name csv-to-json
```

Generated files are written under `./generated/<slug>` by default.

### Web UI

```bash
npm run dev     # dev server with auto-reload, or `npm run build && npm start`
```

Then open `http://localhost:3000`, describe what you want, click **Generate module**,
browse the generated files, and download them as a zip.

### API

`POST /api/generate` with `{ "requirement": "...", "projectName": "optional-name" }`
returns `{ projectId, summary, files: [{ path, content }] }`. Fetch the finished
project as a zip from `GET /api/download/:projectId`.

## On "unlimited usage"

This app itself imposes **no** rate limiting, request quota, API key gating, or
per-user cap — there's no middleware here that throttles or meters requests, and
`MAX_OUTPUT_TOKENS` in `.env.example` only bounds the size of a single reply, not how
many times you can call it. Nothing artificial in this codebase stands between you and
your next request.

What this app can't do is make the underlying model calls free or infinite: every
generation is a real request to the Anthropic API, billed against whatever
`ANTHROPIC_API_KEY` you configure, and that account's own rate limits and quota still
apply. If you need guaranteed unmetered throughput, that's a plan/billing decision on
the Anthropic account side, not something a wrapper app like this can override.

## Project layout

```
src/
  core/
    types.ts           shared types
    generateModule.ts  builds the prompt, calls the Anthropic API
    parseResponse.ts   parses the model's reply into files (pure, unit-tested)
    writeFiles.ts       writes generated files to disk, path-traversal-safe
  cli.ts                `ai-agent generate "<requirement>"`
  server.ts             Express API + static web UI host
public/                 the web UI (vanilla HTML/CSS/JS, no build step)
test/                   vitest unit tests for the parsing/writing logic
```

## What's not built yet

Reasonable next steps, not included in this first pass:
- **Multi-turn refinement** — ask the agent to adjust a previously generated module
  instead of starting over.
- **Streaming output** — show files as they're generated instead of waiting for the
  full response.
- **Sandboxed execution/testing** of generated code before handing it back.
- **Auth**, if this is ever exposed beyond a trusted user/team, since the server
  currently has none.
