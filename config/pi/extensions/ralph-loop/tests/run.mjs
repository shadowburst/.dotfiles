import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import { createRalphCommand, parseSpecArgument } from "../src/command.mjs";
import { registerRalphCommands } from "../src/extension.mjs";
import {
  cachePaths,
  completeFinalReview,
  completeFeatureSpecTask,
  buildTaskImplementationPrompt,
  discoverValidationOptions,
  launchPiImplementationSession,
  parseFeatureSpecTasks,
  parseOrchestratorArgs,
  prepareCurrentBranchStartup,
  refineTaskValidation,
  preserveCacheOnStop,
  recordAttempt,
  recordExpectedChangedPaths,
  recordRunValidationOptions,
  recordTaskValidationPlan,
  recordTaskCommit,
  recordTaskReviewVerdict,
  recordValidationEvidence,
  runOrchestrator,
  selectFirstUncheckedTask,
  transitionPhase,
} from "../src/orchestrator.mjs";

assert.equal(parseSpecArgument("docs/specs/example.md"), "docs/specs/example.md");
assert.equal(parseSpecArgument('"docs/specs/example spec.md"'), "docs/specs/example spec.md");
assert.throws(() => parseSpecArgument(""), /Usage/);
assert.throws(() => parseSpecArgument("--all docs/specs/example.md"), /Usage|flags/);
assert.throws(() => parseSpecArgument("docs/a.md docs/b.md"), /Usage/);
assert.throws(() => parseSpecArgument("'unterminated"), /Unclosed quote/);

assert.deepEqual(parseOrchestratorArgs(["--mode", "all", "--spec", "docs/specs/example.md"]).mode, "all");
assert.throws(() => parseOrchestratorArgs(["--mode", "all", "--spec", "--flag"]), /Feature Spec path/);
assert.throws(() => parseOrchestratorArgs(["--mode", "task", "--spec", "docs/specs/example.md"]), /all\|once/);

const taskLedgerText = `# Feature

- [ ] Outside task

## Implementation Tasks

- [x] 1. Done task
  - Guidance only
  - [ ] Nested checkbox guidance
- [ ] 2. First runnable task
  - Covers: Requirement: Example
- [ ] 3. Second runnable task

## Out of Scope

- [ ] Outside later task
`;
const parsedTasks = parseFeatureSpecTasks(taskLedgerText);
assert.deepEqual(parsedTasks.map((task) => ({ lineNumber: task.lineNumber, checked: task.checked, text: task.text })), [
  { lineNumber: 7, checked: true, text: "1. Done task" },
  { lineNumber: 10, checked: false, text: "2. First runnable task" },
  { lineNumber: 12, checked: false, text: "3. Second runnable task" },
]);
assert.equal(selectFirstUncheckedTask(parsedTasks).lineNumber, 10);
assert.equal(selectFirstUncheckedTask(parseFeatureSpecTasks("# Feature\n\n## Implementation Tasks\n\n- [x] Done\n")), null);

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
await writeFile(spec, "# Ralph Loop\n\n## Implementation Tasks\n\n- [ ] 1. Test task\n");
const checkboxSpec = join(dir, "checkbox-feature.md");
await writeFile(checkboxSpec, taskLedgerText);
const completedTask = await completeFeatureSpecTask({ specPath: checkboxSpec, task: parsedTasks[1] });
assert.equal(completedTask.line, "- [x] 2. First runnable task");
const checkboxSpecText = await readFile(checkboxSpec, "utf8");
assert.match(checkboxSpecText, /- \[x\] 2\. First runnable task/);
assert.match(checkboxSpecText, /  - \[ \] Nested checkbox guidance/);
await assert.rejects(() => completeFeatureSpecTask({ specPath: checkboxSpec, task: parsedTasks[1] }), /already checked|does not match/);

