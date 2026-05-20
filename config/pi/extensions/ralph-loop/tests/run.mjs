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
  buildTaskFixPrompt,
  buildTaskImplementationPrompt,
  buildTaskReviewPrompt,
  discoverValidationOptions,
  generateConventionalCommitMessage,
  hasPassingDeterministicValidation,
  launchPiImplementationSession,
  parseFeatureSpecTasks,
  parseOrchestratorArgs,
  parseTaskReviewVerdict,
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
  runTaskFixReviewLoop,
  runTaskRefactorPhase,
  runWholeFeatureRefactorPhase,
  runVerifiedTaskCompletion,
  runTaskReviewPhase,
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
assert.equal(hasPassingDeterministicValidation([]), false);
assert.equal(hasPassingDeterministicValidation([{ exitCode: 0 }]), true);
assert.equal(hasPassingDeterministicValidation([{ exitCode: 0 }, { exitCode: 1 }]), false);

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

const refactorCacheRoot = join(dir, "refactor-cache");
const refactorCachePath = cachePaths({ cacheRoot: refactorCacheRoot, repoRoot: resolve(dir), specPath: resolve(spec) }).path;
await mkdir(refactorCacheRoot, { recursive: true });
const refactorBaseState = {
  repoRoot: resolve(dir),
  specPath: resolve(spec),
  reviewBase: "dddddddddddddddddddddddddddddddddddddddd",
  phase: "validation",
  currentTask: { lineNumber: 5, text: "7. Implement per-task refactor sessions using the refactor skill after initial validation" },
  expectedChangedPaths: ["feature.md", "config/pi/extensions/ralph-loop/src/orchestrator.mjs"],
};
await writeFile(refactorCachePath, JSON.stringify(refactorBaseState));
let refactorPrompt = "";
const refactorRunCommands = [];
const refactorResult = await runTaskRefactorPhase({
  cachePath: refactorCachePath,
  state: refactorBaseState,
  repoRoot: resolve(dir),
  task: refactorBaseState.currentTask,
  validationPlan: { verified: true, options: [{ command: "npm test", cwd: "config/pi/extensions/ralph-loop", scope: "package", source: "package.json", reason: "extension test" }] },
  execGit: fakeGit({
    repoRoot: resolve(dir),
    branch: "feat/test",
    head: "dddddddddddddddddddddddddddddddddddddddd",
    status: " M config/pi/extensions/ralph-loop/src/orchestrator.mjs\n",
    worktreeDiff: "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+before\n",
    stagedDiff: "",
  }),
  refactorSession: async ({ prompt }) => {
    refactorPrompt = prompt;
    return { status: "refactor session completed" };
  },
  afterDiff: async () => "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+after\n",
  runCommand: async (command, options) => {
    refactorRunCommands.push({ command, options });
    return { command, cwd: options.cwd, exitCode: 0, stdout: "pass", stderr: "" };
  },
});
assert.equal(refactorResult.changedFiles, true);
assert.match(refactorPrompt, /Use the refactor skill contract/);
assert.match(refactorPrompt, /Improve code shape without changing behavior/);
assert.match(refactorPrompt, /config\/pi\/extensions\/ralph-loop\/src\/orchestrator\.mjs/);
assert.doesNotMatch(refactorPrompt, /feature\.md/);
assert.deepEqual(refactorResult.scopePaths, ["config/pi/extensions/ralph-loop/src/orchestrator.mjs"]);
assert.match(refactorPrompt, /diff --git/);
assert.deepEqual(refactorRunCommands.map((entry) => entry.command), ["npm test"]);
assert.equal(refactorRunCommands[0].options.cwd, join(resolve(dir), "config/pi/extensions/ralph-loop"));
const refactorState = JSON.parse(await readFile(refactorCachePath, "utf8"));
assert.equal(refactorState.phase, "refactor");
assert.equal(refactorState.validationEvidence.at(-1).phase, "post-refactor");
assert.equal(refactorState.validationEvidence.at(-1).command, "npm test");

await writeFile(refactorCachePath, JSON.stringify(refactorBaseState));
const noChangeCommands = [];
const noChangeRefactorResult = await runTaskRefactorPhase({
  cachePath: refactorCachePath,
  state: refactorBaseState,
  repoRoot: resolve(dir),
  task: refactorBaseState.currentTask,
  validationPlan: { verified: true, options: [{ command: "npm test", cwd: ".", scope: "repo", source: "package.json", reason: "repo test" }] },
  execGit: fakeGit({ repoRoot: resolve(dir), branch: "feat/test", head: "dddddddddddddddddddddddddddddddddddddddd", status: "", worktreeDiff: "", stagedDiff: "" }),
  refactorSession: async () => ({ status: "already clean" }),
  runCommand: async (command) => {
    noChangeCommands.push(command);
    return { command, exitCode: 0 };
  },
});
assert.equal(noChangeRefactorResult.changedFiles, false);
assert.deepEqual(noChangeCommands, []);

await writeFile(refactorCachePath, JSON.stringify(refactorBaseState));
await writeFile(join(dir, "untracked-task-file.md"), "before\n");
const untrackedRefactorCommands = [];
const untrackedRefactorResult = await runTaskRefactorPhase({
  cachePath: refactorCachePath,
  state: refactorBaseState,
  repoRoot: resolve(dir),
  task: refactorBaseState.currentTask,
  validationPlan: { verified: true, options: [{ command: "npm test", cwd: ".", scope: "repo", source: "package.json", reason: "repo test" }] },
  execGit: fakeGit({ repoRoot: resolve(dir), branch: "feat/test", head: "dddddddddddddddddddddddddddddddddddddddd", status: "?? untracked-task-file.md\n" }),
  refactorSession: async () => {
    await writeFile(join(dir, "untracked-task-file.md"), "after\n");
    return { status: "refactored untracked task file" };
  },
  runCommand: async (command) => {
    untrackedRefactorCommands.push(command);
    return { command, exitCode: 0 };
  },
});
assert.equal(untrackedRefactorResult.changedFiles, true);
assert.deepEqual(untrackedRefactorCommands, ["npm test"]);

