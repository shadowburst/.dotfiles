import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";

import type { QuestionDetails } from "./state.ts";

type SkillCommand = {
  name: string;
  sourceInfo: { path: string };
};

export type SkillExpansion = {
  blocks: string[];
  unknown: string[];
  failed: string[];
};

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

export async function expandSkillMentions(
  details: QuestionDetails,
  skillCommands: SkillCommand[],
): Promise<SkillExpansion> {
  const commands = new Map(skillCommands.map((command) => [command.name, command]));
  const blocks: string[] = [];
  const unknown: string[] = [];
  const failed: string[] = [];

  for (const name of skillNames(details)) {
    const command = commands.get(`skill:${name}`);
    if (!command) {
      unknown.push(name);
      continue;
    }

    try {
      const path = command.sourceInfo.path;
      const body = stripFrontmatter(await readFile(path, "utf8")).trim();
      blocks.push(`<skill name="${name}" location="${path}">
References are relative to ${dirname(path)}.

${body}
</skill>`);
    } catch {
      failed.push(name);
    }
  }

  return { blocks, unknown, failed };
}