await writeFile(join(dir, "flake.nix"), "{ outputs = _: {}; }\n");
await writeFile(join(dir, "AGENTS.md"), "Validation: run `nix flake check` before claiming repository readiness.\n");
await mkdir(join(dir, "docs", "agents"), { recursive: true });
await writeFile(join(dir, "docs", "agents", "validation.md"), "Testing: run `node docs/check.mjs` for documented validation evidence.\n");
await mkdir(join(dir, "config", "pi", "extensions"), { recursive: true });
await writeFile(join(dir, "config", "pi", "extensions", "AGENTS.md"), "Validation: run `node nested-agent-check.mjs` for extension instructions.\n");
await mkdir(join(dir, "config", "pi", "extensions", "ralph-loop"), { recursive: true });
await writeFile(
  join(dir, "config", "pi", "extensions", "ralph-loop", "package.json"),
  JSON.stringify({ type: "module", scripts: { test: "node tests/run.mjs" } }),
);
await mkdir(join(dir, "config", "pi", "extensions", "mcp-bridge"), { recursive: true });
await writeFile(
  join(dir, "config", "pi", "extensions", "mcp-bridge", "package.json"),
  JSON.stringify({ type: "module", scripts: { test: "node tests/run.mjs" } }),
);
await mkdir(join(dir, ".github", "workflows"), { recursive: true });
await writeFile(join(dir, ".github", "workflows", "ci.yml"), "name: CI\njobs:\n  test:\n    steps:\n      - run: npm test\n");
await writeFile(join(dir, ".github", "workflows", "manual.yml"), "name: Manual\njobs:\n  review:\n    steps:\n      - uses: actions/checkout@v4\n");
const validationOptions = await discoverValidationOptions({ repoRoot: dir, specPath: spec, specText: "Guidance: validate with `npm run test` when changing the extension.\n" });
assert.ok(validationOptions.some((option) => option.command === "nix flake check" && option.source === "AGENTS.md"));
assert.ok(validationOptions.some((option) => option.command === "npm run test" && option.source === "docs/spec guidance"));
assert.ok(validationOptions.some((option) => option.command === "node docs/check.mjs" && option.source === "docs/agents/validation.md"));
assert.ok(validationOptions.some((option) => option.command === "node nested-agent-check.mjs" && option.source === "config/pi/extensions/AGENTS.md"));
assert.ok(validationOptions.some((option) => option.command === "nix flake check" && option.source === "flake.nix"));
assert.ok(validationOptions.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/ralph-loop"));
assert.ok(validationOptions.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/mcp-bridge"));
assert.ok(validationOptions.some((option) => option.command === "npm test" && option.source === ".github/workflows/ci.yml"));
assert.ok(!validationOptions.some((option) => option.command === "review CI workflow"));
const taskValidation = refineTaskValidation({
  task: { text: "Implement run-level validation discovery and per-task validation refinement" },
  options: validationOptions,
  changedPaths: ["config/pi/extensions/ralph-loop/src/orchestrator.mjs", "config/pi/extensions/ralph-loop/tests/run.mjs"],
});
assert.equal(taskValidation.verified, true);
assert.ok(taskValidation.options.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/ralph-loop"));
assert.ok(!taskValidation.options.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/mcp-bridge"));
const parentPathTaskValidation = refineTaskValidation({
  task: { text: "Implement validation discovery" },
  options: validationOptions,
  changedPaths: ["config/pi/extensions"],
});
assert.ok(!parentPathTaskValidation.options.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/mcp-bridge"));
const textOnlyTaskValidation = refineTaskValidation({
  task: { text: "Implement run-level validation discovery and per-task validation refinement using project docs, agent instructions, Feature Spec guidance, project files, and existing test patterns." },
  options: validationOptions,
});
assert.ok(!textOnlyTaskValidation.options.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/mcp-bridge"));
assert.equal(refineTaskValidation({ task: { text: "Manual doc task" }, options: [], changedPaths: ["README.md"] }).verified, false);

const behaviorPrompt = buildTaskImplementationPrompt({
  repoRoot: dir,
  specPath: spec,
  task: { lineNumber: 5, text: "6. Implement the task implementation phase with meaningful TDD guidance", guidance: ["Covers: Requirement: Meaningful test-first behavior; Requirement: Per-task implementation loop"] },
  validationPlan: taskValidation,
  expectedChangedPaths: ["config/pi/extensions/ralph-loop/src/orchestrator.mjs", "config/pi/extensions/ralph-loop/tests/run.mjs"],
});
assert.match(behaviorPrompt, /Selected task \(line 5\): 6\. Implement the task implementation phase/);
assert.match(behaviorPrompt, /Before editing, state the deterministic validation you will use/);
assert.match(behaviorPrompt, /Covers: Requirement: Meaningful test-first behavior/);
assert.match(behaviorPrompt, /Write or update one failing automated behavior test before implementation/);
assert.match(behaviorPrompt, /npm test/);
assert.match(behaviorPrompt, /config\/pi\/extensions\/ralph-loop\/src\/orchestrator\.mjs/);
assert.doesNotMatch(behaviorPrompt, /mcp-bridge/);

const declarativePrompt = buildTaskImplementationPrompt({
  repoRoot: dir,
  specPath: spec,
  task: { lineNumber: 5, text: "Update Nix settings documentation" },
  validationPlan: { verified: true, options: [{ command: "nix flake check", cwd: ".", scope: "repo", source: "flake.nix", reason: "flake validation" }], rationale: "repo check" },
  expectedChangedPaths: ["modules/terminal/pi.nix"],
});
assert.match(declarativePrompt, /Do not invent a new test solely for TDD/);
assert.match(declarativePrompt, /Identify deterministic validation before editing/);
assert.doesNotMatch(declarativePrompt, /Write or update one failing automated behavior test before implementation/);

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
assert.deepEqual(launched[0].options.stdio, ["inherit", "pipe", "pipe"]);

let implementationPrompt = "";
const implementationResult = await launchPiImplementationSession({
  cwd: dir,
  prompt: "Implement task 1",
  piBin: "/usr/bin/pi",
  spawnProcess(command, args, options) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.stdin.on("data", (chunk) => {
      implementationPrompt += chunk.toString();
    });
    queueMicrotask(() => {
      child.stdout.end("done\n");
      child.emit("close", 0);
    });
    assert.equal(command, "/usr/bin/pi");
    assert.deepEqual(args, ["-p"]);
    assert.equal(options.cwd, dir);
    assert.equal(options.env.PI_RALPH_IMPLEMENTATION_SESSION, "1");
    assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe"]);
    return child;
  },
});
assert.equal(implementationPrompt, "Implement task 1");
assert.equal(implementationResult.status, "implementation session completed");
assert.equal(implementationResult.stdout, "done\n");

const stdout = new PassThrough();
let text = "";
stdout.on("data", (chunk) => {
  text += chunk.toString();
});
await runOrchestrator(["--mode", "all", "--spec", spec], { stdout }, {
  cwd: dir,
  cacheRoot: join(dir, "run-cache"),
  execGit: fakeGit({ repoRoot: dir, branch: "feat/test", head: "dddddddddddddddddddddddddddddddddddddddd", status: "" }),
  implementationSession: async () => ({ status: "implementation session completed" }),
});
assert.match(text, /Ralph Orchestrator/);
assert.match(text, /mode: all/);
assert.match(text, new RegExp(spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(text, /status: implementation session completed/);
assert.match(text, /task: 1\. Test task/);
assert.match(text, /implementationPromptBytes: [1-9][0-9]*/);
const launchedState = JSON.parse(await readFile(cachePaths({ cacheRoot: join(dir, "run-cache"), repoRoot: resolve(dir), specPath: resolve(spec) }).path, "utf8"));
assert.ok(launchedState.taskValidationPlans.at(-1).options.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/ralph-loop"));
assert.ok(!launchedState.taskValidationPlans.at(-1).options.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/mcp-bridge"));
assert.ok(launchedState.expectedChangedPaths.includes("config/pi/extensions/ralph-loop"));

const noTaskSpec = join(dir, "done-feature.md");
await writeFile(noTaskSpec, "# Feature\n\n## Implementation Tasks\n\n- [x] 1. Done\n");
const noTaskCacheRoot = join(dir, "no-task-cache");
const noTaskStdout = new PassThrough();
let noTaskText = "";
noTaskStdout.on("data", (chunk) => {
  noTaskText += chunk.toString();
});
await runOrchestrator(["--mode", "all", "--spec", noTaskSpec], { stdout: noTaskStdout }, {
  cwd: dir,
  cacheRoot: noTaskCacheRoot,
  execGit: fakeGit({ repoRoot: dir, branch: "feat/test", head: "dddddddddddddddddddddddddddddddddddddddd", status: "" }),
});
assert.match(noTaskText, /status: no unchecked tasks/);
await assert.rejects(() => access(cachePaths({ cacheRoot: noTaskCacheRoot, repoRoot: resolve(dir), specPath: resolve(noTaskSpec) }).path), /ENOENT/);

const activeNoTaskCacheRoot = join(dir, "active-no-task-cache");
const activeNoTaskCacheFile = cachePaths({ cacheRoot: activeNoTaskCacheRoot, repoRoot: resolve(dir), specPath: resolve(noTaskSpec) }).path;
await mkdir(activeNoTaskCacheRoot, { recursive: true });
await writeFile(
  activeNoTaskCacheFile,
  JSON.stringify({ repoRoot: resolve(dir), specPath: resolve(noTaskSpec), reviewBase: "dddddddddddddddddddddddddddddddddddddddd", phase: "startup" }),
);
const activeNoTaskStdout = new PassThrough();
let activeNoTaskText = "";
activeNoTaskStdout.on("data", (chunk) => {
  activeNoTaskText += chunk.toString();
});
await runOrchestrator(["--mode", "all", "--spec", noTaskSpec], { stdout: activeNoTaskStdout }, {
  cwd: dir,
  cacheRoot: activeNoTaskCacheRoot,
  execGit: fakeGit({ repoRoot: dir, branch: "feat/test", head: "dddddddddddddddddddddddddddddddddddddddd", status: "" }),
});
assert.match(activeNoTaskText, /status: no unchecked tasks; active cache found/);
assert.match(activeNoTaskText, /next: final refactor, final validation, final branch review/);
const activeNoTaskState = JSON.parse(await readFile(activeNoTaskCacheFile, "utf8"));
assert.equal(activeNoTaskState.phase, "final-refactor");

const checkedTaskResumeCacheRoot = join(dir, "checked-task-resume-cache");
const checkedTaskResumeCacheFile = cachePaths({ cacheRoot: checkedTaskResumeCacheRoot, repoRoot: resolve(dir), specPath: resolve(noTaskSpec) }).path;
await mkdir(checkedTaskResumeCacheRoot, { recursive: true });
await writeFile(
  checkedTaskResumeCacheFile,
  JSON.stringify({
    repoRoot: resolve(dir),
    specPath: resolve(noTaskSpec),
    reviewBase: "dddddddddddddddddddddddddddddddddddddddd",
    phase: "precommit-validation",
    currentTask: { lineNumber: 5, text: "1. Done" },
    expectedChangedPaths: ["done-feature.md"],
  }),
);
const checkedTaskResumeStdout = new PassThrough();
let checkedTaskResumeText = "";
checkedTaskResumeStdout.on("data", (chunk) => {
  checkedTaskResumeText += chunk.toString();
});
await runOrchestrator(["--mode", "all", "--spec", noTaskSpec], { stdout: checkedTaskResumeStdout }, {
  cwd: dir,
  cacheRoot: checkedTaskResumeCacheRoot,
  execGit: fakeGit({
    repoRoot: resolve(dir),
    branch: "feat/test",
    head: "dddddddddddddddddddddddddddddddddddddddd",
    status: " M done-feature.md\n",
    mergeBase: "dddddddddddddddddddddddddddddddddddddddd",
    worktreeDiff: "diff --git a/done-feature.md b/done-feature.md\n",
  }),
  prompt: async () => true,
});
assert.match(checkedTaskResumeText, /status: no unchecked tasks; resuming in-progress current task/);
assert.match(checkedTaskResumeText, /next: validation/);
const checkedTaskResumeState = JSON.parse(await readFile(checkedTaskResumeCacheFile, "utf8"));
assert.equal(checkedTaskResumeState.phase, "validation");
assert.equal(checkedTaskResumeState.currentTask.text, "1. Done");

const cacheRoot = join(dir, "cache");
const repoRoot = resolve(dir);
const specPath = resolve(spec);
const head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const branch = "feat/test";
const cleanGit = fakeGit({ repoRoot, branch, head, status: "" });
await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "all",
      specPath,
      cwd: repoRoot,
      cacheRoot: join(dir, "detached-cache"),
      execGit: fakeGit({ repoRoot, branch: "", head, status: "" }),
      io: quietIo(),
    }),
  /current branch/,
);
const cleanStartup = await prepareCurrentBranchStartup({
  mode: "all",
  specPath,
  cwd: repoRoot,
  cacheRoot,
  execGit: cleanGit,
  io: quietIo(),
});
assert.equal(cleanStartup.action, "started-clean");
assert.equal(cleanStartup.state.reviewBase, head);
assert.equal(cleanStartup.state.repoRoot, repoRoot);
assert.equal(cleanStartup.state.specPath, specPath);
const cacheFile = cachePaths({ cacheRoot, repoRoot, specPath }).path;
const cachedCleanState = JSON.parse(await readFile(cacheFile, "utf8"));
assert.equal(cachedCleanState.reviewBase, head);
assert.equal(cachedCleanState.phase, "startup");
assert.deepEqual(cachedCleanState.currentTask, null);
assert.deepEqual(cachedCleanState.phaseTransitions.map((transition) => transition.phase), ["startup"]);
assert.deepEqual(cachedCleanState.attempts, {});
assert.deepEqual(cachedCleanState.expectedChangedPaths, []);
assert.deepEqual(cachedCleanState.validationEvidence, []);
assert.deepEqual(cachedCleanState.reviewVerdicts, []);
assert.deepEqual(cachedCleanState.taskCommits, []);
assert.equal(cachedCleanState.finalReviewStatus, null);

let stateWithMetadata = await transitionPhase({ cachePath: cacheFile, state: cachedCleanState, phase: "implementation", currentTask: { lineNumber: 5, text: "- [ ] 1. Test task" } });
stateWithMetadata = await recordAttempt({ cachePath: cacheFile, state: stateWithMetadata, scope: "task:5" });
stateWithMetadata = await recordExpectedChangedPaths({ cachePath: cacheFile, state: stateWithMetadata, paths: ["feature.md", "src/ralph.mjs", "feature.md"] });
stateWithMetadata = await recordRunValidationOptions({ cachePath: cacheFile, state: stateWithMetadata, options: validationOptions });
stateWithMetadata = await recordTaskValidationPlan({ cachePath: cacheFile, state: stateWithMetadata, plan: taskValidation });
stateWithMetadata = await recordValidationEvidence({ cachePath: cacheFile, state: stateWithMetadata, evidence: { command: "npm test", exitCode: 0, summary: "passed" } });
stateWithMetadata = await recordTaskReviewVerdict({ cachePath: cacheFile, state: stateWithMetadata, verdict: "FAIL", summary: "needs fix" });
stateWithMetadata = await recordTaskCommit({ cachePath: cacheFile, state: stateWithMetadata, commit: "cccccccccccccccccccccccccccccccccccccccc", task: stateWithMetadata.currentTask });
const persistedMetadata = JSON.parse(await readFile(cacheFile, "utf8"));
assert.equal(persistedMetadata.phase, "implementation");
assert.equal(persistedMetadata.currentTask.lineNumber, 5);
assert.equal(persistedMetadata.attempts["task:5"], 1);
assert.deepEqual(persistedMetadata.expectedChangedPaths, ["feature.md", "src/ralph.mjs"]);
assert.ok(persistedMetadata.validationOptions.some((option) => option.command === "nix flake check"));
assert.equal(persistedMetadata.taskValidationPlans.at(-1).verified, true);
assert.deepEqual(persistedMetadata.validationEvidence.at(-1), { command: "npm test", exitCode: 0, summary: "passed" });
assert.equal(persistedMetadata.reviewVerdicts.at(-1).verdict, "FAIL");
assert.equal(persistedMetadata.taskCommits.at(-1).commit, "cccccccccccccccccccccccccccccccccccccccc");

const stoppedState = await preserveCacheOnStop({ cachePath: cacheFile, state: persistedMetadata, reason: "/ralph:once declined" });
assert.equal(stoppedState.stop.reason, "/ralph:once declined");
await access(cacheFile);
const failedFinalState = await completeFinalReview({ cachePath: cacheFile, state: stoppedState, verdict: "FAIL", summary: "standards failed" });
assert.equal(failedFinalState.finalReviewStatus.verdict, "FAIL");
await access(cacheFile);
await completeFinalReview({ cachePath: cacheFile, state: failedFinalState, verdict: "PASS", summary: "ready" });
await assert.rejects(() => access(cacheFile), /ENOENT/);

await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "all",
      specPath,
      cwd: repoRoot,
      cacheRoot: join(dir, "empty-cache"),
      execGit: fakeGit({ repoRoot, branch, head, status: " M feature.md\n?? scratch.txt\n" }),
      io: quietIo(),
    }),
  /dirty working tree and no matching active Ralph cache/,
);

await writeFile(
  cacheFile,
  JSON.stringify({
    repoRoot,
    specPath,
    reviewBase: head,
    phase: "implementation",
    phaseTransitions: [
      { phase: "startup", at: "2026-05-19T00:00:00.000Z" },
      { phase: "implementation", at: "2026-05-19T00:01:00.000Z" },
    ],
    currentTask: { lineNumber: 5, text: "- [ ] 1. Test task" },
    expectedChangedPaths: ["feature.md"],
    taskCommits: [],
  }),
);
const dirtyIo = quietIo();
const dirtyStartup = await prepareCurrentBranchStartup({
  mode: "once",
  specPath,
  cwd: repoRoot,
  cacheRoot,
  execGit: fakeGit({
    repoRoot,
    branch,
    head,
    status: " M feature.md\n",
    mergeBase: head,
    worktreeDiff: "diff --git a/feature.md b/feature.md\nindex 1111111..2222222 100644\n--- a/feature.md\n+++ b/feature.md\n@@ -1 +1 @@\n-old\n+new\n",
  }),
  io: dirtyIo,
  prompt: async () => true,
});
assert.equal(dirtyStartup.action, "reconciled-dirty-resume");
assert.equal(dirtyStartup.state.phase, "validation");
assert.deepEqual(dirtyStartup.state.phaseTransitions.map((transition) => transition.phase), ["startup", "implementation", "validation"]);
assert.equal(dirtyStartup.state.reconcile.resumedFromPhase, "implementation");
assert.equal(dirtyStartup.state.reconcile.dirtyStatus, " M feature.md\n");
assert.deepEqual(dirtyStartup.state.reconcile.dirtyDiff.paths, ["feature.md"]);
assert.match(dirtyIo.text(), /dirty working tree/);
assert.match(dirtyIo.text(), /M feature.md/);

await writeFile(
  cacheFile,
  JSON.stringify({
    repoRoot,
    specPath,
    reviewBase: head,
    phase: "implementation",
    currentTask: { lineNumber: 5, text: "- [ ] 1. Test task" },
    expectedChangedPaths: ["new-file.md"],
    taskCommits: [],
  }),
);
await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "once",
      specPath,
      cwd: repoRoot,
      cacheRoot,
      execGit: fakeGit({
        repoRoot,
        branch,
        head,
        status: "?? new-file.md\n",
        mergeBase: head,
      }),
      io: quietIo(),
      prompt: async () => true,
    }),
  /could not verify dirty diff contents for untracked path new-file\.md/,
);
const untrackedStartup = await prepareCurrentBranchStartup({
  mode: "once",
  specPath,
  cwd: repoRoot,
  cacheRoot,
  execGit: fakeGit({
    repoRoot,
    branch,
    head,
    status: "?? new-file.md\n",
    mergeBase: head,
    untrackedDiffs: { "new-file.md": "diff --git a/new-file.md b/new-file.md\nnew file mode 100644\n--- /dev/null\n+++ b/new-file.md\n@@ -0,0 +1 @@\n+new\n" },
  }),
  io: quietIo(),
  prompt: async () => true,
});
assert.equal(untrackedStartup.action, "reconciled-dirty-resume");
assert.deepEqual(untrackedStartup.state.reconcile.dirtyDiff.paths, ["new-file.md"]);
assert.deepEqual(untrackedStartup.state.reconcile.dirtyDiff.untracked, ["new-file.md"]);
assert.equal(untrackedStartup.state.reconcile.dirtyDiff.untrackedDiffs[0].path, "new-file.md");
assert.match(untrackedStartup.state.reconcile.dirtyDiff.untrackedDiffs[0].diff, /new file mode/);