assert.deepEqual(parseTaskReviewVerdict('{"verdict":"PASS","summary":"ok","requiredFixes":[]}'), { verdict: "PASS", summary: "ok", requiredFixes: [] });
assert.deepEqual(parseTaskReviewVerdict('BLOCKED missing validation'), { verdict: "BLOCKED", summary: "missing validation", requiredFixes: [] });
assert.throws(() => parseTaskReviewVerdict('{"verdict":"FAIL","summary":"bad","requiredFixes":[]}'), /requiredFixes/);
assert.throws(() => parseTaskReviewVerdict('looks fine'), /PASS, FAIL, or BLOCKED/);

const reviewTask = {
  lineNumber: 30,
  text: "8. Implement fresh-context Ralph-specific task review with machine-readable `PASS`, `FAIL`, or `BLOCKED` verdicts and review inputs limited to relevant spec, diff, files, summaries, and validation evidence.",
  guidance: ["Covers: Requirement: Clean-eye task review"],
};
const reviewSpecText = `# Feature\n\n## Requirements\n\n### Requirement: Clean-eye task review\n\nRalph SHALL review each task from a fresh context before completion.\n\n#### Scenario: Task review verdict\n\n- **THEN** it returns machine-readable \`PASS\`, \`FAIL\`, or \`BLOCKED\`.\n\n### Requirement: Unrelated final branch review\n\nThis section must not be sent to the task reviewer.\n\n## Implementation Tasks\n\n- [ ] 8. Implement fresh-context Ralph-specific task review with machine-readable \`PASS\`, \`FAIL\`, or \`BLOCKED\` verdicts and review inputs limited to relevant spec, diff, files, summaries, and validation evidence.\n  - Covers: Requirement: Clean-eye task review\n`;
await writeFile(join(dir, "review-file.mjs"), "export const verdict = 'PASS';\n");
const reviewPrompt = buildTaskReviewPrompt({
  repoRoot: resolve(dir),
  specPath: spec,
  specText: reviewSpecText,
  task: reviewTask,
  diff: "diff --git a/review-file.mjs b/review-file.mjs\n+export const verdict = 'PASS';\n",
  changedPaths: ["review-file.mjs"],
  changedFiles: [{ path: "review-file.mjs", language: "javascript", content: "export const verdict = 'PASS';\n" }],
  validationEvidence: [{ phase: "initial-validation", command: "npm test", cwd: "config/pi/extensions/ralph-loop", exitCode: 0 }],
  implementationSummary: "implemented review phase",
  refactorSummary: "already clean",
});
assert.match(reviewPrompt, /fresh context/);
assert.match(reviewPrompt, /Requirement: Clean-eye task review/);
assert.doesNotMatch(reviewPrompt, /Unrelated final branch review/);
assert.match(reviewPrompt, /review-file\.mjs/);
assert.match(reviewPrompt, /npm test -> exit 0/);
assert.match(reviewPrompt, /machine-readable verdict as JSON/);

await writeFile(refactorCachePath, JSON.stringify({ ...refactorBaseState, phase: "refactor", currentTask: reviewTask }));
await writeFile(join(dir, "new-review-file.md"), "new review content\n");
let taskReviewPrompt = "";
const taskReviewResult = await runTaskReviewPhase({
  cachePath: refactorCachePath,
  state: { ...refactorBaseState, phase: "refactor", currentTask: reviewTask },
  repoRoot: resolve(dir),
  specPath: spec,
  specText: reviewSpecText,
  task: reviewTask,
  validationEvidence: [{ phase: "initial-validation", command: "npm test", cwd: ".", exitCode: 0 }],
  implementationSummary: "implemented review phase",
  refactorSummary: "already clean",
  execGit: fakeGit({
    repoRoot: resolve(dir),
    branch: "feat/test",
    head: "dddddddddddddddddddddddddddddddddddddddd",
    status: " M review-file.mjs\n?? new-review-file.md\n",
    worktreeDiff: "diff --git a/review-file.mjs b/review-file.mjs\n+export const verdict = 'PASS';\n",
    untrackedDiffs: { "new-review-file.md": "diff --git a/new-review-file.md b/new-review-file.md\nnew file mode 100644\n--- /dev/null\n+++ b/new-review-file.md\n@@ -0,0 +1 @@\n+new review content\n" },
  }),
  reviewSession: async ({ prompt }) => {
    taskReviewPrompt = prompt;
    return { stdout: 'notes\n{"verdict":"FAIL","summary":"review parser accepts non-machine text before final JSON","requiredFixes":["Require final JSON verdict parsing."]}\n' };
  },
});
assert.equal(taskReviewResult.verdict.verdict, "FAIL");
assert.match(taskReviewPrompt, /Use only the review inputs in this prompt/);
assert.match(taskReviewResult.diff, /new file mode 100644/);
assert.match(taskReviewPrompt, /new-review-file\.md/);
assert.deepEqual(taskReviewResult.changedPaths, ["review-file.mjs", "new-review-file.md"]);
const taskReviewState = JSON.parse(await readFile(refactorCachePath, "utf8"));
assert.equal(taskReviewState.phase, "task-review");
assert.equal(taskReviewState.reviewVerdicts.at(-1).verdict, "FAIL");
assert.match(taskReviewState.reviewVerdicts.at(-1).summary, /Require final JSON verdict parsing/);

