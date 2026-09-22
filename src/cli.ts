#!/usr/bin/env node
import "dotenv/config";
import { resolve } from "node:path";
import { Command } from "commander";
import { runGeneration, runRefinement } from "./core/agent.js";
import { listProjects, loadProject } from "./core/project.js";
import type { AgentEvent } from "./core/types.js";

const program = new Command();

function printEvent(event: AgentEvent): void {
  switch (event.type) {
    case "status":
      console.log(`... ${event.message}`);
      break;
    case "warning":
      console.warn(`!!! ${event.message}`);
      break;
    case "error":
      console.error(`Error: ${event.message}`);
      break;
    case "done":
      break;
  }
}

program
  .name("ai-agent")
  .description("Describe what you need in plain language; get a working software module back.")
  .version("1.0.0");

program
  .command("generate")
  .argument("<requirement>", "plain-language description of what to build")
  .option("-o, --out <dir>", "directory to write generated projects into", "./generated")
  .option("-n, --name <name>", "name for the generated project folder")
  .action(async (requirement: string, opts: { out: string; name?: string }) => {
    try {
      const baseDir = resolve(process.cwd(), opts.out);
      const meta = await runGeneration(
        { requirement, projectName: opts.name, baseDir },
        printEvent
      );

      console.log(`\nWrote ${meta.files.length} file(s) to ${resolve(baseDir, meta.projectId)}:`);
      for (const file of meta.files) console.log(`  - ${file.path}`);
      console.log(`\nProject id: ${meta.projectId}`);
      console.log(`Refine it later with: ai-agent refine ${meta.projectId} "<feedback>"`);
    } catch (error) {
      console.error("Generation failed:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program
  .command("refine")
  .argument("<projectId>", "id of a previously generated project")
  .argument("<feedback>", "what you'd like changed")
  .option("-o, --out <dir>", "directory the project was generated into", "./generated")
  .action(async (projectId: string, feedback: string, opts: { out: string }) => {
    try {
      const baseDir = resolve(process.cwd(), opts.out);
      const meta = await runRefinement({ projectId, feedback, baseDir }, printEvent);

      console.log(`\nProject ${meta.projectId} now has ${meta.files.length} file(s):`);
      for (const file of meta.files) console.log(`  - ${file.path}`);
    } catch (error) {
      console.error("Refinement failed:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program
  .command("list")
  .option("-o, --out <dir>", "directory projects were generated into", "./generated")
  .action(async (opts: { out: string }) => {
    const baseDir = resolve(process.cwd(), opts.out);
    const projects = await listProjects(baseDir);
    if (projects.length === 0) {
      console.log(`No projects found under ${baseDir}`);
      return;
    }
    for (const p of projects) {
      console.log(`${p.projectId}  (${p.files.length} files, updated ${p.updatedAt})`);
      console.log(`  ${p.requirement.split("\n")[0].slice(0, 100)}`);
    }
  });

program
  .command("show")
  .argument("<projectId>", "id of a previously generated project")
  .option("-o, --out <dir>", "directory the project was generated into", "./generated")
  .action(async (projectId: string, opts: { out: string }) => {
    const baseDir = resolve(process.cwd(), opts.out);
    const meta = await loadProject(baseDir, projectId);
    if (!meta) {
      console.error(`Project not found: "${projectId}"`);
      process.exitCode = 1;
      return;
    }
    console.log(`Requirement: ${meta.requirement}`);
    console.log(`Model: ${meta.model}`);
    console.log(`Created: ${meta.createdAt}  Updated: ${meta.updatedAt}`);
    console.log(`Files:`);
    for (const file of meta.files) console.log(`  - ${file.path}`);
  });

program.parseAsync(process.argv);
