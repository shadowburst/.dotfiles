#!/usr/bin/env node
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

const IMPLEMENTATION_TASKS_HEADING_PATTERN = /^##\s+Implementation Tasks\s*$/;
const NEXT_LEVEL_TWO_HEADING_PATTERN = /^##\s+/;
const TOP_LEVEL_CHECKBOX_PATTERN = /^- \[([ xX])\]\s+(.*)$/;
const REPO_VALIDATION_FILES = [
  { path: "flake.nix", id: "nix-flake-check", command: "nix flake check", source: "flake.nix", reason: "Root flake.nix exposes repository-level Nix validation." },
  { path: "Justfile", id: "just-check", command: "just check", source: "Justfile", reason: "Justfile commonly centralizes repository checks." },
  { path: "Makefile", id: "make-test", command: "make test", source: "Makefile", reason: "Makefile commonly centralizes repository tests." },
];
const PACKAGE_VALIDATION_SCRIPT_PRIORITY = ["test", "check", "lint"];
const IGNORED_WALK_DIRS = new Set([".git", "node_modules", ".direnv", "result"]);
const GENERIC_VALIDATION_TOKENS = new Set(["config", "extension", "extensions", "package", "json", "test", "tests", "check", "checks", "lint", "npm", "node", "run", "script", "scripts"]);
const BEHAVIOR_TASK_TOKENS = ["behavior", "implement", "loop", "phase", "command", "parse", "validation", "review", "cache", "state", "prompt", "session", "workflow", "orchestrator"];
const DECLARATIVE_TASK_TOKENS = ["doc", "docs", "documentation", "adr", "readme", "nix", "settings", "format", "copy", "text"];
const AUTOMATED_TEST_COMMAND_PATTERN = /(^|\s)(npm test|.*\btest\b|.*\bnode\s+tests\/|.*\bpytest\b|.*\bvitest\b|.*\bjest\b)/i;
const MAX_TASK_FIX_REVIEW_ITERATIONS = 3;

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

export async function runOrchestrator(argv = process.argv.slice(2), io = process, deps = {}) {
  const { mode, specPath } = parseOrchestratorArgs(argv);
  await access(specPath, constants.R_OK);

  const startup = await prepareCurrentBranchStartup({ mode, specPath, io, ...deps });
  const specText = await readFile(specPath, "utf8");
  const validationOptions = await discoverValidationOptions({ repoRoot: startup.repoRoot, specPath, specText });
  let state = await recordRunValidationOptions({ cachePath: startup.cachePath, state: startup.state, options: validationOptions });
  const progress = createProgressReporter({ io });

  io.stdout.write(`Ralph Orchestrator\n`);
  io.stdout.write(`mode: ${mode}\n`);
  io.stdout.write(`spec: ${specPath}\n`);
  io.stdout.write(`repo: ${startup.repoRoot}\n`);
  io.stdout.write(`reviewBase: ${state.reviewBase}\n`);
  io.stdout.write(`startup: ${startup.action}\n`);
  io.stdout.write(`validationOptions: ${validationOptions.length}\n`);

  let runMode = mode;
  let completedLoops = 0;
  while (true) {
    const currentSpecText = await readFile(specPath, "utf8");
    const tasks = parseFeatureSpecTasks(currentSpecText);
    const selectedTask = selectFirstUncheckedTask(tasks);

    if (!selectedTask) {
      await handleNoUncheckedTasks({ startup, state, io, completedLoops, validationOptions, deps });
      return;
    }

    const result = await runOneTaskLoop({
      cachePath: startup.cachePath,
      state,
      repoRoot: startup.repoRoot,
      specPath,
      specText: currentSpecText,
      task: selectedTask,
      validationOptions,
      io,
      progress,
      deps,
    });
    state = result.state ?? state;
    if (result.stop) return;
    completedLoops += 1;

    if (runMode === "once") {
      const remainingTasks = parseFeatureSpecTasks(await readFile(specPath, "utf8")).filter((task) => !task.checked);
      if (remainingTasks.length === 0) {
        io.stdout.write("status: /ralph:once completed the last unchecked task\n");
        await handleNoUncheckedTasks({ startup, state, io, completedLoops, validationOptions, deps });
        return;
      }
      const accepted = await (deps.promptContinue ?? promptOnceContinuation)(io, "Continue with the next Ralph task? [y/N] ");
      if (!accepted) {
        state = await preserveCacheOnStop({ cachePath: startup.cachePath, state, reason: "/ralph:once continuation declined" });
        io.stdout.write("status: /ralph:once continuation declined; cache preserved\n");
        return;
      }
      io.stdout.write("status: /ralph:once continuation accepted; continuing like /ralph\n");
      runMode = "all";
    }
  }
}

async function handleNoUncheckedTasks({ startup, state, io, completedLoops, validationOptions = [], deps = {} }) {
  if (startup.action === "started-clean" && completedLoops === 0) {
    await rm(startup.cachePath, { force: true });
    io.stdout.write("status: no unchecked tasks\n");
    return;
  }

  if (hasInProgressCurrentTask(state)) {
    io.stdout.write("status: no unchecked tasks; resuming in-progress current task\n");
    io.stdout.write(`task: ${state.currentTask.text}\n`);
    io.stdout.write(`next: ${state.phase}\n`);
    return;
  }

  io.stdout.write(completedLoops > 0 ? "status: all unchecked task loops complete\n" : "status: no unchecked tasks; active cache found\n");
  await runAndReportWholeFeatureRefactor({ startup, state, io, validationOptions, deps });
}

async function runAndReportWholeFeatureRefactor({ startup, state, io, validationOptions, deps }) {
  const refactor = await runWholeFeatureRefactorPhase({
    cachePath: startup.cachePath,
    state,
    repoRoot: startup.repoRoot,
    validationOptions,
    refactorSession: deps.refactorSession,
    execGit: deps.execGit,
    runCommand: deps.runCommand,
  });
  io.stdout.write(`wholeFeatureRefactorPromptBytes: ${Buffer.byteLength(refactor.prompt, "utf8")}\n`);
  io.stdout.write(`wholeFeatureRefactor: ${refactor.result.status}${refactor.changedFiles ? `; ${refactor.status}` : "; no changes"}\n`);
  if (refactor.status === "validation-failed") {
    io.stdout.write("status: final refactor validation did not pass; final review skipped\n");
    return;
  }
  if (refactor.status === "unexpected-files") {
    io.stdout.write("status: final refactor touched files outside the Ralph-produced diff; final review skipped\n");
    return;
  }
  if (refactor.status === "committed") io.stdout.write(`finalRefactorCommit: ${refactor.commit}\n`);
  io.stdout.write("next: final validation and final branch review\n");

  const finalReview = await runFinalBranchReviewPhase({
    cachePath: startup.cachePath,
    state: refactor.state,
    repoRoot: startup.repoRoot,
    specPath: state.specPath,
    validationOptions,
    finalReviewSession: deps.finalReviewSession,
    execGit: deps.execGit,
    runCommand: deps.runCommand,
  });
  io.stdout.write(`finalValidation: ${finalReview.validationStatus}\n`);
  if (finalReview.prompt) io.stdout.write(`finalReviewPromptBytes: ${Buffer.byteLength(finalReview.prompt, "utf8")}\n`);
  io.stdout.write(`finalReview: ${finalReview.verdict.verdict}\n`);
  if (finalReview.status === "ready") io.stdout.write("status: final branch review passed; current branch reviewed and ready; Ralph cache deleted\n");
  else io.stdout.write("status: final branch review did not pass; cache preserved\n");
}

async function runOneTaskLoop({ cachePath, state, repoRoot, specPath, specText, task, validationOptions, io, progress, deps }) {
  progress.task(task, "RUNNING");
  progress.phase("implementation", "RUNNING");
  const implementation = await runTaskImplementationPhase({
    cachePath,
    state,
    repoRoot,
    specPath,
    specText,
    task,
    validationOptions,
    implementationSession: deps.implementationSession,
  });
  progress.phase("implementation", "DONE", implementation.result.status);

  progress.phase("initial-validation", "RUNNING");
  const initialValidationEvidence = await runTaskValidationPhase({
    cachePath,
    state: implementation.state,
    repoRoot,
    validationPlan: implementation.validationPlan,
    phase: "initial-validation",
    runCommand: deps.runCommand,
  });
  progress.phase("initial-validation", hasPassingDeterministicValidation(initialValidationEvidence.validationEvidence) ? "DONE" : "FAILED");
  io.stdout.write(`task: ${task.text}\n`);
  io.stdout.write(`validation: ${implementation.validationPlan.verified ? implementation.validationPlan.options.map((option) => option.command).join("; ") : "unverified"}\n`);
  io.stdout.write(`implementationPromptBytes: ${Buffer.byteLength(implementation.prompt, "utf8")}\n`);
  io.stdout.write(`status: ${implementation.result.status}\n`);
  if (!hasPassingDeterministicValidation(initialValidationEvidence.validationEvidence)) {
    io.stdout.write("status: initial validation did not pass; refactor skipped\n");
    progress.task(task, "FAILED", "initial validation did not pass");
    return { state: initialValidationEvidence.state, stop: true };
  }

  progress.phase("refactor", "RUNNING");
  const refactor = await runTaskRefactorPhase({
    cachePath,
    state: initialValidationEvidence.state,
    repoRoot,
    task,
    validationPlan: implementation.validationPlan,
    refactorSession: deps.refactorSession,
    execGit: deps.execGit,
    runCommand: deps.runCommand,
  });
  progress.phase("refactor", "DONE", refactor.changedFiles ? "validation rerun" : "no changes");
  io.stdout.write(`refactorPromptBytes: ${Buffer.byteLength(refactor.prompt, "utf8")}\n`);
  io.stdout.write(`refactor: ${refactor.result.status}${refactor.changedFiles ? "; validation rerun" : "; no changes"}\n`);
  if (refactor.changedFiles && !hasPassingDeterministicValidation(refactor.validationEvidence)) {
    io.stdout.write("status: post-refactor validation did not pass; task review skipped\n");
    progress.task(task, "FAILED", "post-refactor validation did not pass");
    return { state: refactor.state, stop: true };
  }

  progress.phase("task-review", "RUNNING");
  const review = await runTaskReviewPhase({
    cachePath,
    state: refactor.state,
    repoRoot,
    specPath,
    specText,
    task,
    validationEvidence: taskValidationEvidence(initialValidationEvidence, refactor),
    implementationSummary: implementation.result.status,
    refactorSummary: refactor.result.status,
    reviewSession: deps.reviewSession,
    execGit: deps.execGit,
  });
  progress.phase("task-review", review.verdict.verdict === "PASS" ? "DONE" : review.verdict.verdict);
  io.stdout.write(`reviewPromptBytes: ${Buffer.byteLength(review.prompt, "utf8")}\n`);
  io.stdout.write(`taskReview: ${review.verdict.verdict}\n`);

  progress.phase("fix-review", review.verdict.verdict === "PASS" ? "DONE" : "RUNNING");
  const fixReview = await runTaskFixReviewLoop({
    cachePath,
    state: review.state,
    repoRoot,
    specPath,
    specText,
    task,
    validationPlan: implementation.validationPlan,
    review,
    validationEvidence: taskValidationEvidence(initialValidationEvidence, refactor),
    fixSession: deps.fixSession,
    refactorSession: deps.refactorSession,
    reviewSession: deps.reviewSession,
    execGit: deps.execGit,
    runCommand: deps.runCommand,
  });
  if (fixReview.status !== "already-passed") io.stdout.write(`fixReview: ${fixReview.status}\n`);
  const reviewPassed = taskReviewPassed(fixReview);
  const fixReviewStatus = fixReviewProgressStatus(fixReview);
  progress.phase("fix-review", reviewPassed ? "DONE" : fixReviewStatus, fixReview.status);
  if (!reviewPassed) {
    progress.task(task, fixReviewStatus, fixReview.status);
    return { state: fixReview.state, stop: true };
  }

  progress.phase("task-completion", "RUNNING");
  const completion = await runVerifiedTaskCompletion({
    cachePath,
    state: fixReview.state,
    repoRoot,
    specPath,
    task,
    validationPlan: implementation.validationPlan,
    reviewVerdict: fixReview.review.verdict,
    execGit: deps.execGit,
    runCommand: deps.runCommand,
    commitMessageSession: deps.commitMessageSession,
  });
  if (completion.status === "committed") io.stdout.write(`taskCommit: ${completion.commit}\n`);
  else io.stdout.write(`taskCompletion: ${completion.status}\n`);
  progress.phase("task-completion", completion.status === "committed" ? "DONE" : "FAILED", completion.status);
  progress.task(task, completion.status === "committed" ? "DONE" : "FAILED", completion.status);
  return { state: completion.state, stop: completion.status !== "committed" };
}