await writeFile(
  cacheFile,
  JSON.stringify({ repoRoot, specPath, reviewBase: head, phase: "implementation", currentTask: { lineNumber: 5, text: "- [ ] 1. Test task" } }),
);
await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "once",
      specPath,
      cwd: repoRoot,
      cacheRoot,
      execGit: fakeGit({ repoRoot, branch, head, status: " M feature.md\n", mergeBase: head, worktreeDiff: "diff --git a/feature.md b/feature.md\n" }),
      io: quietIo(),
      prompt: async () => true,
    }),
  /no expected changed paths/,
);

await writeFile(
  cacheFile,
  JSON.stringify({
    repoRoot,
    specPath,
    reviewBase: head,
    phase: "implementation",
    currentTask: { lineNumber: 5, text: "- [ ] 1. Test task" },
    expectedChangedPaths: ["feature.md"],
  }),
);
await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "once",
      specPath,
      cwd: repoRoot,
      cacheRoot,
      execGit: fakeGit({ repoRoot, branch, head, status: " M unrelated.md\n", mergeBase: head, worktreeDiff: "diff --git a/unrelated.md b/unrelated.md\n" }),
      io: quietIo(),
      prompt: async () => true,
    }),
  /unexpected paths: unrelated\.md/,
);

await writeFile(
  cacheFile,
  JSON.stringify({
    repoRoot,
    specPath,
    reviewBase: head,
    phase: "implementation",
    currentTask: { lineNumber: 5, text: "- [ ] 1. Test task" },
    expectedChangedPaths: ["feature.md"],
  }),
);
await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "once",
      specPath,
      cwd: repoRoot,
      cacheRoot,
      execGit: fakeGit({ repoRoot, branch, head, status: " M feature.md\n", mergeBase: head }),
      io: quietIo(),
      prompt: async () => true,
    }),
  /could not verify dirty diff contents/,
);

