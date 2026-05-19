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

type RalphMode = "one" | "all" | "final-review" | "pr";

export type FinalReviewStatus = "PASS" | "FAIL" | "BLOCKED";

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
  finalReviewStatus?: FinalReviewStatus;
  finalReviewSummary?: string;
  pullRequestUrl?: string;
};

type TaskKind = "implementation" | "validation" | "review";

export type ParsedTask = {
  number: number;
  checked: boolean;
  text: string;
  lineIndex: number;
  raw: string;
  guidance: string[];
  kind: TaskKind;
};

type ParsedArgs = {
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

function safeBranchName(slug: string): string {
  return `ralph/${slug.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function safeWorktreeName(slug: string): string {
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
    finalReviewStatus: raw.finalReviewStatus,
    finalReviewSummary: raw.finalReviewSummary,
    pullRequestUrl: raw.pullRequestUrl,
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
  const cachePath = statePath(await repoIdentity(root), specKey);
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
  const worktreePath = join(root, ".worktrees", safeWorktreeName(slug));
  if ((parsed.mode === "final-review" || parsed.mode === "pr") && !existsSync(worktreePath)) {
    throw new Error("Ralph final-review and Pull Request modes require an existing Ralph run; no Ralph state or worktree exists for this Feature Spec.");
  }

  const status = await gitStatus(root);
  if (status && !existsSync(worktreePath)) {
    await createContextCaptureCommit(ctx, root, status);
  } else if (status && existsSync(worktreePath)) {
    ctx.ui.notify("The original checkout is dirty; those changes are not part of the existing Ralph branch and will not be ported automatically.", "warning");
  }

  const currentBranch = await git(["branch", "--show-current"], root);
  const createdFrom = await git(["rev-parse", "HEAD"], root);
  const reviewBase = parsed.reviewBase || currentBranch || createdFrom;

  await mkdir(dirname(worktreePath), { recursive: true });
  if (!existsSync(worktreePath)) {
    if (await branchExists(root, branch)) {
      await git(["worktree", "add", worktreePath, branch], root, 120_000);
    } else {
      await git(["worktree", "add", "-b", branch, worktreePath, "HEAD"], root, 120_000);
    }
  }

  if (!(await isIgnored(root, ".worktrees")) && ctx.hasUI) {
    ctx.ui.notify("Ralph worktrees live under .worktrees, but .worktrees is not ignored by this repo.", "warning");
  }

  const state: RalphState = {
    version: STATE_VERSION,
    repoRoot: root,
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

function formatRalphInvocation(specPath: string, parsed: ParsedArgs, includeNoHandoff = false): string {
  const tokens = [specPath];
  if (parsed.taskNumber !== undefined) tokens.push(String(parsed.taskNumber));
  if (parsed.mode === "all") tokens.push("--all");
  if (parsed.mode === "final-review") tokens.push("--final-review");
  if (parsed.mode === "pr") tokens.push("--pr");
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

function buildTaskPrompt(state: RalphState, specPath: string, task: ParsedTask, mode: RalphMode): string {
  return `Run a Ralph Loop for exactly one Feature Spec task.

Feature Spec: @${specPath}
Selected task: ${task.number}. ${task.text}
Selected task kind: ${task.kind}${taskGuidanceBlock(task)}
Mode: ${mode}
Review Base: ${state.reviewBase}
Branch: ${state.branch}

Required loop:
1. Load repository context and the Feature Spec.
2. Implement only task ${task.number}. Do not broaden scope to other unchecked tasks. Treat the non-checkbox sub-bullets above as guidance for this selected task, not as independently runnable tasks.
3. If the selected task kind is validation or review, execute it as a first-class Ralph task; if it already passes and produces no code changes, deterministic verification plus the spec checkbox update may be the only commit content.
4. Use TDD only if a meaningful feature-level automated test is applicable. Do not add tests for mundane implementation details such as merely checking that a CSS class exists on an HTML tag.
5. Run deterministic validation. Prefer the smallest relevant existing project checks first, then broader CI-quality checks when appropriate.
6. Create a clean-eye review using only the spec, selected task, final diff, changed files, and validation output. The review verdict must be PASS, FAIL, or BLOCKED.
7. If review returns FAIL, fix only real required issues and re-test. Do at most 3 fix/retest iterations.
8. If review returns BLOCKED or deterministic verification is unavailable, stop without marking the task complete.
9. Only after PASS and final deterministic verification, call the ralph_complete_task tool for task ${task.number}. The tool will check the spec checkbox and create the conventional commit.
10. After the commit, report the commit SHA and whether more unchecked tasks remain.

Completion tool guidance:
- Use a Conventional Commit title like: ${conventionalTitleForTask(task)}
- Include validation evidence and review summary in the tool arguments.
- Do not edit the checkbox yourself; ralph_complete_task owns the task ledger update.`;
}

function buildFinalReviewPrompt(state: RalphState, specPath: string): string {
  return `Run the final Ralph branch review with a clean context.

Feature Spec: @${specPath}
Review Base: ${state.reviewBase}
Branch: ${state.branch}
Diff to review: git diff ${state.reviewBase}...HEAD

Review axes:
1. Standards — does the code conform to this repo's documented coding standards, domain language, architecture conventions, and CI-quality validation expectations?
2. Spec — does the branch faithfully implement the Feature Spec and any explicitly linked external issue?

Use only review-relevant artifacts: the Feature Spec, repository docs/context, final branch diff, changed files, and validation output. Do not rely on implementation-conversation memory.

Return a structured verdict: PASS, FAIL, or BLOCKED.
- PASS only if both axes pass and validation evidence supports merge readiness.
- FAIL only for real issues requiring changes, not subjective preferences.
- BLOCKED for missing information or unverifiable state.

If PASS, call ralph_record_final_review with verdict PASS and a detailed summary. Do not call ralph_create_pull_request automatically. After recording PASS, ask the user explicitly whether to create the Pull Request now; only call ralph_create_pull_request after the user clearly approves.
If FAIL, fix real issues with additional conventional commits, re-run validation, and repeat review.
If BLOCKED, stop and report what is missing.`;
}

function prBodyTemplate(state: RalphState, specPath: string): string {
  return `Create a detailed Pull Request body derived mostly from @${specPath}.

Include these sections:
## Summary
- Purpose of the Feature Spec
- Source branch: ${state.branch}
- Review Base / target branch: ${state.reviewBase}

## Requirements Implemented
- Summarize completed Feature Spec requirements.

## Implementation Notes
- Notable constraints and design decisions from the Feature Spec.

## Validation Evidence
- Commands run and results.

## Final Review
- Standards axis result.
- Spec axis result.

## Out of Scope
- Boundaries from the Feature Spec.

## Human Review Checklist
- Checklist derived from the Feature Spec Review Checklist.`;
}

async function commandHandler(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI) {
  const parsed = parseArgs(args);
  if (!parsed.specPath) {
    ctx.ui.notify("Usage: /ralph <spec-path> [task-number] [--all] [--base <ref>] [--final-review] [--pr] [--no-handoff]", "error");
    return;
  }

  const root = await repoRoot(ctx.cwd);
  const absoluteSpec = resolveInRepo(root, parsed.specPath);
  if (!existsSync(absoluteSpec)) throw new Error(`Feature Spec not found: ${absoluteSpec}`);

  const state = await ensureWorktree(ctx, parsed, root, absoluteSpec);
  if (parsed.mode === "all" && !state.allMode) {
    state.allMode = true;
    await writeState(statePath(await repoIdentity(root), canonicalSpecKey(root, absoluteSpec)), state);
  }
  if (!isInside(state.worktreePath, ctx.cwd)) {
    const worktreeSpec = join(state.worktreePath, relativeTo(root, absoluteSpec));
    const ralphInvocation = formatRalphInvocation(relativeTo(state.worktreePath, worktreeSpec), parsed);
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
  if (parsed.mode === "final-review") {
    pi.sendUserMessage(`${buildFinalReviewPrompt(state, worktreeSpecRelative)}\n\n${prBodyTemplate(state, worktreeSpecRelative)}`);
    return;
  }

  if (unchecked.length === 0 && parsed.mode !== "pr") {
    if (state.finalReviewStatus === "PASS") {
      if (ctx.hasUI) {
        const approved = await ctx.ui.confirm("Create Ralph Pull Request?", "Final branch review has passed. Create the Pull Request now?");
        if (approved) {
          pi.sendUserMessage(`Create the Pull Request for this completed Ralph branch. The user explicitly approved Pull Request creation in the Ralph confirmation dialog.\n\n${prBodyTemplate(state, worktreeSpecRelative)}\n\nUse ralph_create_pull_request after confirming final review status is PASS.`);
        } else {
          ctx.ui.notify(`Pull Request creation skipped. Run /ralph ${shellQuote(worktreeSpecRelative)} --pr later to create it.`, "info");
        }
      } else {
        ctx.ui.notify(`Final review has passed. Run /ralph ${shellQuote(worktreeSpecRelative)} --pr to create the Pull Request.`, "info");
      }
      return;
    }

    pi.sendUserMessage(`${buildFinalReviewPrompt(state, worktreeSpecRelative)}\n\n${prBodyTemplate(state, worktreeSpecRelative)}`);
    return;
  }

  if (parsed.mode === "pr") {
    if (state.finalReviewStatus !== "PASS") {
      ctx.ui.notify(`Final review status is ${state.finalReviewStatus ?? "unknown"}; run /ralph ${shellQuote(worktreeSpecRelative)} --final-review before creating a Pull Request.`, "error");
      return;
    }
    pi.sendUserMessage(`Create the Pull Request for this completed Ralph branch. The user explicitly approved Pull Request creation by invoking --pr.\n\n${prBodyTemplate(state, worktreeSpecRelative)}\n\nUse ralph_create_pull_request after confirming final review status is PASS.`);
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
      validationEvidence: Type.String({ description: "Commands/checks run and their passing results." }),
      reviewSummary: Type.String({ description: "Clean-eye review PASS summary." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      const root = await repoRoot(ctx.cwd);
      const spec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      await checkTask(spec, params.taskNumber);
      await git(["add", "-A"], root);
      const status = await git(["status", "--porcelain"], root);
      if (!status) throw new Error("No changes to commit after checking the task. Refusing to create an empty Ralph task commit.");
      const body = `Ralph task: ${params.taskNumber}\n\nValidation evidence:\n${params.validationEvidence}\n\nReview summary:\n${params.reviewSummary}`;
      await git(["commit", "-m", params.commitTitle, "-m", body], root, 120_000);
      const sha = await git(["rev-parse", "HEAD"], root);

      const canonicalSpec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      const specKey = canonicalSpecKey(root, canonicalSpec);
      const cachePath = statePath(await repoIdentity(root), specKey);
      const state = await readState(cachePath, specKey);
      let followUp = "";
      if (state) {
        state.taskCommits[String(params.taskNumber)] = sha;
        await writeState(cachePath, state);

        if (state.allMode) {
          const { tasks } = await loadTasks(spec);
          const nextTask = selectTask(tasks);
          if (nextTask) {
            followUp = ` Continuing all-tasks mode with task ${nextTask.number}.`;
            pi.sendUserMessage(buildTaskPrompt(state, relativeTo(root, spec), nextTask, "all"), { deliverAs: "followUp" });
          } else {
            followUp = " All tasks are complete; queued final branch review.";
            pi.sendUserMessage(`${buildFinalReviewPrompt(state, relativeTo(root, spec))}\n\n${prBodyTemplate(state, relativeTo(root, spec))}`, { deliverAs: "followUp" });
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
    name: "ralph_create_pull_request",
    label: "Create Ralph Pull Request",
    description: "Create the final Ralph Pull Request with gh after final review PASS.",
    parameters: Type.Object({
      specPath: Type.String(),
      title: Type.String({ description: "Conventional Commit style Pull Request title." }),
      body: Type.String({ description: "Detailed Pull Request body derived mostly from the Feature Spec." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
      if (!/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?: .+/.test(params.title)) {
        throw new Error(`Pull Request title is not Conventional Commit style: ${params.title}`);
      }
      const root = await repoRoot(ctx.cwd);
      const spec = resolveInRepo(root, params.specPath.replace(/^@/, ""));
      const specKey = canonicalSpecKey(root, spec);
      const cachePath = statePath(await repoIdentity(root), specKey);
      const state = await readState(cachePath, specKey);
      if (!state) throw new Error(`No Ralph state found for ${spec}`);
      if (state.finalReviewStatus !== "PASS") throw new Error(`Final review status is ${state.finalReviewStatus ?? "unknown"}; refusing to create Pull Request.`);

      const branch = await git(["branch", "--show-current"], root);
      await git(["push", "-u", "origin", branch], root, 120_000);
      const { stdout } = await runCombined("gh", ["pr", "create", "--base", state.reviewBase, "--head", branch, "--title", params.title, "--body", params.body], root, 120_000);
      state.pullRequestUrl = stdout.trim();
      await writeState(cachePath, state);
      return {
        content: [{ type: "text", text: `Created Pull Request: ${state.pullRequestUrl}` }],
        details: { url: state.pullRequestUrl },
      };
    },
  });
}
