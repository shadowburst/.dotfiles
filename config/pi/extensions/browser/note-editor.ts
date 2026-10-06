import { getMarkdownTheme, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
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

export function renderPrompt(lines: string[], getSkills: GetSkills, theme: Theme, markdown = false): string[] {
  const source = lines.map(stripFakeReverseCursor);
  if (markdown) {
    const style = getMarkdownTheme();
    // ponytail: emphasis split across wrapped rows loses styling; use editor source spans if that matters.
    for (let i = 1; i < source.length - 1; i++) source[i] = styleMarkdownLine(source[i]!, style);
  }
  return highlightSkillReferences(source, getSkills, theme);
}

function styleMarkdownLine(line: string, style: ReturnType<typeof getMarkdownTheme>): string {
  const positions: number[] = [];
  let plain = "";
  let last = 0;
  for (const escape of line.matchAll(/\x1b\[[0-9;]*m|\x1b_pi:c\x07/g)) {
    for (let i = last; i < escape.index; i++) { positions.push(i); plain += line[i]; }
    last = escape.index + escape[0].length;
  }
  for (let i = last; i < line.length; i++) { positions.push(i); plain += line[i]; }
  const apply = (ranges: { start: number; end: number; color: (text: string) => string }[]) => {
    let result = "";
    let end = 0;
    for (const range of ranges) {
      const start = positions[range.start]!;
      const stop = positions[range.end] ?? line.length;
      result += line.slice(end, start) + range.color(line.slice(start, stop));
      end = stop;
    }
    return result + line.slice(end);
  };

  if (/^\s*#{1,6} /.test(plain)) return apply([{ start: plain.search(/#/), end: plain.trimEnd().length, color: style.heading }]);

  const ranges: { start: number; end: number; color: (text: string) => string }[] = [];
  const bullet = /^(\s*)([-+*]|\d+[.)])(?= )/.exec(plain);
  if (bullet) ranges.push({ start: bullet[1]!.length, end: bullet[0].length, color: style.listBullet });
  for (const match of plain.matchAll(/`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_/g)) {
    const token = match[0];
    const start = match.index;
    if (start < (ranges.at(-1)?.end ?? 0)) continue;
    ranges.push({
      start,
      end: start + token.length,
      color: token.startsWith("`") ? style.code : token.startsWith("**") || token.startsWith("__") ? style.bold : style.italic,
    });
  }
  return apply(ranges);
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
