import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import { createRalphCommand, parseSpecArgument } from "../src/command.mjs";
import { registerRalphCommands } from "../src/extension.mjs";
import { parseOrchestratorArgs, runOrchestrator } from "../src/orchestrator.mjs";

assert.equal(parseSpecArgument("docs/specs/example.md"), "docs/specs/example.md");
assert.equal(parseSpecArgument('"docs/specs/example spec.md"'), "docs/specs/example spec.md");
assert.throws(() => parseSpecArgument(""), /Usage/);
assert.throws(() => parseSpecArgument("--all docs/specs/example.md"), /Usage|flags/);
assert.throws(() => parseSpecArgument("docs/a.md docs/b.md"), /Usage/);
assert.throws(() => parseSpecArgument("'unterminated"), /Unclosed quote/);

assert.deepEqual(parseOrchestratorArgs(["--mode", "all", "--spec", "docs/specs/example.md"]).mode, "all");
assert.throws(() => parseOrchestratorArgs(["--mode", "all", "--spec", "--flag"]), /Feature Spec path/);
assert.throws(() => parseOrchestratorArgs(["--mode", "task", "--spec", "docs/specs/example.md"]), /all\|once/);

const registered = [];
registerRalphCommands({
  registerCommand(name, options) {
    registered.push({ name, options });
  },
});
assert.deepEqual(registered.map((command) => command.name), ["ralph", "ralph:once"]);
assert.equal(typeof registered[0].options.handler, "function");
assert.equal(typeof registered[1].options.handler, "function");

const dir = await mkdtemp(join(tmpdir(), "ralph-loop-test-"));
const spec = join(dir, "feature.md");
await writeFile(spec, "# Feature\n\n## Implementation Tasks\n\n- [ ] 1. Test task\n");

const launched = [];
const fakeSpawn = (command, args, options) => {
  launched.push({ command, args, options });
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  queueMicrotask(() => {
    child.stdout.end("status: launched\n");
    child.emit("close", 0);
  });
  return child;
};

const handler = createRalphCommand({
  mode: "once",
  orchestratorPath: "/tmp/orchestrator.mjs",
  spawnProcess: fakeSpawn,
  cwd: () => dir,
  nodePath: "/usr/bin/node",
});
const message = await handler("feature.md", { ui: { notify() {} } });
assert.match(message, /status: launched/);
assert.equal(launched.length, 1);
assert.equal(launched[0].command, "/usr/bin/node");
assert.deepEqual(launched[0].args, ["/tmp/orchestrator.mjs", "--mode", "once", "--spec", spec]);
assert.equal(launched[0].options.cwd, dir);
assert.equal(launched[0].options.env.PI_RALPH_MODE, "once");
assert.equal(launched[0].options.env.PI_RALPH_SPEC, spec);

const stdout = new PassThrough();
let text = "";
stdout.on("data", (chunk) => {
  text += chunk.toString();
});
await runOrchestrator(["--mode", "all", "--spec", spec], { stdout });
assert.match(text, /Ralph Orchestrator/);
assert.match(text, /mode: all/);
assert.match(text, new RegExp(spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(text, /status: launched/);

console.log("ralph-loop command surface validation fixtures passed");