const fixPrompt = buildTaskFixPrompt({
  repoRoot: resolve(dir),
  task: reviewTask,
  reviewVerdict: { verdict: "FAIL", summary: "needs scope", requiredFixes: ["Fix only the review parser."] },
  validationPlan: { verified: true, options: [{ command: "npm test", cwd: ".", reason: "repo test" }] },
  diff: "diff --git a/review-file.mjs b/review-file.mjs\n+bad\n",
  changedPaths: ["review-file.mjs"],
  iteration: 1,
});
assert.match(fixPrompt, /Fix only required issues from the Ralph task review/);
assert.match(fixPrompt, /Iteration 1 of 3/);
assert.match(fixPrompt, /Fix only the review parser/);
assert.match(fixPrompt, /Do not implement subjective preferences/);

await writeFile(refactorCachePath, JSON.stringify({ ...refactorBaseState, phase: "task-review", currentTask: reviewTask }));
const fixValidations = [];
const fixReviewVerdicts = [
  { verdict: "FAIL", summary: "parser accepts prefixes", requiredFixes: ["Require final-line JSON only."] },
  { verdict: "PASS", summary: "ready", requiredFixes: [] },
];
let fixSessionCount = 0;
let fixReviewCount = 0;
let fixRefactorCount = 0;
const fixedReview = await runTaskFixReviewLoop({
  cachePath: refactorCachePath,
  state: { ...refactorBaseState, phase: "task-review", currentTask: reviewTask },
  repoRoot: resolve(dir),
  specPath: spec,
  specText: reviewSpecText,
  task: reviewTask,
  validationPlan: { verified: true, options: [{ command: "npm test", cwd: ".", scope: "repo", source: "package.json", reason: "repo test" }] },
  review: { verdict: fixReviewVerdicts[0], changedPaths: ["review-file.mjs"], diff: "diff --git a/review-file.mjs b/review-file.mjs\n+bad\n" },
  fixSession: async ({ prompt }) => {
    fixSessionCount += 1;
    assert.match(prompt, /Require final-line JSON only/);
    return { status: "fixed required issue", refactorRecommended: true };
  },
  refactorSession: async ({ prompt }) => {
    fixRefactorCount += 1;
    assert.match(prompt, /fix area/);
    return { status: "simplified fix area" };
  },
  reviewSession: async () => {
    fixReviewCount += 1;
    const verdict = fixReviewVerdicts[fixReviewCount];
    return { stdout: JSON.stringify(verdict) };
  },
  runCommand: async (command, options) => {
    fixValidations.push({ command, options });
    return { command, cwd: options.cwd, exitCode: 0, stdout: "pass", stderr: "" };
  },
  execGit: fakeGit({ repoRoot: resolve(dir), branch: "feat/test", head: "dddddddddddddddddddddddddddddddddddddddd", status: " M review-file.mjs\n", worktreeDiff: "diff --git a/review-file.mjs b/review-file.mjs\n+fixed\n" }),
});
assert.equal(fixedReview.status, "passed");
assert.equal(fixSessionCount, 1);
assert.equal(fixReviewCount, 1);
assert.equal(fixRefactorCount, 1);
assert.deepEqual(fixValidations.map((entry) => entry.command), ["npm test"]);
const fixedState = JSON.parse(await readFile(refactorCachePath, "utf8"));
assert.equal(fixedState.attempts[`task:${reviewTask.lineNumber}:fix-review`], 1);
assert.equal(fixedState.reviewVerdicts.at(-1).verdict, "PASS");

await writeFile(refactorCachePath, JSON.stringify({ ...refactorBaseState, phase: "task-review", currentTask: reviewTask }));
const blockedReview = await runTaskFixReviewLoop({
  cachePath: refactorCachePath,
  state: { ...refactorBaseState, phase: "task-review", currentTask: reviewTask },
  repoRoot: resolve(dir),
  specPath: spec,
  specText: reviewSpecText,
  task: reviewTask,
  validationPlan: { verified: true, options: [] },
  review: { verdict: { verdict: "BLOCKED", summary: "missing evidence", requiredFixes: [] }, changedPaths: [], diff: "" },
});
assert.equal(blockedReview.status, "blocked");
const blockedState = JSON.parse(await readFile(refactorCachePath, "utf8"));
assert.match(blockedState.stop.reason, /review blocked/);

await writeFile(refactorCachePath, JSON.stringify({ ...refactorBaseState, phase: "task-review", currentTask: reviewTask }));
let exhaustedFixes = 0;
const exhaustedReview = await runTaskFixReviewLoop({
  cachePath: refactorCachePath,
  state: { ...refactorBaseState, phase: "task-review", currentTask: reviewTask },
  repoRoot: resolve(dir),
  specPath: spec,
  specText: reviewSpecText,
  task: reviewTask,
  validationPlan: { verified: true, options: [{ command: "npm test", cwd: ".", scope: "repo", source: "package.json", reason: "repo test" }] },
  review: { verdict: { verdict: "FAIL", summary: "still wrong", requiredFixes: ["Fix it."] }, changedPaths: ["review-file.mjs"], diff: "diff --git a/review-file.mjs b/review-file.mjs\n+bad\n" },
  fixSession: async () => {
    exhaustedFixes += 1;
    return { status: "attempted fix" };
  },
  reviewSession: async () => ({ stdout: '{"verdict":"FAIL","summary":"still wrong","requiredFixes":["Fix it."]}' }),
  runCommand: async (command, options) => ({ command, cwd: options.cwd, exitCode: 0, stdout: "pass", stderr: "" }),
  execGit: fakeGit({ repoRoot: resolve(dir), branch: "feat/test", head: "dddddddddddddddddddddddddddddddddddddddd", status: " M review-file.mjs\n", worktreeDiff: "diff --git a/review-file.mjs b/review-file.mjs\n+still-bad\n" }),
});
assert.equal(exhaustedReview.status, "exhausted");
assert.equal(exhaustedFixes, 3);
const exhaustedState = JSON.parse(await readFile(refactorCachePath, "utf8"));
assert.equal(exhaustedState.attempts[`task:${reviewTask.lineNumber}:fix-review`], 3);
assert.match(exhaustedState.stop.reason, /exhausted/);

