import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  checkTask,
  extractFinalJsonBlock,
  finalTextFromSubagentResponse,
  parseGitStatusPorcelain,
  parseImplementationTasks,
  relativeToCwd,
  resolveSpecPath,
  taskCommitTitle,
  taskPromptPayload,
  unexpectedDirtyPaths,
  validateCompletionSummary,
  validateTaskSummary,
} from "./forge-core.mjs";

interface ForgeTask {
  lineIndex: number;
  checked: boolean;
  number: number;
  text: string;
  guidance: string;
}

interface TaskSummary {
  status: "done" | "stop";
  summary: string;
  changedPaths?: string[];
  validation?: string[];
  commitTitle?: string;
}

interface SlashResponse {
  requestId: string;
  result: { content: Array<{ type?: string; text?: string }>; details?: unknown };
  isError?: boolean;
  errorText?: string;
}

interface SlashLiveDetails {
  requestId: string;
  result: {
    content: Array<{ type: "text"; text: string }>;
    details: {
      mode: "single";
      results: Array<Record<string, unknown>>;
      progress: Array<Record<string, unknown>>;
    };
  };
}

interface ForgeLiveDisplay {
  taskLabel: string;
  phases: string[];
  chain: unknown[];
}

interface ForgePhaseState {
  number: number;
  total: number;
  label: string;
}

