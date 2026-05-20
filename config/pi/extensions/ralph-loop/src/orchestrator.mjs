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
  const tasks = parseFeatureSpecTasks(specText);
  const selectedTask = selectFirstUncheckedTask(tasks);

  io.stdout.write(`Ralph Orchestrator\n`);
  io.stdout.write(`mode: ${mode}\n`);
  io.stdout.write(`spec: ${specPath}\n`);
  io.stdout.write(`repo: ${startup.repoRoot}\n`);
  io.stdout.write(`reviewBase: ${state.reviewBase}\n`);
  io.stdout.write(`startup: ${startup.action}\n`);
  io.stdout.write(`validationOptions: ${validationOptions.length}\n`);

  if (!selectedTask) {
    if (startup.action === "started-clean") {
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

    await transitionPhase({ cachePath: startup.cachePath, state, phase: "final-refactor", currentTask: null });
    io.stdout.write("status: no unchecked tasks; active cache found\n");
    io.stdout.write("next: final refactor, final validation, final branch review\n");
    return;
  }

  const implementation = await runTaskImplementationPhase({
    cachePath: startup.cachePath,
    state,
    repoRoot: startup.repoRoot,
    specPath,
    specText,
    task: selectedTask,
    validationOptions,
    implementationSession: deps.implementationSession,
  });
  io.stdout.write(`task: ${selectedTask.text}\n`);
  io.stdout.write(`validation: ${implementation.validationPlan.verified ? implementation.validationPlan.options.map((option) => option.command).join("; ") : "unverified"}\n`);
  io.stdout.write(`implementationPromptBytes: ${Buffer.byteLength(implementation.prompt, "utf8")}\n`);
  io.stdout.write(`status: ${implementation.result.status}\n`);
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

export function launchPiImplementationSession({ cwd, prompt, spawnProcess = spawn, piBin = process.env.PI_RALPH_PI_BIN ?? "pi" }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnProcess(piBin, ["-p"], {
      cwd,
      env: { ...process.env, PI_RALPH_IMPLEMENTATION_SESSION: "1" },
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
        const error = new Error(stderr.trim() || `Pi implementation session exited with status ${exitCode}`);
        error.exitCode = exitCode;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolvePromise({ status: "implementation session completed", exitCode, stdout, stderr });
    });
    child.stdin?.end(prompt);
  });
}

export function buildTaskImplementationPrompt({ repoRoot, specPath, task, validationPlan, expectedChangedPaths = [] }) {
  if (!task?.text) throw new Error("Ralph implementation prompt requires a selected task.");
  const normalizedPlan = normalizeTaskValidationPlan(validationPlan);
  const paths = uniqueStrings(expectedChangedPaths, "expected changed path");
  const validationLines = formatPromptBullets(
    normalizedPlan.options,
    (option) => `(${option.cwd}) ${option.command} — ${option.reason}`,
    "No deterministic validation selected. Stop and report the task as unverified; do not edit.",
  );
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

function normalizeImplementationResult(result) {
  const status = typeof result?.status === "string" && result.status.length > 0 ? result.status : "implementation completed";
  return { ...result, status };
}

function formatPromptBullets(values, formatValue, emptyText) {
  if (values.length === 0) return `- ${emptyText}`;
  return values.map((value) => `- ${formatValue(value)}`).join("\n");
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

  const worktree = await gitOne(execGit, ["diff", "--binary"], { cwd, trim: false });
  const staged = await gitOne(execGit, ["diff", "--cached", "--binary"], { cwd, trim: false });
  const untrackedPaths = dirtyEntries.filter((entry) => entry.status === "??").map((entry) => entry.path);
  const untrackedDiffs = [];
  for (const path of untrackedPaths) {
    const diff = await gitDiffNoIndex(execGit, ["diff", "--binary", "--no-index", "--", "/dev/null", path], { cwd });
    if (!diff.trim()) throw new Error(`Ralph could not verify dirty diff contents for untracked path ${path} during reconcile.`);
    untrackedDiffs.push({ path, diff });
  }
  const hasTrackedDirtyEntries = dirtyEntries.some((entry) => entry.status !== "??");
  if (!worktree.trim() && !staged.trim() && hasTrackedDirtyEntries) {
    throw new Error("Ralph could not verify dirty diff contents during reconcile.");
  }

  return { paths: dirtyPaths, worktree, staged, untracked: untrackedPaths, untrackedDiffs };
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
  if (!io.stdin?.isTTY) return false;
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
