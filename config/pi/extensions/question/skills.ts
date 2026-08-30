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

export function queueSkillMentions(
  details: QuestionDetails,
  skillCommands: SkillCommand[],
  queue: QueueSkill,
): string[] {
  const available = new Set(skillCommands.map((command) => command.name));
  const unknown: string[] = [];
  for (const name of skillNames(details)) {
    if (available.has(`skill:${name}`)) queue(name);
    else unknown.push(name);
  }
  return unknown;
}