function taskValidationEvidence(initialValidationEvidence, refactor) {
  return [...initialValidationEvidence.validationEvidence, ...refactor.validationEvidence];
}

function taskReviewPassed(fixReview) {
  return fixReview.status === "already-passed" || fixReview.status === "passed";
}

function fixReviewProgressStatus(fixReview) {
  return fixReview.status === "blocked" ? "BLOCKED" : "FAILED";
}

function createProgressReporter({ io, interactive = process.env.PI_RALPH_INTERACTIVE === "1" || Boolean(io.stdout?.isTTY && !process.env.CI) } = {}) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  if (!interactive) {
    const write = (scope, status, label, detail = "") => {
      const suffix = detail ? ` ${detail}` : "";
      io.stdout.write(`[${scope} ${label}] ${status}${suffix}\n`);
    };
    return {
      task(task, status, detail = "") {
        write("task", status, `line ${task.lineNumber ?? "unknown"}`, `${task.text}${detail ? ` — ${detail}` : ""}`);
      },
      phase(name, status, detail = "") {
        write("phase", status, name, detail);
      },
    };
  }

  const rows = new Map();
  let frame = 0;
  let renderedRows = 0;
  let interval = null;
  let writingProgress = false;
  const originalWrite = io.stdout.write.bind(io.stdout);

  const writeRaw = (text) => {
    writingProgress = true;
    try {
      originalWrite(text);
    } finally {
      writingProgress = false;
    }
  };
  const moveToProgressStart = () => {
    if (renderedRows > 0) writeRaw(`\u001b[${renderedRows}A`);
  };
  const clearRenderedProgress = () => {
    if (renderedRows === 0) return;
    moveToProgressStart();
    writeRaw("\u001b[J");
    renderedRows = 0;
  };
  const render = () => {
    clearRenderedProgress();
    const lines = [...rows.values()].map(({ scope, label, status, detail }) => {
      const spinner = status === "RUNNING" ? `${frames[frame % frames.length]} ` : "";
      const suffix = detail ? ` ${detail}` : "";
      return `${spinner}[${scope} ${label}] ${status}${suffix}`;
    });
    if (lines.length === 0) return;
    writeRaw(`${lines.join("\n")}\n`);
    renderedRows = lines.length;
  };
  const hasActiveRows = () => [...rows.values()].some((row) => row.status === "RUNNING");
  const updateTimer = () => {
    if (hasActiveRows()) {
      if (interval) return;
      interval = setInterval(() => {
        frame = (frame + 1) % frames.length;
        render();
      }, 80);
      interval.unref?.();
      return;
    }
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  io.stdout.write = (chunk, encoding, callback) => {
    if (writingProgress) return originalWrite(chunk, encoding, callback);
    clearRenderedProgress();
    const result = originalWrite(chunk, encoding, callback);
    if (rows.size > 0) render();
    return result;
  };

  const write = (key, scope, status, label, detail = "") => {
    rows.set(key, { scope, label, status, detail });
    render();
    updateTimer();
  };
  return {
    task(task, status, detail = "") {
      write("task", "task", status, `line ${task.lineNumber ?? "unknown"}`, `${task.text}${detail ? ` — ${detail}` : ""}`);
    },
    phase(name, status, detail = "") {
      write(`phase:${name}`, "phase", status, name, detail);
    },
  };
}

export function parseFeatureSpecTasks(specText) {
  const lines = specText.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => IMPLEMENTATION_TASKS_HEADING_PATTERN.test(line));
  if (headingIndex === -1) return [];

  const tasks = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (NEXT_LEVEL_TWO_HEADING_PATTERN.test(line)) break;
    const task = parseTopLevelCheckboxTask(line, index + 1);
    if (!task) continue;

    const guidance = [];
    let cursor = index + 1;
    while (cursor < lines.length && !NEXT_LEVEL_TWO_HEADING_PATTERN.test(lines[cursor]) && !TOP_LEVEL_CHECKBOX_PATTERN.test(lines[cursor])) {
      const trimmed = lines[cursor].trim();
      if (trimmed) guidance.push(trimmed);
      cursor += 1;
    }
    tasks.push({ ...task, guidance });
    index = cursor - 1;
  }
  return tasks;
}

function parseTopLevelCheckboxTask(line, lineNumber) {
  const match = TOP_LEVEL_CHECKBOX_PATTERN.exec(line);
  if (!match) return null;
  return {
    lineNumber,
    checked: match[1].toLowerCase() === "x",
    text: match[2].trim(),
    line,
  };
}

export function selectFirstUncheckedTask(tasks) {
  return tasks.find((task) => !task.checked) ?? null;
}

export async function completeFeatureSpecTask({ specPath, task }) {
  if (!Number.isInteger(task?.lineNumber) || task.lineNumber < 1) throw new Error("Ralph Feature Spec task line number is required.");
  const specText = await readFile(specPath, "utf8");
  const parsedTask = parseFeatureSpecTasks(specText).find((candidate) => candidate.lineNumber === task.lineNumber);
  if (!parsedTask) throw new Error("Ralph Feature Spec task line no longer points at a top-level Implementation Tasks checkbox.");
  if (parsedTask.text !== task.text) throw new Error("Ralph Feature Spec task text does not match the selected task.");
  if (parsedTask.checked) throw new Error("Ralph Feature Spec task is already checked.");

  const newline = specText.includes("\r\n") ? "\r\n" : "\n";
  const lines = specText.split(/\r?\n/);
  const lineIndex = task.lineNumber - 1;
  lines[lineIndex] = parsedTask.line.replace("- [ ]", "- [x]");
  await writeFile(specPath, lines.join(newline), "utf8");
  return { ...task, checked: true, line: lines[lineIndex] };
}

export async function runVerifiedTaskCompletion({
  cachePath,
  state,
  repoRoot,
  specPath,
  task = state.currentTask ?? null,
  validationPlan,
  reviewVerdict,
  execGit = git,
  runCommand = runShellCommand,
  commitMessageSession = launchCheapCommitMessageSession,
}) {
  assertTaskCompletionReady({ task, reviewVerdict, validationEvidence: state.validationEvidence });

  let nextState = await transitionPhase({ cachePath, state, phase: "checkbox-update", currentTask: task });
  const checkedTask = await completeFeatureSpecTask({ specPath, task });
  let taskCommitCreated = false;
  try {
    const precommitValidation = await runPrecommitValidationAfterCheckbox({ cachePath, state: nextState, repoRoot, validationPlan, runCommand });
    nextState = precommitValidation.state;
    if (precommitValidation.status === "failed") {
      await revertFeatureSpecTaskCompletion({ specPath, task: checkedTask });
      return { status: "validation-failed", state: nextState, checkedTask, validationEvidence: precommitValidation.validationEvidence };
    }

    const taskCommit = await createVerifiedTaskCommit({ cachePath, repoRoot, specPath, state: nextState, task: checkedTask, execGit, commitMessageSession });
    taskCommitCreated = true;
    nextState = await recordTaskCommit({ cachePath, state: nextState, commit: taskCommit.commit, task: checkedTask });
    nextState = await transitionPhase({ cachePath, state: nextState, phase: "task-committed", currentTask: null });
    return { status: "committed", state: nextState, checkedTask, ...taskCommit };
  } catch (error) {
    if (!taskCommitCreated) await revertFeatureSpecTaskCompletion({ specPath, task: checkedTask });
    throw error;
  }
}

function assertTaskCompletionReady({ task, reviewVerdict, validationEvidence }) {
  if (!task?.text) throw new Error("Ralph verified task completion requires a selected task.");
  if (reviewVerdict?.verdict !== "PASS") throw new Error("Ralph cannot complete a task before task review PASS.");
  if (!hasPassingDeterministicValidation(validationEvidence)) throw new Error("Ralph cannot complete a task without prior passing deterministic validation evidence.");
}

async function revertFeatureSpecTaskCompletion({ specPath, task }) {
  if (!Number.isInteger(task?.lineNumber) || task.lineNumber < 1) throw new Error("Ralph Feature Spec task line number is required.");
  const specText = await readFile(specPath, "utf8");
  const parsedTask = parseFeatureSpecTasks(specText).find((candidate) => candidate.lineNumber === task.lineNumber);
  if (!parsedTask) throw new Error("Ralph Feature Spec task line no longer points at a top-level Implementation Tasks checkbox.");
  if (parsedTask.text !== task.text) throw new Error("Ralph Feature Spec task text does not match the selected task.");
  if (!parsedTask.checked) return { ...task, checked: false, line: parsedTask.line };

  const newline = specText.includes("\r\n") ? "\r\n" : "\n";
  const lines = specText.split(/\r?\n/);
  const lineIndex = task.lineNumber - 1;
  lines[lineIndex] = parsedTask.line.replace("- [x]", "- [ ]");
  await writeFile(specPath, lines.join(newline), "utf8");
  return { ...task, checked: false, line: lines[lineIndex] };
}

async function runPrecommitValidationAfterCheckbox({ cachePath, state, repoRoot, validationPlan, runCommand }) {
  const validation = await runTaskValidationPhase({ cachePath, state, repoRoot, validationPlan, phase: "precommit-validation", runCommand });
  if (hasPassingDeterministicValidation(validation.validationEvidence)) return { status: "passed", ...validation };
  return {
    status: "failed",
    state: await preserveCacheOnStop({ cachePath, state: validation.state, reason: "precommit validation failed after Feature Spec checkbox update" }),
    validationEvidence: validation.validationEvidence,
  };
}

async function createVerifiedTaskCommit({ cachePath, repoRoot, specPath, state, task, execGit, commitMessageSession }) {
  const expectedPaths = expectedCommitPaths({ repoRoot, specPath, state });
  const dirtyPaths = await dirtyWorkingTreePaths({ repoRoot, execGit });
  await assertExpectedDirtyPathsForCommit({ cachePath, state, dirtyPaths, expectedPaths });
  const message = await generateConventionalCommitMessage({ task, dirtyPaths, commitMessageSession });

  await gitOne(execGit, ["add", "--", ...dirtyPaths], { cwd: repoRoot, trim: false });
  await gitOne(execGit, ["commit", "-m", message.title, "-m", message.body], { cwd: repoRoot, trim: false });
  const commit = await gitOne(execGit, ["rev-parse", "HEAD"], { cwd: repoRoot });
  return { commit, message, dirtyPaths };
}

async function assertExpectedDirtyPathsForCommit({ cachePath, state, dirtyPaths, expectedPaths }) {
  try {
    assertDirtyPathsAreExpected({ dirtyPaths, expectedPaths });
  } catch (error) {
    await preserveCacheOnStop({ cachePath, state, reason: error.message });
    throw error;
  }
}

export async function generateConventionalCommitMessage({ task, dirtyPaths = [], commitMessageSession = launchCheapCommitMessageSession }) {
  const fallback = deterministicTaskCommitMessage({ task, dirtyPaths });
  let proposed = null;
  try {
    proposed = await commitMessageSession({ task, dirtyPaths, fallback });
  } catch {
    proposed = null;
  }
  return validateConventionalCommitMessage(proposed) ?? fallback;
}

