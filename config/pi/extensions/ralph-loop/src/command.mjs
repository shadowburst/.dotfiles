import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ORCHESTRATOR_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "orchestrator.mjs");

export function parseSpecArgument(rawArgs) {
  const args = tokenizeSinglePath(rawArgs ?? "");
  if (args.length !== 1) {
    throw new Error("Usage: /ralph <feature-spec-path> or /ralph:once <feature-spec-path>");
  }

  const specPath = args[0];
  if (specPath.startsWith("-")) {
    throw new Error("Ralph commands accept only a Feature Spec path; flags are not supported.");
  }

  return specPath;
}

export function createRalphCommand({ mode, orchestratorPath = ORCHESTRATOR_PATH, spawnProcess = spawn, cwd = process.cwd, nodePath = process.execPath } = {}) {
  if (mode !== "all" && mode !== "once") throw new Error(`Unsupported Ralph mode: ${mode}`);

  return async function runRalph(rawArgs, ctx = {}) {
    const specArg = parseSpecArgument(rawArgs);
    const workingDirectory = cwd();
    const specPath = resolve(workingDirectory, specArg);

    await access(specPath, constants.R_OK);

    ctx.ui?.notify?.(`Launching Ralph Orchestrator for ${specArg}`, "info");
    const result = await launchRalphOrchestrator({ mode, specPath, orchestratorPath, spawnProcess, cwd: workingDirectory, nodePath });
    const output = formatProcessOutput(result);

    if (result.exitCode !== 0) {
      throw new Error(output || `Ralph Orchestrator exited with status ${result.exitCode}`);
    }

    const message = output || `Ralph Orchestrator launched for ${specArg}.`;
    ctx.ui?.notify?.("Ralph Orchestrator finished", "success");
    return message;
  };
}

export function launchRalphOrchestrator({ mode, specPath, orchestratorPath = ORCHESTRATOR_PATH, spawnProcess = spawn, cwd = process.cwd(), nodePath = process.execPath }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnProcess(nodePath, [orchestratorPath, "--mode", mode, "--spec", specPath], {
      cwd,
      env: { ...process.env, PI_RALPH_MODE: mode, PI_RALPH_SPEC: specPath, PI_RALPH_INTERACTIVE: process.stdout.isTTY ? "1" : "0" },
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolvePromise({ exitCode, stdout, stderr }));
  });
}

function formatProcessOutput({ stdout, stderr }) {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

function tokenizeSinglePath(input) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (quote) throw new Error("Unclosed quote in Feature Spec path.");
  if (current.length > 0) tokens.push(current);
  return tokens;
}