await writeFile(
  cacheFile,
  JSON.stringify({
    repoRoot,
    specPath,
    reviewBase: head,
    phase: "startup",
    currentTask: { lineNumber: 5, text: "- [ ] 1. Test task" },
    expectedChangedPaths: ["feature.md"],
  }),
);
await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "once",
      specPath,
      cwd: repoRoot,
      cacheRoot,
      execGit: fakeGit({ repoRoot, branch, head, status: " M feature.md\n", mergeBase: head, worktreeDiff: "diff --git a/feature.md b/feature.md\n" }),
      io: quietIo(),
      prompt: async () => true,
    }),
  /cannot select a safe next phase/,
);

await writeFile(cacheFile, JSON.stringify({ repoRoot, specPath, reviewBase: head, currentTask: { lineNumber: 1, text: "missing task" } }));
await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "once",
      specPath,
      cwd: repoRoot,
      cacheRoot,
      execGit: fakeGit({ repoRoot, branch, head, status: " M feature.md\n", mergeBase: head }),
      io: quietIo(),
      prompt: async () => true,
    }),
  /current task no longer points|current task no longer matches/,
);

await writeFile(
  cacheFile,
  JSON.stringify({
    repoRoot,
    specPath,
    reviewBase: head,
    phase: "implementation",
    currentTask: { lineNumber: 5, text: "- [ ] 1. Test task" },
    expectedChangedPaths: ["feature.md"],
    taskCommits: ["eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
  }),
);
await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "once",
      specPath,
      cwd: repoRoot,
      cacheRoot,
      execGit: fakeGit({
        repoRoot,
        branch,
        head,
        status: " M feature.md\n",
        mergeBase: head,
        mergeBases: { "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": "ffffffffffffffffffffffffffffffffffffffff" },
        worktreeDiff: "diff --git a/feature.md b/feature.md\n",
      }),
      io: quietIo(),
      prompt: async () => true,
    }),
  /cached task commit .* is not reachable from current HEAD/,
);

