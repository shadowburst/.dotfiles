import path from "node:path";

export const DONE_STATUS = "done";
export const STOP_STATUS = "stop";

export function normalizeRepoPath(filePath) {
  return filePath.replace(/^@/, "").replaceAll("\\", "/").replace(/^\.\//, "");
}

export function resolveSpecPath(cwd, rawPath) {
  const cleaned = rawPath.trim().replace(/^@/, "");
  if (!cleaned) throw new Error("Usage: /forge <spec>");
  return path.isAbsolute(cleaned) ? cleaned : path.resolve(cwd, cleaned);
}

export function relativeToCwd(cwd, absoluteOrRelativePath) {
  const cleaned = absoluteOrRelativePath.replace(/^@/, "");
  const rel = path.isAbsolute(cleaned) ? path.relative(cwd, cleaned) : cleaned;
  return normalizeRepoPath(rel);
}

export function parseImplementationTasks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^##\s+Implementation Tasks\s*$/.test(line));
  if (headingIndex === -1) throw new Error("Feature Spec is missing ## Implementation Tasks");

  const tasks = [];
  for (let i = headingIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;

    const match = line.match(/^- \[( |x|X)\]\s+(?:(\d+)\.\s*)?(.*)$/);
    if (!match) continue;

    const guidance = [];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (/^##\s+/.test(next) || /^- \[( |x|X)\]\s+/.test(next)) break;
      if (next.trim()) guidance.push(next);
    }

    tasks.push({
      lineIndex: i,
      checked: match[1].toLowerCase() === "x",
      number: match[2] ? Number(match[2]) : tasks.length + 1,
      text: match[3].trim(),
      guidance: guidance.join("\n").trim(),
    });
  }

  return tasks;
}

export function firstUncheckedTask(markdown) {
  return parseImplementationTasks(markdown).find((task) => !task.checked);
}

export function checkTask(markdown, lineIndex) {
  const lines = markdown.split(/\r?\n/);
  if (!lines[lineIndex] || !/^- \[ \]/.test(lines[lineIndex])) {
    throw new Error(`Selected task line ${lineIndex + 1} is not an unchecked top-level checkbox`);
  }
  lines[lineIndex] = lines[lineIndex].replace(/^- \[ \]/, "- [x]");
  return lines.join("\n");
}

export function extractFinalJsonBlock(text) {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length === 0) throw new Error("Chain output did not contain a fenced json block");
  const raw = matches[matches.length - 1][1].trim();
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Final json block is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateCompletionSummary(summary, options = {}) {
  const requireChangedPaths = options.requireChangedPaths === true;
  const requireCommitTitle = options.requireCommitTitle === true;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new Error("Final summary must be a JSON object");
  }
  if (summary.status !== DONE_STATUS && summary.status !== STOP_STATUS) {
    throw new Error('Final summary status must be "done" or "stop"');
  }
  if (typeof summary.summary !== "string" || summary.summary.trim() === "") {
    throw new Error("Final summary must include a non-empty summary string");
  }
  if (summary.status === STOP_STATUS) return summary;

  if (requireChangedPaths && (!Array.isArray(summary.changedPaths) || summary.changedPaths.length === 0)) {
    throw new Error('status "done" requires non-empty changedPaths');
  }
  if (!Array.isArray(summary.validation) || summary.validation.length === 0) {
    throw new Error('status "done" requires non-empty validation evidence');
  }
  if (requireCommitTitle && (typeof summary.commitTitle !== "string" || summary.commitTitle.trim() === "")) {
    throw new Error('status "done" requires commitTitle');
  }
  return {
    ...summary,
    changedPaths: Array.isArray(summary.changedPaths) ? summary.changedPaths.map((p) => normalizeRepoPath(String(p))) : [],
    validation: summary.validation.map((v) => String(v)),
    commitTitle: typeof summary.commitTitle === "string" ? summary.commitTitle.trim() : undefined,
  };
}

export function validateTaskSummary(summary) {
  return validateCompletionSummary(summary, { requireChangedPaths: true, requireCommitTitle: true });
}

export function parseGitStatusPorcelain(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const raw = line.slice(3);
      const renameParts = raw.split(" -> ");
      return normalizeRepoPath(renameParts[renameParts.length - 1]);
    })
    .filter(Boolean);
}

export function unexpectedDirtyPaths(actualPaths, expectedPaths) {
  const expected = new Set(expectedPaths.map(normalizeRepoPath));
  return actualPaths.map(normalizeRepoPath).filter((file) => !expected.has(file));
}

export function isValidConventionalCommitTitle(title) {
  if (typeof title !== "string") return false;
  if (title.includes("\n") || title.length > 100) return false;
  return /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+/.test(title);
}

export function taskCommitTitle(taskNumber, proposedTitle) {
  return isValidConventionalCommitTitle(proposedTitle)
    ? proposedTitle.trim()
    : `feat: complete spec task ${taskNumber}`;
}

export function taskPromptPayload({ specPath, task }) {
  return [
    `Feature Spec: ${specPath}`,
    `Selected task ${task.number}: ${task.text}`,
    task.guidance ? `Task guidance:\n${task.guidance}` : "Task guidance: none",
  ].join("\n\n");
}

export function projectContextContract() {
  return [
    "Project context contract:",
    "- Before acting, inspect repository domain documentation when present: root CONTEXT.md or CONTEXT-MAP.md, docs/agents/domain.md, and ADRs under docs/adr/ relevant to the files or decision area.",
    "- Use canonical glossary terms from CONTEXT.md and surface any ADR conflict instead of silently overriding it.",
    "- If these files do not exist, proceed silently; do not invent or create domain docs during Forge.",
    "- Preserve Feature Spec vocabulary and constraints in every handoff, plan, implementation summary, review, and final JSON.",
  ].join("\n");
}

export function buildForgeTaskChain(specPath, task) {
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
      agent: "planner",
      task: `${context}\n\nCreate a concrete implementation plan from {previous}. Include non-goals, expected changed paths, meaningful TDD guidance, and validation expectations. Do not edit files.`,
      output: "forge/plan.md",
      outputMode: "file-only",
    },
    {
      agent: "worker",
      task: `${context}\n\nImplement the selected Forge task from {previous}. Treat ${specPath} task checkboxes as read-only; the Forge Driver updates them. Use meaningful TDD only when an automated behavior test is applicable. Run deterministic validation and summarize changed paths and validation evidence.`,
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

export function buildForgeFinalReviewChain(specPath, reviewBase) {
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

export function buildForgeFinalRefactorChain(specPath, reviewBase) {
  const context = projectContextContract();
  const finalJsonContract = `End with exactly one final fenced json block. Use {"status":"done","summary":"...","changedPaths":["..."],"validation":["..."]} when the simplification refactor is complete or no refactor was needed. Use {"status":"stop","summary":"..."} when blocked or unverified.`;
  return [
    { agent: "worker", skill: "refactor", task: `${context}\n\nPerform one behavior-preserving simplification refactor over the Forge-produced diff ${reviewBase}..HEAD for Feature Spec ${specPath}. Prefer no change over speculative churn. Run deterministic validation if files change and summarize the outcome.`, output: "forge/final-refactor.md", outputMode: "file-only" },
    { agent: "delegate", task: `${context}\n\nInspect the final refactor outcome from {previous}. ${finalJsonContract}`, output: false },
  ];
}

export function finalTextFromSubagentResponse(response) {
  const content = response?.result?.content ?? response?.content ?? [];
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}
