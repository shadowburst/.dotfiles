// The repository data the popup shows, and the commands it runs. No UI here.

import { agents, appHome, exec, panes, readTextFile, spaces } from "herdr";

// The agents in the New form. Each must be on PATH.
export const AGENT_KINDS = ["claude", "codex", "opencode"];
export const PREVIEW_MODES = ["graph", "diff", "changes"];
const DEFAULT_NAMING = ["textgen"];

export async function git(cwd, args, on) {
  try {
    const r = await exec("git", args, { cwd, on });
    return { ok: r.code === 0, out: r.stdout ?? "", err: (r.stderr || r.stdout || "").trim() };
  } catch (e) {
    return { ok: false, out: "", err: String(e) };
  }
}

// worktrees.json, written by Nix: { naming_command, agents: { kind: { models, efforts } },
// opencode: { providers } }. The first value of each list is the default. OpenCode's
// models come from its service, limited to the listed providers.
export async function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse((await readTextFile(`${appHome()}/worktrees.json`)) ?? "{}");
  } catch {}
  return {
    naming_command: cfg.naming_command?.length ? cfg.naming_command : DEFAULT_NAMING,
    agents: cfg.agents ?? {},
    opencodeProviders: cfg.opencode?.providers ?? [],
  };
}

async function opencodeApi(cwd, path, on) {
  const r = await exec("sh", ["-c", 'exec timeout 20 opencode api get "$1"', "sh", path], { cwd, on });
  if (r.code !== 0) throw new Error(`opencode api get ${path}: ${(r.stderr || r.stdout).trim()}`);
  return JSON.parse(r.stdout).data ?? [];
}

// OpenCode's chat models, by provider in the order of `providers` (all when empty):
// [{ id, name, models: [{ id, name, variants }] }]. Its variants are the effort levels.
export async function loadOpencodeModels(cwd, providers, on) {
  const [list, known] = await Promise.all([opencodeApi(cwd, "/api/model", on), opencodeApi(cwd, "/api/provider", on)]);
  const names = Object.fromEntries(known.map((p) => [p.id, p.name]));
  const ids = providers.length ? providers : [...new Set(list.map((m) => m.providerID))];
  return ids.map((id) => ({
    id,
    name: names[id] ?? id,
    models: list
      .filter((m) => m.providerID === id && m.type !== "image" && m.enabled !== false && m.status !== "deprecated")
      .map((m) => ({ id: m.id, name: m.name || m.id, variants: (m.variants ?? []).map((v) => (typeof v === "string" ? v : v.id)) })),
  })).filter((p) => p.models.length);
}

// The repository of a folder: its main checkout, name, and the current branch.
export async function detectRepo(cwd, machine = null) {
  if (!cwd) return null;
  const common = await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], machine);
  if (!common.ok) return null;
  const root = common.out.trim().replace(/\/\.git\/?$/, "");
  let base = (await git(cwd, ["branch", "--show-current"], machine)).out.trim();
  if (!base) base = (await git(cwd, ["rev-parse", "--short", "HEAD"], machine)).out.trim(); // detached
  const top = (await git(cwd, ["rev-parse", "--show-toplevel"], machine)).out.trim();
  return { root, name: root.split("/").pop(), base, top, machine };
}

export const rowName = (r) => r.remote ? `${r.remote}/${r.branch}` : r.branch || "(detached)";
export const rowRef = (r) => r.branch ? `refs/${r.remote ? `remotes/${r.remote}` : "heads"}/${r.branch}` : r.sha;
export const rowKey = (r) => r.branch ? JSON.stringify([rowRef(r), r.path || ""]) : r.path;