export async function prepareCurrentBranchStartup({
  mode,
  specPath,
  io = process,
  cwd = process.cwd(),
  execGit = git,
  cacheRoot = defaultCacheRoot(),
  prompt = promptYesNo,
} = {}) {
  const repoRoot = await gitOne(execGit, ["rev-parse", "--show-toplevel"], { cwd });
  const branch = await gitOne(execGit, ["branch", "--show-current"], { cwd: repoRoot });
  if (!branch) throw new Error("Ralph must start on a current branch; detached HEAD checkouts are not supported.");
  const head = await gitOne(execGit, ["rev-parse", "HEAD"], { cwd: repoRoot });
  const status = await gitOne(execGit, ["status", "--porcelain"], { cwd: repoRoot, trim: false });
  const cache = cachePaths({ cacheRoot, repoRoot, specPath });
  const existing = await readMatchingCache(cache.path, { repoRoot, specPath });

  if (isCleanStatus(status)) {
    const state = existing ?? createRunState({ mode, specPath, repoRoot, branch, reviewBase: head });
    state.mode = mode;
    state.branch = branch;
    state.updatedAt = new Date().toISOString();
    if (!state.reviewBase) state.reviewBase = head;
    return writeStartupCache({ cachePath: cache.path, action: existing ? "resumed-clean" : "started-clean", repoRoot, state });
  }

  writeDirtyStatus(io, status);

  if (!existing) {
    throw new Error("Ralph found a dirty working tree and no matching active Ralph cache for this repo and Feature Spec. Commit, stash, or clean manually before starting Ralph.");
  }

  const approved = await prompt(io, "Resume the matching Ralph run and reconcile the dirty in-progress state? [y/N] ");
  if (!approved) throw new Error("Ralph resume declined; cache preserved.");

  const state = await reconcileBeforeResume({ state: existing, repoRoot, specPath, status, head, branch, execGit, cwd: repoRoot });
  state.mode = mode;
  state.updatedAt = new Date().toISOString();
  return writeStartupCache({ cachePath: cache.path, action: "reconciled-dirty-resume", repoRoot, state });
}

async function writeStartupCache({ cachePath, action, repoRoot, state }) {
  const normalizedState = normalizeRunState(state);
  await writeCache(cachePath, normalizedState);
  return { action, repoRoot, state: normalizedState, cachePath };
}

export async function transitionPhase({ cachePath, state, phase, currentTask = state.currentTask ?? null }) {
  return persistCacheUpdate(cachePath, state, (nextState) => ({
    ...nextState,
    phase,
    currentTask,
    phaseTransitions: [
      ...(nextState.phaseTransitions ?? []),
      { phase, at: nextState.updatedAt },
    ],
  }));
}

export async function recordAttempt({ cachePath, state, scope }) {
  if (!scope) throw new Error("Ralph attempt scope is required.");
  return persistCacheUpdate(cachePath, state, (nextState) => ({
    ...nextState,
    attempts: { ...nextState.attempts, [scope]: (nextState.attempts?.[scope] ?? 0) + 1 },
  }));
}

export async function recordExpectedChangedPaths({ cachePath, state, paths }) {
  return persistCacheUpdate(cachePath, state, (nextState) => ({
    ...nextState,
    expectedChangedPaths: uniqueStrings(paths, "expected changed path"),
  }));
}

export async function recordRunValidationOptions({ cachePath, state, options }) {
  return persistCacheUpdate(cachePath, state, (nextState) => ({
    ...nextState,
    validationOptions: normalizeValidationOptions(options),
  }));
}

export async function recordTaskValidationPlan({ cachePath, state, task = state.currentTask ?? null, plan }) {
  return persistCacheUpdate(cachePath, state, (nextState) => ({
    ...nextState,
    taskValidationPlans: [...(nextState.taskValidationPlans ?? []), { task, ...normalizeTaskValidationPlan(plan), at: nextState.updatedAt }],
  }));
}

export async function recordValidationEvidence({ cachePath, state, evidence }) {
  return persistCacheUpdate(cachePath, state, (nextState) => ({
    ...nextState,
    validationEvidence: [...(nextState.validationEvidence ?? []), evidence],
  }));
}

export async function recordTaskReviewVerdict({ cachePath, state, verdict, summary = "", task = state.currentTask ?? null }) {
  assertReviewVerdict(verdict);
  return persistCacheUpdate(cachePath, state, (nextState) => ({
    ...nextState,
    reviewVerdicts: [...(nextState.reviewVerdicts ?? []), { verdict, summary, task, at: nextState.updatedAt }],
  }));
}

export async function recordTaskCommit({ cachePath, state, commit, task = state.currentTask ?? null }) {
  if (!/^[0-9a-f]{40}$/i.test(commit ?? "")) throw new Error("Ralph task commit must be a 40-character git commit hash.");
  return persistCacheUpdate(cachePath, state, (nextState) => ({
    ...nextState,
    taskCommits: [...(nextState.taskCommits ?? []), { commit, task, at: nextState.updatedAt }],
  }));
}

export async function recordFinalRefactorCommit({ cachePath, state, commit, dirtyPaths = [] }) {
  if (!/^[0-9a-f]{40}$/i.test(commit ?? "")) throw new Error("Ralph final refactor commit must be a 40-character git commit hash.");
  return persistCacheUpdate(cachePath, state, (nextState) => ({
    ...nextState,
    finalRefactorCommit: { commit, dirtyPaths: uniqueStrings(dirtyPaths, "final refactor dirty path"), at: nextState.updatedAt },
  }));
}

export async function preserveCacheOnStop({ cachePath, state, reason }) {
  const nextState = touchState({ ...normalizeRunState(state), stop: { reason, at: new Date().toISOString() } });
  await writeCache(cachePath, nextState);
  return nextState;
}

export async function completeFinalReview({ cachePath, state, verdict, summary = "" }) {
  assertReviewVerdict(verdict);
  const nextState = touchState({ ...normalizeRunState(state), finalReviewStatus: { verdict, summary, at: new Date().toISOString() } });
  if (verdict === "PASS") {
    await rm(cachePath, { force: true });
    return nextState;
  }
  await writeCache(cachePath, nextState);
  return nextState;
}

export async function reconcileBeforeResume({ state, repoRoot, specPath, status, head, branch, execGit = git, cwd = repoRoot }) {
  if (state.repoRoot !== repoRoot) throw new Error("Ralph cache repo does not match current checkout.");
  if (state.specPath !== specPath) throw new Error("Ralph cache Feature Spec does not match requested spec.");
  if (!state.reviewBase) throw new Error("Ralph cache has no Review Base and cannot be reconciled safely.");
  const specText = await readFile(specPath, "utf8");
  verifyCachedTaskStillMatchesSpec(state.currentTask, specText);
  await verifyCommitReachableFromHead({
    commit: state.reviewBase,
    head,
    execGit,
    cwd,
    errorMessage: () => "Ralph cache Review Base is not an ancestor of HEAD; cannot reconcile safely.",
  });
  for (const entry of state.taskCommits ?? []) {
    const commit = typeof entry === "string" ? entry : entry.commit;
    await verifyCommitReachableFromHead({
      commit,
      head,
      execGit,
      cwd,
      errorMessage: (unreachableCommit) => `Ralph cached task commit ${unreachableCommit} is not reachable from current HEAD; cannot reconcile safely.`,
    });
  }
  if (isCleanStatus(status)) throw new Error("Ralph expected a dirty in-progress state during reconcile.");

  const dirtyDiff = await verifyDirtyDiffForResume({ state, status, execGit, cwd });
  const nextPhase = selectSafeNextPhase(state.phase);
  if (!nextPhase) throw new Error(`Ralph cannot select a safe next phase from cached phase '${state.phase ?? "unknown"}'.`);

  const reconciledAt = new Date().toISOString();
  return {
    ...state,
    branch,
    phase: nextPhase,
    phaseTransitions: [...(state.phaseTransitions ?? []), { phase: nextPhase, at: reconciledAt }],
    reconciledAt,
    reconcile: { head, dirtyStatus: status, dirtyDiff, resumedFromPhase: state.phase },
  };
}

export async function discoverValidationOptions({ repoRoot, specPath, specText }) {
  const root = resolve(repoRoot);
  const options = [];
  const add = (option) => {
    const normalized = normalizeValidationOption(option);
    const key = validationOptionKey(normalized);
    if (!options.some((candidate) => validationOptionKey(candidate) === key)) options.push(normalized);
  };

  for (const guidanceSource of await collectValidationGuidanceSources({ root, specPath, specText })) {
    for (const command of extractValidationGuidance(guidanceSource.text)) {
      add({ id: commandId(`${guidanceSource.source}-${command}`), command, cwd: ".", scope: "documented", source: guidanceSource.source, reason: "Project docs, agent instructions, or Feature Spec guidance mention this deterministic validation." });
    }
  }

  for (const option of REPO_VALIDATION_FILES) {
    if (await exists(join(root, option.path))) add({ ...option, cwd: ".", scope: "repo" });
  }

  for (const packagePath of await findNamedFiles(root, "package.json")) {
    const packageText = await readOptional(packagePath);
    if (!packageText) continue;
    let parsed;
    try {
      parsed = JSON.parse(packageText);
    } catch {
      continue;
    }
    const scripts = parsed.scripts ?? {};
    const preferredScript = PACKAGE_VALIDATION_SCRIPT_PRIORITY.find((script) => typeof scripts[script] === "string");
    if (preferredScript) {
      const cwd = relative(root, dirname(packagePath)) || ".";
      const command = preferredScript === "test" ? "npm test" : `npm run ${preferredScript}`;
      add({ id: `npm-${preferredScript}-${commandId(cwd)}`, command, cwd, scope: cwd === "." ? "repo" : "package", source: relative(root, packagePath), reason: `package.json defines a ${preferredScript} script matching existing test patterns.` });
    }
  }

  for (const workflowPath of await findFilesUnder(join(root, ".github", "workflows"))) {
    const workflowText = await readOptional(workflowPath);
    for (const command of extractWorkflowValidationCommands(workflowText)) {
      add({ id: `ci-${commandId(`${relative(root, workflowPath)}-${command}`)}`, command, cwd: ".", scope: "ci", source: relative(root, workflowPath), reason: "CI workflow defines this deterministic validation command." });
    }
  }

  return options;
}

export function refineTaskValidation({ task, options, expectedChangedPaths = [], changedPaths = [] }) {
  const paths = uniqueStrings([...expectedChangedPaths, ...changedPaths].filter(Boolean), "validation path");
  const taskText = task?.text ?? "";
  const taskNeedle = taskText.toLowerCase();
  const relevant = options.filter((option) => validationOptionMatchesTask(option, paths, taskNeedle));
  const selected = relevant.length > 0 ? relevant : options.filter((option) => option.scope === "repo");
  const normalized = normalizeValidationOptions(selected);
  return {
    verified: normalized.length > 0,
    options: normalized,
    requiresBroaderChecks: normalized.some((option) => option.scope === "repo"),
    rationale: normalized.length > 0 ? "Smallest discovered deterministic checks relevant to the selected task and expected paths." : "No meaningful deterministic validation was discovered; Ralph must stop rather than complete the task as verified.",
  };
}

export async function runTaskImplementationPhase({ cachePath, state, repoRoot, specPath, specText, task, validationOptions, implementationSession = launchPiImplementationSession }) {
  const expectedChangedPaths = inferTaskValidationPaths({ repoRoot, specPath, specText, task, options: validationOptions });
  const validationPlan = refineTaskValidation({ task, options: validationOptions, expectedChangedPaths });
  let nextState = await recordExpectedChangedPaths({ cachePath, state, paths: expectedChangedPaths });
  nextState = await recordTaskValidationPlan({ cachePath, state: nextState, task, plan: validationPlan });
  nextState = await transitionPhase({ cachePath, state: nextState, phase: "implementation", currentTask: task });
  const prompt = buildTaskImplementationPrompt({ repoRoot, specPath, task, validationPlan, expectedChangedPaths });
  const result = await implementationSession({ cwd: repoRoot, prompt, task, validationPlan, expectedChangedPaths });
  return { state: nextState, validationPlan, expectedChangedPaths, prompt, result: normalizeImplementationResult(result) };
}

export async function runTaskValidationPhase({ cachePath, state, repoRoot, validationPlan, phase = "validation", runCommand = runShellCommand }) {
  const nextState = await transitionPhase({ cachePath, state, phase, currentTask: state.currentTask ?? null });
  return runValidationPlanOptions({ cachePath, state: nextState, repoRoot, validationPlan, phase, runCommand });
}

