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

export function finalTextFromSubagentResponse(response) {
  const content = response?.result?.content ?? response?.content ?? [];
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export function runSlashSubagentRequest({
  events,
  requestId,
  params,
  onStarted,
  onUpdate,
  startTimeoutMs = 15_000,
  requestEvent = "subagent:slash:request",
  startedEvent = "subagent:slash:started",
  responseEvent = "subagent:slash:response",
  updateEvent = "subagent:slash:update",
}) {
  return new Promise((resolve, reject) => {
    let done = false;
    let started = false;
    const startTimeout = setTimeout(() => {
      finish(() => reject(new Error("pi-subagents did not start within 15s. Is pi-subagents installed and loaded?")));
    }, startTimeoutMs);

    const finish = (next) => {
      if (done) return;
      done = true;
      clearTimeout(startTimeout);
      unsubStarted();
      unsubResponse();
      unsubUpdate();
      next();
    };

    const unsubStarted = events.on(startedEvent, (data) => {
      if (done || !data || typeof data !== "object" || data.requestId !== requestId) return;
      started = true;
      clearTimeout(startTimeout);
      onStarted?.();
    });
    const unsubResponse = events.on(responseEvent, (data) => {
      if (done || !data || typeof data !== "object" || data.requestId !== requestId) return;
      finish(() => resolve(data));
    });
    const unsubUpdate = events.on(updateEvent, (data) => {
      if (done || !data || typeof data !== "object" || data.requestId !== requestId) return;
      onUpdate?.(data);
    });

    events.emit(requestEvent, { requestId, params });
    if (!started && done) return;
    if (!started) {
      finish(() => reject(new Error("No pi-subagents slash bridge responded. Ensure pi-subagents is loaded before Forge.")));
    }
  });
}
