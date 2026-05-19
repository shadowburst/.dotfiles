#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const extensionPath = resolve(scriptDir, "ralph-loop.ts");

function runStep(name, command, args, options = {}) {
  console.log(`\n==> ${name}`);
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(`${name} failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${name} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

runStep("Ralph extension load check", "pi", [
  "--no-extensions",
  "-e",
  extensionPath,
  "--no-tools",
  "--no-session",
  "-p",
  "/ralph",
], { env: { PI_OFFLINE: "1" } });

runStep("Nix flake check", "nix", ["flake", "check"]);

console.log("\nRalph Loop extension validation passed.");
