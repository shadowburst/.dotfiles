import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb, spawn } from "node:child_process";

const execFile = promisify(execFileCb);
const STATE_VERSION = 1;

type RalphMode = "one" | "all" | "final-review" | "pr" | "remote-checks";

export type FinalReviewStatus = "PASS" | "FAIL" | "BLOCKED";
export type RemoteCheckVerdict = "PASS" | "FAIL" | "BLOCKED";
export type PullRequestDraftState = "draft" | "ready";
export type TaskReviewVerdict = FinalReviewStatus;

export type RalphState = {
  version: number;
  repoRoot: string;
  specPath: string;
  canonicalSpecPath: string;
  specSlug: string;
  worktreePath: string;
  branch: string;
  reviewBase: string;
  createdFrom: string;
  taskCommits: Record<string, string>;
  allMode?: boolean;
  allModeStopReason?: string;
  finalReviewStatus?: FinalReviewStatus;
  finalReviewSummary?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  pullRequestDraftState?: PullRequestDraftState;
  remoteCheckVerdict?: RemoteCheckVerdict;
  failedCheckSummaries?: string[];
  pendingCheckSummaries?: string[];
  remoteFixAttemptCount?: number;
};

type TaskKind = "implementation" | "validation" | "review";

type RemoteCheck = {
  name?: string;
  workflow?: string;
  state?: string;
  conclusion?: string;
  bucket?: string;
  link?: string;
  detailsUrl?: string;
};

export type ParsedTask = {
  number: number;
  checked: boolean;
  text: string;
  lineIndex: number;
  raw: string;
  guidance: string[];
  kind: TaskKind;
};

export type TaskReviewPacket = {
  specPath: string;
  task: ParsedTask;
  implementationSummary: string;
  diff: string;
  changedFiles: string[];
  commandsRun: string[];
  validationOutput: string;
  reviewAttempt: number;
};

type TaskReviewDecision =
  | { action: "pass"; message: string }
  | { action: "fix"; nextAttempt: number; message: string }
  | { action: "stop-failed"; message: string }
  | { action: "stop-blocked"; message: string };

export type RemoteCheckGateResult = {
  verdict: RemoteCheckVerdict;
  failedCheckSummaries: string[];
  pendingCheckSummaries: string[];
  summary: string;
};