await writeFile(refactorCachePath, JSON.stringify({
  ...refactorBaseState,
  phase: "task-review",
  currentTask: reviewTask,
  attempts: { [`task:${reviewTask.lineNumber}:fix-review`]: 2 },
}));
let resumedExhaustedFixes = 0;
const resumedExhaustedReview = await runTaskFixReviewLoop({
  cachePath: refactorCachePath,
  state: {
    ...refactorBaseState,
    phase: "task-review",
    currentTask: reviewTask,
    attempts: { [`task:${reviewTask.lineNumber}:fix-review`]: 2 },
  },
  repoRoot: resolve(dir),
  specPath: spec,
  specText: reviewSpecText,
  task: reviewTask,
  validationPlan: { verified: true, options: [{ command: "npm test", cwd: ".", scope: "repo", source: "package.json", reason: "repo test" }] },
  review: { verdict: { verdict: "FAIL", summary: "still wrong", requiredFixes: ["Fix it."] }, changedPaths: ["review-file.mjs"], diff: "diff --git a/review-file.mjs b/review-file.mjs\n+bad\n" },
  fixSession: async () => {
    resumedExhaustedFixes += 1;
    return { status: "attempted resumed fix" };
  },
  reviewSession: async () => ({ stdout: '{"verdict":"FAIL","summary":"still wrong","requiredFixes":["Fix it."]}' }),
  runCommand: async (command, options) => ({ command, cwd: options.cwd, exitCode: 0, stdout: "pass", stderr: "" }),
  execGit: fakeGit({ repoRoot: resolve(dir), branch: "feat/test", head: "dddddddddddddddddddddddddddddddddddddddd", status: " M review-file.mjs\n", worktreeDiff: "diff --git a/review-file.mjs b/review-file.mjs\n+still-bad\n" }),
});
assert.equal(resumedExhaustedReview.status, "exhausted");
assert.equal(resumedExhaustedFixes, 1);
const resumedExhaustedState = JSON.parse(await readFile(refactorCachePath, "utf8"));
assert.equal(resumedExhaustedState.attempts[`task:${reviewTask.lineNumber}:fix-review`], 3);
assert.match(resumedExhaustedState.stop.reason, /exhausted/);

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
assert.match(launched[0].options.env.PI_RALPH_INTERACTIVE, /^[01]$/);
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
let orchestratorStatusCalls = 0;
let orchestratorCommitted = false;
const orchestratorGit = async (args) => {
  const command = args.join(" ");
  if (command === "rev-parse --show-toplevel") return `${dir}\n`;
  if (command === "branch --show-current") return "feat/test\n";
  if (command === "rev-parse HEAD") return `${orchestratorCommitted ? "8888888888888888888888888888888888888888" : "dddddddddddddddddddddddddddddddddddddddd"}\n`;
  if (command === "status --porcelain") {
    orchestratorStatusCalls += 1;
    if (orchestratorCommitted) return "";
    return orchestratorStatusCalls === 1 ? "" : " M feature.md\n M config/pi/extensions/ralph-loop/src/orchestrator.mjs\n";
  }
  if (command === "ls-files --others --exclude-standard -z") return "";
  if (command === "diff --binary dddddddddddddddddddddddddddddddddddddddd..HEAD") return "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+feature\n";
  if (command === "diff --binary") return orchestratorCommitted ? "" : "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+change\n";
  if (command === "diff --cached --binary") return "";
  if (args[0] === "add") return "";
  if (args[0] === "commit") {
    orchestratorCommitted = true;
    return "";
  }
  throw new Error(`unexpected git command: ${command}`);
};
await runOrchestrator(["--mode", "all", "--spec", spec], { stdout }, {
  cwd: dir,
  cacheRoot: join(dir, "run-cache"),
  execGit: orchestratorGit,
  implementationSession: async () => ({ status: "implementation session completed" }),
  refactorSession: async () => ({ status: "refactor session completed" }),
  reviewSession: async () => ({ stdout: '{"verdict":"PASS","summary":"task is ready","requiredFixes":[]}\n' }),
  runCommand: async (command, options) => ({ command, cwd: options.cwd, exitCode: 0, stdout: "pass", stderr: "" }),
});
assert.match(text, /Ralph Orchestrator/);
assert.match(text, /mode: all/);
assert.match(text, new RegExp(spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(text, /status: implementation session completed/);
assert.match(text, /task: 1\. Test task/);
assert.match(text, /implementationPromptBytes: [1-9][0-9]*/);
assert.match(text, /refactorPromptBytes: [1-9][0-9]*/);
assert.match(text, /refactor: refactor session completed; no changes/);
assert.match(text, /reviewPromptBytes: [1-9][0-9]*/);
assert.match(text, /taskReview: PASS/);
const launchedState = JSON.parse(await readFile(cachePaths({ cacheRoot: join(dir, "run-cache"), repoRoot: resolve(dir), specPath: resolve(spec) }).path, "utf8"));
assert.ok(launchedState.taskValidationPlans.at(-1).options.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/ralph-loop"));
assert.ok(!launchedState.taskValidationPlans.at(-1).options.some((option) => option.command === "npm test" && option.cwd === "config/pi/extensions/mcp-bridge"));
assert.ok(launchedState.expectedChangedPaths.includes("config/pi/extensions/ralph-loop"));
assert.ok(launchedState.validationEvidence.some((evidence) => evidence.phase === "initial-validation"));
assert.equal(launchedState.validationEvidence.at(-1).phase, "precommit-validation");
assert.equal(launchedState.taskCommits.at(-1).commit, "8888888888888888888888888888888888888888");
await writeFile(spec, "# Ralph Loop\n\n## Implementation Tasks\n\n- [ ] 1. Test task\n");

const loopSpec = join(dir, "loop-feature.md");
await writeFile(loopSpec, "# Ralph Loop\n\n## Implementation Tasks\n\n- [ ] 1. First loop task\n- [ ] 2. Second loop task\n");
const loopStdout = new PassThrough();
let loopText = "";
loopStdout.on("data", (chunk) => {
  loopText += chunk.toString();
});
let loopCommitCount = 0;
let loopStatusCalls = 0;
await runOrchestrator(["--mode", "all", "--spec", loopSpec], { stdout: loopStdout, stdin: { isTTY: false } }, {
  cwd: dir,
  cacheRoot: join(dir, "loop-cache"),
  execGit: async (args) => {
    const command = args.join(" ");
    if (command === "rev-parse --show-toplevel") return `${dir}\n`;
    if (command === "branch --show-current") return "feat/test\n";
    if (command === "rev-parse HEAD") return `${String(loopCommitCount + 1).repeat(40).slice(0, 40)}\n`;
    if (command === "status --porcelain") {
      loopStatusCalls += 1;
      if (loopCommitCount >= 2) return "";
      return loopStatusCalls === 1 ? "" : " M loop-feature.md\n";
    }
    if (command === "ls-files --others --exclude-standard -z") return "";
    if (command === "diff --binary 1111111111111111111111111111111111111111..HEAD") return "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+feature\n";
    if (command === "diff --binary") return loopCommitCount >= 2 ? "" : "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+change\n";
    if (command === "diff --cached --binary") return "";
    if (args[0] === "add") return "";
    if (args[0] === "commit") {
      loopCommitCount += 1;
      return "";
    }
    throw new Error(`unexpected git command: ${command}`);
  },
  implementationSession: async ({ task }) => ({ status: `implemented ${task.text}` }),
  refactorSession: async () => ({ status: "refactor session completed" }),
  reviewSession: async () => ({ stdout: '{"verdict":"PASS","summary":"task is ready","requiredFixes":[]}\n' }),
  runCommand: async (command, options) => ({ command, cwd: options.cwd, exitCode: 0, stdout: "pass", stderr: "" }),
});
assert.equal(loopCommitCount, 2);
assert.match(await readFile(loopSpec, "utf8"), /- \[x\] 1\. First loop task/);
assert.match(await readFile(loopSpec, "utf8"), /- \[x\] 2\. Second loop task/);
assert.match(loopText, /\[task line 5\] RUNNING 1\. First loop task/);
assert.match(loopText, /\[phase implementation\] RUNNING/);
assert.match(loopText, /\[phase task-completion\] DONE committed/);
assert.match(loopText, /status: all unchecked task loops complete/);

const onceSpec = join(dir, "once-feature.md");
await writeFile(onceSpec, "# Ralph Once\n\n## Implementation Tasks\n\n- [ ] 1. Once first task\n- [ ] 2. Once second task\n");
const onceStdout = new PassThrough();
let onceText = "";
onceStdout.on("data", (chunk) => {
  onceText += chunk.toString();
});
let onceCommitCount = 0;
let onceStatusCalls = 0;
await runOrchestrator(["--mode", "once", "--spec", onceSpec], { stdout: onceStdout, stdin: { isTTY: false } }, {
  cwd: dir,
  cacheRoot: join(dir, "once-cache"),
  execGit: async (args) => {
    const command = args.join(" ");
    if (command === "rev-parse --show-toplevel") return `${dir}\n`;
    if (command === "branch --show-current") return "feat/test\n";
    if (command === "rev-parse HEAD") return `${String(onceCommitCount + 3).repeat(40).slice(0, 40)}\n`;
    if (command === "status --porcelain") {
      onceStatusCalls += 1;
      return onceStatusCalls === 1 ? "" : " M once-feature.md\n";
    }
    if (command === "ls-files --others --exclude-standard -z") return "";
    if (command === "diff --binary") return "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+change\n";
    if (command === "diff --cached --binary") return "";
    if (args[0] === "add") return "";
    if (args[0] === "commit") {
      onceCommitCount += 1;
      return "";
    }
    throw new Error(`unexpected git command: ${command}`);
  },
  implementationSession: async ({ task }) => ({ status: `implemented ${task.text}` }),
  refactorSession: async () => ({ status: "refactor session completed" }),
  reviewSession: async () => ({ stdout: '{"verdict":"PASS","summary":"task is ready","requiredFixes":[]}\n' }),
  runCommand: async (command, options) => ({ command, cwd: options.cwd, exitCode: 0, stdout: "pass", stderr: "" }),
});
assert.equal(onceCommitCount, 1);
assert.match(await readFile(onceSpec, "utf8"), /- \[x\] 1\. Once first task/);
assert.match(await readFile(onceSpec, "utf8"), /- \[ \] 2\. Once second task/);
assert.match(onceText, /Continue with the next Ralph task\? \[y\/N\]/);
assert.match(onceText, /status: \/ralph:once continuation declined; cache preserved/);
await access(cachePaths({ cacheRoot: join(dir, "once-cache"), repoRoot: resolve(dir), specPath: resolve(onceSpec) }).path);

const onceContinueSpec = join(dir, "once-continue-feature.md");
await writeFile(onceContinueSpec, "# Ralph Once Continue\n\n## Implementation Tasks\n\n- [ ] 1. Continue first task\n- [ ] 2. Continue second task\n");
const onceContinueStdout = new PassThrough();
let onceContinueText = "";
onceContinueStdout.on("data", (chunk) => {
  onceContinueText += chunk.toString();
});
let onceContinueCommitCount = 0;
let onceContinueStatusCalls = 0;
await runOrchestrator(["--mode", "once", "--spec", onceContinueSpec], { stdout: onceContinueStdout, stdin: { isTTY: false } }, {
  cwd: dir,
  cacheRoot: join(dir, "once-continue-cache"),
  promptContinue: async () => true,
  execGit: async (args) => {
    const command = args.join(" ");
    if (command === "rev-parse --show-toplevel") return `${dir}\n`;
    if (command === "branch --show-current") return "feat/test\n";
    if (command === "rev-parse HEAD") return `${String(onceContinueCommitCount + 5).repeat(40).slice(0, 40)}\n`;
    if (command === "status --porcelain") {
      onceContinueStatusCalls += 1;
      if (onceContinueCommitCount >= 2) return "";
      return onceContinueStatusCalls === 1 ? "" : " M once-continue-feature.md\n";
    }
    if (command === "ls-files --others --exclude-standard -z") return "";
    if (command === "diff --binary 5555555555555555555555555555555555555555..HEAD") return "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+feature\n";
    if (command === "diff --binary") return onceContinueCommitCount >= 2 ? "" : "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+change\n";
    if (command === "diff --cached --binary") return "";
    if (args[0] === "add") return "";
    if (args[0] === "commit") {
      onceContinueCommitCount += 1;
      return "";
    }
    throw new Error(`unexpected git command: ${command}`);
  },
  implementationSession: async ({ task }) => ({ status: `implemented ${task.text}` }),
  refactorSession: async () => ({ status: "refactor session completed" }),
  reviewSession: async () => ({ stdout: '{"verdict":"PASS","summary":"task is ready","requiredFixes":[]}\n' }),
  runCommand: async (command, options) => ({ command, cwd: options.cwd, exitCode: 0, stdout: "pass", stderr: "" }),
});
assert.equal(onceContinueCommitCount, 2);
assert.match(await readFile(onceContinueSpec, "utf8"), /- \[x\] 2\. Continue second task/);
assert.match(onceContinueText, /status: \/ralph:once continuation accepted; continuing like \/ralph/);

const noValidationDir = await mkdtemp(join(tmpdir(), "ralph-loop-no-validation-"));
const noValidationSpec = join(noValidationDir, "feature.md");
await writeFile(noValidationSpec, "# Feature\n\n## Implementation Tasks\n\n- [ ] 1. Unverified task\n");
const noValidationStdout = new PassThrough();
let noValidationText = "";
let noValidationRefactorLaunches = 0;
noValidationStdout.on("data", (chunk) => {
  noValidationText += chunk.toString();
});
await runOrchestrator(["--mode", "once", "--spec", noValidationSpec], { stdout: noValidationStdout }, {
  cwd: noValidationDir,
  cacheRoot: join(noValidationDir, "run-cache"),
  execGit: fakeGit({ repoRoot: noValidationDir, branch: "feat/test", head: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", status: "", worktreeDiff: "", stagedDiff: "" }),
  implementationSession: async () => ({ status: "implementation session completed" }),
  refactorSession: async () => {
    noValidationRefactorLaunches += 1;
    return { status: "refactor session completed" };
  },
});
assert.equal(noValidationRefactorLaunches, 0);
assert.match(noValidationText, /validation: unverified/);
assert.match(noValidationText, /initial validation did not pass; refactor skipped/);

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
let activeNoTaskRefactorPrompt = "";
activeNoTaskStdout.on("data", (chunk) => {
  activeNoTaskText += chunk.toString();
});
await runOrchestrator(["--mode", "all", "--spec", noTaskSpec], { stdout: activeNoTaskStdout }, {
  cwd: dir,
  cacheRoot: activeNoTaskCacheRoot,
  execGit: async (args) => {
    const command = args.join(" ");
    if (command === "rev-parse --show-toplevel") return `${dir}\n`;
    if (command === "branch --show-current") return "feat/test\n";
    if (command === "rev-parse HEAD") return "dddddddddddddddddddddddddddddddddddddddd\n";
    if (command === "status --porcelain") return "";
    if (command === "diff --binary dddddddddddddddddddddddddddddddddddddddd..HEAD") return "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+feature\n";
    if (command === "diff --binary") return "";
    if (command === "diff --cached --binary") return "";
    if (command === "ls-files --others --exclude-standard -z") return "";
    throw new Error(`unexpected git command: ${command}`);
  },
  refactorSession: async ({ prompt }) => {
    activeNoTaskRefactorPrompt = prompt;
    return { status: "whole-feature refactor already clean" };
  },
});
assert.match(activeNoTaskText, /status: no unchecked tasks; active cache found/);
assert.match(activeNoTaskText, /wholeFeatureRefactorPromptBytes: [1-9][0-9]*/);
assert.match(activeNoTaskText, /wholeFeatureRefactor: whole-feature refactor already clean; no changes/);
assert.match(activeNoTaskText, /next: final validation and final branch review/);
assert.match(activeNoTaskRefactorPrompt, /Run a bounded Ralph whole-feature refactor session/);
assert.match(activeNoTaskRefactorPrompt, /diff --git/);
const activeNoTaskState = JSON.parse(await readFile(activeNoTaskCacheFile, "utf8"));
assert.equal(activeNoTaskState.phase, "final-refactor");

const wholeRefactorCacheRoot = join(dir, "whole-refactor-cache");
const wholeRefactorCacheFile = cachePaths({ cacheRoot: wholeRefactorCacheRoot, repoRoot: resolve(dir), specPath: resolve(noTaskSpec) }).path;
await mkdir(wholeRefactorCacheRoot, { recursive: true });
const wholeRefactorState = {
  repoRoot: resolve(dir),
  specPath: resolve(noTaskSpec),
  reviewBase: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  phase: "task-committed",
  validationOptions: [{ command: "npm test", cwd: "config/pi/extensions/ralph-loop", scope: "package", source: "package.json", reason: "extension tests" }],
};
await writeFile(wholeRefactorCacheFile, JSON.stringify(wholeRefactorState));
let wholeRefactorCommitted = false;
let wholeRefactorRan = false;
let wholeRefactorPrompt = "";
const wholeRefactorValidationCommands = [];
const wholeRefactorResult = await runWholeFeatureRefactorPhase({
  cachePath: wholeRefactorCacheFile,
  state: wholeRefactorState,
  repoRoot: resolve(dir),
  validationOptions: wholeRefactorState.validationOptions,
  execGit: async (args) => {
    const command = args.join(" ");
    if (command === "diff --binary aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa..HEAD") return "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+feature\n";
    if (command === "status --porcelain") return wholeRefactorRan && !wholeRefactorCommitted ? " M config/pi/extensions/ralph-loop/src/orchestrator.mjs\n" : "";
    if (command === "diff --binary") return wholeRefactorRan && !wholeRefactorCommitted ? "diff --git a/config/pi/extensions/ralph-loop/src/orchestrator.mjs b/config/pi/extensions/ralph-loop/src/orchestrator.mjs\n+refactor\n" : "";
    if (command === "diff --cached --binary") return "";
    if (command === "ls-files --others --exclude-standard -z") return "";
    if (args[0] === "add") return "";
    if (args[0] === "commit") {
      assert.equal(args[2], "refactor(ralph): simplify completed feature implementation");
      wholeRefactorCommitted = true;
      return "";
    }
    if (command === "rev-parse HEAD") return "9999999999999999999999999999999999999999\n";
    throw new Error(`unexpected git command: ${command}`);
  },
  refactorSession: async ({ prompt, scopePaths }) => {
    wholeRefactorPrompt = prompt;
    wholeRefactorRan = true;
    assert.deepEqual(scopePaths, ["config/pi/extensions/ralph-loop/src/orchestrator.mjs"]);
    return { status: "simplified whole feature" };
  },
  runCommand: async (command, options) => {
    wholeRefactorValidationCommands.push({ command, options });
    return { exitCode: 0, stdout: "pass", stderr: "" };
  },
});
assert.equal(wholeRefactorResult.status, "committed");
assert.equal(wholeRefactorResult.commit, "9999999999999999999999999999999999999999");
assert.match(wholeRefactorPrompt, /Use the refactor skill contract/);
assert.match(wholeRefactorPrompt, /Do not implement new feature behavior, update the Feature Spec checkbox, or commit/);
assert.match(wholeRefactorPrompt, /Ralph-produced diff/);
assert.deepEqual(wholeRefactorValidationCommands.map((entry) => entry.command), ["npm test"]);
assert.equal(wholeRefactorValidationCommands[0].options.cwd, join(resolve(dir), "config/pi/extensions/ralph-loop"));
const wholeRefactorPersisted = JSON.parse(await readFile(wholeRefactorCacheFile, "utf8"));
assert.equal(wholeRefactorPersisted.finalRefactorCommit.commit, "9999999999999999999999999999999999999999");
assert.equal(wholeRefactorPersisted.validationEvidence.at(-1).phase, "post-final-refactor");

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

const commitSpec = join(dir, "commit-feature.md");
await writeFile(commitSpec, "# Commit Feature\n\n## Implementation Tasks\n\n- [ ] 10. Implement verified task completion\n");
const commitTask = parseFeatureSpecTasks(await readFile(commitSpec, "utf8"))[0];
const commitCacheFile = cachePaths({ cacheRoot: join(dir, "commit-cache"), repoRoot, specPath: resolve(commitSpec) }).path;
await mkdir(join(dir, "commit-cache"), { recursive: true });
const commitState = {
  repoRoot,
  specPath: resolve(commitSpec),
  reviewBase: head,
  phase: "task-review",
  currentTask: commitTask,
  expectedChangedPaths: ["feature.md", "commit-feature.md"],
  validationEvidence: [{ phase: "initial-validation", command: "npm test", cwd: ".", exitCode: 0 }],
  reviewVerdicts: [{ verdict: "PASS", task: commitTask }],
  taskCommits: [],
};
await writeFile(commitCacheFile, JSON.stringify(commitState));
const gitCommands = [];
const completion = await runVerifiedTaskCompletion({
  cachePath: commitCacheFile,
  state: commitState,
  repoRoot,
  specPath: resolve(commitSpec),
  task: commitTask,
  validationPlan: { verified: true, options: [{ command: "npm test", cwd: ".", reason: "repo test" }] },
  reviewVerdict: { verdict: "PASS" },
  execGit: async (args) => {
    gitCommands.push(args);
    const command = args.join(" ");
    if (command === "status --porcelain") return " M feature.md\n M commit-feature.md\n";
    if (args[0] === "add") return "";
    if (args[0] === "commit") return "";
    if (command === "rev-parse HEAD") return "9999999999999999999999999999999999999999\n";
    throw new Error(`unexpected git command: ${command}`);
  },
  runCommand: async () => ({ exitCode: 0, stdout: "pass", stderr: "" }),
  commitMessageSession: async () => ({ title: "not conventional", body: "ignored" }),
});
assert.equal(completion.status, "committed");
assert.equal(completion.commit, "9999999999999999999999999999999999999999");
assert.equal(completion.message.title, "feat(ralph): implement verified task completion");
assert.ok(gitCommands.some((args) => args[0] === "add" && args.includes("feature.md") && args.includes("commit-feature.md")));
assert.ok(gitCommands.some((args) => args[0] === "commit" && args.includes("feat(ralph): implement verified task completion")));
const committedSpecText = await readFile(commitSpec, "utf8");
assert.match(committedSpecText, /- \[x\] 10\. Implement verified task completion/);
const committedState = JSON.parse(await readFile(commitCacheFile, "utf8"));
assert.equal(committedState.taskCommits.at(-1).commit, "9999999999999999999999999999999999999999");
assert.equal(committedState.phase, "task-committed");
assert.deepEqual(
  await generateConventionalCommitMessage({
    task: commitTask,
    dirtyPaths: ["feature.md"],
    commitMessageSession: async () => ({ stdout: '{"title":"test(ralph): cover task commits","body":"Adds deterministic coverage."}\n' }),
  }),
  { title: "test(ralph): cover task commits", body: "Adds deterministic coverage." },
);

const failedPrecommitSpec = join(dir, "failed-precommit-feature.md");
await writeFile(failedPrecommitSpec, "# Commit Feature\n\n## Implementation Tasks\n\n- [ ] 10. Implement verified task completion\n");
const failedPrecommitTask = parseFeatureSpecTasks(await readFile(failedPrecommitSpec, "utf8"))[0];
const failedPrecommitResult = await runVerifiedTaskCompletion({
  cachePath: commitCacheFile,
  state: { ...commitState, currentTask: failedPrecommitTask, expectedChangedPaths: ["feature.md"], validationEvidence: [{ exitCode: 0 }] },
  repoRoot,
  specPath: resolve(failedPrecommitSpec),
  task: failedPrecommitTask,
  validationPlan: { verified: true, options: [{ command: "npm test", cwd: ".", reason: "repo test" }] },
  reviewVerdict: { verdict: "PASS" },
  execGit: async () => {
    throw new Error("git must not run after failed precommit validation");
  },
  runCommand: async () => ({ exitCode: 1, stdout: "fail", stderr: "" }),
  commitMessageSession: async () => null,
});
assert.equal(failedPrecommitResult.status, "validation-failed");
assert.match(await readFile(failedPrecommitSpec, "utf8"), /- \[ \] 10\. Implement verified task completion/);

const unexpectedCommitSpec = join(dir, "unexpected-commit-feature.md");
await writeFile(unexpectedCommitSpec, "# Commit Feature\n\n## Implementation Tasks\n\n- [ ] 10. Implement verified task completion\n");
const unexpectedCommitTask = parseFeatureSpecTasks(await readFile(unexpectedCommitSpec, "utf8"))[0];
await assert.rejects(
  () =>
    runVerifiedTaskCompletion({
      cachePath: commitCacheFile,
      state: { ...commitState, currentTask: unexpectedCommitTask, expectedChangedPaths: ["feature.md"], validationEvidence: [{ exitCode: 0 }] },
      repoRoot,
      specPath: resolve(unexpectedCommitSpec),
      task: unexpectedCommitTask,
      validationPlan: { verified: true, options: [{ command: "npm test", cwd: ".", reason: "repo test" }] },
      reviewVerdict: { verdict: "PASS" },
      execGit: async (args) => {
        const command = args.join(" ");
        if (command === "status --porcelain") return " M feature.md\n M unrelated.md\n";
        throw new Error(`unexpected git command: ${command}`);
      },
      runCommand: async () => ({ exitCode: 0 }),
      commitMessageSession: async () => null,
    }),
  /unexpected dirty files: unrelated\.md/,
);
assert.match(await readFile(unexpectedCommitSpec, "utf8"), /- \[ \] 10\. Implement verified task completion/);

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

function fakeGit({ repoRoot, branch, head, status, mergeBase = head, mergeBases = {}, worktreeDiff = "", stagedDiff = "", untrackedDiffs = {}, untrackedFiles }) {
  return async (args) => {
    const command = args.join(" ");
    if (command === "rev-parse --show-toplevel") return `${repoRoot}\n`;
    if (command === "branch --show-current") return `${branch}\n`;
    if (command === "rev-parse HEAD") return `${head}\n`;
    if (command === "status --porcelain") return status;
    if (command === "ls-files --others --exclude-standard -z") return (untrackedFiles ?? parseFakeUntrackedFiles(status)).join("\0");
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

function parseFakeUntrackedFiles(status) {
  return status
    .trimEnd()
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3));
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
