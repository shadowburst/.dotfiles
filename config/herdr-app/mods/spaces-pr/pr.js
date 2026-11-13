// The GitHub pull request of each local checkout, as the Herdr TUI shows it
// with the worktree plugin's $pr token: open, draft, merged or closed, and the
// review decision. Asked with `gh` when the branch changes, else every 2 minutes.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec } from "herdr";

const POLL = 120000;
// Nearly every default checkout is on one of these, and has no PR of its own.
const DEFAULT_BRANCHES = new Set(["main", "master"]);

export class PullRequests {
  constructor() {
    this.pr = {}; // where() -> { number, state, isDraft, reviewDecision } or null
    this.asked = {}; // where() -> { at, branch } of the last look
    this.busy = false;
  }

  // `git`: where() -> the spaces mod's git info (null: not a repo).
  update(git, cx) {
    if (this.busy) return;
    const now = Date.now();
    const due = Object.entries(git).filter(([key, g]) => {
      if (!g?.branch || JSON.parse(key)[0] !== null) return false; // local repos on a branch only
      const last = this.asked[key];
      return !last || last.branch !== g.branch || now - last.at > POLL;
    });
    if (!due.length) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      for (const [key, g] of due) {
        this.asked[key] = { at: Date.now(), branch: g.branch };
        this.pr[key] = DEFAULT_BRANCHES.has(g.branch) ? null : await this.fetch(JSON.parse(key)[1]);
      }
      this.busy = false;
      cx.notify();
    });
  }

  async fetch(cwd) {
    try {
      const remote = await exec("git", ["config", "--get", "remote.origin.url"], { cwd });
      if (!remote.stdout.includes("github.com")) return null;
      const r = await exec("gh", ["pr", "view", "--json", "number,state,isDraft,reviewDecision"], { cwd });
      return r.code === 0 ? JSON.parse(r.stdout) : null;
    } catch {
      return null;
    }
  }

  // The badge for a place, or null. Colors follow the TUI's sidebar rules.
  badge(key, t) {
    const pr = this.pr[key];
    if (!pr || pr.state === "CLOSED") return null;
    const draft = pr.isDraft && pr.state === "OPEN";
    const approved = pr.reviewDecision === "APPROVED";
    const changes = pr.reviewDecision === "CHANGES_REQUESTED";
    const color = changes ? t.ansi1 : approved ? t.ansi2 : draft ? t.dim : pr.state === "MERGED" ? t.ansi5 : t.ansi2;
    return h_flex()
      .flex_none()
      .gap(2)
      .items_center()
      .text_color(color)
      .when(approved, (el) => el.font_semibold())
      .child(svg("mods/workspace-chrome/git-compare.svg").size(11))
      .child(div().child(`#${pr.number}`))
      .when(approved, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(11)))
      .when(changes, (el) => el.child(svg("mods/workspace-chrome/x.svg").size(11)));
  }
}