export type ParsedArgs = {
  specPath?: string;
  taskNumber?: number;
  mode: RalphMode;
  reviewBase?: string;
  title?: string;
  noHandoff?: boolean;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function run(command: string, args: string[], cwd: string, timeout = 30_000): Promise<string> {
  const { stdout } = await execFile(command, args, { cwd, timeout, maxBuffer: 1024 * 1024 * 10 });
  return stdout.trim();
}

async function runCombined(command: string, args: string[], cwd: string, timeout = 60_000): Promise<{ stdout: string; stderr: string }> {
  const result = await execFile(command, args, { cwd, timeout, maxBuffer: 1024 * 1024 * 10 });
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

async function git(args: string[], cwd: string, timeout?: number): Promise<string> {
  return run("git", args, cwd, timeout);
}

async function gitStatus(root: string): Promise<string> {
  return git(["status", "--porcelain"], root);
}

function checkDisplayName(check: RemoteCheck): string {
  return check.workflow && check.workflow !== check.name ? `${check.workflow}: ${check.name || "unnamed check"}` : check.name || check.workflow || "unnamed check";
}

function checkSummary(check: RemoteCheck): string {
  const status = [check.bucket, check.state, check.conclusion].filter(Boolean).join("/") || "unknown";
  const url = check.link || check.detailsUrl;
  return `${checkDisplayName(check)} (${status})${url ? ` - ${url}` : ""}`;
}

export function classifyRemoteChecks(checks: RemoteCheck[]): RemoteCheckGateResult {
  if (checks.length === 0) {
    return {
      verdict: "BLOCKED",
      failedCheckSummaries: [],
      pendingCheckSummaries: ["No hosted Pull Request checks were reported."],
      summary: "Remote Check Gate is blocked because no hosted Pull Request checks were reported.",
    };
  }

  const failed = checks.filter((check) => {
    const bucket = check.bucket?.toLowerCase();
    const state = check.state?.toLowerCase();
    const conclusion = check.conclusion?.toLowerCase();
    return bucket === "fail" || state === "failure" || state === "failed" || conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out" || conclusion === "action_required";
  });
  const pending = checks.filter((check) => {
    const bucket = check.bucket?.toLowerCase();
    const state = check.state?.toLowerCase();
    const conclusion = check.conclusion?.toLowerCase();
    return !failed.includes(check) && (!bucket && !state && !conclusion || bucket === "pending" || state === "pending" || state === "queued" || state === "in_progress" || state === "waiting" || conclusion === "");
  });

  if (failed.length > 0) {
    const failedCheckSummaries = failed.map(checkSummary);
    return {
      verdict: "FAIL",
      failedCheckSummaries,
      pendingCheckSummaries: pending.map(checkSummary),
      summary: `Remote Check Gate failed: ${failedCheckSummaries.join("; ")}`,
    };
  }
  if (pending.length > 0) {
    const pendingCheckSummaries = pending.map(checkSummary);
    return {
      verdict: "BLOCKED",
      failedCheckSummaries: [],
      pendingCheckSummaries,
      summary: `Remote Check Gate is blocked by pending checks: ${pendingCheckSummaries.join("; ")}`,
    };
  }
  return {
    verdict: "PASS",
    failedCheckSummaries: [],
    pendingCheckSummaries: [],
    summary: `Remote Check Gate passed: ${checks.map(checkDisplayName).join(", ")}`,
  };
}

function contextCaptureBody(status: string): string {
  return `User approved committing dirty original-checkout changes before Ralph\nworktree creation so the Ralph branch includes the current context.\n\nPre-commit status:\n${status}`;
}

function manualContextCaptureText(status: string): string {
  return `# Ralph cannot continue safely while the original checkout is dirty.\n# Commit or clean these changes, then rerun Ralph.\n\n# Current status:\n${status
    .split("\n")
    .filter(Boolean)
    .map((line) => `# ${line}`)
    .join("\n")}\n\ngit status --short\ngit add -A\ngit commit -m ${shellQuote("chore(ralph): capture pre-worktree changes")}`;
}

async function createContextCaptureCommit(ctx: ExtensionCommandContext, root: string, status: string): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("Ralph cannot create a worktree safely while the original checkout is dirty and confirmation is unavailable.", "error");
    ctx.ui.setEditorText(manualContextCaptureText(status));
    throw new Error("Original checkout is dirty and Context-Capture Commit confirmation is unavailable.");
  }

  const approved = await ctx.ui.confirm(
    "Create Context-Capture Commit?",
    `The original checkout has uncommitted changes that will be missing from the Ralph worktree unless committed.\n\nDirty status:\n${status}\n\nCommit all dirty changes before creating the Ralph worktree?`,
  );
  if (!approved) {
    ctx.ui.notify("Ralph stopped before worktree creation because uncommitted context would be omitted.", "warning");
    throw new Error("User declined Context-Capture Commit before Ralph worktree creation.");
  }

  await git(["add", "-A"], root, 120_000);
  await git(["commit", "-m", "chore(ralph): capture pre-worktree changes", "-m", contextCaptureBody(status)], root, 120_000);
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseArgs(input: string): ParsedArgs {
  const tokens = tokenize(input);
  const parsed: ParsedArgs = { mode: "one" };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--all") {
      parsed.mode = "all";
    } else if (token === "--final-review") {
      parsed.mode = "final-review";
    } else if (token === "--pr" || token === "--create-pr") {
      parsed.mode = "pr";
    } else if (token === "--remote-checks") {
      parsed.mode = "remote-checks";
    } else if (token === "--no-handoff") {
      parsed.noHandoff = true;
    } else if (token === "--base") {
      parsed.reviewBase = tokens[++i];
    } else if (token.startsWith("--base=")) {
      parsed.reviewBase = token.slice("--base=".length);
    } else if (token === "--title") {
      parsed.title = tokens[++i];
    } else if (token.startsWith("--title=")) {
      parsed.title = token.slice("--title=".length);
    } else if (/^\d+$/.test(token)) {
      parsed.taskNumber = Number(token);
    } else if (!parsed.specPath) {
      parsed.specPath = token.replace(/^@/, "");
    }
  }
  return parsed;
}

function stripDatePrefix(name: string): string {
  return name.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function specSlug(specPath: string): string {
  return stripDatePrefix(basename(specPath).replace(/\.md$/, ""));
}

export function safeBranchName(slug: string): string {
  return `ralph/${slug.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export function safeWorktreeName(slug: string): string {
  return `ralph-${slug.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function cacheRoot(agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent")): string {
  return join(agentDir, "cache", "ralph");
}

export function statePath(repoIdentityPath: string, specKey: string, agentDir?: string): string {
  const repoId = createHash("sha256").update(repoIdentityPath).digest("hex").slice(0, 16);
  const specId = createHash("sha256").update(specKey).digest("hex").slice(0, 12);
  return join(cacheRoot(agentDir), repoId, `${specSlug(specKey)}-${specId}.json`);
}

export function canonicalSpecKey(repo: string, absoluteSpec: string): string {
  return relativeTo(repo, absoluteSpec).replace(/\\/g, "/");
}

export function normalizeState(raw: Partial<RalphState>, fallbackSpecPath: string): RalphState {
  const specPath = raw.specPath || fallbackSpecPath;
  const state: RalphState = {
    version: raw.version || STATE_VERSION,
    repoRoot: raw.repoRoot || "",
    specPath,
    canonicalSpecPath: raw.canonicalSpecPath || specPath,
    specSlug: raw.specSlug || specSlug(specPath),
    worktreePath: raw.worktreePath || "",
    branch: raw.branch || "",
    reviewBase: raw.reviewBase || "",
    createdFrom: raw.createdFrom || "",
    taskCommits: raw.taskCommits || {},
    allMode: raw.allMode,
    allModeStopReason: raw.allModeStopReason,
    finalReviewStatus: raw.finalReviewStatus,
    finalReviewSummary: raw.finalReviewSummary,
    pullRequestUrl: raw.pullRequestUrl,
    pullRequestNumber: raw.pullRequestNumber,
    pullRequestDraftState: raw.pullRequestDraftState,
    remoteCheckVerdict: raw.remoteCheckVerdict,
    failedCheckSummaries: raw.failedCheckSummaries || [],
    pendingCheckSummaries: raw.pendingCheckSummaries || [],
    remoteFixAttemptCount: raw.remoteFixAttemptCount || 0,
  };

  for (const field of ["repoRoot", "specPath", "canonicalSpecPath", "worktreePath", "branch", "reviewBase", "createdFrom"] as const) {
    if (!state[field]) throw new Error(`Ralph state is missing required metadata field: ${field}`);
  }
  return state;
}

async function readState(path: string, fallbackSpecPath: string): Promise<RalphState | undefined> {
  if (!existsSync(path)) return undefined;
  return normalizeState(JSON.parse(await readFile(path, "utf8")) as Partial<RalphState>, fallbackSpecPath);
}

async function writeState(path: string, state: RalphState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalizeState(state, state.specPath), null, 2)}\n`, "utf8");
}

async function repoRoot(cwd: string): Promise<string> {
  return git(["rev-parse", "--show-toplevel"], cwd);
}

async function repoIdentity(cwd: string): Promise<string> {
  const commonDir = await git(["rev-parse", "--git-common-dir"], cwd);
  return isAbsolute(commonDir) ? commonDir : resolve(cwd, commonDir);
}

function primaryRepoRoot(currentRoot: string, repoIdentityPath: string): string {
  return basename(repoIdentityPath) === ".git" ? dirname(repoIdentityPath) : currentRoot;
}

function resolveInRepo(repo: string, inputPath: string): string {
  return isAbsolute(inputPath) ? inputPath : resolve(repo, inputPath);
}

function relativeTo(repo: string, path: string): string {
  const rel = relative(repo, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function classifyTask(text: string): TaskKind {
  const normalized = text.toLowerCase();
  if (/\b(review|readiness review|final review)\b/.test(normalized)) return "review";
  if (/\b(validate|validation|check|checks|test|tests|ci|flake)\b/.test(normalized)) return "validation";
  return "implementation";
}

function collectTaskGuidance(lines: string[], taskLineIndex: number): string[] {
  const guidance: string[] = [];
  for (let i = taskLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line) || /^[-*]\s+\[[ xX]\]\s+\d+\.\s+/.test(line)) break;
    const bullet = line.match(/^\s+[-*]\s+(?!\[[ xX]\]\s+)(.+)$/);
    if (bullet) guidance.push(bullet[1].trim());
  }
  return guidance;
}

export function parseImplementationTasks(markdown: string): ParsedTask[] {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^##\s+Implementation Tasks\s*$/.test(line));
  if (headingIndex < 0) return [];
  const tasks: ParsedTask[] = [];
  for (let i = headingIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;
    const match = line.match(/^[-*]\s+\[([ xX])]\s+(\d+)\.\s+(.+)$/);
    if (!match) continue;
    const text = match[3].trim();
    tasks.push({
      number: Number(match[2]),
      checked: match[1].toLowerCase() === "x",
      text,
      lineIndex: i,
      raw: line,
      guidance: collectTaskGuidance(lines, i),
      kind: classifyTask(text),
    });
  }
  return tasks;
}

async function loadTasks(specPath: string): Promise<{ markdown: string; tasks: ParsedTask[] }> {
  const markdown = await readFile(specPath, "utf8");
  return { markdown, tasks: parseImplementationTasks(markdown) };
}

export function selectTask(tasks: ParsedTask[], taskNumber?: number): ParsedTask | undefined {
  if (taskNumber !== undefined) return tasks.find((task) => task.number === taskNumber && !task.checked);
  return tasks.find((task) => !task.checked);
}

export function updateTaskCheckbox(markdown: string, taskNumber: number, checked = true): string {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const tasks = parseImplementationTasks(markdown);
  const task = tasks.find((candidate) => candidate.number === taskNumber);
  if (!task) throw new Error(`Task ${taskNumber} was not found in Feature Spec`);
  const marker = checked ? "x" : " ";
  lines[task.lineIndex] = task.raw.replace(/^([-*]\s+\[)([ xX])(]\s+\d+\.\s+)/, `$1${marker}$3`);
  return lines.join(newline);
}

async function checkTask(specPath: string, taskNumber: number): Promise<void> {
  const markdown = await readFile(specPath, "utf8");
  const nextMarkdown = updateTaskCheckbox(markdown, taskNumber, true);
  if (nextMarkdown === markdown) return;
  await writeFile(specPath, nextMarkdown, "utf8");
}

async function branchExists(repo: string, branch: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--verify", branch], repo);
    return true;
  } catch {
    return false;
  }
}

async function isIgnored(repo: string, path: string): Promise<boolean> {
  try {
    await git(["check-ignore", "-q", path], repo);
    return true;
  } catch {
    return false;
  }
}

async function ensureWorktree(ctx: ExtensionCommandContext, parsed: ParsedArgs, root: string, absoluteSpec: string): Promise<RalphState> {
  const specKey = canonicalSpecKey(root, absoluteSpec);
  const slug = specSlug(specKey);
  const identity = await repoIdentity(root);
  const baseRoot = primaryRepoRoot(root, identity);
  const cachePath = statePath(identity, specKey);
  const existing = await readState(cachePath, specKey);
  if (existing) {
    const status = await gitStatus(root);
    if (status && !isInside(existing.worktreePath, ctx.cwd)) {
      ctx.ui.notify("The original checkout is dirty; those changes are not part of the existing Ralph branch and will not be ported automatically.", "warning");
    }
    if (parsed.reviewBase) {
      existing.reviewBase = parsed.reviewBase;
      await writeState(cachePath, existing);
    }
    return existing;
  }

  const branch = safeBranchName(slug);
  const defaultWorktreePath = join(baseRoot, ".worktrees", safeWorktreeName(slug));
  const currentBranch = await git(["branch", "--show-current"], root);
  const insideExpectedWorktree = basename(root) === safeWorktreeName(slug);
  const worktreePath = existsSync(defaultWorktreePath) ? defaultWorktreePath : insideExpectedWorktree ? root : defaultWorktreePath;
  const worktreeExists = existsSync(worktreePath);

  if ((parsed.mode === "final-review" || parsed.mode === "pr" || parsed.mode === "remote-checks") && !worktreeExists) {
    throw new Error("Ralph final-review, Pull Request, and Remote Check Gate modes require an existing Ralph run; no Ralph state or worktree exists for this Feature Spec.");
  }

  const status = await gitStatus(root);
  if (status && !worktreeExists && !insideExpectedWorktree) {
    await createContextCaptureCommit(ctx, root, status);
  } else if (status && worktreeExists && !insideExpectedWorktree) {
    ctx.ui.notify("The original checkout is dirty; those changes are not part of the existing Ralph branch and will not be ported automatically.", "warning");
  }

  const createdFrom = await git(["rev-parse", "HEAD"], root);
  const reviewBase = parsed.reviewBase || currentBranch || createdFrom;

  await mkdir(dirname(worktreePath), { recursive: true });
  if (!worktreeExists) {
    if (await branchExists(root, branch)) {
      await git(["worktree", "add", worktreePath, branch], root, 120_000);
    } else {
      await git(["worktree", "add", "-b", branch, worktreePath, "HEAD"], root, 120_000);
    }
  }

  if (!(await isIgnored(baseRoot, ".worktrees")) && ctx.hasUI) {
    ctx.ui.notify("Ralph worktrees live under .worktrees, but .worktrees is not ignored by this repo.", "warning");
  }

  const state: RalphState = {
    version: STATE_VERSION,
    repoRoot: baseRoot,
    specPath: specKey,
    canonicalSpecPath: specKey,
    specSlug: slug,
    worktreePath,
    branch,
    reviewBase,
    createdFrom,
    taskCommits: {},
  };
  await writeState(cachePath, state);
  return state;
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

export function formatRalphInvocation(specPath: string, parsed: ParsedArgs, includeNoHandoff = false): string {
  const tokens = [specPath];
  if (parsed.taskNumber !== undefined) tokens.push(String(parsed.taskNumber));
  if (parsed.mode === "all") tokens.push("--all");
  if (parsed.mode === "final-review") tokens.push("--final-review");
  if (parsed.mode === "pr") tokens.push("--pr");
  if (parsed.mode === "remote-checks") tokens.push("--remote-checks");
  if (parsed.reviewBase) tokens.push("--base", parsed.reviewBase);
  if (parsed.title) tokens.push("--title", parsed.title);
  if (includeNoHandoff && parsed.noHandoff) tokens.push("--no-handoff");
  return `/ralph ${tokens.map(shellQuote).join(" ")}`;
}

function manualHandoffText(worktreePath: string, ralphInvocation: string): string {
  return `cd ${shellQuote(worktreePath)}\npi ${shellQuote(ralphInvocation)}`;
}

async function canFindPi(cwd: string): Promise<boolean> {
  try {
    await run("sh", ["-lc", "command -v pi"], cwd, 5_000);
    return true;
  } catch {
    return false;
  }
}

async function automaticHandoff(ctx: ExtensionCommandContext, worktreePath: string, ralphInvocation: string): Promise<boolean> {
  if (!(await canFindPi(worktreePath))) {
    ctx.ui.notify("Automatic Handoff unavailable: pi was not found in PATH.", "warning");
    return false;
  }

  const child = spawn("sh", ["-lc", `exec pi ${shellQuote(ralphInvocation)}`], {
    cwd: worktreePath,
    stdio: "inherit",
    env: { ...process.env, RALPH_HANDOFF: worktreePath },
  });

  const spawned = await new Promise<boolean>((resolveSpawned) => {
    let settled = false;
    child.once("error", () => {
      if (!settled) {
        settled = true;
        resolveSpawned(false);
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolveSpawned(true);
      }
    }, 100);
  });

  if (!spawned) {
    ctx.ui.notify("Automatic Handoff failed while starting replacement Pi.", "warning");
    return false;
  }

  ctx.shutdown();
  return true;
}

function conventionalTitleForTask(task: ParsedTask): string {
  const cleaned = task.text.replace(/`/g, "").replace(/[.!]$/g, "").slice(0, 72);
  return `feat(ralph): complete task ${task.number} - ${cleaned}`;
}

function taskGuidanceBlock(task: ParsedTask): string {
  if (task.guidance.length === 0) return "";
  return `\nTask guidance from non-checkbox sub-bullets:\n${task.guidance.map((item) => `- ${item}`).join("\n")}`;
}

function taskContextChecklist(specPath: string): string {
  return `Context to load before implementation:
- Repository instructions from AGENTS.md files that apply to the current worktree.
- Domain language from CONTEXT.md when present.
- Repository validation guidance from docs/agents/specs.md when present.
- The Feature Spec at @${specPath}, including Purpose, Requirements, Implementation Constraints, Out of Scope, Source Context, and Review Checklist.
- Only the source files or docs needed for the selected task; do not broaden into unrelated unchecked tasks.`;
}

function tddPolicyBlock(task: ParsedTask): string {
  if (task.kind === "validation") {
    return "TDD policy: this is a validation task. Do not invent tests merely to satisfy TDD; run or discover the specified validation checks first, then fix only directly revealed relevant issues.";
  }
  if (task.kind === "review") {
    return "TDD policy: this is a review task. Do not invent implementation tests unless the review uncovers a concrete missing behavior with an existing meaningful test style.";
  }
  return "TDD policy: before editing, decide whether meaningful feature behavior can be covered by an existing automated test style. If yes, write or update the failing test first. If the only possible test would assert an incidental implementation detail (for example a CSS class, an HTML attribute, or another mechanical marker without behavior), do not add that test; state why TDD is not applicable and rely on stronger deterministic validation.";
}

function validationEvidenceBlock(): string {
  return `Deterministic validation evidence required before completion:
- Prefer the smallest relevant existing project check first, then broader CI-quality checks when needed.
- Record each command exactly, its result, and the relevant output summary.
- If no meaningful automated verification exists, stop with the task implemented but unchecked unless the user explicitly authorizes manual verification.
- After implementation and initial validation, call ralph_start_task_review with the implementation summary, commands run, and validation output so Ralph can start a fresh-session clean-eye review.
- Do not call ralph_complete_task unless deterministic verification and clean-eye review both pass.
- When calling ralph_complete_task, include finalValidationCommand so Ralph can rerun validation after the Feature Spec checkbox edit, or finalValidationEvidence when a rerun is unnecessary and explicitly confirmed.
- In all-tasks mode, do not manually start another task after FAIL, BLOCKED, or unavailable deterministic verification; Ralph only continues after ralph_complete_task succeeds for the current task.`;
}

function extractSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return "";
  const level = heading.match(/^#+/)?.[0].length ?? 1;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#+)\s+/);
    if (match && match[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

function relevantSpecSections(markdown: string): string {
  const sections = ["## Purpose", "## Requirements", "## Implementation Constraints", "## Out of Scope", "## Review Checklist"]
    .map((heading) => extractSection(markdown, heading))
    .filter(Boolean);
  return sections.join("\n\n");
}

export function nextAllTasksAction(tasks: ParsedTask[]): { action: "run-next"; task: ParsedTask } | { action: "final-review" } {
  const nextTask = selectTask(tasks);
  return nextTask ? { action: "run-next", task: nextTask } : { action: "final-review" };
}

export function taskReviewDecision(verdict: TaskReviewVerdict, reviewAttempt: number, maxFixIterations = 3): TaskReviewDecision {
  const attempt = Math.max(0, Math.floor(reviewAttempt));
  if (verdict === "PASS") {
    return { action: "pass", message: "Review passed. Proceed only after final deterministic verification, then use ralph_complete_task." };
  }
  if (verdict === "BLOCKED") {
    return { action: "stop-blocked", message: "Review is blocked. Stop all-tasks mode without checking the task or creating a success commit." };
  }
  if (attempt >= maxFixIterations) {
    return { action: "stop-failed", message: `Review remains failing after ${maxFixIterations} fix/retest iterations. Stop all-tasks mode without checking the task or creating a success commit.` };
  }
  return { action: "fix", nextAttempt: attempt + 1, message: `Review failed. Run fix/retest iteration ${attempt + 1} of ${maxFixIterations}, fixing only the required issues.` };
}

function buildFixRetestPrompt(packet: TaskReviewPacket, requiredFixes: string, reviewSummary: string, nextAttempt: number): string {
  return `Continue the bounded Ralph fix/retest flow for exactly one Feature Spec task.

Feature Spec: @${packet.specPath}
Selected task: ${packet.task.number}. ${packet.task.text}
Fix/retest iteration: ${nextAttempt} of 3

Clean-eye review summary:
${reviewSummary}

Required fixes from review:
${requiredFixes}

Instructions:
1. Fix only the real required issues listed above. Do not make subjective or unrelated changes.
2. Re-run the smallest relevant deterministic validation checks, then broader checks if needed.
3. Capture updated implementation summary, changed files, diff, commands run, and validation output.
4. Call ralph_start_task_review again with reviewAttempt ${nextAttempt} so Ralph starts another fresh-session clean-eye review.
5. Stop without ralph_complete_task if deterministic verification is unavailable.`;
}

export function buildTaskReviewPrompt(packet: TaskReviewPacket, specMarkdown: string): string {
  return `Run a fresh-session clean-eye review for exactly one Ralph task.

Feature Spec: @${packet.specPath}
Selected task: ${packet.task.number}. ${packet.task.text}
Selected task kind: ${packet.task.kind}${taskGuidanceBlock(packet.task)}
Review/fix iteration already completed before this review: ${packet.reviewAttempt} of 3

Relevant Feature Spec sections:
${relevantSpecSections(specMarkdown) || "(No relevant sections were extracted; read the Feature Spec path above if needed.)"}

Implementation summary:
${packet.implementationSummary}

Changed files:
${packet.changedFiles.length > 0 ? packet.changedFiles.map((file) => `- ${file}`).join("\n") : "(No changed files reported.)"}

Diff to review:
\`\`\`diff
${packet.diff || "(No diff reported.)"}
\`\`\`

Validation commands run:
${packet.commandsRun.length > 0 ? packet.commandsRun.map((command) => `- ${command}`).join("\n") : "(No validation commands reported.)"}

Validation output:
\`\`\`
${packet.validationOutput || "(No validation output reported.)"}
\`\`\`

Review rules:
- Use only the artifacts in this fresh session: the Feature Spec path/sections, selected task, implementation summary, changed files, diff, commands run, and validation output.
- Do not rely on the implementation conversation or unstated intent.
- Evaluate the selected task against related requirements, Implementation Constraints, Out of Scope, Review Checklist, code quality, maintainability, and validation evidence.
- Return exactly one machine-readable verdict: PASS, FAIL, or BLOCKED.
- PASS only when the selected task is implemented, scoped correctly, maintainable, and supported by deterministic validation evidence.
- FAIL only for real required fixes; list the required fixes and keep them scoped to this selected task.
- BLOCKED when required information or deterministic verification is missing or unavailable.
- After deciding the verdict, call ralph_handle_task_review with the same verdict, this task number, reviewAttempt ${packet.reviewAttempt}, the review summary, required fixes, and blocking issues. That tool enforces the bounded fix/retest controller.

Required response format before calling the tool:
Verdict: PASS|FAIL|BLOCKED
Summary: <concise review summary>
Required fixes: <only for FAIL; otherwise "None">
Blocking issues: <only for BLOCKED; otherwise "None">`;
}

export function buildTaskPrompt(state: RalphState, specPath: string, task: ParsedTask, mode: RalphMode): string {
  return `Run a Ralph Loop for exactly one Feature Spec task.

Feature Spec: @${specPath}
Selected task: ${task.number}. ${task.text}
Selected task kind: ${task.kind}${taskGuidanceBlock(task)}
Mode: ${mode}
Review Base: ${state.reviewBase}
Branch: ${state.branch}

${taskContextChecklist(specPath)}

${tddPolicyBlock(task)}

${validationEvidenceBlock()}

Required loop:
1. Load the repository context and Feature Spec context listed above before making changes.
2. Implement only task ${task.number}. Do not broaden scope to other unchecked tasks. Treat the non-checkbox sub-bullets above as guidance for this selected task, not as independently runnable tasks.
3. If the selected task kind is validation or review, execute it as a first-class Ralph task; if it already passes and produces no code changes, deterministic verification plus the spec checkbox update may be the only commit content.
4. In all-tasks mode, still complete this one full Ralph Loop before any later task; do not continue after FAIL, BLOCKED, or unavailable deterministic verification.
5. Apply the TDD policy above: use test-first development only for meaningful feature behavior, and explicitly skip new tests for incidental implementation details.
6. Run deterministic validation and capture the validation evidence described above.
7. Create a clean-eye review using only the spec, selected task, final diff, changed files, and validation output. The review verdict must be PASS, FAIL, or BLOCKED.
8. If review returns FAIL, fix only real required issues and re-test. Do at most 3 fix/retest iterations.
9. If review returns BLOCKED or deterministic verification is unavailable, stop without marking the task complete.
10. Only after PASS and final deterministic verification, call the ralph_complete_task tool for task ${task.number}. The tool will check the spec checkbox and create the conventional commit.
11. After the commit, report the commit SHA and whether more unchecked tasks remain.

Completion tool guidance:
- Use a Conventional Commit title like: ${conventionalTitleForTask(task)}
- Include validation evidence, final validation command or evidence after the checkbox edit, and review summary in the tool arguments.
- Do not edit the checkbox yourself; ralph_complete_task owns the task ledger update.`;
}

export function buildFinalReviewPrompt(state: RalphState, specPath: string, specMarkdown = "", diff = "", changedFiles: string[] = [], validationEvidence = ""): string {
  return `Run the final Ralph branch review with a clean context.

Feature Spec: @${specPath}
Review Base: ${state.reviewBase}
Branch: ${state.branch}
Diff reviewed: git diff ${state.reviewBase}...HEAD

Relevant Feature Spec sections:
${specMarkdown ? relevantSpecSections(specMarkdown) || "(No relevant sections were extracted; read the Feature Spec path above if needed.)" : "Read the Feature Spec path above before deciding the Spec axis."}

Changed files:
${changedFiles.length > 0 ? changedFiles.map((file) => `- ${file}`).join("\n") : "(No changed files were supplied.)"}

Branch diff:
\`\`\`diff
${diff || "(No diff was supplied; run git diff for the Review Base before deciding.)"}
\`\`\`

Validation evidence:
${validationEvidence || "No validation evidence was supplied to the final review session. Run or request deterministic validation before returning PASS; return BLOCKED if validation cannot be produced."}

Review axes:
1. Standards — does the code conform to this repo's documented coding standards, domain language, architecture conventions, and CI-quality validation expectations?
2. Spec — does the branch faithfully implement the Feature Spec and any explicitly linked external issue?

Use only review-relevant artifacts in this fresh session: the Feature Spec, repository docs/context, final branch diff, changed files, and validation output. Do not rely on implementation-conversation memory.

Return a structured verdict: PASS, FAIL, or BLOCKED.
- PASS only if both axes pass and validation evidence supports merge readiness.
- FAIL only for real issues requiring changes, not subjective preferences.
- BLOCKED for missing information or unverifiable state.

If PASS, call ralph_record_final_review with verdict PASS and a detailed Standards summary, Spec summary, and validation evidence. Do not call ralph_create_pull_request automatically. After recording PASS, ask the user explicitly whether to create the Pull Request now; only call ralph_create_pull_request after the user clearly approves.
If FAIL, fix real issues with additional conventional commits, re-run validation, and repeat review.
If BLOCKED, stop and report what is missing.`;
}

async function startFinalBranchReview(ctx: ExtensionCommandContext, state: RalphState, specPath: string): Promise<void> {
  const root = await repoRoot(ctx.cwd);
  const spec = resolveInRepo(root, specPath.replace(/^@/, ""));
  const specMarkdown = await readFile(spec, "utf8");
  const diff = await git(["diff", "--no-ext-diff", `${state.reviewBase}...HEAD`], root, 120_000);
  const changedFiles = (await git(["diff", "--name-only", `${state.reviewBase}...HEAD`], root, 120_000)).split("\n").filter(Boolean);
  const prompt = buildFinalReviewPrompt(state, relativeTo(root, spec), specMarkdown, diff, changedFiles);
  const parentSession = ctx.sessionManager.getSessionFile();
  await ctx.newSession({
    parentSession,
    withSession: async (newCtx) => {
      await newCtx.sendUserMessage(prompt);
    },
  });
}

function reviewPacketPath(repoIdentityPath: string, specKey: string, packetId: string): string {
  return join(dirname(statePath(repoIdentityPath, specKey)), "reviews", `${packetId}.json`);
}

function reviewPacketId(packet: TaskReviewPacket): string {
  return createHash("sha256").update(`${Date.now()}-${Math.random()}-${packet.specPath}-${packet.task.number}`).digest("hex").slice(0, 16);
}

async function writeReviewPacket(root: string, spec: string, packet: TaskReviewPacket): Promise<string> {
  const specKey = canonicalSpecKey(root, spec);
  const packetId = reviewPacketId(packet);
  const packetPath = reviewPacketPath(await repoIdentity(root), specKey, packetId);
  await mkdir(dirname(packetPath), { recursive: true });
  await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  return packetPath;
}

async function commandTaskReview(args: string, ctx: ExtensionCommandContext) {
  const [packetPath] = tokenize(args);
  if (!packetPath) {
    ctx.ui.notify("Usage: /ralph-task-review <review-packet-path>", "error");
    return;
  }

  const packet = JSON.parse(await readFile(packetPath, "utf8")) as TaskReviewPacket;
  const root = await repoRoot(ctx.cwd);
  const spec = resolveInRepo(root, packet.specPath.replace(/^@/, ""));
  const specMarkdown = await readFile(spec, "utf8");
  const reviewPrompt = buildTaskReviewPrompt(packet, specMarkdown);
  const parentSession = ctx.sessionManager.getSessionFile();
  await ctx.newSession({
    parentSession,
    withSession: async (newCtx) => {
      await newCtx.sendUserMessage(reviewPrompt);
    },
  });
}

export function isConventionalCommitTitle(title: string): boolean {
  return /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?: .+/.test(title);
}

export function taskCommitBody(taskNumber: number, validationEvidence: string, finalValidationEvidence: string, reviewSummary: string): string {
  return `Ralph task: ${taskNumber}\n\nValidation evidence:\n${validationEvidence}\n\nFinal validation after checkbox edit:\n${finalValidationEvidence}\n\nReview summary:\n${reviewSummary}`;
}

export async function finalValidationAfterCheckbox(root: string, command?: string, evidence?: string): Promise<string> {
  if (command?.trim()) {
    const { stdout, stderr } = await runCombined("sh", ["-lc", command], root, 120_000);
    return `Command after checkbox edit: ${command}\nResult: PASS\n${stdout ? `stdout:\n${stdout}\n` : ""}${stderr ? `stderr:\n${stderr}` : ""}`.trim();
  }
  if (evidence?.trim()) return evidence;
  throw new Error("Ralph task completion requires final validation after the checkbox edit: provide finalValidationCommand or finalValidationEvidence.");
}

function stripMarkdownHeading(section: string): string {
  return section.replace(/^##\s+[^\n]+\n?/, "").trim();
}

export function pullRequestNumberFromUrl(url: string): number | undefined {
  const match = url.match(/\/pull\/(\d+)(?:$|[/?#])/);
  return match ? Number(match[1]) : undefined;
}

export function buildPullRequestTitle(state: RalphState): string {
  return `feat(${state.specSlug}): complete Ralph feature`;
}

export function buildPullRequestBody(state: RalphState, specPath: string, specMarkdown: string, validationEvidence = ""): string {
  const purpose = stripMarkdownHeading(extractSection(specMarkdown, "## Purpose"));
  const requirements = stripMarkdownHeading(extractSection(specMarkdown, "## Requirements"));
  const constraints = stripMarkdownHeading(extractSection(specMarkdown, "## Implementation Constraints"));
  const outOfScope = stripMarkdownHeading(extractSection(specMarkdown, "## Out of Scope"));
  const checklist = stripMarkdownHeading(extractSection(specMarkdown, "## Review Checklist"));
  return `## Summary
${purpose || `Implements the Ralph Feature Spec at \`${specPath}\`.`}

- Source branch: ${state.branch}
- Review Base / target branch: ${state.reviewBase}

## Requirements Implemented
${requirements || "See the Feature Spec requirements."}

## Implementation Notes
${constraints || "No additional implementation constraints were documented."}

## Validation Evidence
${validationEvidence || state.finalReviewSummary || "Final review PASS was recorded; see Ralph metadata and commit history for validation details."}

## Final Review
${state.finalReviewSummary || "Final branch review status: PASS"}

## Out of Scope
${outOfScope || "No explicit out-of-scope items were documented."}

## Human Review Checklist
${checklist || "- [ ] Review the Feature Spec requirements against this branch."}`;
}

async function pullRequestPrompt(state: RalphState, specPath: string): Promise<string> {
  const spec = resolveInRepo(state.worktreePath, specPath.replace(/^@/, ""));
  const specMarkdown = await readFile(spec, "utf8");
  const title = buildPullRequestTitle(state);
  const body = buildPullRequestBody(state, specPath, specMarkdown);
  return `Create the draft Pull Request for this completed Ralph branch. The user explicitly approved Pull Request creation.

Use ralph_create_pull_request with exactly this Conventional Commit title and body. The Pull Request must be created as a draft.

Title:
${title}

Body:
${body}`;
}

async function fetchRemoteChecks(root: string, pullRequestRef: string): Promise<RemoteCheck[]> {
  const { stdout } = await runCombined("gh", ["pr", "checks", pullRequestRef, "--json", "name,workflow,state,conclusion,bucket,link,detailsUrl"], root, 120_000);
  return JSON.parse(stdout || "[]") as RemoteCheck[];
}

async function watchRemoteChecks(root: string, pullRequestRef: string, timeoutSeconds: number, pollIntervalSeconds: number): Promise<RemoteCheckGateResult> {
  const deadline = Date.now() + Math.max(0, timeoutSeconds) * 1000;
  let lastResult: RemoteCheckGateResult | undefined;
  while (true) {
    const checks = await fetchRemoteChecks(root, pullRequestRef);
    const result = classifyRemoteChecks(checks);
    lastResult = result;
    if (result.verdict === "PASS" || result.verdict === "FAIL") return result;
    if (Date.now() >= deadline) {
      return {
        ...result,
        verdict: "BLOCKED",
        summary: `${result.summary}\nResume with: /ralph <spec> --remote-checks`,
      };
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(1, pollIntervalSeconds) * 1000));
  }
}

export function buildRemoteChecksPrompt(state: RalphState, specPath: string): string {
  return `Resume the Ralph Remote Check Gate for an existing draft Pull Request.

Feature Spec: @${specPath}
Pull Request: ${state.pullRequestUrl || state.pullRequestNumber || "(unknown)"}
Pull Request draft state: ${state.pullRequestDraftState || "draft"}
Remote Check Gate verdict currently recorded: ${state.remoteCheckVerdict || "unknown"}
Remote fix attempt count: ${state.remoteFixAttemptCount || 0}
Failed check summaries:
${state.failedCheckSummaries?.length ? state.failedCheckSummaries.map((item) => `- ${item}`).join("\n") : "(none recorded)"}
Pending check summaries:
${state.pendingCheckSummaries?.length ? state.pendingCheckSummaries.map((item) => `- ${item}`).join("\n") : "(none recorded)"}

Instructions:
- Resume hosted Pull Request check watching for the existing recorded Pull Request only.
- Do not create a new Pull Request in --remote-checks mode.
- Use ralph_watch_remote_checks to watch all hosted checks and update the cached Remote Check Gate verdict with failed or pending check summaries.
- If no Pull Request URL or number is recorded, report BLOCKED and do not create a Pull Request.`;
}

function prBodyTemplate(state: RalphState, specPath: string): string {
  return `Create a detailed draft Pull Request derived mostly from @${specPath}.

Recommended title: ${buildPullRequestTitle(state)}

The body must include the feature purpose, completed requirements, notable implementation constraints, validation evidence, final review result, out-of-scope boundaries, Review Base, target branch, source branch, and a human review checklist.`;
}

async function commandHandler(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI) {
  const parsed = parseArgs(args);
  if (!parsed.specPath) {
    ctx.ui.notify("Usage: /ralph <spec-path> [task-number] [--all] [--base <ref>] [--final-review] [--pr] [--remote-checks] [--no-handoff]", "error");
    return;
  }

  const root = await repoRoot(ctx.cwd);
  const absoluteSpec = resolveInRepo(root, parsed.specPath);
  if (!existsSync(absoluteSpec)) throw new Error(`Feature Spec not found: ${absoluteSpec}`);

  const state = await ensureWorktree(ctx, parsed, root, absoluteSpec);
  if (parsed.mode === "all" && (!state.allMode || state.allModeStopReason)) {
    state.allMode = true;
    state.allModeStopReason = undefined;
    await writeState(statePath(await repoIdentity(root), canonicalSpecKey(root, absoluteSpec)), state);
  }
  if (!isInside(state.worktreePath, ctx.cwd)) {
    const worktreeSpec = join(state.worktreePath, relativeTo(root, absoluteSpec));
    const ralphInvocation = formatRalphInvocation(relativeTo(state.worktreePath, worktreeSpec), parsed, true);
    ctx.ui.notify(`Ralph worktree ready: ${state.worktreePath}`, "info");

    const handoffAlreadyAttempted = process.env.RALPH_HANDOFF === state.worktreePath || process.env.RALPH_HANDOFF === "1";
    if (!parsed.noHandoff && !handoffAlreadyAttempted) {
      if (await automaticHandoff(ctx, state.worktreePath, ralphInvocation)) return;
    } else if (handoffAlreadyAttempted) {
      ctx.ui.notify("Automatic Handoff was already attempted; falling back to Manual Handoff.", "warning");
    }

    ctx.ui.setEditorText(manualHandoffText(state.worktreePath, ralphInvocation));
    return;
  }

  const worktreeSpec = resolveInRepo(state.worktreePath, relativeTo(root, absoluteSpec));
  const { tasks } = await loadTasks(worktreeSpec);
  if (tasks.length === 0) throw new Error(`No top-level checkbox tasks found under ## Implementation Tasks in ${worktreeSpec}`);

  const unchecked = tasks.filter((task) => !task.checked);
  const worktreeSpecRelative = relativeTo(state.worktreePath, worktreeSpec);
  if (parsed.mode === "remote-checks") {
    if (!state.pullRequestUrl && !state.pullRequestNumber) {
      state.remoteCheckVerdict = "BLOCKED";
      state.pendingCheckSummaries = ["No Pull Request URL or number is recorded; --remote-checks does not create Pull Requests."];
      await writeState(statePath(await repoIdentity(root), canonicalSpecKey(root, absoluteSpec)), state);
      ctx.ui.notify("Remote Check Gate requires an existing recorded Pull Request. Run /ralph <spec> --pr after final review PASS first.", "error");
      return;
    }
    pi.sendUserMessage(buildRemoteChecksPrompt(state, worktreeSpecRelative));
    return;
  }

  if (parsed.mode === "final-review") {
    if (unchecked.length > 0) {
      ctx.ui.notify(`Final branch review requires all implementation tasks to be complete; ${unchecked.length} unchecked task(s) remain.`, "error");
      return;
    }
    await startFinalBranchReview(ctx, state, worktreeSpecRelative);
    return;
  }

  if (unchecked.length === 0 && parsed.mode !== "pr") {
    if (state.finalReviewStatus === "PASS") {
      if (ctx.hasUI) {
        const approved = await ctx.ui.confirm("Create Ralph Pull Request?", "Final branch review has passed. Create the Pull Request now?");
        if (approved) {
          pi.sendUserMessage(await pullRequestPrompt(state, worktreeSpecRelative));
        } else {
          ctx.ui.notify(`Pull Request creation skipped. Run /ralph ${shellQuote(worktreeSpecRelative)} --pr later to create it.`, "info");
        }
      } else {
        ctx.ui.notify(`Final review has passed. Run /ralph ${shellQuote(worktreeSpecRelative)} --pr to create the Pull Request.`, "info");
      }
      return;
    }

    await startFinalBranchReview(ctx, state, worktreeSpecRelative);
    return;
  }

  if (parsed.mode === "pr") {
    if (state.finalReviewStatus !== "PASS") {
      ctx.ui.notify(`Final review status is ${state.finalReviewStatus ?? "unknown"}; run /ralph ${shellQuote(worktreeSpecRelative)} --final-review before creating a Pull Request.`, "error");
      return;
    }
    if (state.pullRequestUrl) {
      ctx.ui.notify(`Ralph Pull Request already recorded: ${state.pullRequestUrl}`, "info");
      return;
    }
    pi.sendUserMessage(await pullRequestPrompt(state, worktreeSpecRelative));
    return;
  }

  const task = selectTask(tasks, parsed.taskNumber);
  if (!task) {
    ctx.ui.notify(parsed.taskNumber ? `Task ${parsed.taskNumber} is missing or already checked.` : "No unchecked implementation tasks remain.", "info");
    return;
  }

  pi.sendUserMessage(buildTaskPrompt(state, worktreeSpecRelative, task, parsed.mode));
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("ralph", {
    description: "Run a Ralph Loop from a Feature Spec, one task at a time by default.",
    handler: async (args, ctx) => commandHandler(args, ctx, pi),
  });

  pi.registerCommand("ralph-task-review", {
    description: "Start a fresh-session clean-eye review from a Ralph task review packet.",
    handler: async (args, ctx) => commandTaskReview(args, ctx),
  });

  pi.registerTool({
    name: "ralph_start_task_review",
    label: "Start Ralph Task Review",
    description: "Start a fresh-session clean-eye review for one Ralph task using review-relevant artifacts only.",
    promptSnippet: "Start a fresh-session clean-eye Ralph task review seeded with selected task, diff, changed files, commands run, and validation output.",
    promptGuidelines: [
      "Use ralph_start_task_review after implementing one Ralph task and running initial deterministic validation.",
      "Provide accurate implementation summary, commands run, and validation output so the clean-eye review can return PASS, FAIL, or BLOCKED.",
    ],
    parameters: Type.Object({
      specPath: Type.String({ description: "Feature Spec path, relative to the current Ralph worktree or absolute." }),
      taskNumber: Type.Number({ description: "The selected Ralph task number to review." }),
      implementationSummary: Type.String({ description: "Concise implementation summary for the selected task." }),
      commandsRun: Type.Array(Type.String(), { description: "Validation commands/checks run." }),
      validationOutput: Type.String({ description: "Validation command results and relevant output summary." }),
      reviewAttempt: Type.Optional(Type.Number({ description: "Number of review-driven fix/retest iterations already completed before this review. Defaults to 0." })),
      diff: Type.Optional(Type.String({ description: "Diff to review. Defaults to git diff when omitted." })),
      changedFiles: Type.Optional(Type.Array(Type.String(), { description: "Changed files. Defaults to git diff --name-only when omitted." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      const root = await repoRoot(ctx.cwd);
      const spec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      const { tasks } = await loadTasks(spec);
      const task = tasks.find((candidate) => candidate.number === params.taskNumber);
      if (!task) throw new Error(`Task ${params.taskNumber} was not found in ${spec}`);
      const diff = params.diff ?? (await git(["diff", "--no-ext-diff"], root, 120_000));
      const changedFiles = params.changedFiles ?? (await git(["diff", "--name-only"], root, 120_000)).split("\n").filter(Boolean);
      const packet: TaskReviewPacket = {
        specPath: relativeTo(root, spec),
        task,
        implementationSummary: params.implementationSummary,
        diff,
        changedFiles,
        commandsRun: params.commandsRun,
        validationOutput: params.validationOutput,
        reviewAttempt: params.reviewAttempt ?? 0,
      };
      const packetPath = await writeReviewPacket(root, spec, packet);
      const command = `/ralph-task-review ${shellQuote(packetPath)}`;
      pi.sendUserMessage(command, { deliverAs: "followUp" });
      return {
        content: [{ type: "text", text: `Queued fresh-session Ralph task review for task ${params.taskNumber}. Review packet: ${packetPath}` }],
        details: { packetPath, command },
      };
    },
  });

  pi.registerTool({
    name: "ralph_handle_task_review",
    label: "Handle Ralph Task Review",
    description: "Apply the bounded Ralph fix/retest controller to a task review verdict.",
    promptSnippet: "Handle PASS, FAIL, or BLOCKED task review verdicts with at most three review-driven fix/retest iterations.",
    promptGuidelines: [
      "Use ralph_handle_task_review after a fresh-session Ralph task review returns PASS, FAIL, or BLOCKED.",
      "For FAIL, ralph_handle_task_review may queue one narrowly scoped fix/retest prompt until the three-iteration limit is reached.",
      "For BLOCKED or exhausted failures, ralph_handle_task_review stops without marking the task complete.",
    ],
    parameters: Type.Object({
      specPath: Type.String({ description: "Feature Spec path, relative to the current Ralph worktree or absolute." }),
      taskNumber: Type.Number({ description: "The reviewed Ralph task number." }),
      verdict: StringEnum(["PASS", "FAIL", "BLOCKED"] as const),
      reviewAttempt: Type.Number({ description: "Number of review-driven fix/retest iterations already completed before this verdict." }),
      reviewSummary: Type.String({ description: "Concise clean-eye review summary." }),
      requiredFixes: Type.Optional(Type.String({ description: "Required fixes for FAIL verdicts." })),
      blockingIssues: Type.Optional(Type.String({ description: "Blocking issues for BLOCKED verdicts." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      const decision = taskReviewDecision(params.verdict, params.reviewAttempt);
      const root = await repoRoot(ctx.cwd);
      const spec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      const { tasks } = await loadTasks(spec);
      const task = tasks.find((candidate) => candidate.number === params.taskNumber);
      if (!task) throw new Error(`Task ${params.taskNumber} was not found in ${spec}`);

      if (decision.action === "fix") {
        const packet: TaskReviewPacket = {
          specPath: relativeTo(root, spec),
          task,
          implementationSummary: "Previous review failed; fix/retest iteration required.",
          diff: "",
          changedFiles: [],
          commandsRun: [],
          validationOutput: "",
          reviewAttempt: params.reviewAttempt,
        };
        pi.sendUserMessage(buildFixRetestPrompt(packet, params.requiredFixes || "(No required fixes were provided.)", params.reviewSummary, decision.nextAttempt), { deliverAs: "followUp" });
      } else if (decision.action === "stop-blocked" || decision.action === "stop-failed") {
        const specKey = canonicalSpecKey(root, spec);
        const cachePath = statePath(await repoIdentity(root), specKey);
        const state = await readState(cachePath, specKey);
        if (state?.allMode) {
          state.allModeStopReason = decision.action === "stop-blocked" ? params.blockingIssues || params.reviewSummary : params.requiredFixes || params.reviewSummary;
          await writeState(cachePath, state);
        }
      }
      const detailText = decision.action === "stop-blocked" && params.blockingIssues ? `${decision.message}\n\nBlocking issues:\n${params.blockingIssues}` : decision.action === "stop-failed" && params.requiredFixes ? `${decision.message}\n\nRemaining required fixes:\n${params.requiredFixes}` : decision.message;
      return {
        content: [{ type: "text", text: detailText }],
        details: { decision },
      };
    },
  });

  pi.registerTool({
    name: "ralph_complete_task",
    label: "Complete Ralph Task",
    description: "After Ralph review PASS and deterministic verification, check one Feature Spec task and create the conventional task commit.",
    promptSnippet: "Complete a verified Ralph task by updating the Feature Spec checkbox and creating the task commit.",
    promptGuidelines: [
      "Use ralph_complete_task only after the selected Ralph task has PASS review and deterministic verification evidence.",
      "Do not use ralph_complete_task for blocked, failed, or unverifiable Ralph tasks.",
    ],
    parameters: Type.Object({
      specPath: Type.String({ description: "Feature Spec path, relative to the current Ralph worktree or absolute." }),
      taskNumber: Type.Number({ description: "The verified task number to mark complete." }),
      commitTitle: Type.String({ description: "Conventional Commit title for this task." }),
      validationEvidence: Type.String({ description: "Commands/checks run and their passing results before completion." }),
      finalValidationCommand: Type.Optional(Type.String({ description: "Validation command for Ralph to rerun after the Feature Spec checkbox edit and before committing." })),
      finalValidationEvidence: Type.Optional(Type.String({ description: "Explicit final validation confirmation when no rerun is necessary after the Feature Spec checkbox edit." })),
      reviewSummary: Type.String({ description: "Clean-eye review PASS summary." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      if (!isConventionalCommitTitle(params.commitTitle)) throw new Error(`Ralph task commit title is not Conventional Commit style: ${params.commitTitle}`);
      if (!params.validationEvidence.trim()) throw new Error("Ralph task completion requires deterministic validation evidence.");
      if (!params.reviewSummary.trim()) throw new Error("Ralph task completion requires a clean-eye review PASS summary.");

      const root = await repoRoot(ctx.cwd);
      const spec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      const specKey = canonicalSpecKey(root, spec);
      const cachePath = statePath(await repoIdentity(root), specKey);
      const state = await readState(cachePath, specKey);
      if (!state) throw new Error(`No Ralph state found for ${spec}; refusing to complete a verified task without metadata.`);

      await checkTask(spec, params.taskNumber);
      const finalValidationEvidence = await finalValidationAfterCheckbox(root, params.finalValidationCommand, params.finalValidationEvidence);
      await git(["add", "-A"], root);
      const status = await git(["status", "--porcelain"], root);
      if (!status) throw new Error("No changes to commit after checking the task. Refusing to create an empty Ralph task commit.");
      const body = taskCommitBody(params.taskNumber, params.validationEvidence, finalValidationEvidence, params.reviewSummary);
      await git(["commit", "-m", params.commitTitle, "-m", body], root, 120_000);
      const sha = await git(["rev-parse", "HEAD"], root);

      let followUp = "";
      if (state) {
        state.taskCommits[String(params.taskNumber)] = sha;
        await writeState(cachePath, state);

        if (state.allMode) {
          const { tasks } = await loadTasks(spec);
          const action = nextAllTasksAction(tasks);
          if (action.action === "run-next") {
            followUp = ` Continuing all-tasks mode with task ${action.task.number}.`;
            pi.sendUserMessage(buildTaskPrompt(state, relativeTo(root, spec), action.task, "all"), { deliverAs: "followUp" });
          } else {
            followUp = " All tasks are complete; queued final branch review.";
            pi.sendUserMessage(`/ralph ${shellQuote(relativeTo(root, spec))} --final-review`, { deliverAs: "followUp" });
          }
        }
      }

      return {
        content: [{ type: "text", text: `Ralph task ${params.taskNumber} completed and committed as ${sha}.${followUp}` }],
        details: { taskNumber: params.taskNumber, commit: sha, followUp },
      };
    },
  });

  pi.registerTool({
    name: "ralph_record_final_review",
    label: "Record Ralph Final Review",
    description: "Record the final two-axis Ralph branch review verdict in Pi cache.",
    parameters: Type.Object({
      specPath: Type.String(),
      verdict: StringEnum(["PASS", "FAIL", "BLOCKED"] as const),
      standardsSummary: Type.String(),
      specSummary: Type.String(),
      validationEvidence: Type.String(),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      const root = await repoRoot(ctx.cwd);
      const spec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      const specKey = canonicalSpecKey(root, spec);
      const cachePath = statePath(await repoIdentity(root), specKey);
      const state = await readState(cachePath, specKey);
      if (!state) throw new Error(`No Ralph state found for ${spec}`);
      state.finalReviewStatus = params.verdict;
      state.finalReviewSummary = `Standards: ${params.standardsSummary}\n\nSpec: ${params.specSummary}\n\nValidation: ${params.validationEvidence}`;
      await writeState(cachePath, state);
      return {
        content: [{ type: "text", text: params.verdict === "PASS" ? "Recorded Ralph final review verdict: PASS. Ask the user whether to create the Pull Request now; do not call ralph_create_pull_request unless the user explicitly approves." : `Recorded Ralph final review verdict: ${params.verdict}.` }],
        details: { verdict: params.verdict },
      };
    },
  });

  pi.registerTool({
    name: "ralph_watch_remote_checks",
    label: "Watch Ralph Remote Checks",
    description: "Watch hosted Pull Request checks and return PASS, FAIL, or BLOCKED with failed or pending check summaries.",
    promptSnippet: "Watch hosted Pull Request checks for a Ralph Pull Request and report PASS, FAIL, or BLOCKED.",
    promptGuidelines: [
      "Use ralph_watch_remote_checks for the Remote Check Gate after a draft Ralph Pull Request exists.",
      "ralph_watch_remote_checks defaults to all hosted checks and blocks rather than creating a Pull Request when no Pull Request is recorded.",
    ],
    parameters: Type.Object({
      specPath: Type.String({ description: "Feature Spec path, relative to the current Ralph worktree or absolute." }),
      timeoutSeconds: Type.Optional(Type.Number({ description: "Maximum seconds to wait for pending checks. Defaults to 600." })),
      pollIntervalSeconds: Type.Optional(Type.Number({ description: "Seconds between hosted check polls. Defaults to 15." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      const root = await repoRoot(ctx.cwd);
      const spec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      const specKey = canonicalSpecKey(root, spec);
      const cachePath = statePath(await repoIdentity(root), specKey);
      const state = await readState(cachePath, specKey);
      if (!state) throw new Error(`No Ralph state found for ${spec}`);
      const pullRequestRef = state.pullRequestUrl || (state.pullRequestNumber ? String(state.pullRequestNumber) : "");
      let result: RemoteCheckGateResult;
      if (!pullRequestRef) {
        result = {
          verdict: "BLOCKED",
          failedCheckSummaries: [],
          pendingCheckSummaries: ["No Pull Request URL or number is recorded; run /ralph <spec> --pr after final review PASS first."],
          summary: "Remote Check Gate is blocked because no Pull Request is recorded. --remote-checks does not create Pull Requests.",
        };
      } else {
        try {
          result = await watchRemoteChecks(root, pullRequestRef, params.timeoutSeconds ?? 600, params.pollIntervalSeconds ?? 15);
        } catch (error) {
          result = {
            verdict: "BLOCKED",
            failedCheckSummaries: [],
            pendingCheckSummaries: [`Hosted check watching unavailable: ${error instanceof Error ? error.message : String(error)}`],
            summary: "Remote Check Gate is blocked because hosted check tooling, authentication, permissions, or repository support is unavailable. Resume with /ralph <spec> --remote-checks after resolving it.",
          };
        }
      }
      state.remoteCheckVerdict = result.verdict;
      state.failedCheckSummaries = result.failedCheckSummaries;
      state.pendingCheckSummaries = result.pendingCheckSummaries;
      await writeState(cachePath, state);
      return {
        content: [{ type: "text", text: result.summary }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "ralph_record_remote_check_state",
    label: "Record Ralph Remote Check State",
    description: "Record Remote Check Gate state for an existing Ralph Pull Request in Pi cache.",
    parameters: Type.Object({
      specPath: Type.String(),
      verdict: StringEnum(["PASS", "FAIL", "BLOCKED"] as const),
      failedCheckSummaries: Type.Optional(Type.Array(Type.String())),
      pendingCheckSummaries: Type.Optional(Type.Array(Type.String())),
      remoteFixAttemptCount: Type.Optional(Type.Number()),
      pullRequestUrl: Type.Optional(Type.String()),
      pullRequestNumber: Type.Optional(Type.Number()),
      pullRequestDraftState: Type.Optional(StringEnum(["draft", "ready"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      const root = await repoRoot(ctx.cwd);
      const spec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      const specKey = canonicalSpecKey(root, spec);
      const cachePath = statePath(await repoIdentity(root), specKey);
      const state = await readState(cachePath, specKey);
      if (!state) throw new Error(`No Ralph state found for ${spec}`);
      state.remoteCheckVerdict = params.verdict;
      state.failedCheckSummaries = params.failedCheckSummaries || [];
      state.pendingCheckSummaries = params.pendingCheckSummaries || [];
      state.remoteFixAttemptCount = params.remoteFixAttemptCount ?? state.remoteFixAttemptCount ?? 0;
      if (params.pullRequestUrl) {
        state.pullRequestUrl = params.pullRequestUrl;
        state.pullRequestNumber = pullRequestNumberFromUrl(params.pullRequestUrl) ?? state.pullRequestNumber;
      }
      if (params.pullRequestNumber) state.pullRequestNumber = params.pullRequestNumber;
      if (params.pullRequestDraftState) state.pullRequestDraftState = params.pullRequestDraftState;
      await writeState(cachePath, state);
      return {
        content: [{ type: "text", text: `Recorded Remote Check Gate verdict: ${params.verdict}` }],
        details: { verdict: params.verdict, failedCheckSummaries: state.failedCheckSummaries, pendingCheckSummaries: state.pendingCheckSummaries, remoteFixAttemptCount: state.remoteFixAttemptCount },
      };
    },
  });

  pi.registerTool({
    name: "ralph_create_pull_request",
    label: "Create Ralph Pull Request",
    description: "Create the final Ralph Pull Request with gh after final review PASS.",
    parameters: Type.Object({
      specPath: Type.String(),
      title: Type.String({ description: "Conventional Commit style Pull Request title." }),
      body: Type.String({ description: "Detailed Pull Request body derived mostly from the Feature Spec." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      if (!isConventionalCommitTitle(params.title)) {
        throw new Error(`Pull Request title is not Conventional Commit style: ${params.title}`);
      }
      const root = await repoRoot(ctx.cwd);
      const spec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      const specKey = canonicalSpecKey(root, spec);
      const cachePath = statePath(await repoIdentity(root), specKey);
      const state = await readState(cachePath, specKey);
      if (!state) throw new Error(`No Ralph state found for ${spec}`);
      if (state.finalReviewStatus !== "PASS") throw new Error(`Final review status is ${state.finalReviewStatus ?? "unknown"}; refusing to create Pull Request.`);
      if (state.pullRequestUrl) {
        return {
          content: [{ type: "text", text: `Ralph Pull Request already recorded: ${state.pullRequestUrl}` }],
          details: { url: state.pullRequestUrl, alreadyExists: true },
        };
      }

      const branch = await git(["branch", "--show-current"], root);
      await git(["push", "-u", "origin", branch], root, 120_000);
      const { stdout } = await runCombined("gh", ["pr", "create", "--draft", "--base", state.reviewBase, "--head", branch, "--title", params.title, "--body", params.body], root, 120_000);
      state.pullRequestUrl = stdout.trim();
      state.pullRequestNumber = pullRequestNumberFromUrl(state.pullRequestUrl);
      state.pullRequestDraftState = "draft";
      state.remoteFixAttemptCount = state.remoteFixAttemptCount || 0;
      await writeState(cachePath, state);
      return {
        content: [{ type: "text", text: `Created Pull Request: ${state.pullRequestUrl}` }],
        details: { url: state.pullRequestUrl },
      };
    },
  });
}