export async function runTaskRefactorPhase({
  cachePath,
  state,
  repoRoot,
  task = state.currentTask ?? null,
  validationPlan,
  refactorSession = launchPiRefactorSession,
  execGit = git,
  runCommand = runShellCommand,
  afterDiff,
}) {
  const initialDiff = await taskDiff({ repoRoot, execGit });
  const initialFingerprint = await taskChangeFingerprint({ repoRoot, execGit, diff: initialDiff });
  const touchedPaths = await taskTouchedPaths({ repoRoot, execGit });
  const scopePaths = uniqueStrings(touchedPaths, "refactor scope path");
  const normalizedPlan = normalizeTaskValidationPlan(validationPlan);
  let nextState = await transitionPhase({ cachePath, state, phase: "refactor", currentTask: task });
  const prompt = buildTaskRefactorPrompt({ repoRoot, task, validationPlan: normalizedPlan, scopePaths, diff: initialDiff });
  const result = normalizeImplementationResult(await refactorSession({ cwd: repoRoot, prompt, task, validationPlan: normalizedPlan, scopePaths, diff: initialDiff }));
  const finalFingerprint = afterDiff ? await afterDiff() : await taskChangeFingerprint({ repoRoot, execGit });
  const changedFiles = finalFingerprint !== initialFingerprint;
  const validationEvidence = [];

  if (changedFiles) {
    const validation = await runValidationPlanOptions({ cachePath, state: nextState, repoRoot, validationPlan: normalizedPlan, phase: "post-refactor", runCommand });
    nextState = validation.state;
    validationEvidence.push(...validation.validationEvidence);
  }

  return { state: nextState, prompt, result, changedFiles, validationEvidence, scopePaths };
}

export async function runWholeFeatureRefactorPhase({
  cachePath,
  state,
  repoRoot,
  validationOptions = state.validationOptions ?? [],
  refactorSession = launchPiRefactorSession,
  execGit = git,
  runCommand = runShellCommand,
}) {
  const reviewBase = state.reviewBase;
  if (!/^[0-9a-f]{40}$/i.test(reviewBase ?? "")) throw new Error("Ralph whole-feature refactor requires a cached Review Base.");
  const ralphDiff = await ralphProducedDiff({ repoRoot, reviewBase, execGit });
  const scopePaths = uniqueStrings(pathsFromDiff(ralphDiff), "whole-feature refactor scope path");
  const validationPlan = normalizeTaskValidationPlan({ verified: validationOptions.length > 0, options: validationOptions });
  const initialFingerprint = await taskChangeFingerprint({ repoRoot, execGit });
  let nextState = await transitionPhase({ cachePath, state, phase: "final-refactor", currentTask: null });
  const prompt = buildWholeFeatureRefactorPrompt({ repoRoot, reviewBase, validationPlan, scopePaths, diff: ralphDiff });
  const result = normalizeImplementationResult(await refactorSession({ cwd: repoRoot, prompt, validationPlan, scopePaths, diff: ralphDiff }));
  const changedFiles = (await taskChangeFingerprint({ repoRoot, execGit })) !== initialFingerprint;
  const validationEvidence = [];

  if (!changedFiles) return { status: "no-changes", state: nextState, prompt, result, changedFiles, validationEvidence, scopePaths };

  const dirtyPaths = await dirtyWorkingTreePaths({ repoRoot, execGit });
  try {
    assertDirtyPathsAreExpected({ dirtyPaths, expectedPaths: scopePaths });
  } catch (error) {
    nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: error.message.replace("Ralph task commit", "Ralph final refactor commit") });
    return { status: "unexpected-files", state: nextState, prompt, result, changedFiles, validationEvidence, scopePaths, dirtyPaths };
  }

  const validation = await runValidationPlanOptions({ cachePath, state: nextState, repoRoot, validationPlan, phase: "post-final-refactor", runCommand });
  nextState = validation.state;
  validationEvidence.push(...validation.validationEvidence);
  if (!hasPassingDeterministicValidation(validationEvidence)) {
    nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: "final refactor validation failed" });
    return { status: "validation-failed", state: nextState, prompt, result, changedFiles, validationEvidence, scopePaths, dirtyPaths };
  }

  const commit = await createFinalRefactorCommit({ repoRoot, dirtyPaths, execGit });
  nextState = await recordFinalRefactorCommit({ cachePath, state: nextState, commit, dirtyPaths });
  nextState = await transitionPhase({ cachePath, state: nextState, phase: "final-refactor-committed", currentTask: null });
  return { status: "committed", state: nextState, prompt, result, changedFiles, validationEvidence, scopePaths, dirtyPaths, commit };
}

async function ralphProducedDiff({ repoRoot, reviewBase, execGit }) {
  return gitOne(execGit, ["diff", "--binary", `${reviewBase}..HEAD`], { cwd: repoRoot, trim: false });
}

async function createFinalRefactorCommit({ repoRoot, dirtyPaths, execGit }) {
  await gitOne(execGit, ["add", "--", ...dirtyPaths], { cwd: repoRoot, trim: false });
  await gitOne(execGit, ["commit", "-m", "refactor(ralph): simplify completed feature implementation", "-m", "Apply behavior-preserving cleanup after all Ralph Feature Spec tasks completed."], { cwd: repoRoot, trim: false });
  return gitOne(execGit, ["rev-parse", "HEAD"], { cwd: repoRoot });
}

export async function runTaskReviewPhase({
  cachePath,
  state,
  repoRoot,
  specPath,
  specText,
  task = state.currentTask ?? null,
  validationEvidence = state.validationEvidence ?? [],
  implementationSummary = "",
  refactorSummary = "",
  reviewSession = launchPiTaskReviewSession,
  execGit = git,
}) {
  const diff = await taskDiff({ repoRoot, execGit });
  const changedPaths = await taskTouchedPaths({ repoRoot, execGit });
  const changedFiles = await collectChangedFileSnapshots({ repoRoot, paths: changedPaths });
  let nextState = await transitionPhase({ cachePath, state, phase: "task-review", currentTask: task });
  const prompt = buildTaskReviewPrompt({
    repoRoot,
    specPath,
    specText,
    task,
    diff,
    changedPaths,
    changedFiles,
    validationEvidence,
    implementationSummary,
    refactorSummary,
  });
  const result = await reviewSession({ cwd: repoRoot, prompt, task, diff, changedPaths, validationEvidence });
  const verdict = parseTaskReviewVerdict(result?.stdout ?? result?.text ?? result?.summary ?? "");
  nextState = await recordTaskReviewVerdict({
    cachePath,
    state: nextState,
    task,
    verdict: verdict.verdict,
    summary: formatReviewSummary(verdict),
  });
  return { state: nextState, prompt, result, verdict, diff, changedPaths, changedFiles };
}

export async function runTaskFixReviewLoop({
  cachePath,
  state,
  repoRoot,
  specPath,
  specText,
  task = state.currentTask ?? null,
  validationPlan,
  review,
  validationEvidence = state.validationEvidence ?? [],
  fixSession = launchPiTaskFixSession,
  refactorSession = launchPiRefactorSession,
  reviewSession = launchPiTaskReviewSession,
  execGit = git,
  runCommand = runShellCommand,
}) {
  let currentReview = review;
  let nextState = state;
  let accumulatedEvidence = [...validationEvidence];
  const attemptScope = taskFixAttemptScope(task);
  const usedAttempts = persistedAttemptCount(nextState, attemptScope);

  if (currentReview.verdict.verdict === "PASS") return { status: "already-passed", state: nextState, review: currentReview, iterations: 0 };
  if (currentReview.verdict.verdict === "BLOCKED") {
    nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: `task review blocked: ${currentReview.verdict.summary}`.trim() });
    return { status: "blocked", state: nextState, review: currentReview, iterations: 0 };
  }
  if (usedAttempts >= MAX_TASK_FIX_REVIEW_ITERATIONS) {
    nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: `task review exhausted ${MAX_TASK_FIX_REVIEW_ITERATIONS} fix/retest/re-review iterations without PASS` });
    return { status: "exhausted", state: nextState, review: currentReview, iterations: MAX_TASK_FIX_REVIEW_ITERATIONS };
  }

  for (let iteration = usedAttempts + 1; iteration <= MAX_TASK_FIX_REVIEW_ITERATIONS; iteration += 1) {
    nextState = await recordAttempt({ cachePath, state: nextState, scope: attemptScope });
    nextState = await transitionPhase({ cachePath, state: nextState, phase: "task-fix", currentTask: task });
    const prompt = buildTaskFixPrompt({
      repoRoot,
      task,
      reviewVerdict: currentReview.verdict,
      validationPlan,
      diff: currentReview.diff ?? "",
      changedPaths: currentReview.changedPaths ?? [],
      iteration,
    });
    const fixResult = normalizeImplementationResult(await fixSession({ cwd: repoRoot, prompt, task, reviewVerdict: currentReview.verdict, iteration }));
    let fixRefactor = { changedFiles: false, validationEvidence: [], result: { status: "fix-area refactor skipped" } };
    if (fixAreaRefactorRecommended(fixResult)) {
      fixRefactor = await runFixAreaRefactorPhase({ cachePath, state: nextState, repoRoot, task, validationPlan, refactorSession, execGit, runCommand });
      nextState = fixRefactor.state;
      accumulatedEvidence = [...accumulatedEvidence, ...fixRefactor.validationEvidence];
      if (fixRefactor.changedFiles && !hasPassingDeterministicValidation(fixRefactor.validationEvidence)) {
        nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: `fix-area refactor validation failed during iteration ${iteration}` });
        return { status: "validation-failed", state: nextState, review: currentReview, iterations: iteration, prompt, fixResult, fixRefactor };
      }
    }
    const validation = await runTaskValidationPhase({ cachePath, state: nextState, repoRoot, validationPlan, phase: "fix-validation", runCommand });
    nextState = validation.state;
    accumulatedEvidence = [...accumulatedEvidence, ...validation.validationEvidence];
    if (!hasPassingDeterministicValidation(validation.validationEvidence)) {
      nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: `fix validation failed during iteration ${iteration}` });
      return { status: "validation-failed", state: nextState, review: currentReview, iterations: iteration, prompt, fixResult, fixRefactor, validationEvidence: validation.validationEvidence };
    }

    currentReview = await runTaskReviewPhase({
      cachePath,
      state: nextState,
      repoRoot,
      specPath,
      specText,
      task,
      validationEvidence: accumulatedEvidence,
      implementationSummary: fixResult.status,
      refactorSummary: fixRefactor.result.status,
      reviewSession,
      execGit,
    });
    nextState = currentReview.state;
    if (currentReview.verdict.verdict === "PASS") return { status: "passed", state: nextState, review: currentReview, iterations: iteration, prompt, fixResult, fixRefactor };
    if (currentReview.verdict.verdict === "BLOCKED") {
      nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: `task review blocked after fix iteration ${iteration}: ${currentReview.verdict.summary}`.trim() });
      return { status: "blocked", state: nextState, review: currentReview, iterations: iteration, prompt, fixResult, fixRefactor };
    }
  }

  nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: `task review exhausted ${MAX_TASK_FIX_REVIEW_ITERATIONS} fix/retest/re-review iterations without PASS` });
  return { status: "exhausted", state: nextState, review: currentReview, iterations: MAX_TASK_FIX_REVIEW_ITERATIONS };
}

async function runFixAreaRefactorPhase({ cachePath, state, repoRoot, task, validationPlan, refactorSession, execGit, runCommand }) {
  const initialDiff = await taskDiff({ repoRoot, execGit });
  const initialFingerprint = await taskChangeFingerprint({ repoRoot, execGit, diff: initialDiff });
  const scopePaths = uniqueStrings(await taskTouchedPaths({ repoRoot, execGit }), "fix-area refactor scope path");
  let nextState = await transitionPhase({ cachePath, state, phase: "fix-area-refactor", currentTask: task });
  const prompt = buildFixAreaRefactorPrompt({ repoRoot, task, validationPlan, scopePaths, diff: initialDiff });
  const result = normalizeImplementationResult(await refactorSession({ cwd: repoRoot, prompt, task, validationPlan, scopePaths, diff: initialDiff }));
  const changedFiles = (await taskChangeFingerprint({ repoRoot, execGit })) !== initialFingerprint;
  const validationEvidence = [];
  if (changedFiles) {
    const validation = await runValidationPlanOptions({ cachePath, state: nextState, repoRoot, validationPlan, phase: "post-fix-refactor", runCommand });
    nextState = validation.state;
    validationEvidence.push(...validation.validationEvidence);
  }
  return { state: nextState, prompt, result, changedFiles, validationEvidence, scopePaths };
}

