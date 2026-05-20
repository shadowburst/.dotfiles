#!/usr/bin/env node
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";

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

  io.stdout.write(`Ralph Orchestrator\n`);
  io.stdout.write(`mode: ${mode}\n`);
  io.stdout.write(`spec: ${specPath}\n`);
  io.stdout.write(`repo: ${startup.repoRoot}\n`);
  io.stdout.write(`reviewBase: ${startup.state.reviewBase}\n`);
  io.stdout.write(`startup: ${startup.action}\n`);
  io.stdout.write("status: launched\n");
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
    validationEvidence: state.validationEvidence ?? [],
    reviewVerdicts: state.reviewVerdicts ?? [],
    taskCommits: state.taskCommits ?? [],
    finalReviewStatus: state.finalReviewStatus ?? null,
    createdAt: state.createdAt ?? now,
    updatedAt: state.updatedAt ?? now,
  };
}

function touchState(state) {
  return { ...state, updatedAt: new Date().toISOString() };
}

async function persistCacheUpdate(cachePath, state, update) {
  const nextState = update(touchState(normalizeRunState(state)));
  await writeCache(cachePath, nextState);
  return nextState;
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
