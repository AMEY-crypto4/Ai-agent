import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ts from "typescript";
import type { GeneratedFile, ValidationError, ValidationResult } from "./types.js";

const execFileAsync = promisify(execFile);
const CHECK_TIMEOUT_MS = 5000;

/**
 * Best-effort, execution-free syntax validation for generated files.
 *
 * This deliberately never *runs* generated code (no `npm install`, no
 * `npm test`, no `python script.py`): doing so would mean executing
 * arbitrary model-generated code on the host, which is a real remote-code-
 * execution risk. Every check here only parses/compiles source to catch
 * syntax errors, the same way `node --check` or `python -m py_compile` do.
 *
 * Languages without a cheap, safe, dependency-free syntax checker (Go,
 * Rust, Java, etc.) are skipped rather than guessed at.
 */
export async function validateFiles(files: GeneratedFile[]): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  for (const file of files) {
    const error = await validateOne(file);
    if (error) errors.push(error);
  }

  return { ok: errors.length === 0, errors };
}

async function validateOne(file: GeneratedFile): Promise<ValidationError | null> {
  const ext = file.path.slice(file.path.lastIndexOf(".")).toLowerCase();

  try {
    if (ext === ".json") {
      JSON.parse(file.content);
      return null;
    }
    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
      return await checkWithNode(file);
    }
    if (ext === ".ts" || ext === ".tsx") {
      return checkTypeScriptSyntax(file);
    }
    if (ext === ".py") {
      return await checkWithPython(file);
    }
    return null;
  } catch (error) {
    return { path: file.path, message: error instanceof Error ? error.message : String(error) };
  }
}

async function checkWithNode(file: GeneratedFile): Promise<ValidationError | null> {
  const dir = await mkdtemp(join(tmpdir(), "ai-agent-check-"));
  try {
    // Checked as ESM regardless of the original extension: ESM syntax is a
    // superset for our purposes (plain scripts are valid ESM too), so this
    // still catches real syntax errors in .js/.cjs files.
    const tempFile = join(dir, "check.mjs");
    await writeFile(tempFile, file.content, "utf8");
    await execFileAsync(process.execPath, ["--check", tempFile], { timeout: CHECK_TIMEOUT_MS });
    return null;
  } catch (error) {
    return { path: file.path, message: cleanNodeError(error) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function cleanNodeError(error: unknown): string {
  const stderr = (error as { stderr?: string })?.stderr;
  if (typeof stderr === "string" && stderr.trim()) {
    return stderr.trim().split("\n").slice(0, 5).join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function checkTypeScriptSyntax(file: GeneratedFile): ValidationError | null {
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
  };
  if (file.path.endsWith(".tsx")) {
    compilerOptions.jsx = ts.JsxEmit.React;
  }

  const result = ts.transpileModule(file.content, {
    compilerOptions,
    reportDiagnostics: true,
  });

  const syntaxErrors = (result.diagnostics ?? []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error
  );
  if (syntaxErrors.length === 0) return null;

  const message = syntaxErrors
    .slice(0, 5)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
    .join("\n");
  return { path: file.path, message };
}

async function checkWithPython(file: GeneratedFile): Promise<ValidationError | null> {
  const dir = await mkdtemp(join(tmpdir(), "ai-agent-check-"));
  try {
    const tempFile = join(dir, "check.py");
    await writeFile(tempFile, file.content, "utf8");
    await execFileAsync("python3", ["-m", "py_compile", tempFile], {
      timeout: CHECK_TIMEOUT_MS,
    });
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // python3 isn't available in this environment; skip rather than fail.
      return null;
    }
    return { path: file.path, message: cleanNodeError(error) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