export function hasPassingDeterministicValidation(validationEvidence) {
  if (!Array.isArray(validationEvidence) || validationEvidence.length === 0) return false;
  return validationEvidence.some((evidence) => evidence.exitCode === 0) && validationEvidence.every((evidence) => evidence.exitCode === 0);
}

function expectedCommitPaths({ repoRoot, specPath, state }) {
  return uniqueStrings([...(state.expectedChangedPaths ?? []), relative(repoRoot, specPath) || specPath], "expected commit path");
}

async function dirtyWorkingTreePaths({ repoRoot, execGit }) {
  const status = await gitOne(execGit, ["status", "--porcelain"], { cwd: repoRoot, trim: false });
  return uniqueStrings(parsePorcelainEntries(status).map((entry) => entry.path).sort(), "dirty path");
}

function assertDirtyPathsAreExpected({ dirtyPaths, expectedPaths }) {
  if (dirtyPaths.length === 0) throw new Error("Ralph cannot create a task commit because no dirty files are present.");
  const unexpected = dirtyPaths.filter((path) => !expectedPaths.some((expected) => path === expected || path.startsWith(`${expected.replace(/\/$/, "")}/`)));
  if (unexpected.length > 0) throw new Error(`Ralph task commit contains unexpected dirty files: ${unexpected.join(", ")}.`);
}

function deterministicTaskCommitMessage({ task, dirtyPaths = [] }) {
  const summary = taskSummaryForCommit(task?.text ?? "verified task");
  const body = [
    `Complete Ralph Feature Spec task${Number.isInteger(task?.lineNumber) ? ` from line ${task.lineNumber}` : ""}.`,
    "Includes the verified implementation changes, validation evidence, and Feature Spec checkbox update.",
    dirtyPaths.length > 0 ? `Changed paths: ${dirtyPaths.join(", ")}` : "Changed paths: none recorded",
  ].join("\n");
  return { title: `feat(ralph): ${summary}`, body };
}

