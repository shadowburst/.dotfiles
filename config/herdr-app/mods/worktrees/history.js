// Git history and row geometry. No UI or mutable repository operations.
import { git } from "./data.js";

export const PAGE = 300;
export const HEIGHT = 30;
export const STEP = 14;
export const laneX = (lane) => 12 + lane * STEP;

export async function history(repo, tips, skip = 0, count = PAGE) {
  if (!tips.length) return { commits: [], more: false };
  // Snapshot hashes, not moving ref names, keep pagination stable during commits.
  if (tips.some((sha) => !/^[a-f0-9]{40,64}$/.test(sha))) throw new Error("A branch has no valid commit ID.");
  const r = await git(repo, ["log", "--topo-order", "--no-show-signature", "--no-decorate", "--format=%H%x00%P%x00%s%x00%an%x00%aI", `--skip=${skip}`, `--max-count=${count + 1}`, ...tips, "--"]);
  if (!r.ok) throw new Error(r.err);
  const commits = r.out.trimEnd().split("\n").filter(Boolean).map((line) => {
    const [sha, parents, subject, author, date] = line.split("\0");
    if (!/^[a-f0-9]{40,64}$/.test(sha) || date === undefined) throw new Error("Cannot read Git history.");
    return { sha, parents: parents ? parents.split(" ") : [], subject, author, date };
  });
  return { commits: commits.slice(0, count), more: commits.length > count };
}

export async function commitDetails(repo, sha) {
  if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("Invalid commit ID.");
  const [message, files] = await Promise.all([
    git(repo, ["show", "--no-show-signature", "-s", "--format=%B", sha, "--"]),
    git(repo, ["diff-tree", "--root", "--no-commit-id", "--stat", "-r", `${sha}^1`, sha, "--"]),
  ]);
  if (!message.ok) throw new Error(message.err);
  // A root commit has no first parent.
  const summary = files.ok ? files : await git(repo, ["diff-tree", "--root", "--no-commit-id", "--stat", "-r", sha, "--"]);
  if (!summary.ok) throw new Error(summary.err);
  return { message: message.out.trimEnd(), files: summary.out.trimEnd() };
}

export function firstParents(commits, tip) {
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  const chain = new Set();
  while (tip && !chain.has(tip)) { chain.add(tip); tip = bySha.get(tip)?.parents[0]; }
  return chain;
}

// Each active lane names a pending parent. Holes are reused, never compacted
// across rows: continuing lines must not slide under unrelated commit dots.
export function layout(commits) {
  const lanes = [];
  let width = 1;
  const color = (sha) => parseInt(sha.slice(0, 6), 16) % 6;
  const free = () => { const at = lanes.indexOf(null); return at < 0 ? lanes.length : at; };
  const rows = commits.map((commit) => {
    let lane = lanes.findIndex((l) => l?.sha === commit.sha);
    const incoming = lane >= 0;
    if (lane < 0) { lane = free(); lanes[lane] = { sha: commit.sha, color: color(commit.sha) }; }
    const tone = lanes[lane].color;
    const edges = lanes.flatMap((l, i) => !l || (i === lane && !incoming) ? [] : [{ from: i, to: i, start: 0, end: i === lane ? 0.5 : 1, color: l.color, target: l.sha }]);
    lanes[lane] = null;
    commit.parents.forEach((sha, n) => {
      let to = lanes.findIndex((l) => l?.sha === sha);
      if (to < 0) {
        to = n === 0 && !lanes[lane] ? lane : free();
        lanes[to] = { sha, color: n === 0 ? tone : color(sha) };
      }
      edges.push({ from: lane, to, start: 0.5, end: 1, color: lanes[to].color, source: commit.sha, target: sha, first: n === 0 });
    });
    width = Math.max(width, lanes.length, lane + 1);
    while (lanes.length && !lanes.at(-1)) lanes.pop();
    return { ...commit, lane, color: tone, edges };
  });
  return { rows, width: laneX(width) + 8 };
}
