import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";

type SkillCommand = ReturnType<ExtensionAPI["getCommands"]>[number];
type GetSkills = () => SkillCommand[];

const skillToken = /(?:^|[^\p{L}\p{N}_$])\$([a-z0-9-]*)$/u;
const skillReference = /\/skill:([a-z0-9]+(?:-[a-z0-9]+)*)(?![\p{L}\p{N}_-])/gu;
const ansi = /\x1b\[[0-9;]*m|\x1b_pi:c\x07/g;

function stripFakeReverseCursor(line: string): string {
  // Pi draws a software cursor that flickers beneath the terminal cursor.
  return line.replace(/\x1b\[7m([\s\S]*?)\x1b\[(?:0|27)m/, "$1");
}

export function renderPrompt(lines: string[], getSkills: GetSkills, theme: Theme): string[] {
  return highlightSkillReferences(lines.map(stripFakeReverseCursor), getSkills, theme);
}

export function skillAutocomplete(current: AutocompleteProvider, getSkills: GetSkills): AutocompleteProvider {
  return {
    triggerCharacters: [...new Set([...(current.triggerCharacters ?? []), "$"])],
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const before = (lines[cursorLine] ?? "").slice(0, cursorCol);
      const match = before.match(skillToken);
      if (!match) return before.endsWith(" ") && skillToken.test(before.slice(0, -1))
        ? null : current.getSuggestions(lines, cursorLine, cursorCol, options);
      const query = match[1]!.toLowerCase();
      const items = getSkills()
        .filter((command) => command.source === "skill")
        .filter((command) => command.name.slice(6).includes(query))
        .map((command) => ({ value: `/${command.name}`, label: command.name.slice(6), description: command.description }));
      return items.length ? { items, prefix: `$${match[1]}` } : null;
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      if (!prefix.startsWith("$")) return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      const line = lines[cursorLine] ?? "";
      const start = cursorCol - prefix.length;
      const suffix = /^[a-z0-9-]*/i.exec(line.slice(cursorCol))?.[0] ?? "";
      const after = line.slice(cursorCol + suffix.length);
      return {
        lines: lines.map((text, index) => index === cursorLine
          ? text.slice(0, start) + item.value + (after.startsWith(" ") ? "" : " ") + after
          : text),
        cursorLine,
        cursorCol: start + item.value.length + 1,
      };
    },
    shouldTriggerFileCompletion: (lines, cursorLine, cursorCol) =>
      current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true,
  };
}

export function highlightSkillReferences(lines: string[], getSkills: GetSkills, theme: Theme): string[] {
  // ponytail: visual-line coloring skips tokens split by hard wrapping; use an upstream editor token-style hook if needed.
  const names = new Set(getSkills().filter((command) => command.source === "skill").map((command) => command.name.slice(6)));
  return lines.map((line) => {
    const positions: number[] = [];
    let plain = "";
    let last = 0;
    for (const escape of line.matchAll(ansi)) {
      const index = escape.index;
      for (let i = last; i < index; i++) { positions.push(i); plain += line[i]; }
      last = index + escape[0].length;
    }
    for (let i = last; i < line.length; i++) { positions.push(i); plain += line[i]; }

    let result = "";
    let end = 0;
    for (const match of plain.matchAll(skillReference)) {
      if (!names.has(match[1]!)) continue;
      const start = positions[match.index]!;
      const stop = positions[match.index + match[0].length] ?? line.length;
      result += line.slice(end, start);
      // Keep cursor ANSI sequences intact; color only text between them.
      result += line.slice(start, stop).split(/(\x1b\[[0-9;]*m|\x1b_pi:c\x07)/g)
        .map((part) => part.startsWith("\x1b") ? part : theme.fg("accent", part)).join("");
      end = stop;
    }
    return result + line.slice(end);
  });
}