function taskSummaryForCommit(text) {
  const stripped = String(text).replace(/^\s*\d+\.\s*/, "").replace(/[`*_]/g, "").trim().toLowerCase();
  const words = stripped.split(/\s+/).filter(Boolean).slice(0, 7).join(" ");
  const summary = words || "complete verified task";
  return summary.length <= 52 ? summary : summary.slice(0, 52).replace(/\s+\S*$/, "");
}

function validateConventionalCommitMessage(value) {
  const parsed = normalizeCommitMessageCandidate(value);
  if (!parsed) return null;
  if (!/^(feat|fix|refactor|test|docs|chore|build|ci|perf|style)(\([a-z0-9._-]+\))?: .{1,72}$/.test(parsed.title)) return null;
  if (parsed.title.length > 100) return null;
  return parsed;
}

function normalizeCommitMessageCandidate(value) {
  let candidate = value;
  if (typeof value?.stdout === "string") {
    const line = value.stdout.trim().split(/\r?\n/).reverse().find(isJsonObjectLine);
    if (line) {
      try {
        candidate = JSON.parse(line);
      } catch {
        return null;
      }
    }
  }
  if (typeof candidate === "string") {
    const lines = candidate.trim().split(/\r?\n/);
    candidate = { title: lines[0], body: lines.slice(1).join("\n").trim() };
  }
  if (!candidate || typeof candidate !== "object") return null;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const body = typeof candidate.body === "string" && candidate.body.trim() ? candidate.body.trim() : "Verified Ralph Feature Spec task completion.";
  if (!title) return null;
  return { title, body };
}

export function launchPiImplementationSession({ cwd, prompt, spawnProcess = spawn, piBin = process.env.PI_RALPH_PI_BIN ?? "pi" }) {
  return launchPiPromptSession({
    cwd,
    prompt,
    spawnProcess,
    piBin,
    sessionEnv: { PI_RALPH_IMPLEMENTATION_SESSION: "1" },
    label: "implementation",
    successStatus: "implementation session completed",
  });
}

export function launchPiRefactorSession({ cwd, prompt, spawnProcess = spawn, piBin = process.env.PI_RALPH_PI_BIN ?? "pi" }) {
  return launchPiPromptSession({
    cwd,
    prompt,
    spawnProcess,
    piBin,
    sessionEnv: { PI_RALPH_REFACTOR_SESSION: "1" },
    label: "refactor",
    successStatus: "refactor session completed",
  });
}

export function launchPiTaskReviewSession({ cwd, prompt, spawnProcess = spawn, piBin = process.env.PI_RALPH_PI_BIN ?? "pi" }) {
  return launchPiPromptSession({
    cwd,
    prompt,
    spawnProcess,
    piBin,
    sessionEnv: { PI_RALPH_TASK_REVIEW_SESSION: "1" },
    label: "task review",
    successStatus: "task review session completed",
  });
}

export function launchPiTaskFixSession({ cwd, prompt, spawnProcess = spawn, piBin = process.env.PI_RALPH_PI_BIN ?? "pi" }) {
  return launchPiPromptSession({
    cwd,
    prompt,
    spawnProcess,
    piBin,
    sessionEnv: { PI_RALPH_TASK_FIX_SESSION: "1" },
    label: "task fix",
    successStatus: "task fix session completed",
  });
}

export function launchPiFinalReviewSession({ cwd, prompt, spawnProcess = spawn, piBin = process.env.PI_RALPH_PI_BIN ?? "pi" }) {
  return launchPiPromptSession({
    cwd,
    prompt,
    spawnProcess,
    piBin,
    sessionEnv: { PI_RALPH_FINAL_REVIEW_SESSION: "1" },
    label: "final review",
    successStatus: "final review session completed",
  });
}

export function launchCheapCommitMessageSession({ task, dirtyPaths = [], fallback, spawnProcess = spawn, piBin = process.env.PI_RALPH_PI_BIN ?? "pi", model = process.env.PI_RALPH_CHEAP_MODEL }) {
  if (!model) return null;
  const prompt = [
    "Propose a Conventional Commit message for one verified Ralph Feature Spec task.",
    "Return only JSON: {\"title\":\"type(scope): summary\",\"body\":\"...\"}.",
    "Use a cheap non-thinking response. Do not mention unverified work.",
    `Task: ${task?.text ?? "unknown"}`,
    `Changed paths: ${dirtyPaths.join(", ") || "unknown"}`,
    `Fallback if unsure: ${fallback?.title ?? "feat(ralph): complete verified task"}`,
  ].join("\n");
  return launchPiPromptSession({
    cwd: process.cwd(),
    prompt,
    spawnProcess,
    piBin,
    sessionEnv: { PI_RALPH_COMMIT_MESSAGE_SESSION: "1" },
    label: "commit message",
    successStatus: "commit message generated",
    args: ["-p", "--model", model],
  });
}

function launchPiPromptSession({ cwd, prompt, spawnProcess, piBin, sessionEnv, label, successStatus, args = ["-p"] }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnProcess(piBin, args, {
      cwd,
      env: { ...process.env, ...sessionEnv },
      stdio: ["pipe", "pipe", "pipe"],
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
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        const error = new Error(stderr.trim() || `Pi ${label} session exited with status ${exitCode}`);
        error.exitCode = exitCode;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolvePromise({ status: successStatus, exitCode, stdout, stderr });
    });
    child.stdin?.end(prompt);
  });
}

export function buildTaskImplementationPrompt({ repoRoot, specPath, task, validationPlan, expectedChangedPaths = [] }) {
  if (!task?.text) throw new Error("Ralph implementation prompt requires a selected task.");
  const normalizedPlan = normalizeTaskValidationPlan(validationPlan);
  const paths = uniqueStrings(expectedChangedPaths, "expected changed path");
  const validationLines = formatValidationPlanPromptBullets(normalizedPlan, "No deterministic validation selected. Stop and report the task as unverified; do not edit.");
  const pathLines = formatPromptBullets(
    paths,
    (path) => path,
    "Not inferred; state the expected touched files before editing and keep scope to the selected task.",
  );
  const guidanceLines = formatPromptBullets(
    Array.isArray(task.guidance) ? task.guidance : [],
    (line) => line,
    "No task-specific sub-guidance was found under this checkbox.",
  );
  const tddGuidance = meaningfulAutomatedBehaviorTestApplicable({ task, validationPlan: normalizedPlan })
    ? "TDD: A meaningful automated behavior test appears applicable. Write or update one failing automated behavior test before implementation, run it to observe the expected failure, then implement the smallest behavior change and rerun the selected deterministic validation. Do not batch unrelated tests."
    : "TDD: Do not invent a new test solely for TDD. Identify deterministic validation before editing, then make the smallest task-scoped change and run the selected validation.";

  return [
    "Implement exactly one Ralph Feature Spec task in this repository.",
    "",
    `Repository: ${repoRoot}`,
    `Feature Spec: ${specPath}`,
    `Selected task (line ${task.lineNumber ?? "unknown"}): ${task.text}`,
    "",
    "Task-specific Feature Spec guidance:",
    guidanceLines,
    "",
    "Before editing, state the deterministic validation you will use and why it is sufficient for this task.",
    tddGuidance,
    "",
    "Selected deterministic validation (chosen before editing):",
    validationLines,
    "",
    "Expected task-scoped changed paths:",
    pathLines,
    "",
    "Implementation constraints:",
    "- Keep changes scoped to the selected task; do not update the Feature Spec checkbox and do not commit.",
    "- Follow repository instructions and domain language.",
    "- If validation cannot provide meaningful deterministic evidence, stop and report the task as unverified.",
  ].join("\n");
}

export function buildTaskReviewPrompt({
  repoRoot,
  specPath,
  specText,
  task,
  diff = "",
  changedPaths = [],
  changedFiles = [],
  validationEvidence = [],
  implementationSummary = "",
  refactorSummary = "",
}) {
  if (!task?.text) throw new Error("Ralph task review prompt requires a selected task.");
  const specSections = relevantSpecSections({ specText, task });
  const changedPathLines = formatPromptBullets(uniqueStrings(changedPaths, "review changed path"), (path) => path, "No changed paths were detected.");
  const changedFileLines = formatPromptBullets(
    changedFiles,
    formatChangedFileSnapshot,
    "No changed file snapshots were available.",
  );
  const evidenceLines = formatPromptBullets(
    validationEvidence,
    formatValidationEvidence,
    "No deterministic validation evidence was provided; return BLOCKED unless the task is explicitly unreviewable without it.",
  );

  return [
    "Review exactly one Ralph Feature Spec task from a fresh context.",
    "Use only the review inputs in this prompt: relevant Feature Spec text, task diff, changed files, implementation/refactor summaries, and validation evidence.",
    "Do not ask for broad repository context, do not review unrelated files, and do not require subjective preferences as fixes.",
    "Return a machine-readable verdict as JSON on the final line: {\"verdict\":\"PASS|FAIL|BLOCKED\",\"summary\":\"...\",\"requiredFixes\":[\"...\"]}.",
    "If verdict is FAIL, requiredFixes must contain only required fixes for correctness, spec compliance, validation, safety, or maintainability defects introduced by this task.",
    "Use BLOCKED only when the provided inputs are insufficient or validation evidence is missing/invalid.",
    "",
    `Repository: ${repoRoot}`,
    `Feature Spec: ${specPath}`,
    `Selected task (line ${task.lineNumber ?? "unknown"}): ${task.text}`,
    "",
    "Relevant Feature Spec sections:",
    specSections,
    "",
    "Implementation summary:",
    implementationSummary || "(none provided)",
    "",
    "Refactor summary:",
    refactorSummary || "(none provided)",
    "",
    "Changed paths:",
    changedPathLines,
    "",
    "Validation evidence:",
    evidenceLines,
    "",
    "Changed file snapshots:",
    changedFileLines,
    "",
    "Task diff:",
    diff.trim() ? diff : "(no current task diff detected)",
  ].join("\n");
}

export function buildTaskFixPrompt({ repoRoot, task, reviewVerdict, validationPlan, diff = "", changedPaths = [], iteration }) {
  if (!task?.text) throw new Error("Ralph task fix prompt requires a selected task.");
  const normalizedPlan = normalizeTaskValidationPlan(validationPlan);
  const fixes = normalizeRequiredFixes(reviewVerdict?.requiredFixes);
  if (fixes.length === 0) throw new Error("Ralph task fix prompt requires review requiredFixes.");
  const validationLines = formatValidationPlanPromptBullets(normalizedPlan, "No deterministic validation selected. Stop and report the task as unverified; do not edit.");
  const pathLines = formatPromptBullets(uniqueStrings(changedPaths, "fix changed path"), (path) => path, "No changed paths were provided; inspect the diff and stop if scope is unclear.");
  const fixLines = formatPromptBullets(fixes, (fix) => fix, "No required fixes were provided.");

  return [
    "Fix only required issues from the Ralph task review.",
    `Iteration ${iteration} of ${MAX_TASK_FIX_REVIEW_ITERATIONS}.`,
    "Do not implement subjective preferences, unrelated improvements, Feature Spec checkbox updates, or commits.",
    "Keep scope to the review's required fixes. If a requested change is not required for correctness, spec compliance, validation, safety, or introduced maintainability defects, do not make it.",
    "If your required fixes introduce obvious complexity or duplication, report that a fix-area refactor is recommended; Ralph may run a separate behavior-preserving refactor before revalidation.",
    "Before editing, restate the deterministic validation you will rerun after the fix.",
    "",
    `Repository: ${repoRoot}`,
    `Selected task (line ${task.lineNumber ?? "unknown"}): ${task.text}`,
    "",
    "Required fixes:",
    fixLines,
    "",
    "Review summary:",
    reviewVerdict?.summary || "(none provided)",
    "",
    "Changed paths in scope:",
    pathLines,
    "",
    "Validation to rerun after the fix:",
    validationLines,
    "",
    "Current task diff:",
    diff.trim() ? diff : "(no current task diff detected)",
  ].join("\n");
}

export function parseTaskReviewVerdict(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error("Ralph task review returned no machine-readable verdict.");
  const jsonLine = trimmed.split(/\r?\n/).reverse().find(isJsonObjectLine);
  if (jsonLine) return normalizeTaskReviewVerdict(parseReviewVerdictJson(jsonLine));
  const match = /^(PASS|FAIL|BLOCKED)(?::|\s|-)?\s*([\s\S]*)$/m.exec(trimmed);
  if (!match) throw new Error("Ralph task review must return PASS, FAIL, or BLOCKED.");
  return normalizeTaskReviewVerdict({ verdict: match[1], summary: match[2].trim() });
}

export function buildTaskRefactorPrompt({ repoRoot, task, validationPlan, scopePaths = [], diff = "" }) {
  if (!task?.text) throw new Error("Ralph refactor prompt requires a selected task.");
  const normalizedPlan = normalizeTaskValidationPlan(validationPlan);
  const validationLines = formatValidationPlanPromptBullets(normalizedPlan, "No deterministic validation selected. Do not refactor without a validation command.");
  const scopeLines = formatPromptBullets(
    uniqueStrings(scopePaths, "refactor scope path"),
    (path) => path,
    "No task touched files were detected; inspect the task diff and stop if scope is unclear.",
  );

  return [
    "Run a Ralph per-task refactor session after initial validation.",
    "Use the refactor skill contract: Improve code shape without changing behavior.",
    "Do not implement new feature behavior, update the Feature Spec checkbox, or commit.",
    "Preserve public contracts, data shape, error behavior, and user-visible output.",
    "Skip changes that would make the code merely different rather than simpler.",
    "",
    `Repository: ${repoRoot}`,
    `Selected task (line ${task.lineNumber ?? "unknown"}): ${task.text}`,
    "",
    "Refactor scope is limited to the task diff or touched files:",
    scopeLines,
    "",
    "Rerun validation if you change files:",
    validationLines,
    "",
    "Current task diff for context:",
    diff.trim() ? diff : "(no current task diff detected)",
  ].join("\n");
}

export async function runFinalBranchReviewPhase({
  cachePath,
  state,
  repoRoot,
  specPath = state.specPath,
  validationOptions = state.validationOptions ?? [],
  finalReviewSession = launchPiFinalReviewSession,
  execGit = git,
  runCommand = runShellCommand,
}) {
  const reviewBase = state.reviewBase;
  if (!/^[0-9a-f]{40}$/i.test(reviewBase ?? "")) throw new Error("Ralph final branch review requires a cached Review Base.");
  const validationPlan = normalizeTaskValidationPlan({ verified: validationOptions.length > 0, options: validationOptions });
  let nextState = await transitionPhase({ cachePath, state, phase: "final-validation", currentTask: null });

  if (validationPlan.options.length === 0) {
    nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: "final deterministic validation unavailable" });
    return finalReviewBlockedResult({ validationStatus: "unavailable", state: nextState, summary: "final deterministic validation unavailable" });
  }

  const validation = await runValidationPlanOptions({ cachePath, state: nextState, repoRoot, validationPlan, phase: "final-validation", runCommand });
  nextState = validation.state;
  if (!hasPassingDeterministicValidation(validation.validationEvidence)) {
    nextState = await preserveCacheOnStop({ cachePath, state: nextState, reason: "final validation failed" });
    return finalReviewBlockedResult({ validationStatus: "failed", state: nextState, summary: "final validation failed", validationEvidence: validation.validationEvidence });
  }

  const diff = await ralphProducedDiff({ repoRoot, reviewBase, execGit });
  const commits = await gitOne(execGit, ["log", `${reviewBase}..HEAD`, "--oneline"], { cwd: repoRoot, trim: false });
  nextState = await transitionPhase({ cachePath, state: nextState, phase: "final-review", currentTask: null });
  const prompt = buildFinalBranchReviewPrompt({ repoRoot, specPath, reviewBase, diff, commits, validationEvidence: validation.validationEvidence });
  const result = await finalReviewSession({ cwd: repoRoot, prompt, reviewBase, diff, commits, validationEvidence: validation.validationEvidence });
  const verdict = parseFinalReviewVerdict(result?.stdout ?? result?.text ?? result?.summary ?? "");
  nextState = await completeFinalReview({ cachePath, state: nextState, verdict: verdict.verdict, summary: verdict.summary });
  return { status: verdict.verdict === "PASS" ? "ready" : "not-ready", validationStatus: "passed", state: nextState, prompt, result, verdict, diff, commits, validationEvidence: validation.validationEvidence };
}

export function buildWholeFeatureRefactorPrompt({ repoRoot, reviewBase, validationPlan, scopePaths = [], diff = "" }) {
  const normalizedPlan = normalizeTaskValidationPlan(validationPlan);
  const validationLines = formatValidationPlanPromptBullets(normalizedPlan, "No deterministic validation selected. Do not refactor without a validation command.");
  const scopeLines = formatPromptBullets(
    uniqueStrings(scopePaths, "whole-feature refactor scope path"),
    (path) => path,
    "No Ralph-produced changed files were detected; inspect the diff and stop if scope is unclear.",
  );

  return [
    "Run a bounded Ralph whole-feature refactor session after all implementation tasks are complete.",
    "Use the refactor skill contract: Improve code shape without changing behavior.",
    "Do not implement new feature behavior, update the Feature Spec checkbox, or commit.",
    "Preserve public contracts, data shape, error behavior, and user-visible output.",
    "Prefer no change over speculative churn; only simplify code already changed by this Ralph run.",
    "If you change files, Ralph will run broad relevant validation and create a separate refactor(...) commit.",
    "If no worthwhile simplification exists, report that no refactor changes were needed.",
    "",
    `Repository: ${repoRoot}`,
    `Review Base: ${reviewBase}`,
    "",
    "Refactor scope is limited to files in the Ralph-produced diff:",
    scopeLines,
    "",
    "Validation Ralph will rerun if files change:",
    validationLines,
    "",
    "Ralph-produced diff:",
    diff.trim() ? diff : "(no Ralph-produced diff detected)",
  ].join("\n");
}

export function buildFinalBranchReviewPrompt({ repoRoot, specPath, reviewBase, diff = "", commits = "", validationEvidence = [] }) {
  const evidenceLines = formatPromptBullets(
    validationEvidence,
    formatValidationEvidence,
    "No deterministic final validation evidence was provided; return BLOCKED.",
  );

  return [
    "Run the existing review skill as a final clean-context two-axis Ralph branch review.",
    "Review exactly the Ralph-produced branch diff, using this two-dot command: git diff <Review Base>..HEAD.",
    "Do not use a merge-base/three-dot comparison for this Ralph final review.",
    "Evaluate both axes from the review skill:",
    "- Standards: repository standards, domain language, architecture conventions, maintainability, and CI-quality validation expectations.",
    "- Spec: whether the Ralph-produced diff faithfully implements the Feature Spec and review checklist.",
    "Return a machine-readable verdict as JSON on the final line: {\"verdict\":\"PASS|FAIL|BLOCKED\",\"standards\":\"PASS|FAIL|BLOCKED\",\"spec\":\"PASS|FAIL|BLOCKED\",\"summary\":\"...\"}.",
    "The overall verdict is PASS only when both Standards and Spec pass. Use BLOCKED if required review inputs are insufficient.",
    "If final review fails or blocks, do not claim the branch is ready; Ralph will preserve cache.",
    "If final review passes, Ralph will delete the active cache for this Feature Spec immediately after recording PASS.",
    "",
    `Repository: ${repoRoot}`,
    `Feature Spec: ${specPath}`,
    `Review Base: ${reviewBase}`,
    `Diff command: git diff ${reviewBase}..HEAD`,
    "",
    "Commits under review (git log <Review Base>..HEAD --oneline):",
    commits.trim() ? commits.trim() : "(no commits reported)",
    "",
    "Final validation evidence:",
    evidenceLines,
    "",
    "Ralph-produced diff:",
    diff.trim() ? diff : "(no Ralph-produced diff detected)",
  ].join("\n");
}

export function parseFinalReviewVerdict(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error("Ralph final review returned no machine-readable verdict.");
  const jsonLine = trimmed.split(/\r?\n/).reverse().find(isJsonObjectLine);
  if (!jsonLine) throw new Error("Ralph final review must return JSON with explicit Standards and Spec verdicts.");
  return normalizeFinalReviewVerdict(parseReviewVerdictJson(jsonLine));
}

function normalizeFinalReviewVerdict(value) {
  const standards = explicitFinalReviewAxis(value, "standards");
  const spec = explicitFinalReviewAxis(value, "spec");
  assertReviewVerdict(standards);
  assertReviewVerdict(spec);
  const requestedVerdict = String(value?.verdict ?? "").trim().toUpperCase();
  if (requestedVerdict) assertReviewVerdict(requestedVerdict);
  const verdict = finalReviewVerdictFromAxes({ standards, spec, requestedVerdict });
  const summary = typeof value?.summary === "string" ? value.summary.trim() : `Standards: ${standards}; Spec: ${spec}`;
  return { verdict, summary, axes: { standards, spec } };
}

function explicitFinalReviewAxis(value, axis) {
  const raw = value?.[axis] ?? value?.axes?.[axis];
  const verdict = String(raw ?? "").trim().toUpperCase();
  if (!verdict) throw new Error(`Ralph final review JSON must include an explicit ${axis} verdict.`);
  return verdict;
}

function finalReviewBlockedResult({ validationStatus, state, summary, validationEvidence = [] }) {
  return {
    status: "blocked",
    validationStatus,
    state,
    verdict: { verdict: "BLOCKED", summary, axes: { standards: "BLOCKED", spec: "BLOCKED" } },
    validationEvidence,
  };
}

function finalReviewVerdictFromAxes({ standards, spec, requestedVerdict }) {
  if (standards === "PASS" && spec === "PASS" && requestedVerdict !== "FAIL" && requestedVerdict !== "BLOCKED") return "PASS";
  if (requestedVerdict === "BLOCKED" || standards === "BLOCKED" || spec === "BLOCKED") return "BLOCKED";
  return "FAIL";
}

function buildFixAreaRefactorPrompt({ repoRoot, task, validationPlan, scopePaths = [], diff = "" }) {
  if (!task?.text) throw new Error("Ralph fix-area refactor prompt requires a selected task.");
  const normalizedPlan = normalizeTaskValidationPlan(validationPlan);
  const validationLines = formatValidationPlanPromptBullets(normalizedPlan, "No deterministic validation selected. Do not refactor without a validation command.");
  const scopeLines = formatPromptBullets(uniqueStrings(scopePaths, "fix-area refactor scope path"), (path) => path, "No touched fix-area files were detected; inspect the diff and stop if scope is unclear.");

  return [
    "Run an optional Ralph fix-area refactor session after required review fixes introduced complexity.",
    "Use the refactor skill contract: Improve code shape without changing behavior.",
    "Limit changes to the fix area and touched files; do not add feature behavior, update the Feature Spec checkbox, or commit.",
    "Prefer no change over speculative churn.",
    "",
    `Repository: ${repoRoot}`,
    `Selected task (line ${task.lineNumber ?? "unknown"}): ${task.text}`,
    "",
    "Fix area scope:",
    scopeLines,
    "",
    "Rerun validation if you change files:",
    validationLines,
    "",
    "Current fix-area diff:",
    diff.trim() ? diff : "(no current task diff detected)",
  ].join("\n");
}

async function collectChangedFileSnapshots({ repoRoot, paths }) {
  const snapshots = [];
  for (const path of uniqueStrings(paths, "review changed path")) {
    const absolutePath = join(repoRoot, path);
    let content;
    try {
      content = await readFile(absolutePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") continue;
      throw error;
    }
    snapshots.push({ path, language: languageForPath(path), content: truncateText(content, 12000) });
  }
  return snapshots;
}

function relevantSpecSections({ specText, task }) {
  const sections = [];
  const requirementNames = requirementNamesForTask(task);
  const taskBlock = selectedTaskSpecBlock({ specText, task });
  if (taskBlock) sections.push(taskBlock);
  for (const name of requirementNames) {
    const block = requirementBlock(specText, name);
    if (block) sections.push(block);
  }
  return sections.length > 0 ? sections.join("\n\n---\n\n") : `Selected task: ${task.text}`;
}

function selectedTaskSpecBlock({ specText, task }) {
  if (!Number.isInteger(task?.lineNumber)) return `Selected task: ${task?.text ?? "unknown"}`;
  const lines = specText.split(/\r?\n/);
  const start = task.lineNumber - 1;
  if (start < 0 || start >= lines.length) return `Selected task: ${task.text}`;
  let end = start + 1;
  while (end < lines.length && !NEXT_LEVEL_TWO_HEADING_PATTERN.test(lines[end]) && !TOP_LEVEL_CHECKBOX_PATTERN.test(lines[end])) end += 1;
  return lines.slice(start, end).join("\n").trim();
}

function requirementNamesForTask(task) {
  const text = [task?.text, ...(Array.isArray(task?.guidance) ? task.guidance : [])].join("\n");
  return [...text.matchAll(/Requirement:\s*([^;\n]+)/g)].map((match) => match[1].trim()).filter(Boolean);
}

function requirementBlock(specText, requirementName) {
  const lines = specText.split(/\r?\n/);
  const heading = `### Requirement: ${requirementName}`.toLowerCase();
  const start = lines.findIndex((line) => line.trim().toLowerCase() === heading);
  if (start === -1) return "";
  let end = start + 1;
  while (end < lines.length && !/^###\s+Requirement:|^##\s+/.test(lines[end])) end += 1;
  return lines.slice(start, end).join("\n").trim();
}

function isJsonObjectLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function parseReviewVerdictJson(jsonLine) {
  try {
    return JSON.parse(jsonLine);
  } catch (error) {
    throw new Error(`Ralph task review verdict JSON is invalid: ${error.message}`);
  }
}

function normalizeTaskReviewVerdict(value) {
  const verdict = String(value?.verdict ?? "").trim().toUpperCase();
  assertReviewVerdict(verdict);
  const requiredFixes = normalizeRequiredFixes(value?.requiredFixes);
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  if (verdict === "FAIL" && requiredFixes.length === 0) throw new Error("Ralph task review FAIL verdict must include requiredFixes.");
  return { verdict, summary, requiredFixes };
}

function normalizeRequiredFixes(requiredFixes) {
  if (!Array.isArray(requiredFixes)) return [];
  return requiredFixes.filter((fix) => typeof fix === "string" && fix.trim()).map((fix) => fix.trim());
}

function formatReviewSummary(verdict) {
  const fixes = verdict.requiredFixes?.length ? ` Required fixes: ${verdict.requiredFixes.join("; ")}` : "";
  return `${verdict.summary ?? ""}${fixes}`.trim();
}

function formatChangedFileSnapshot(file) {
  return `${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\``;
}

function formatValidationEvidence(evidence) {
  const stderr = evidence.stderr ? `; stderr: ${truncateText(evidence.stderr, 1000)}` : "";
  return `${evidence.phase ?? "validation"}: (${evidence.cwd ?? "."}) ${evidence.command ?? "unknown command"} -> exit ${evidence.exitCode}${stderr}`;
}

function languageForPath(path) {
  if (path.endsWith(".mjs") || path.endsWith(".js")) return "javascript";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".nix")) return "nix";
  return "text";
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...<truncated ${text.length - maxLength} bytes>`;
}

function normalizeImplementationResult(result) {
  const status = typeof result?.status === "string" && result.status.length > 0 ? result.status : "implementation completed";
  return { ...result, status };
}

function fixAreaRefactorRecommended(result) {
  if (result?.refactorRecommended === true || result?.fixAreaRefactorRecommended === true) return true;
  const text = `${result?.stdout ?? ""}\n${result?.stderr ?? ""}\n${result?.summary ?? ""}\n${result?.status ?? ""}`;
  return /fix-area refactor recommended|refactor recommended/i.test(text);
}

function taskFixAttemptScope(task) {
  return `task:${task?.lineNumber ?? "unknown"}:fix-review`;
}

function persistedAttemptCount(state, scope) {
  const count = Number(state?.attempts?.[scope] ?? 0);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

function formatPromptBullets(values, formatValue, emptyText) {
  if (values.length === 0) return `- ${emptyText}`;
  return values.map((value) => `- ${formatValue(value)}`).join("\n");
}

function formatValidationPlanPromptBullets(validationPlan, emptyText) {
  return formatPromptBullets(
    normalizeTaskValidationPlan(validationPlan).options,
    (option) => `(${option.cwd}) ${option.command} — ${option.reason}`,
    emptyText,
  );
}

function meaningfulAutomatedBehaviorTestApplicable({ task, validationPlan }) {
  const taskText = (task?.text ?? "").toLowerCase();
  const hasAutomatedTest = normalizeTaskValidationPlan(validationPlan).options.some((option) => AUTOMATED_TEST_COMMAND_PATTERN.test(option.command));
  if (!hasAutomatedTest) return false;
  const hasBehaviorSignal = BEHAVIOR_TASK_TOKENS.some((token) => taskText.includes(token));
  const declarativeOnly = DECLARATIVE_TASK_TOKENS.some((token) => taskText.includes(token)) && !hasBehaviorSignal;
  return hasBehaviorSignal && !declarativeOnly;
}

export function cachePaths({ cacheRoot = defaultCacheRoot(), repoRoot, specPath }) {
  const key = createHash("sha256").update(`${repoRoot}\0${specPath}`).digest("hex").slice(0, 32);
  return { key, path: join(cacheRoot, `${key}.json`) };
}

function createRunState({ mode, specPath, repoRoot, branch, reviewBase }) {
  const now = new Date().toISOString();
  return {
    version: 1,
    mode,
    repoRoot,
    specPath,
    branch,
    reviewBase,
    currentTask: null,
    phase: "startup",
    phaseTransitions: [{ phase: "startup", at: now }],
    attempts: {},
    expectedChangedPaths: [],
    validationEvidence: [],
    reviewVerdicts: [],
    taskCommits: [],
    finalReviewStatus: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function readMatchingCache(path, { repoRoot, specPath }) {
  try {
    const state = JSON.parse(await readFile(path, "utf8"));
    if (state?.repoRoot === repoRoot && state?.specPath === specPath && state?.reviewBase) return state;
    return null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Unable to read Ralph cache: ${error.message}`);
  }
}

