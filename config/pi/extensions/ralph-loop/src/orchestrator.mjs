#!/usr/bin/env node
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

export function parseOrchestratorArgs(argv) {
  let mode;
  let spec;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode") {
      mode = argv[++i];
    } else if (arg === "--spec") {
      spec = argv[++i];
    } else {
      throw new Error(`Unexpected Ralph Orchestrator argument: ${arg}`);
    }
  }

  if (mode !== "all" && mode !== "once") throw new Error("Ralph Orchestrator requires --mode all|once.");
  if (!spec) throw new Error("Ralph Orchestrator requires --spec <feature-spec-path>.");
  if (spec.startsWith("-")) throw new Error("Ralph Orchestrator --spec must be a Feature Spec path.");

  return { mode, specPath: resolve(spec) };
}

export async function runOrchestrator(argv = process.argv.slice(2), io = process) {
  const { mode, specPath } = parseOrchestratorArgs(argv);
  await access(specPath, constants.R_OK);

  io.stdout.write(`Ralph Orchestrator\n`);
  io.stdout.write(`mode: ${mode}\n`);
  io.stdout.write(`spec: ${specPath}\n`);
  io.stdout.write("status: launched\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
