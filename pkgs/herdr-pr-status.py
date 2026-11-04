"""Show each herdr Space's GitHub PR as the `$pr` token, and remove merged worktrees.

Based on https://github.com/Flyingdot/herdr-pr-status (MIT).

Before it removes a merged worktree, it runs `teardown` from
$HERDR_PLUGIN_CONFIG_DIR/config.toml with bash, in the worktree, with
WORKTREE_PATH, WORKTREE_BRANCH, REPO_ROOT and PR_NUMBER set. If the teardown
fails, the worktree stays. If the teardown removed the checkout, the Space is
closed.

  daemon            poll all Spaces every POLL_SECS (single instance via pidfile)
  refresh           refresh the Space in HERDR_WORKSPACE_ID (or all if unset)
  refresh --all     refresh all Spaces
"""
import json
import os
import subprocess
import sys
import time
import tomllib

HERDR = os.environ.get("HERDR_BIN_PATH", "herdr")
SOURCE = "pbaudry.pr-status"
POLL_SECS = 120
TTL_MS = POLL_SECS * 3 * 1000  # stale values vanish if the poller dies

# Nerd Font octicons, one per state, so sidebar rules can color by state.
ICONS = {
    "open": "",  # nf-oct-git_pull_request
    "draft": "",  # nf-oct-git_pull_request_draft
    "merged": "",  # nf-oct-git_merge
    "closed": "",  # nf-oct-git_pull_request_closed
}
REVIEWS = {
    "APPROVED": "",  # nf-oct-check
    "CHANGES_REQUESTED": "",  # nf-oct-x
}


def run(cmd, cwd=None, timeout=20):
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return p.stdout if p.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def workspaces():
    out = run([HERDR, "workspace", "list"])
    return json.loads(out)["result"]["workspaces"] if out else []


def pull_request(path):
    remote = run(["git", "config", "--get", "remote.origin.url"], cwd=path) or ""
    if "github.com" not in remote:
        return None
    out = run(["gh", "pr", "view", "--json", "number,state,isDraft,reviewDecision,headRefOid"], cwd=path)
    return json.loads(out) if out else None


def label(pr):
    state = "draft" if pr["isDraft"] and pr["state"] == "OPEN" else pr["state"].lower()
    review = REVIEWS.get(pr.get("reviewDecision") or "")
    return f"{ICONS[state]} #{pr['number']}" + (f" {review}" if review else "")


def merged_and_done(pr, worktree):
    """True when the PR is merged and the worktree has no commits after the merged head.

    The main checkout is never removed. A worktree with new commits (for example a
    long-lived branch whose old PR was merged) is kept. Uncommitted changes are
    protected: a dirty worktree is kept, before any teardown runs.
    """
    if pr["state"] != "MERGED" or not worktree.get("is_linked_worktree"):
        return False
    path = worktree["checkout_path"]
    head = (run(["git", "rev-parse", "HEAD"], cwd=path) or "").strip()
    return head == pr["headRefOid"] and run(["git", "status", "--porcelain"], cwd=path) == ""


def teardown_command():
    try:
        with open(os.path.join(os.environ.get("HERDR_PLUGIN_CONFIG_DIR", ""), "config.toml"), "rb") as f:
            return tomllib.load(f).get("teardown")
    except (OSError, tomllib.TOMLDecodeError):
        return None


def remove(wid, worktree, pr):
    path = worktree["checkout_path"]
    teardown = teardown_command()
    if teardown:
        branch = (run(["git", "branch", "--show-current"], cwd=path) or "").strip()
        env = os.environ | {
            "WORKTREE_PATH": path,
            "WORKTREE_BRANCH": branch,
            "REPO_ROOT": worktree.get("repo_root", ""),
            "PR_NUMBER": str(pr["number"]),
        }
        try:
            code = subprocess.run(["bash", "-c", teardown], cwd=path, env=env, timeout=600).returncode
        except (OSError, subprocess.TimeoutExpired) as e:
            code = str(e)
        if code != 0:
            print(f"teardown failed for {path} ({code}); worktree kept", file=sys.stderr)
            return False
    if os.path.isdir(path):
        return run([HERDR, "worktree", "remove", "--workspace", wid]) is not None
    return run([HERDR, "workspace", "close", wid]) is not None


def refresh(only=None):
    for ws in workspaces():
        wid = ws["workspace_id"]
        if only and wid != only:
            continue
        worktree = ws.get("worktree") or {}
        path = worktree.get("checkout_path")
        pr = pull_request(path) if path else None
        if pr and merged_and_done(pr, worktree) and remove(wid, worktree, pr):
            continue
        args = [HERDR, "workspace", "report-metadata", wid, "--source", SOURCE]
        args += ["--token", f"pr={label(pr)}", "--ttl-ms", str(TTL_MS)] if pr else ["--clear-token", "pr"]
        run(args)


def daemon():
    pidfile = os.path.join(os.environ.get("HERDR_PLUGIN_STATE_DIR", "/tmp"), "daemon.pid")
    try:
        with open(pidfile) as f:
            os.kill(int(f.read()), 0)
        return  # already running
    except (OSError, ValueError):
        pass
    with open(pidfile, "w") as f:
        f.write(str(os.getpid()))
    while True:
        refresh()
        time.sleep(POLL_SECS)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "refresh"
    if cmd == "daemon":
        daemon()
    else:
        refresh(None if "--all" in sys.argv else os.environ.get("HERDR_WORKSPACE_ID"))