async function writeCache(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(normalizeRunState(state), null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

function normalizeRunState(state) {
  const now = new Date().toISOString();
  return {
    version: 1,
    ...state,
    currentTask: state.currentTask ?? null,
    phase: state.phase ?? "startup",
    phaseTransitions: state.phaseTransitions ?? (state.phase ? [{ phase: state.phase, at: state.updatedAt ?? now }] : []),
    attempts: state.attempts ?? {},
    expectedChangedPaths: state.expectedChangedPaths ?? [],
    validationOptions: normalizeValidationOptions(state.validationOptions ?? []),
    taskValidationPlans: state.taskValidationPlans ?? [],
    validationEvidence: state.validationEvidence ?? [],
    reviewVerdicts: state.reviewVerdicts ?? [],
    taskCommits: state.taskCommits ?? [],
    finalReviewStatus: state.finalReviewStatus ?? null,
    createdAt: state.createdAt ?? now,
    updatedAt: state.updatedAt ?? now,
  };
}

function normalizeValidationOptions(options) {
  if (!Array.isArray(options)) throw new Error("Ralph validation options must be an array.");
  const seen = new Set();
  const normalized = [];
  for (const option of options) {
    const value = normalizeValidationOption(option);
    const key = validationOptionKey(value);
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(value);
    }
  }
  return normalized;
}

function validationOptionKey(option) {
  return `${option.cwd}\0${option.command}\0${option.source}`;
}

function normalizeValidationOption(option) {
  if (!option || typeof option !== "object") throw new Error("Ralph validation option must be an object.");
  if (typeof option.command !== "string" || option.command.trim().length === 0) throw new Error("Ralph validation command must be a non-empty string.");
  const command = option.command.trim();
  const cwd = typeof option.cwd === "string" && option.cwd.length > 0 ? option.cwd : ".";
  return {
    id: typeof option.id === "string" && option.id.length > 0 ? option.id : commandId(`${cwd}:${command}`),
    command,
    cwd,
    scope: typeof option.scope === "string" && option.scope.length > 0 ? option.scope : "task",
    source: typeof option.source === "string" ? option.source : "discovered",
    reason: typeof option.reason === "string" ? option.reason : "Discovered deterministic validation option.",
  };
}

function normalizeTaskValidationPlan(plan) {
  const normalized = {
    verified: Boolean(plan?.verified),
    options: normalizeValidationOptions(plan?.options ?? []),
    requiresBroaderChecks: Boolean(plan?.requiresBroaderChecks),
    rationale: typeof plan?.rationale === "string" ? plan.rationale : "",
  };
  if (!normalized.verified && normalized.options.length > 0) normalized.verified = true;
  return normalized;
}

function touchState(state) {
  return { ...state, updatedAt: new Date().toISOString() };
}

async function persistCacheUpdate(cachePath, state, update) {
  const nextState = update(touchState(normalizeRunState(state)));
  await writeCache(cachePath, nextState);
  return nextState;
}

async function collectValidationGuidanceSources({ root, specPath, specText }) {
  const sources = [{ source: "docs/spec guidance", text: specText }];
  const sourcePaths = [join(root, "CONTEXT.md"), ...(await findNamedFiles(root, "AGENTS.md")), ...(await findFilesUnder(join(root, "docs")))];
  const seen = new Set([resolve(specPath)]);

  for (const path of sourcePaths) {
    const resolved = resolve(path);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (!path.endsWith(".md")) continue;
    const text = await readOptional(path);
    if (text) sources.push({ source: relative(root, path) || ".", text });
  }

  return sources;
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return "";
    throw error;
  }
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function findNamedFiles(root, name, limit = 50) {
  const results = [];
  await walk(root, async (path, entry) => {
    if (entry.isFile() && entry.name === name) results.push(path);
    return results.length < limit;
  });
  return results;
}

async function findFilesUnder(root, limit = 50) {
  if (!(await exists(root))) return [];
  const results = [];
  await walk(root, async (path, entry) => {
    if (entry.isFile()) results.push(path);
    return results.length < limit;
  });
  return results;
}

async function walk(root, visit) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EACCES") return true;
    throw error;
  }
  for (const entry of entries) {
    if (IGNORED_WALK_DIRS.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (!(await visit(path, entry))) return false;
    if (entry.isDirectory()) {
      const keepGoing = await walk(path, visit);
      if (!keepGoing) return false;
    }
  }
  return true;
}