function rowData(it) {
  const w = it.worktree, d = it.default_branch, c = w?.changes ?? {};
  return {
    branch: it.branch ?? "",
    remote: it.remote ?? "",
    sha: it.head?.sha ?? "",
    upstream: it.upstream?.remote ? `${it.upstream.remote}/${it.upstream.branch}` : "",
    path: w?.path ?? "",
    main: Boolean(w?.main),
    dirty: Boolean(c.staged || c.modified || c.untracked || c.renamed || c.deleted || c.conflicted),
    merged: Boolean(d?.integration),
    ahead: d?.ahead ?? 0,
    behind: d?.behind ?? 0,
    pr: it.pr?.number ?? 0,
    busy: false,
    spaces: [],
  };
}

function remoteParts(ref, remotes) {
  const short = ref.slice(13);
  const remote = remotes.find((name) => short.startsWith(`${name}/`)) ?? short.split("/")[0];
  return { remote, branch: short.slice(remote.length + 1) };
}

// Keep full ref identities: local and remote branches can have different tips.
export function parseRows(raw) {
  const list = JSON.parse(raw);
  return { def: list.repo?.default_branch ?? "", rows: list.items.map(rowData) };
}

// Local identities are fast; wt adds status and remote rows afterwards.
// `full` also asks the forge for the PRs, which needs the network.
export async function loadRows(repo, full, on, remotes = true) {
  try {
    let list;
    if (remotes) {
      const args = ["-C", repo, "list", "--format=json", "--branches", "--remotes", ...(full ? ["--full"] : ["--config-set", "list.full=false"])];
      const r = await exec("wt", args, { cwd: repo, on });
      if (r.code !== 0) return { error: `wt list: ${(r.stderr || r.stdout).trim()}` };
      list = parseRows(r.stdout);
    } else {
      const r = await git(repo, ["worktree", "list", "--porcelain", "-z"], on);
      if (!r.ok) return { error: r.err };
      list = { def: "", rows: r.out.split("\0\0").filter(Boolean).map((record) => {
        const fields = record.split("\0");
        const value = (key) => fields.find((f) => f.startsWith(`${key} `))?.slice(key.length + 1) ?? "";
        const path = value("worktree");
        return rowData({ branch: value("branch").replace(/^refs\/heads\//, ""), head: { sha: value("HEAD") }, worktree: { path, main: path === repo } });
      }) };
    }
    // wt can omit matching remote tips. Git is the authoritative ref catalog.
    const [refs, remoteList] = await Promise.all([
      git(repo, ["for-each-ref", "--format=%(refname)%00%(objectname)%00%(upstream:short)%00%(symref)", "refs/heads", ...(remotes ? ["refs/remotes"] : [])], on),
      remotes ? git(repo, ["remote"], on) : { ok: true, out: "" },
    ]);
    if (!refs.ok) return { error: refs.err };
    if (!remoteList.ok) return { error: remoteList.err };
    const remoteNames = remoteList.out.trim().split("\n").filter(Boolean).sort((a, b) => b.length - a.length);
    const byRef = new Map();
    for (const row of list.rows) byRef.set(rowRef(row), [...(byRef.get(rowRef(row)) ?? []), row]);
    for (const line of refs.out.trim().split("\n")) {
      const [ref, sha, upstream, symbolic] = line.split("\0");
      if (!ref || symbolic) continue;
      const { remote, branch } = ref.startsWith("refs/remotes/") ? remoteParts(ref, remoteNames) : { remote: "", branch: ref.slice(11) };
      if (remote && branch === "HEAD") continue;
      let rows = byRef.get(ref);
      if (!rows) {
        rows = [rowData({ branch, remote })];
        list.rows.push(...rows);
      }
      for (const row of rows) { row.sha = sha ?? row.sha; row.upstream = upstream ?? row.upstream; }
    }
    if (!remotes) for (const row of list.rows) row.pending = true;
    return list;
  } catch (e) {
    return { error: `wt list: ${e}` };
  }
}

const inside = (p, dir) => p === dir || p.startsWith(dir + "/");

// The spaces and the agents of each checkout. A space or an agent belongs to the
// checkout with the longest path that holds its folder (worktrees can be inside
// the main checkout).
export function attach(rows, machine = null) {
  const holder = (cwd) => {
    let best = null;
    for (const r of rows) if (r.path && cwd && inside(cwd, r.path) && (!best || r.path.length > best.path.length)) best = r;
    return best;
  };
  const ps = panes();
  for (const s of spaces()) {
    if ((s.machine ?? null) !== machine) continue;
    const tabs = new Set(s.tabs.map((t) => t.id));
    const r = holder(ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder);
    if (r) r.spaces.push(s.id);
  }
  const tabs = new Set(spaces().filter((s) => (s.machine ?? null) === machine).flatMap((s) => s.tabs.map((t) => t.id)));
  const cwd = Object.fromEntries(ps.filter((p) => tabs.has(p.tab)).map((p) => [p.pane, p.cwd]));
  for (const a of agents()) {
    const r = holder(cwd[a.pane]);
    if (!r) continue;
    const busy = a.status === "working" || a.status === "blocked";
    r.busy ||= busy;
  }
  return rows;
}

// Choices keep remote prefixes; the bare sets keep new names unique.
export async function loadBranches(repo, on) {
  const [r, remoteList] = await Promise.all([
    git(repo, ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"], on),
    git(repo, ["remote"], on),
  ]);
  const remotes = remoteList.out.trim().split("\n").filter(Boolean).sort((a, b) => b.length - a.length);
  const local = new Set(), remote = new Set(), qualified = [];
  for (const ref of r.out.split("\n")) {
    if (ref.startsWith("refs/heads/")) local.add(ref.slice(11));
    else if (ref.startsWith("refs/remotes/")) {
      const name = remoteParts(ref, remotes).branch;
      if (name && name !== "HEAD") { remote.add(name); qualified.push(ref); }
    }
  }
  return { local, remote, names: [...new Set([...local, ...qualified])].sort() };
}

export async function lastFetch(repo, on) {
  const path = await git(repo, ["rev-parse", "--path-format=absolute", "--git-path", "FETCH_HEAD"], on);
  if (!path.ok) return null;
  try {
    const r = await exec("python3", ["-I", "-c", "import os, sys; print(os.stat(sys.argv[1]).st_mtime)", path.out.trim()], { cwd: repo, on });
    return r.code === 0 && Number(r.stdout) > 0 ? Number(r.stdout) * 1000 : null;
  } catch { return null; }
}

// The base that a New launch recorded for the branch.
export async function mergeBase(repo, branch, on) {
  return (await git(repo, ["config", "--get", `branch.${branch}.gh-merge-base`], on)).out.trim();
}

// The ref that a branch's Diff compares with: the base that New recorded for it
// (a local branch, else the same name on a remote), else the default branch.
export async function diffBase(repo, def, row, on) {
  const base = row.branch && !row.remote ? await mergeBase(repo, row.branch, on) : "";
  if (base) {
    const r = await git(repo, ["for-each-ref", "--format=%(refname)", `refs/heads/${base}`, `refs/remotes/*/${base}`], on);
    const refs = r.out.split("\n").filter(Boolean);
    const found = refs.find((ref) => ref.startsWith("refs/heads/")) ?? refs[0];
    if (found) return { ref: found, name: base };
  }
  return def ? { ref: def, name: def } : null;
}

// Updates a branch from its upstream: `git pull` in its worktree, else a fast-forward fetch.
export async function pull(repo, row, on) {
  if (row.path) return git(row.path, ["pull"], on);
  const config = async (key) => (await git(repo, ["config", "--get", `branch.${row.branch}.${key}`], on)).out.trim();
  const [remote, merge] = await Promise.all([config("remote"), config("merge")]);
  if (!remote || !merge) return { ok: false, out: "", err: `${row.branch} has no upstream.` };
  return git(repo, ["fetch", remote, `${merge}:refs/heads/${row.branch}`], on);
}

// Sends a branch to its upstream. Without one, it goes to origin (else the only remote)
// and becomes the upstream. `rejected`: the remote has commits that the branch does not
// have, so only a force push can replace them.
export async function push(repo, row, on, force = false) {
  const cwd = row.path || repo;
  const config = async (key) => (await git(repo, ["config", "--get", `branch.${row.branch}.${key}`], on)).out.trim();
  const [remote, merge] = await Promise.all([config("remote"), config("merge")]);
  const lease = force ? ["--force-with-lease"] : [];
  let r;
  if (remote && merge) r = await git(cwd, ["push", ...lease, remote, `refs/heads/${row.branch}:${merge}`], on);
  else {
    const remotes = (await git(repo, ["remote"], on)).out.split("\n").filter(Boolean);
    const to = remotes.includes("origin") ? "origin" : remotes.length === 1 ? remotes[0] : "";
    if (!to) return { ok: false, out: "", err: remotes.length ? `${row.branch} has no upstream, and there is no origin remote.` : "This repository has no remote." };
    r = await git(cwd, ["push", ...lease, "--set-upstream", to, `refs/heads/${row.branch}:refs/heads/${row.branch}`], on);
  }
  return { ...r, rejected: !r.ok && /\[rejected\]|non-fast-forward|fetch first/.test(r.err) };
}

// The Neovim AI commit prompt (config/neovim/plugin/50-neogit.lua).
export const COMMIT_PROMPT = `Write a git commit message for the staged diff below. Reply with the message only, without code fences.
Use this format:

<type>(<optional-scope>): <imperative summary>

<short intent-focused body>

The type is a Conventional Commit type. The summary has at most 72 characters.`;

// `git diff --cached <args>` of every change in a worktree (untracked files too), as
// `git add -A` would commit it. A copy of the index takes the changes, so the real
// index does not change.
async function diffAll(path, args, on) {
  const script = `set -e
index=$(git rev-parse --path-format=absolute --git-path index)
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
if [ -f "$index" ]; then cp "$index" "$tmp"; else rm -f "$tmp"; fi
export GIT_INDEX_FILE="$tmp"
git add -A
git diff --cached --no-color --no-ext-diff "$@"`;
  try {
    const r = await exec("sh", ["-c", script, "sh", ...args], { cwd: path, on });
    return { ok: r.code === 0, out: r.stdout ?? "", err: (r.stderr || "").trim() };
  } catch (e) {
    return { ok: false, out: "", err: String(e) };
  }
}

export const commitDiff = (path, on) => diffAll(path, [], on);

// A commit message from `textgen`, as Neovim's AI commit writes it.
export async function generateCommit(path, on) {
  const diff = await commitDiff(path, on);
  if (!diff.ok) return { ok: false, err: diff.err || "Cannot read the changes." };
  if (!diff.out.trim()) return { ok: false, err: "There are no changes to commit." };
  const prompt = `${COMMIT_PROMPT}\n\n<diff>\n${diff.out.slice(0, 60000)}\n</diff>\n`;
  try {
    // exec has no stdin: the prompt goes through an argument. It must end in 30 s.
    const r = await exec("sh", ["-c", 'printf "%s" "$1" | timeout 25 textgen', "sh", prompt], { cwd: path, on });
    const message = (r.stdout ?? "").replace(/^\s*```\w*\n/, "").replace(/\n```\s*$/, "").trim();
    if (r.code !== 0 || !message) return { ok: false, err: (r.stderr || "").trim().slice(-500) || `textgen exited with code ${r.code}.` };
    return { ok: true, message };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}

// Commits every change in a worktree (`git add -A`).
export async function commit(path, message, on) {
  const add = await git(path, ["add", "-A"], on);
  if (!add.ok) return add;
  return git(path, ["commit", "-m", message], on);
}

// The files of `git diff --raw --numstat -z --no-abbrev`: status letter, path (and
// old path), blob ids ("" for a missing side), and line counts (null: binary).
export function parseFiles(out) {
  const t = out.split("\0");
  const files = [];
  let i = 0;
  const blob = (id) => (/^0+$/.test(id) ? "" : id);
  while (t[i]?.startsWith(":")) {
    const [, , left, right, code] = t[i].slice(1).split(" ");
    const status = code[0], moved = status === "R" || status === "C";
    files.push({ status, old: t[i + 1], path: t[moved ? i + 2 : i + 1], left: blob(left), right: blob(right), add: null, del: null });
    i += moved ? 3 : 2;
  }
  for (const f of files) {
    const [add, del, path] = (t[i] ?? "").split("\t");
    i += path ? 1 : 3; // a rename puts its two paths in the next two fields
    if (add !== "-") Object.assign(f, { add: Number(add), del: Number(del) });
  }
  return files;
}

// What the Diff or Changes tab lists: { base, cwd, files, err }. Diff: the branch's own
// commits since its base. Changes: every change in the worktree, untracked files too.
export async function loadPreview(repo, def, row, mode, on) {
  const args = ["--raw", "--numstat", "-z", "--no-abbrev", "-M"];
  let r, cwd, base = "";
  if (PREVIEW_MODES[mode] === "diff") {
    const ref = row.branch ? rowRef(row) : "HEAD";
    const b = await diffBase(repo, def, row, on);
    if (!b || ref === b.ref || ref === `refs/heads/${b.name}`) return { base, cwd, files: [] };
    [cwd, base] = [row.branch ? repo : row.path, b.name];
    r = await git(cwd, ["diff", "--no-color", "--no-ext-diff", ...args, `${b.ref}...${ref}`], on);
  } else if (PREVIEW_MODES[mode] === "changes" && row.path) {
    cwd = row.path;
    r = await diffAll(cwd, args, on);
  } else return { base, cwd, files: [] };
  return { base, cwd, files: r.ok ? parseFiles(r.out) : [], err: r.ok ? "" : r.err };
}

// Both sides of a file and CodeDiff's changes between them, as side-by-side rows.
// codediff.lua runs codediff.nvim's engine in a headless Neovim on the target machine.
export async function loadFileDiff(cwd, file, on) {
  const source = await readTextFile(`${appHome()}/mods/worktrees/codediff.lua`);
  const script = `f=$(mktemp) && printf '%s' "$1" > "$f" || exit 1
VSCODE_DIFF_NO_AUTO_INSTALL=1 nvim -u NONE -i NONE -l "$f" "$2" "$3"; code=$?
rm -f "$f"; exit $code`;
  try {
    const r = await exec("sh", ["-c", script, "sh", source ?? "", file.left, file.right], { cwd, on });
    if (r.code !== 0) return { err: (r.stderr || r.stdout || "").trim() || `Neovim exited with code ${r.code}.` };
    const d = JSON.parse(r.stdout);
    return { rows: diffRows(list(d.left), list(d.right), list(d.changes)) };
  } catch (e) {
    return { err: String(e) };
  }
}

// Lua's JSON writes an empty list as {}.
const list = (v) => (Array.isArray(v) ? v : []);

// A line as parts [text, marked]: `marks` are [from, to) UTF-16 ranges.
export function lineParts(text, marks = []) {
  text = text.replace(/\r$/, "");
  const parts = [];
  let at = 0;
  for (const [from, to] of [...marks].sort((a, b) => a[0] - b[0])) {
    const a = Math.max(from, at), b = Math.min(to, text.length);
    if (a > at) parts.push([text.slice(at, a), false]);
    if (b > a) parts.push([text.slice(a, b), true]);
    at = Math.max(at, b);
  }
  if (at < text.length || !parts.length) parts.push([text.slice(at), false]);
  return parts.map(([s, marked]) => [s.replaceAll("\t", "    "), marked]);
}

// CodeDiff's side-by-side view in compact mode: each change with `context` unchanged
// lines around it. A row is { left, right, change } (a side is { n, parts }, or null
// in front of lines that the other side adds) or { gap: n hidden unchanged lines }.
export function diffRows(left, right, changes, context = 3) {
  // The engine finds no change when a side is empty: an added or a deleted file.
  if (!left.length !== !right.length) changes = [{ original: { start_line: 1, end_line: left.length + 1 }, modified: { start_line: 1, end_line: right.length + 1 } }];
  const rows = [];
  const side = (lines, n, marks) => ({ n, parts: lineParts(lines[n - 1] ?? "", marks?.get(n)) });
  let o = 1, m = 1;
  const same = (n) => { rows.push({ left: side(left, o++), right: side(right, m++), change: false }); };
  const unchanged = (count, first, last) => {
    const head = first ? 0 : Math.min(context, count);
    const tail = last ? 0 : Math.min(context, count - head);
    for (let k = 0; k < head; k++) same();
    if (count - head - tail > 0) rows.push({ gap: count - head - tail });
    o += count - head - tail; m += count - head - tail;
    for (let k = 0; k < tail; k++) same();
  };
  changes.forEach((c, k) => {
    unchanged(c.original.start_line - o, k === 0, false);
    const marks = [new Map(), new Map()];
    for (const inner of list(c.inner_changes)) {
      [[inner.original, left, 0], [inner.modified, right, 1]].forEach(([r, lines, s]) => {
        for (let n = r.start_line; n <= r.end_line; n++) {
          const from = n === r.start_line ? r.start_col - 1 : 0;
          const to = n === r.end_line ? r.end_col - 1 : (lines[n - 1] ?? "").length;
          if (to > from) marks[s].set(n, [...(marks[s].get(n) ?? []), [from, to]]);
        }
      });
    }
    const a = c.original.end_line - c.original.start_line, b = c.modified.end_line - c.modified.start_line;
    for (let i = 0; i < Math.max(a, b); i++) {
      rows.push({
        left: i < a ? side(left, c.original.start_line + i, marks[0]) : null,
        right: i < b ? side(right, c.modified.start_line + i, marks[1]) : null,
        change: true,
      });
    }
    [o, m] = [c.original.end_line, c.modified.end_line];
  });
  if (changes.length) unchanged(left.length + 1 - o, false, true);
  return rows;
}

export function uniqueName(name, taken) {
  let candidate = name;
  for (let n = 2; taken(candidate); n++) candidate = `${name}-${n}`;
  return candidate;
}

// ---------------------------------------------------------------- launch

// OpenCode's TUI has no model flag: the script makes a session with the model and
// the variant ($1, a Model.Ref) in the checkout, then opens it with the prompt ($2).
const OPENCODE_SESSION = `
d=$(printf %s "$PWD" | sed 's/[\\\\"]/\\\\&/g')
r=$(opencode api post /api/session -d "{\\"model\\":$1,\\"location\\":{\\"directory\\":\\"$d\\"} }")
id=$(printf %s "$r" | grep -o '"id":"ses_[^"]*"' | head -n 1 | cut -d '"' -f 4)
[ -n "$id" ] || { printf 'No OpenCode session with this model: %s\\n' "$r" >&2; exec opencode --prompt "$2"; }
exec opencode --session "$id" --prompt "$2"`;

// The agent and its native flags; the prompt comes last.
export function agentArgv(kind, sel = {}) {
  const { provider, model, effort } = sel;
  if (kind === "opencode") {
    if (!provider || !model) return ["opencode", "--prompt"];
    const ref = { providerID: provider, id: model, ...(effort ? { variant: effort } : {}) };
    return ["sh", "-c", OPENCODE_SESSION, "sh", JSON.stringify(ref)];
  }
  const argv = [kind];
  if (kind === "codex") argv.push("--no-daemon"); // else its commands run outside herdr-core
  const flags = { claude: ["--model", "--effort"], codex: ["-m", "-c"] }[kind];
  if (flags && model) argv.push(flags[0], model);
  if (flags && effort) argv.push(flags[1], kind === "codex" ? `model_reasoning_effort=${effort}` : effort);
  return argv;
}
