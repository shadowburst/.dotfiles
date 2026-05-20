import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ORCHESTRATOR_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "orchestrator.mjs");

export function parseSpecArgument(rawArgs) {
  const args = tokenizeSinglePath(rawArgs ?? "");
  if (args.length !== 1) {
    throw new Error("Usage: /ralph <feature-spec-path> or /ralph:once <feature-spec-path>");
  }

  const specPath = normalizeSpecPathToken(args[0]);
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
    const specPath = await resolveReadableSpecPath(workingDirectory, specArg);

    ctx.ui?.notify?.(`Launching Ralph Orchestrator for ${specArg}`, "info");
    const hiddenEditor = hideEditorDuringInteractiveOutput(ctx.ui);
    let result;
    try {
      result = await launchRalphOrchestrator({ mode, specPath, orchestratorPath, spawnProcess, cwd: workingDirectory, nodePath });
    } finally {
      hiddenEditor?.restore();
    }
    const output = formatProcessOutput(result);

    if (result.exitCode !== 0) {
      throw new Error(output || `Ralph Orchestrator exited with status ${result.exitCode}`);
    }

    const message = output || `Ralph Orchestrator launched for ${specArg}.`;
    ctx.ui?.notify?.("Ralph Orchestrator finished", "success");
    return message;
  };
}

export function launchRalphOrchestrator({
  mode,
  specPath,
  orchestratorPath = ORCHESTRATOR_PATH,
  spawnProcess = spawn,
  cwd = process.cwd(),
  nodePath = process.execPath,
  interactive = process.stdout.isTTY,
} = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnProcess(nodePath, [orchestratorPath, "--mode", mode, "--spec", specPath], {
      cwd,
      env: { ...process.env, PI_RALPH_MODE: mode, PI_RALPH_SPEC: specPath, PI_RALPH_INTERACTIVE: interactive ? "1" : "0" },
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

function hideEditorDuringInteractiveOutput(ui) {
  if (typeof ui?.setEditorComponent !== "function") return null;

  const previousEditorFactory = typeof ui.getEditorComponent === "function" ? ui.getEditorComponent() : undefined;
  ui.setEditorComponent(() => ({
    render: () => [],
    invalidate() {},
    getText: () => "",
    setText() {},
    handleInput() {},
  }));

  return {
    restore: () => ui.setEditorComponent(previousEditorFactory),
  };
}

function formatProcessOutput({ stdout, stderr }) {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

async function resolveReadableSpecPath(workingDirectory, specArg) {
  const candidates = specPathCandidates(workingDirectory, specArg);
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  await access(candidates[0], constants.R_OK);
  return candidates[0];
}

function specPathCandidates(workingDirectory, specArg) {
  const normalized = normalizeSpecPathToken(specArg);
  const candidates = [resolve(workingDirectory, normalized)];

  if (specArg !== normalized) candidates.push(resolve(workingDirectory, specArg));
  const atSegmentNormalized = normalized.replace(/(^|\/)@([^/]+)/, "$1$2");
  if (atSegmentNormalized !== normalized) candidates.unshift(resolve(workingDirectory, atSegmentNormalized));
  if (specArg.startsWith("@/") && specArg.length > 2) candidates.unshift(join(workingDirectory, specArg.slice(2)));

  return [...new Set(candidates)];
}

function normalizeSpecPathToken(token) {
  if (token.startsWith("@") && token.length > 1) return token.slice(1);
  return token;
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