function requestId(): string {
  return `forge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sendForgeMessage(pi: ExtensionAPI, content: string, details: Record<string, unknown> = {}): void {
  pi.sendMessage({ customType: "forge", content, display: true, details });
}

function setStatus(ctx: ExtensionContext, text: string | undefined): void {
  if (ctx.hasUI) ctx.ui.setStatus("forge", text);
}

async function exec(pi: ExtensionAPI, command: string, args: string[], cwd: string, timeout = 120_000) {
  const result = await pi.exec(command, args, { cwd, timeout });
  if (result.code !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : "";
    const stdout = result.stdout ? `\n${result.stdout}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.code}${stderr}${stdout}`);
  }
  return result.stdout.trim();
}

async function gitStatus(pi: ExtensionAPI, cwd: string): Promise<string[]> {
  const output = await exec(pi, "git", ["status", "--porcelain"], cwd, 30_000);
  return parseGitStatusPorcelain(output);
}

async function ensureCleanStart(pi: ExtensionAPI, cwd: string): Promise<string> {
  const dirty = await gitStatus(pi, cwd);
  if (dirty.length > 0) {
    throw new Error(`Forge requires a clean working tree before start. Dirty paths:\n${dirty.map((p) => `- ${p}`).join("\n")}`);
  }
  return exec(pi, "git", ["rev-parse", "HEAD"], cwd, 30_000);
}

function buildForgeLiveDetails(id: string, params: Record<string, unknown>, display?: ForgeLiveDisplay): SlashLiveDetails {
  const initialPhase = display ? phaseState(display, []) : undefined;
  const progress = {
    index: 0,
    agent: forgeLiveAgentLabel(display, initialPhase),
    status: "running",
    task: forgeLiveTaskLabel(params, initialPhase),
    recentTools: [],
    recentOutput: [],
    toolCount: 0,
    tokens: 0,
    durationMs: 0,
  };
  return {
    requestId: id,
    result: {
      content: [{ type: "text", text: progress.task }],
      details: {
        mode: "single",
        progress: [progress],
        results: [{
          agent: progress.agent,
          task: progress.task,
          exitCode: 0,
          messages: [],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
          progress,
        }],
      },
    },
  };
}

function chainStepWidth(step: unknown): number {
  if (!step || typeof step !== "object") return 1;
  const parallel = (step as { parallel?: unknown }).parallel;
  return Array.isArray(parallel) ? Math.max(1, parallel.length) : 1;
}

function phaseState(display: ForgeLiveDisplay, progressEntries: Array<Record<string, unknown>>): ForgePhaseState {
  const runningIndex = progressEntries.findIndex((entry) => entry.status === "running");
  const flatIndex = runningIndex >= 0 && typeof progressEntries[runningIndex].index === "number"
    ? Number(progressEntries[runningIndex].index)
    : Math.max(0, runningIndex);
  let cursor = 0;
  for (let i = 0; i < display.phases.length; i++) {
    const width = chainStepWidth(display.chain[i]);
    if (flatIndex >= cursor && flatIndex < cursor + width) {
      return { number: i + 1, total: display.phases.length, label: display.phases[i] };
    }
    cursor += width;
  }
  return { number: 1, total: display.phases.length, label: display.phases[0] ?? "Running" };
}

function forgeLiveAgentLabel(display?: ForgeLiveDisplay, phase?: ForgePhaseState): string {
  if (!display || !phase) return "forge";
  return `Forge · ${display.taskLabel} · Phase ${phase.number}/${phase.total}`;
}

function forgeLiveTaskLabel(params: Record<string, unknown>, phase?: ForgePhaseState): string {
  if (!phase) return String(params.task ?? "Running Forge Task Chain");
  return `${phase.label}`;
}

function activeToolLabel(progressEntries: Array<Record<string, unknown>>): string | undefined {
  const activeToolEntries = progressEntries.filter((entry) => entry.status === "running" && typeof entry.currentTool === "string" && entry.currentTool.length > 0);
  if (activeToolEntries.length === 0) return undefined;
  if (activeToolEntries.length === 1) return `1 active · ${String(activeToolEntries[0].currentTool)}`;
  return `${activeToolEntries.length} active tools`;
}

function updateForgeLiveDetails(details: SlashLiveDetails, update: { currentTool?: string; toolCount?: number; progress?: Array<Record<string, unknown>> }, display?: ForgeLiveDisplay): void {
  const progressEntries = update.progress ?? [];
  const phase = display ? phaseState(display, progressEntries) : undefined;
  const running = progressEntries.find((entry) => entry.status === "running") ?? progressEntries[0];
  const current = details.result.details.progress[0] ?? {};
  const progress = {
    ...current,
    status: "running",
    agent: forgeLiveAgentLabel(display, phase),
    task: forgeLiveTaskLabel({ task: running?.task ?? current.task }, phase),
    recentTools: [],
    recentOutput: [],
    ...(running?.tokens ? { tokens: running.tokens } : {}),
    ...(running?.durationMs ? { durationMs: running.durationMs } : {}),
    currentTool: activeToolLabel(progressEntries),
    toolCount: 0,
  };
  details.result.details.progress = [progress];
  details.result.details.results = [{
    ...details.result.details.results[0],
    agent: progress.agent,
    task: progress.task,
    progress,
  }];
}

function installForgeRenderPump(ctx: ExtensionCommandContext): () => void {
  if (!ctx.hasUI) return () => undefined;
  ctx.ui.setWidget(
    "forge-render-pump",
    (tui: { requestRender(): void }) => {
      const interval = setInterval(() => tui.requestRender(), 100);
      return {
        render: () => [],
        dispose: () => clearInterval(interval),
      };
    },
    { placement: "belowEditor" },
  );
  return () => ctx.ui.setWidget("forge-render-pump", undefined);
}

function runSubagentChain(pi: ExtensionAPI, ctx: ExtensionCommandContext, params: Record<string, unknown>, display?: ForgeLiveDisplay): Promise<SlashResponse> {
  return new Promise((resolve, reject) => {
    const id = requestId();
    const liveDetails = buildForgeLiveDetails(id, params, display);
    const stopRenderPump = installForgeRenderPump(ctx);
    pi.sendMessage({
      customType: "subagent-slash-result",
      content: liveDetails.result.content.map((part) => part.text).join("\n"),
      display: true,
      details: liveDetails,
    });

    let pendingRender: ReturnType<typeof setTimeout> | undefined;
    let lastRenderAt = 0;
    const requestRender = () => {
      if (!ctx.hasUI) return;
      const render = (ctx.ui as { requestRender?: () => void }).requestRender;
      if (!render) return;
      const now = Date.now();
      const delay = Math.max(0, 100 - (now - lastRenderAt));
      if (delay === 0) {
        lastRenderAt = now;
        render.call(ctx.ui);
        return;
      }
      if (pendingRender) return;
      pendingRender = setTimeout(() => {
        pendingRender = undefined;
        lastRenderAt = Date.now();
        render.call(ctx.ui);
      }, delay);
    };

    let done = false;
    let started = false;
    const startTimeout = setTimeout(() => {
      finish(() => reject(new Error("pi-subagents did not start within 15s. Is pi-subagents installed and loaded?")));
    }, 15_000);

    const finish = (next: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(startTimeout);
      unsubStarted();
      unsubResponse();
      unsubUpdate();
      if (pendingRender) clearTimeout(pendingRender);
      pendingRender = undefined;
      stopRenderPump();
      next();
    };

    const unsubStarted = pi.events.on("subagent:slash:started", (data: unknown) => {
      if (done || !data || typeof data !== "object" || (data as { requestId?: string }).requestId !== id) return;
      started = true;
      clearTimeout(startTimeout);
      // Keep the bottom bar focused on the current Forge phase; live subagent
      // details are rendered in the Forge message instead of status text.
    });
    const unsubResponse = pi.events.on("subagent:slash:response", (data: unknown) => {
      if (done || !data || typeof data !== "object" || (data as { requestId?: string }).requestId !== id) return;
      const response = data as SlashResponse;
      if (response.result?.details) liveDetails.result = response.result as SlashLiveDetails["result"];
      requestRender();
      finish(() => resolve(response));
    });
    const unsubUpdate = pi.events.on("subagent:slash:update", (data: unknown) => {
      if (done || !data || typeof data !== "object" || (data as { requestId?: string }).requestId !== id) return;
      const update = data as { currentTool?: string; toolCount?: number; progress?: Array<Record<string, unknown>> };
      updateForgeLiveDetails(liveDetails, update, display);
      requestRender();
    });

    pi.events.emit("subagent:slash:request", { requestId: id, params });
    if (!started && done) return;
    if (!started) {
      finish(() => reject(new Error("No pi-subagents slash bridge responded. Ensure pi-subagents is loaded before Forge.")));
    }
  });
}

function projectContextContract(): string {
  return [
    "Project context contract:",
    "- Before acting, inspect repository domain documentation when present: root CONTEXT.md or CONTEXT-MAP.md, docs/agents/domain.md, and ADRs under docs/adr/ relevant to the files or decision area.",
    "- Use canonical glossary terms from CONTEXT.md and surface any ADR conflict instead of silently overriding it.",
    "- If these files do not exist, proceed silently; do not invent or create domain docs during Forge.",
    "- Preserve Feature Spec vocabulary and constraints in every handoff, plan, implementation summary, review, and final JSON.",
  ].join("\n");
}

function buildTaskChain(specPath: string, task: ForgeTask) {
  const taskPayload = taskPromptPayload({ specPath, task });
  const context = projectContextContract();
  const finalJsonContract = `End with exactly one final fenced json block. Use {"status":"done","summary":"...","changedPaths":["..."],"validation":["..."],"commitTitle":"feat(scope): title"} when complete. Use {"status":"stop","summary":"..."} when blocked or unverified.`;
  return [
    {
      agent: "context-builder",
      task: `${context}\n\nBuild implementation context for this Forge task. Treat the Feature Spec task ledger as read-only. Include relevant requirements, canonical domain terms, ADR constraints, likely files, validation strategy, and handoff context.\n\n${taskPayload}`,
      output: "forge/context.md",
      outputMode: "file-only",
    },
    {
      agent: "worker",
      task: `${context}\n\nImplement the selected Forge task from {previous}. Treat ${specPath} task checkboxes as read-only; the Forge Driver updates them. Use meaningful TDD only when an automated behavior test is applicable. Derive a minimal plan from the provided context, including non-goals and expected changed paths, before editing. Run deterministic validation and summarize changed paths and validation evidence.`,
      output: "forge/implementation.md",
      outputMode: "file-only",
    },
    {
      agent: "worker",
      skill: "refactor",
      task: `${context}\n\nPerform a bounded behavior-preserving refactor over only the task diff or touched files from {previous}. Prefer no change over speculative churn. Rerun validation if you change files.`,
      output: "forge/refactor.md",
      outputMode: "file-only",
    },
    {
      parallel: [
        { agent: "reviewer", task: `${context}\n\nFresh-context review for SPEC COMPLIANCE. Inspect ${specPath}, the selected task, current diff, and relevant domain docs/ADRs. Does the code answer the required task, use canonical vocabulary, obey ADR constraints, and avoid out-of-scope behavior? Return required fixes only.\n\n${taskPayload}`, output: false },
        { agent: "reviewer", task: `${context}\n\nFresh-context review for CORRECTNESS AND REGRESSIONS. Inspect the current diff, changed files, and relevant domain docs/ADRs. Return required fixes only, with evidence.\n\n${taskPayload}`, output: false },
        { agent: "reviewer", task: `${context}\n\nFresh-context review for VALIDATION AND TESTS. Check whether validation evidence is meaningful and deterministic for the Feature Spec and project context. Return required fixes only.\n\n${taskPayload}`, output: false },
        { agent: "reviewer", task: `${context}\n\nFresh-context review for SIMPLICITY AND MAINTAINABILITY. Flag unnecessary complexity, duplication, architecture drift, glossary drift, and ADR conflicts. Return required fixes only.\n\n${taskPayload}`, output: false },
      ],
      concurrency: 4,
    },
    {
      agent: "delegate",
      task: `${context}\n\nSynthesize the parallel review output from {previous}. Separate required fixes from optional improvements and feedback to ignore. If there are no required fixes, say so clearly.`,
      output: "forge/review-synthesis.md",
      outputMode: "file-only",
    },
    {
      agent: "worker",
      task: `${context}\n\nApply the synthesized required fixes from {previous} once. Do not apply optional improvements. Preserve the approved scope and keep ${specPath} task checkboxes read-only. Rerun focused deterministic validation and summarize changed paths and validation evidence.`,
      output: "forge/fixes.md",
      outputMode: "file-only",
    },
    {
      agent: "delegate",
      task: `${context}\n\nRead the chain outputs and inspect git status/diff as needed. Emit the Forge final task summary. ${finalJsonContract}\n\nSelected task:\n${taskPayload}`,
      output: false,
    },
  ];
}

function buildFinalReviewChain(specPath: string, reviewBase: string) {
  const context = projectContextContract();
  const finalJsonContract = `End with exactly one final fenced json block. Use {"status":"done","summary":"...","changedPaths":["..."],"validation":["..."]} when final review fixes are complete or no fixes are needed. Use {"status":"stop","summary":"..."} when blocked or unverified.`;
  return [
    {
      parallel: [
        { agent: "reviewer", task: `${context}\n\nFinal branch review, STANDARDS axis. Review git diff ${reviewBase}..HEAD for repository standards, maintainability, architecture conventions, canonical vocabulary, ADR constraints, and validation quality. Return required fixes only. Feature Spec: ${specPath}`, output: false },
        { agent: "reviewer", task: `${context}\n\nFinal branch review, SPEC axis. Review git diff ${reviewBase}..HEAD against the full Feature Spec at ${specPath} and relevant domain docs/ADRs. Return required fixes only.`, output: false },
      ],
      concurrency: 2,
    },
    { agent: "delegate", task: `${context}\n\nSynthesize final branch review findings from {previous}. Separate required fixes from optional improvements.`, output: "forge/final-review.md", outputMode: "file-only" },
    { agent: "worker", task: `${context}\n\nApply required final review fixes from {previous} once. Do not rewrite prior commits. Run deterministic validation and summarize changed paths and validation evidence.`, output: "forge/final-review-fixes.md", outputMode: "file-only" },
    { agent: "delegate", task: `${context}\n\nInspect the final review/fix outcome from {previous}. ${finalJsonContract}`, output: false },
  ];
}

function buildFinalRefactorChain(specPath: string, reviewBase: string) {
  const context = projectContextContract();
  const finalJsonContract = `End with exactly one final fenced json block. Use {"status":"done","summary":"...","changedPaths":["..."],"validation":["..."]} when the simplification refactor is complete or no refactor was needed. Use {"status":"stop","summary":"..."} when blocked or unverified.`;
  return [
    { agent: "worker", skill: "refactor", task: `${context}\n\nPerform one behavior-preserving simplification refactor over the Forge-produced diff ${reviewBase}..HEAD for Feature Spec ${specPath}. Prefer no change over speculative churn. Run deterministic validation if files change and summarize the outcome.`, output: "forge/final-refactor.md", outputMode: "file-only" },
    { agent: "delegate", task: `${context}\n\nInspect the final refactor outcome from {previous}. ${finalJsonContract}`, output: false },
  ];
}

async function parseTaskChainSummary(response: SlashResponse): Promise<TaskSummary> {
  if (response.isError) throw new Error(response.errorText || "Subagent chain failed");
  const text = finalTextFromSubagentResponse(response);
  return validateTaskSummary(extractFinalJsonBlock(text)) as TaskSummary;
}

async function parseCompletionChainSummary(response: SlashResponse): Promise<TaskSummary> {
  if (response.isError) throw new Error(response.errorText || "Subagent chain failed");
  const text = finalTextFromSubagentResponse(response);
  return validateCompletionSummary(extractFinalJsonBlock(text)) as TaskSummary;
}

async function updateSpecCheckbox(specPath: string, task: ForgeTask): Promise<void> {
  const current = await fs.readFile(specPath, "utf8");
  await fs.writeFile(specPath, checkTask(current, task.lineIndex), "utf8");
}

async function commitPaths(pi: ExtensionAPI, cwd: string, paths: string[], title: string): Promise<void> {
  await exec(pi, "git", ["add", "--", ...paths], cwd, 30_000);
  await exec(pi, "git", ["commit", "-m", title], cwd, 120_000);
}

async function runForge(pi: ExtensionAPI, ctx: ExtensionCommandContext, rawSpecPath: string): Promise<void> {
  await ctx.waitForIdle();
  const specPath = resolveSpecPath(ctx.cwd, rawSpecPath);
  const specRel = relativeToCwd(ctx.cwd, specPath);
  await fs.access(specPath);

  setStatus(ctx, "checking git...");
  const reviewBase = await ensureCleanStart(pi, ctx.cwd);
  sendForgeMessage(pi, `Forge started for \`${specRel}\`\n\nReview Base: \`${reviewBase}\``);

  const taskCommits: string[] = [];
  while (true) {
    const spec = await fs.readFile(specPath, "utf8");
    const tasks = parseImplementationTasks(spec) as ForgeTask[];
    const task = tasks.find((candidate) => !candidate.checked);
    if (!task) break;
    const taskPosition = tasks.findIndex((candidate) => candidate.lineIndex === task.lineIndex) + 1;
    const taskChain = buildTaskChain(specRel, task);

    setStatus(ctx, `task ${task.number}: running chain`);
    sendForgeMessage(pi, `Running Forge Task Chain for task ${task.number}: ${task.text}`);
    const response = await runSubagentChain(pi, ctx, {
      chain: taskChain,
      task: taskPromptPayload({ specPath: specRel, task }),
      clarify: false,
      agentScope: "both",
      context: "fresh",
    }, {
      taskLabel: `Task ${taskPosition}/${tasks.length}`,
      phases: ["Context", "Implement", "Refactor", "Review", "Synthesize", "Fix", "Summarize"],
      chain: taskChain,
    });
    const summary = await parseTaskChainSummary(response);
    if (summary.status === "stop") {
      sendForgeMessage(pi, `Forge stopped on task ${task.number}:\n\n${summary.summary}`);
      return;
    }

    const dirtyBeforeCheckbox = await gitStatus(pi, ctx.cwd);
    const expectedBeforeCheckbox = (summary.changedPaths ?? []).map((p) => relativeToCwd(ctx.cwd, p));
    const unexpectedBeforeCheckbox = unexpectedDirtyPaths(dirtyBeforeCheckbox, expectedBeforeCheckbox);
    if (unexpectedBeforeCheckbox.length > 0) {
      throw new Error(`Task chain changed unexpected paths before checkbox update:\n${unexpectedBeforeCheckbox.map((p) => `- ${p}`).join("\n")}`);
    }

    await updateSpecCheckbox(specPath, task);
    const dirty = await gitStatus(pi, ctx.cwd);
    const expected = [...new Set([...expectedBeforeCheckbox, specRel])];
    const unexpected = unexpectedDirtyPaths(dirty, expected);
    if (unexpected.length > 0) {
      throw new Error(`Unexpected dirty paths before task commit:\n${unexpected.map((p) => `- ${p}`).join("\n")}`);
    }

    const title = taskCommitTitle(task.number, summary.commitTitle);
    await commitPaths(pi, ctx.cwd, expected, title);
    taskCommits.push(title);
    sendForgeMessage(pi, `Committed task ${task.number}: \`${title}\`\n\nValidation:\n${(summary.validation ?? []).map((v) => `- ${v}`).join("\n")}`);
  }

  setStatus(ctx, "final review...");
  sendForgeMessage(pi, "All Feature Spec tasks are checked. Running final review and autofix.");
  const finalReviewChain = buildFinalReviewChain(specRel, reviewBase);
  const finalReviewResponse = await runSubagentChain(pi, ctx, {
    chain: finalReviewChain,
    task: `Final review and autofix for ${specRel}`,
    clarify: false,
    agentScope: "both",
    context: "fresh",
  }, {
    taskLabel: "Finalization",
    phases: ["Review", "Synthesize", "Fix", "Summarize"],
    chain: finalReviewChain,
  });
  const finalReviewSummary = await parseCompletionChainSummary(finalReviewResponse);
  if (finalReviewSummary.status === "stop") {
    sendForgeMessage(pi, `Forge stopped during final review autofix:\n\n${finalReviewSummary.summary}`);
    return;
  }
  const finalFixDirty = await gitStatus(pi, ctx.cwd);
  if (finalFixDirty.length > 0) {
    await commitPaths(pi, ctx.cwd, finalFixDirty, "fix: address final review findings");
  }

  setStatus(ctx, "final refactor...");
  const finalRefactorChain = buildFinalRefactorChain(specRel, reviewBase);
  const finalRefactorResponse = await runSubagentChain(pi, ctx, {
    chain: finalRefactorChain,
    task: `Final simplification refactor for ${specRel}`,
    clarify: false,
    agentScope: "both",
    context: "fresh",
  }, {
    taskLabel: "Final refactor",
    phases: ["Refactor", "Summarize"],
    chain: finalRefactorChain,
  });
  const finalRefactorSummary = await parseCompletionChainSummary(finalRefactorResponse);
  if (finalRefactorSummary.status === "stop") {
    sendForgeMessage(pi, `Forge stopped during final refactor:\n\n${finalRefactorSummary.summary}`);
    return;
  }
  const refactorDirty = await gitStatus(pi, ctx.cwd);
  if (refactorDirty.length > 0) {
    await commitPaths(pi, ctx.cwd, refactorDirty, "refactor: simplify forged implementation");
  }

  sendForgeMessage(pi, [
    `Forge completed for \`${specRel}\`.`,
    "",
    "Task commits:",
    ...(taskCommits.length ? taskCommits.map((title) => `- ${title}`) : ["- none"]),
    finalFixDirty.length ? "- Final review fixes committed." : "- No final review fix commit needed.",
    refactorDirty.length ? "- Final simplification refactor committed." : "- No final refactor commit needed.",
  ].join("\n"));
}

export default function forgeExtension(pi: ExtensionAPI) {
  pi.registerCommand("forge", {
    description: "Fulfill a Feature Spec with a subagent chain: /forge <spec>",
    handler: async (args, ctx) => {
      try {
        await runForge(pi, ctx, args.trim());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendForgeMessage(pi, `Forge stopped.\n\n${message}`, { error: message });
        if (ctx.hasUI) ctx.ui.notify(message, "error");
      } finally {
        setStatus(ctx, undefined);
      }
    },
  });
}