function extractValidationGuidance(text) {
  const commands = [];
  const commandPattern = /(?:validation|validate|test|check)[^`\n]*`([^`]+)`/gi;
  for (const match of text.matchAll(commandPattern)) {
    const command = match[1].trim();
    if (isValidationCommand(command)) commands.push(command);
  }
  return commands;
}

function extractWorkflowValidationCommands(text) {
  const commands = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*-?\s*run:\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const command = match[1].replace(/^['"]|['"]$/g, "").trim();
    if (isValidationCommand(command)) commands.push(command);
  }
  return commands;
}

function isValidationCommand(command) {
  return /^(npm|pnpm|yarn|node|nix|just|make|cargo|go|pytest|ruff|stylua)\b/.test(command);
}

function inferTaskValidationPaths({ repoRoot, specPath, specText, task, options }) {
  const paths = [relative(repoRoot, specPath)];
  const specNeedle = `${specText}\n${task?.text ?? ""}`.toLowerCase();
  for (const option of options) {
    if (option.scope !== "package" || option.cwd === ".") continue;
    const tokens = validationOptionSpecificTokens(option);
    if (tokens.length > 0 && tokens.every((token) => specNeedle.includes(token))) paths.push(option.cwd);
  }
  return uniqueStrings(paths, "validation path");
}

function validationOptionMatchesTask(option, paths, taskNeedle) {
  if (option.scope === "repo" || option.scope === "documented") return true;
  const cwd = option.cwd === "." ? "" : `${option.cwd.replace(/\/$/, "")}/`;
  if (paths.some((path) => path === option.cwd || (cwd && path.startsWith(cwd)))) return true;
  return validationOptionSpecificTokens(option).some((token) => taskNeedle.includes(token));
}

function validationOptionSpecificTokens(option) {
  const pathText = `${option.cwd} ${option.source}`.toLowerCase();
  return pathText
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3 && !GENERIC_VALIDATION_TOKENS.has(token));
}

function commandId(value) {
  const id = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return id || "validation";
}

function uniqueStrings(values, label) {
  if (!Array.isArray(values)) throw new Error(`Ralph ${label}s must be an array.`);
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== "string" || value.length === 0) throw new Error(`Ralph ${label} must be a non-empty string.`);
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function assertReviewVerdict(verdict) {
  if (!["PASS", "FAIL", "BLOCKED"].includes(verdict)) throw new Error("Ralph review verdict must be PASS, FAIL, or BLOCKED.");
}

async function verifyCommitReachableFromHead({ commit, head, execGit, cwd, errorMessage }) {
  await gitOne(execGit, ["cat-file", "-e", `${commit}^{commit}`], { cwd });
  const mergeBase = await gitOne(execGit, ["merge-base", commit, head], { cwd });
  if (mergeBase !== commit && head !== commit) throw new Error(errorMessage(commit));
}

async function verifyDirtyDiffForResume({ state, status, execGit, cwd }) {
  if (!state.currentTask) throw new Error("Ralph cache has no current task and cannot reconcile dirty task changes safely.");

  const dirtyEntries = parsePorcelainEntries(status);
  const dirtyPaths = dirtyEntries.map((entry) => entry.path);
  if (dirtyPaths.length === 0) throw new Error("Ralph could not identify dirty paths during reconcile.");

  const expectedPaths = new Set(state.expectedChangedPaths ?? []);
  if (expectedPaths.size === 0) throw new Error("Ralph cache has no expected changed paths and cannot verify the dirty diff safely.");

  const unexpectedPaths = dirtyPaths.filter((path) => !expectedPaths.has(path));
  if (unexpectedPaths.length > 0) {
    throw new Error(`Ralph dirty diff touches unexpected paths: ${unexpectedPaths.join(", ")}.`);
  }

  const unstaged = await gitOne(execGit, ["diff", "--binary"], { cwd, trim: false });
  const staged = await gitOne(execGit, ["diff", "--cached", "--binary"], { cwd, trim: false });
  const untrackedPaths = dirtyEntries.filter((entry) => entry.status === "??").map((entry) => entry.path);
  const untrackedDiffs = [];
  for (const path of untrackedPaths) {
    const diff = await gitDiffNoIndex(execGit, ["diff", "--binary", "--no-index", "--", "/dev/null", path], { cwd });
    if (!diff.trim()) throw new Error(`Ralph could not verify dirty diff contents for untracked path ${path} during reconcile.`);
    untrackedDiffs.push({ path, diff });
  }
  const hasTrackedDirtyEntries = dirtyEntries.some((entry) => entry.status !== "??");
  if (!unstaged.trim() && !staged.trim() && hasTrackedDirtyEntries) {
    throw new Error("Ralph could not verify dirty diff contents during reconcile.");
  }

  return { paths: dirtyPaths, worktree: unstaged, staged, untracked: untrackedPaths, untrackedDiffs };
}

async function taskDiff({ repoRoot, execGit }) {
  const unstaged = await gitOne(execGit, ["diff", "--binary"], { cwd: repoRoot, trim: false });
  const staged = await gitOne(execGit, ["diff", "--cached", "--binary"], { cwd: repoRoot, trim: false });
  const untrackedPaths = await taskUntrackedPaths({ repoRoot, execGit });
  const untracked = [];
  for (const path of untrackedPaths) {
    untracked.push(await gitDiffNoIndex(execGit, ["diff", "--binary", "--no-index", "--", "/dev/null", path], { cwd: repoRoot }));
  }
  return `${unstaged}${staged}${untracked.join("")}`;
}

async function taskUntrackedPaths({ repoRoot, execGit }) {
  const output = await gitOne(execGit, ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repoRoot, trim: false });
  return output.split("\0").filter(Boolean).sort();
}

async function taskChangeFingerprint({ repoRoot, execGit, diff }) {
  const status = await gitOne(execGit, ["status", "--porcelain"], { cwd: repoRoot, trim: false });
  const currentDiff = typeof diff === "string" ? diff : await taskDiff({ repoRoot, execGit });
  const untrackedContent = await untrackedContentFingerprint({ repoRoot, execGit });
  return `${status}\0${currentDiff}\0${untrackedContent}`;
}

async function untrackedContentFingerprint({ repoRoot, execGit }) {
  const output = await gitOne(execGit, ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repoRoot, trim: false });
  const paths = output.split("\0").filter(Boolean).sort();
  const fingerprints = [];
  for (const path of paths) {
    try {
      const content = await readFile(join(repoRoot, path));
      fingerprints.push(`${path}\0${createHash("sha256").update(content).digest("hex")}`);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
      fingerprints.push(`${path}\0${error.code}`);
    }
  }
  return fingerprints.join("\0");
}

async function taskTouchedPaths({ repoRoot, execGit }) {
  const status = await gitOne(execGit, ["status", "--porcelain"], { cwd: repoRoot, trim: false });
  return parsePorcelainEntries(status).map((entry) => entry.path);
}

function pathsFromDiff(diff) {
  const paths = [];
  for (const line of String(diff ?? "").split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match) paths.push(match[2]);
  }
  return paths;
}

async function runValidationPlanOptions({ cachePath, state, repoRoot, validationPlan, phase, runCommand }) {
  let nextState = state;
  const validationEvidence = [];
  for (const option of normalizeTaskValidationPlan(validationPlan).options) {
    const evidence = await runValidationOption({ repoRoot, option, runCommand, phase });
    validationEvidence.push(evidence);
    nextState = await recordValidationEvidence({ cachePath, state: nextState, evidence });
    if (evidence.exitCode !== 0) break;
  }
  return { state: nextState, validationEvidence };
}

async function runValidationOption({ repoRoot, option, runCommand, phase }) {
  const cwd = option.cwd === "." ? repoRoot : join(repoRoot, option.cwd);
  const result = await runCommand(option.command, { cwd });
  return {
    phase,
    command: option.command,
    cwd: option.cwd,
    exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : 0,
    stdout: typeof result?.stdout === "string" ? result.stdout : "",
    stderr: typeof result?.stderr === "string" ? result.stderr : "",
  };
}

async function runShellCommand(command, { cwd }) {
  return new Promise((resolvePromise) => {
    execFile(command, [], { cwd, shell: true }, (error, stdout, stderr) => {
      resolvePromise({ command, cwd, exitCode: error?.code ?? 0, stdout, stderr });
    });
  });
}

async function gitDiffNoIndex(execGit, args, { cwd }) {
  try {
    return await gitOne(execGit, args, { cwd, trim: false });
  } catch (error) {
    if (error.code === 1 && typeof error.stdout === "string") return error.stdout;
    throw error;
  }
}

function parsePorcelainEntries(status) {
  const entries = [];
  for (const line of status.trimEnd().split("\n")) {
    if (!line) continue;
    const statusCode = line.slice(0, 2);
    const rawPath = line.slice(3);
    const renameSeparator = " -> ";
    const path = rawPath.includes(renameSeparator) ? rawPath.slice(rawPath.indexOf(renameSeparator) + renameSeparator.length) : rawPath;
    entries.push({ status: statusCode, path });
  }
  return entries;
}

function selectSafeNextPhase(phase) {
  switch (phase) {
    case "implementation":
    case "refactor":
    case "fix-review-failures":
    case "task-fix":
    case "fix-area-refactor":
    case "post-fix-refactor":
    case "fix-validation":
    case "validation":
    case "task-review":
    case "precommit-validation":
    case "checkbox-update":
      return "validation";
    default:
      return null;
  }
}

function hasInProgressCurrentTask(state) {
  return Boolean(state.currentTask && selectSafeNextPhase(state.phase));
}

function verifyCachedTaskStillMatchesSpec(currentTask, specText) {
  if (!currentTask) return;
  const lines = specText.split(/\r?\n/);
  if (Number.isInteger(currentTask.lineNumber)) {
    const line = lines[currentTask.lineNumber - 1];
    if (!/^\s*- \[[ xX]\]/.test(line ?? "")) {
      throw new Error("Ralph cache current task no longer points at a Feature Spec checkbox.");
    }
  }
  if (currentTask.text && !specText.includes(currentTask.text)) {
    throw new Error("Ralph cache current task no longer matches the Feature Spec checkbox state.");
  }
}

function isCleanStatus(status) {
  return status.trim().length === 0;
}

function writeDirtyStatus(io, status) {
  io.stdout.write("Ralph found a dirty working tree:\n");
  for (const line of status.trimEnd().split("\n")) io.stdout.write(`${line}\n`);
}

async function promptYesNo(io, question) {
  if (process.env.PI_RALPH_RESUME_DIRTY === "yes") return true;
  if (process.env.PI_RALPH_RESUME_DIRTY === "no") return false;
  return promptYesNoWithDefaultNo(io, question);
}

async function promptOnceContinuation(io, question) {
  if (process.env.PI_RALPH_ONCE_CONTINUE === "yes") return true;
  if (process.env.PI_RALPH_ONCE_CONTINUE === "no") return false;
  return promptYesNoWithDefaultNo(io, question);
}

async function promptYesNoWithDefaultNo(io, question) {
  if (!io.stdin?.isTTY) {
    io.stdout.write(question);
    io.stdout.write("no\n");
    return false;
  }
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  try {
    const answer = await rl.question(question);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function git(args, options) {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        error.message = stderr.trim() || error.message;
        reject(error);
      } else {
        resolvePromise(stdout);
      }
    });
  });
}

async function gitOne(execGit, args, { cwd, trim = true } = {}) {
  const output = await execGit(args, { cwd });
  return trim ? output.trim() : output;
}

function defaultCacheRoot() {
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "pi", "ralph-loop");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
