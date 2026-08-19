export const MAX_RUNNING = 4;
export const MAX_RETAINED = 12;
export const COMPLETION_DELIVERY = { deliverAs: "followUp", triggerTurn: true } as const;

export type ChildStatus = "queued" | "running" | "idle" | "failed" | "closed";

export interface ChildSpec {
  title: string;
  task: string;
  model: string;
  thinking: string;
}

export interface RetainedChild extends ChildSpec {
  id: string;
  status: Exclude<ChildStatus, "closed">;
  pendingPrompt?: string;
  runs: number;
  error?: string;
}

export interface WorkItem {
  childId: string;
  prompt: string;
}

export interface SchedulerState {
  children: RetainedChild[];
  queue: WorkItem[];
  nextId: number;
}

export interface StartWork {
  childId: string;
  prompt: string;
  run: number;
}

export interface Transition {
  state: SchedulerState;
  started: StartWork[];
}

export type SubmitResult = Transition & { action: "started" | "queued" | "steer" };

export function createSchedulerState(): SchedulerState {
  return { children: [], queue: [], nextId: 1 };
}

export function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length < 1 || normalized.length > 40) {
    throw new Error("Subagent title must be 1–40 characters after trimming.");
  }
  return normalized;
}

function runningCount(state: SchedulerState): number {
  return state.children.filter((child) => child.status === "running").length;
}

function startQueued(state: SchedulerState): Transition {
  const children = state.children.map((child) => ({ ...child }));
  const queue = [...state.queue];
  const started: StartWork[] = [];
  let running = children.filter((child) => child.status === "running").length;

  while (running < MAX_RUNNING && queue.length > 0) {
    const work = queue.shift()!;
    const child = children.find((candidate) => candidate.id === work.childId);
    if (!child || child.status !== "queued") continue;
    child.status = "running";
    child.pendingPrompt = undefined;
    child.runs++;
    started.push({ childId: child.id, prompt: work.prompt, run: child.runs });
    running++;
  }

  return { state: { ...state, children, queue }, started };
}

export function addChild(state: SchedulerState, spec: ChildSpec): Transition & { child: RetainedChild } {
  if (state.children.length >= MAX_RETAINED) {
    throw new Error(`Retained subagent limit reached (${MAX_RETAINED}). Close an agent before spawning another.`);
  }

  const id = `A${state.nextId}`;
  const canStart = runningCount(state) < MAX_RUNNING;
  const child: RetainedChild = {
    ...spec,
    id,
    status: canStart ? "running" : "queued",
    pendingPrompt: canStart ? undefined : spec.task,
    runs: canStart ? 1 : 0,
  };
  const next: SchedulerState = {
    children: [...state.children, child],
    queue: canStart ? state.queue : [...state.queue, { childId: id, prompt: spec.task }],
    nextId: state.nextId + 1,
  };
  return {
    state: next,
    child,
    started: canStart ? [{ childId: id, prompt: spec.task, run: 1 }] : [],
  };
}

export function submitToChild(state: SchedulerState, childId: string, text: string): SubmitResult {
  const child = state.children.find((candidate) => candidate.id === childId);
  if (!child) throw new Error(`Unknown subagent: ${childId}`);
  if (child.status === "failed") throw new Error(`Subagent ${childId} has failed; retry it from /agents.`);
  if (child.status === "running") return { state, started: [], action: "steer" };

  if (child.status === "queued") {
    const prompt = child.pendingPrompt ? `${child.pendingPrompt}\n\n${text}` : text;
    return {
      state: {
        ...state,
        children: state.children.map((candidate) =>
          candidate.id === childId ? { ...candidate, pendingPrompt: prompt } : candidate),
        queue: state.queue.map((work) => work.childId === childId ? { ...work, prompt } : work),
      },
      started: [],
      action: "queued",
    };
  }

  if (runningCount(state) >= MAX_RUNNING) {
    const next: SchedulerState = {
      ...state,
      children: state.children.map((candidate) =>
        candidate.id === childId ? { ...candidate, status: "queued", pendingPrompt: text } : candidate),
      queue: [...state.queue, { childId, prompt: text }],
    };
    return { state: next, started: [], action: "queued" };
  }

  const run = child.runs + 1;
  const next: SchedulerState = {
    ...state,
    children: state.children.map((candidate) =>
      candidate.id === childId ? { ...candidate, status: "running", runs: run, error: undefined } : candidate),
  };
  return { state: next, started: [{ childId, prompt: text, run }], action: "started" };
}

export function settleChild(state: SchedulerState, childId: string): Transition {
  const child = state.children.find((candidate) => candidate.id === childId);
  if (!child || child.status !== "running") return { state, started: [] };
  return startQueued({
    ...state,
    children: state.children.map((candidate) =>
      candidate.id === childId ? { ...candidate, status: "idle" } : candidate),
  });
}

export function failChild(state: SchedulerState, childId: string, error: string): Transition {
  const child = state.children.find((candidate) => candidate.id === childId);
  if (!child) return { state, started: [] };
  const wasRunning = child.status === "running";
  const next: SchedulerState = {
    ...state,
    children: state.children.map((candidate) =>
      candidate.id === childId
        ? { ...candidate, status: "failed", pendingPrompt: undefined, error }
        : candidate),
    queue: state.queue.filter((work) => work.childId !== childId),
  };
  return wasRunning ? startQueued(next) : { state: next, started: [] };
}

export function closeChild(state: SchedulerState, childId: string): Transition {
  const child = state.children.find((candidate) => candidate.id === childId);
  if (!child) return { state, started: [] };
  const next: SchedulerState = {
    ...state,
    children: state.children.filter((candidate) => candidate.id !== childId),
    queue: state.queue.filter((work) => work.childId !== childId),
  };
  return child.status === "running" ? startQueued(next) : { state: next, started: [] };
}

export function retryChild(state: SchedulerState, childId: string): Transition & { child: RetainedChild } {
  const child = state.children.find((candidate) => candidate.id === childId);
  if (!child || child.status !== "failed") throw new Error(`Only failed subagents can be retried: ${childId}`);
  return addChild(state, { title: child.title, task: child.task, model: child.model, thinking: child.thinking });
}
