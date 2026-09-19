#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { generateModule } from "./core/generateModule.js";
import { slugify, writeGeneratedFiles } from "./core/writeFiles.js";

const program = new Command();

program
  .name("ai-agent")
  .description("Describe what you need in plain language; get a working software module back.")
  .version("1.0.0");

program
  .command("generate")
  .argument("<requirement>", "plain-language description of what to build")
  .option("-o, --out <dir>", "directory to write the generated project into", "./generated")
  .option("-n, --name <name>", "name for the generated project folder")
  .action(async (requirement: string, opts: { out: string; name?: string }) => {
    try {
      console.log("Understanding your requirement and building the module...\n");
      const result = await generateModule({
        requirement,
        projectName: opts.name,
      });

      const projectDir = slugify(opts.name ?? requirement);
      const root = await writeGeneratedFiles(opts.out, projectDir, result.files);

      console.log(result.summary);
      console.log(`\nWrote ${result.files.length} file(s) to ${root}:`);
      for (const file of result.files) {
        console.log(`  - ${file.path}`);
      }
    } catch (error) {
      console.error("Generation failed:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
