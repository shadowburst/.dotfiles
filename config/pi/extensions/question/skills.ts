import type { QuestionDetails } from "./state.ts";

type SkillCommand = { name: string };
type QueueSkill = (name: string) => void;

const skillMentionPattern = /\/skill:([a-z0-9]+(?:-[a-z0-9]+)*)(?![\p{L}\p{N}_-])/gu;

function submittedTexts(details: QuestionDetails): string[] {
  return [
    ...details.answers.flat(),
    ...Object.values(details.notes ?? {}).flatMap((notes) => Object.values(notes)),
  ];
}

function skillNames(details: QuestionDetails): string[] {
  const names = new Set<string>();
  for (const text of submittedTexts(details)) {
    for (const match of text.matchAll(skillMentionPattern)) {
      const name = match[1];
      if (name && name.length <= 64) names.add(name);
    }
  }
  return [...names];
}

export function discoverSkillMentions(
  details: QuestionDetails,
  skillCommands: SkillCommand[],
): { valid: string[]; unknown: string[] } {
  const available = new Set(skillCommands.map((command) => command.name));
  const valid: string[] = [];
  const unknown: string[] = [];
  for (const name of skillNames(details)) {
    if (available.has(`skill:${name}`)) valid.push(name);
    else unknown.push(name);
  }
  return { valid, unknown };
}

export function queueSkillMentions(
  details: QuestionDetails,
  skillCommands: SkillCommand[],
  queue: QueueSkill,
): string[] {
  const { valid, unknown } = discoverSkillMentions(details, skillCommands);
  for (const name of valid) queue(name);
  return unknown;
}

export function createReopenSkillQueue(deliver: QueueSkill): {
  schedule: (names: string[]) => void;
  flush: () => void;
} {
  let pending: string[] | undefined;

  return {
    schedule(names) {
      pending = names.length ? [...names] : undefined;
    },
    flush() {
      const names = pending;
      pending = undefined;
      if (!names) return;
      for (const name of names) deliver(name);
    },
  };
}
