// GitHub profile pictures for commit authors. An author email maps to a GitHub
// user once (kept in localStorage); the picture is downloaded once to
// cache/avatars/ and shown from there, because image() reads local files only.
import { appHome, exec } from "herdr";
import * as fs from "fs/promises";

const DIR = "cache/avatars";
const NOREPLY = /^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/i;
const TRIES = 3;

export class Avatars {
  constructor() {
    // email -> { login, url } | null (null: GitHub knows no user for it).
    this.users = JSON.parse(localStorage.getItem("avatars") ?? "{}") ?? {};
    this.files = new Map(); // login -> true (on disk) | false (download failed)
    this.tries = new Map(); // email -> lookups that failed this session
    this.offline = new Set(); // repos where gh cannot reach GitHub
    this.busy = false;
  }

  // The image path for an email, or null while unknown or without a picture.
  path(email) {
    const u = this.users[email];
    return u && this.files.get(u.login) ? `${DIR}/${u.login}.png` : null;
  }

  login(email) { return this.users[email]?.login ?? null; }

  // True if some of these commits still need a lookup or a download.
  needs(repo, commits) {
    return !this.busy && commits.some((c) => this.todo(repo, c));
  }

  todo(repo, c) {
    if (!c.email) return false;
    const u = this.users[c.email];
    if (u === undefined) return !this.offline.has(repo) && (this.tries.get(c.email) ?? 0) < TRIES;
    return Boolean(u) && !this.files.has(u.login);
  }

  // One pass over the commits, one request at a time. Calls changed() each
  // time a picture becomes available.
  async resolve(repo, commits, on, changed) {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const c of commits) {
        if (!this.todo(repo, c)) continue;
        if (this.users[c.email] === undefined) await this.lookup(repo, c, on);
        const u = this.users[c.email];
        if (u && !this.files.has(u.login) && await this.download(u)) changed();
      }
    } finally {
      this.busy = false;
    }
  }

  async lookup(repo, c, on) {
    const m = NOREPLY.exec(c.email);
    if (m) return this.remember(c.email, { login: m[2], url: m[1] ? `https://avatars.githubusercontent.com/u/${m[1]}?s=64` : `https://github.com/${m[2]}.png?size=64` });
    // GitHub links the commit to its author's account, private emails too.
    const jq = '.author | if . then [.login, .avatar_url] | join(" ") else "" end';
    let r;
    try {
      r = await exec("gh", ["api", `repos/{owner}/{repo}/commits/${c.sha}`, "--jq", jq], { cwd: repo, on });
    } catch {
      this.offline.add(repo); // gh is not installed there
      return;
    }
    if (r.code === 0) {
      const [login, url] = r.stdout.trim().split(" ");
      return this.remember(c.email, login && url ? { login, url: `${url}${url.includes("?") ? "&" : "?"}s=64` } : null);
    }
    // A commit that is not on GitHub yet: try another commit of this author.
    if (/No commit found|HTTP 422|HTTP 404/.test(r.stderr)) this.tries.set(c.email, (this.tries.get(c.email) ?? 0) + 1);
    else this.offline.add(repo);
  }

  remember(email, user) {
    this.users[email] = user;
    localStorage.setItem("avatars", JSON.stringify(this.users));
  }

  async download(u) {
    if (!/^[A-Za-z0-9-]+$/.test(u.login)) { this.files.set(u.login, false); return false; }
    const file = `${appHome()}/${DIR}/${u.login}.png`;
    if (await fs.exists(file)) { this.files.set(u.login, true); return true; }
    try {
      const r = await exec("sh", ["-c", 'mkdir -p "${1%/*}" && curl -fsSL --max-time 15 -o "$1.part" "$2" && mv -f "$1.part" "$1"', "sh", file, u.url]);
      this.files.set(u.login, r.code === 0);
    } catch {
      this.files.set(u.login, false);
    }
    return this.files.get(u.login);
  }
}