await writeFile(cacheFile, JSON.stringify({ repoRoot, specPath, reviewBase: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }));
await assert.rejects(
  () =>
    prepareCurrentBranchStartup({
      mode: "once",
      specPath,
      cwd: repoRoot,
      cacheRoot,
      execGit: fakeGit({ repoRoot, branch, head, status: " M feature.md\n", mergeBase: "cccccccccccccccccccccccccccccccccccccccc" }),
      io: quietIo(),
      prompt: async () => true,
    }),
  /Review Base is not an ancestor of HEAD/,
);

function fakeGit({ repoRoot, branch, head, status, mergeBase = head, mergeBases = {}, worktreeDiff = "", stagedDiff = "", untrackedDiffs = {} }) {
  return async (args) => {
    const command = args.join(" ");
    if (command === "rev-parse --show-toplevel") return `${repoRoot}\n`;
    if (command === "branch --show-current") return `${branch}\n`;
    if (command === "rev-parse HEAD") return `${head}\n`;
    if (command === "status --porcelain") return status;
    if (args[0] === "cat-file" && args[1] === "-e") return "";
    if (args[0] === "merge-base") return `${mergeBases[args[1]] ?? mergeBase}\n`;
    if (command === "diff --binary") return worktreeDiff;
    if (command === "diff --cached --binary") return stagedDiff;
    if (args[0] === "diff" && args[1] === "--binary" && args[2] === "--no-index" && args[3] === "--" && args[4] === "/dev/null") {
      return untrackedDiffs[args[5]] ?? "";
    }
    throw new Error(`unexpected git command: ${command}`);
  };
}

function quietIo() {
  let output = "";
  return {
    stdin: { isTTY: false },
    stdout: {
      write(chunk) {
        output += chunk;
      },
    },
    text() {
      return output;
    },
  };
}

console.log("ralph-loop command surface validation fixtures passed");
