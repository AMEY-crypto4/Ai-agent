# Ai-agent

An AI agent that turns a plain-language requirement into a working software module.
Describe what you need — a script, a small service, a CLI tool, a library — and the
agent designs it, writes the code, checks it for syntax errors, fixes what it finds,
and hands you back a runnable project. Then keep talking to it: ask for changes and it
refines the same project instead of starting over. No account setup, sign-off queue, or
built-in usage cap stands between you and the next thing you want to build.

## How it works

1. You describe a requirement in plain English (CLI argument or the web form).
2. The agent (`src/core/agent.ts`) sends it to Claude with a system prompt that asks
   for a short summary plus a complete set of files, each delimited as:
   ```
   ### FILE: relative/path/to/file.ext
   <file content>
   ### END FILE
   ```
3. `src/core/parseResponse.ts` parses that reply, rejecting anything that looks like a
   path-traversal attempt or a duplicate path.
4. `src/core/validate.ts` syntax-checks the result (JS/TS/JSON/Python) — see
   **Self-repair, safely** below. If anything fails, the agent sends the error back to
   Claude and merges the fix, up to two attempts, before giving up and telling you what's
   still broken.
5. The files are written to disk (`src/core/writeFiles.ts`), inside a project folder
   that can't escape the target directory even if a path were malicious, and the
   conversation + file state are persisted as project metadata so you can come back
   and refine it later.
6. You get the code back — via the CLI, or via the web UI with live progress, a
   per-file viewer, and a one-click `.zip` download.
7. **Refine it**: describe a change (CLI `refine` command, or the web UI's "Ask the
   agent to change something" box) and the agent replies with only what changed —
   updated/new files plus any deletions — which get merged onto the existing project,
   validated, and repaired the same way.

## Self-repair, safely

The agent validates its own output and asks itself to fix mistakes — but it never
*executes* generated code to do that. Running arbitrary model-written code (`npm
install`, `npm test`, `python script.py`, ...) on the host would be a real remote-code-
execution risk, especially with no usage cap gating who can trigger a generation. So
`validate.ts` only ever parses/compiles:
- `node --check` for `.js`/`.mjs`/`.cjs` — syntax only, does not run the file.
- the TypeScript compiler's `transpileModule` (syntactic diagnostics only) for `.ts`/`.tsx`.
- `JSON.parse` for `.json`.
- `python3 -m py_compile` for `.py` — compiles without executing.

Other languages (Go, Rust, Java, ...) are skipped rather than guessed at. This catches
real syntax mistakes (the most common thing a model gets wrong) without ever running
untrusted code. True behavioral testing would need an actual sandbox (a locked-down
container/VM) and is intentionally left out — see "What's not built yet".

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
node dist/cli.js generate "A CLI tool that converts CSV files to JSON" --name csv-to-json
node dist/cli.js refine csv-to-json-abc123 "Also support semicolon-separated files"
node dist/cli.js list
node dist/cli.js show csv-to-json-abc123
```

Generated files are written under `./generated/<slug>-<id>` by default (`--out` to
change the base directory).

### Web UI

```bash
npm run dev     # dev server with auto-reload, or `npm run build && npm start`
```

Then open `http://localhost:3000`, describe what you want, and watch the agent's
progress stream in live. Once it's done, browse the files, download the zip, ask for a
change in the refine box, or reopen any past project from the sidebar.

### API

- `POST /api/generate` `{ requirement, projectName? }` → project JSON (non-streaming).
- `GET /api/generate/stream?requirement=...&projectName=...` → Server-Sent Events
  (`status` / `warning` / `done` / `error`) ending in a `done` event with the project.
- `POST /api/projects/:id/refine` `{ feedback }` → updated project JSON.
- `GET /api/projects/:id/refine/stream?feedback=...` → same SSE shape as generation.
- `GET /api/projects` → list of past projects. `GET /api/projects/:id` → one project.
- `GET /api/download/:id` → the project as a `.zip`.

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
    types.ts           shared types (events, project metadata, conversation messages)
    generateModule.ts  system prompt, prompt builders, the raw Claude API call
    agent.ts            orchestration: create/refine turns, the self-repair loop, events
    parseResponse.ts    parses model replies into files / upserts+deletes (unit-tested)
    mergeFiles.ts        applies a refinement's upserts/deletes onto an existing file set
    validate.ts          execution-free syntax validation (JS/TS/JSON/Python)
    project.ts            per-project metadata persistence (.agent-meta.json)
    writeFiles.ts         writes/deletes generated files on disk, path-traversal-safe
  cli.ts                `ai-agent generate|refine|list|show`
  server.ts             Express API (streaming + non-streaming) + static web UI host
public/                 the web UI (vanilla HTML/CSS/JS, no build step)
test/                   vitest unit + mocked-integration tests (no network calls)
```

## What's not built yet

Reasonable next steps, not included so far:
- **Sandboxed execution/testing** of generated code (actually running `npm test`, etc.)
  in a locked-down container — deliberately not attempted here, see "Self-repair,
  safely" above.
- **Auth**, if this is ever exposed beyond a trusted user/team, since the server
  currently has none.
- Model-driven **multi-file dependency awareness** across a large refinement history
  (today the whole prior conversation is replayed to Claude each turn, which is simple
  and correct but not token-efficient for long-lived, many-turn projects).
