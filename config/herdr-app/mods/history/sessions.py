"""The newest interactive agent sessions on this computer, for the History dialog (main.js).

Reads each agent's own storage, read-only: opencode's and Codex's sqlite databases and Claude
Code's transcripts. Leaves out sub-agents, automation runs, hc child agents (their first prompt
tells them to report with hc), sessions without a prompt, sessions whose folder is gone or under
/tmp, and the ids given after the limit.

Prints a JSON list, newest first:
  {agent, id, title, folder, updated (ms), live (the hc terminal showing it, or null)}

Usage: python3 -I sessions.py LIMIT [HIDDEN_ID...]
"""

import glob
import json
import os
import re
import sqlite3
import subprocess
import sys
from contextlib import closing

HOME = os.path.expanduser("~")
CHILD = ("hc send t", "<hc from=")
CLAUDE_HEAD = 64 * 1024  # holds the entrypoint, the folder and the first prompt
CLAUDE_TAIL = 512 * 1024  # Claude writes its title line again all through a transcript


def database(path):
    return closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True))


def lines(data):
    for line in data.splitlines():
        try:
            yield json.loads(line)
        except ValueError:
            pass  # a line cut by the head or tail read


def opencode(n):
    path = f"{HOME}/.local/share/opencode/opencode-stable.db"
    if not os.path.exists(path):
        return []
    with database(path) as db:
        rows = db.execute(
            """select s.id, s.title, s.directory, s.time_updated,
                 (select json_extract(m.data, '$.text') from session_message m
                  where m.session_id = s.id and m.type = 'user' order by m.seq limit 1)
               from session_v2 s
               where s.parent_id is null and s.time_archived is null
               order by s.time_updated desc limit ?""",
            (n,),
        ).fetchall()
    return [
        {"agent": "opencode", "id": id, "title": title, "folder": folder, "updated": updated, "prompt": prompt}
        for id, title, folder, updated, prompt in rows
        if prompt
    ]


def claude_session(path):
    with open(path, "rb") as f:
        head = f.read(CLAUDE_HEAD)
        size = f.seek(0, os.SEEK_END)
        f.seek(max(0, size - CLAUDE_TAIL))
        tail = f.read()
    entry = folder = prompt = None
    for line in lines(head):
        entry = entry or line.get("entrypoint")
        folder = folder or line.get("cwd")
        if prompt is None and line.get("type") == "user":
            content = line.get("message", {}).get("content")
            prompt = content if isinstance(content, str) else " ".join(
                part.get("text", "") for part in content or [] if isinstance(part, dict)
            )
    if entry != "cli" or not prompt:  # opencode's and the SDK's sessions are not Claude Code's own
        return None
    titles = {}
    for line in lines(tail):
        if line.get("type") in ("ai-title", "custom-title"):
            titles[line["type"]] = line.get("customTitle") or line.get("aiTitle")
    title = titles.get("custom-title") or titles.get("ai-title")
    if not title:  # a session of slash commands only
        return None
    return {"agent": "claude", "id": os.path.basename(path)[:-6], "title": title, "folder": folder, "prompt": prompt}


def claude(n):
    out = []
    files = [(os.path.getmtime(f), f) for f in glob.glob(f"{HOME}/.claude/projects/*/*.jsonl")]
    for mtime, path in sorted(files, reverse=True):
        if len(out) >= n:
            break
        session = claude_session(path)
        if session:
            out.append({**session, "updated": int(mtime * 1000)})
    return out


def codex(n):
    path = f"{HOME}/.codex/state_5.sqlite"
    if not os.path.exists(path):
        return []
    with database(path) as db:
        rows = db.execute(
            """select id, coalesce(nullif(name, ''), nullif(title, ''), preview), cwd, updated_at_ms, first_user_message
               from threads
               where archived = 0 and preview <> '' and attached_thread_parent_id is null and source = 'cli'
               order by updated_at_ms desc limit ?""",
            (n,),
        ).fetchall()
    return [
        {"agent": "codex", "id": id, "title": title, "folder": folder, "updated": updated, "prompt": prompt}
        for id, title, folder, updated, prompt in rows
    ]


def automation_sessions():
    ids = set()
    for path in glob.glob(f"{HOME}/.local/state/herdr-automations/runs/*/*/run.json"):
        try:
            with open(path) as f:
                ids.add(json.load(f).get("session"))
        except (OSError, ValueError):
            pass
    return ids


def hc(*args):
    result = subprocess.run(["hc", *args, "--json"], capture_output=True, text=True, timeout=5)
    return json.loads(result.stdout) if result.returncode == 0 else {}


def live():
    """Session id -> address for the agents running in hc terminals now, plus opencode's that
    give no id: (address, folder, title) to match by title."""
    found, guesses = {}, []
    try:
        terminals = hc("ls").get("terminals", [])
    except (OSError, ValueError, subprocess.SubprocessError):
        return found, guesses
    for t in terminals:
        agent = t.get("agent")
        if t.get("state") != "live" or agent not in ("opencode", "claude", "codex"):
            continue
        try:
            info = hc("get", t["address"])
        except (OSError, ValueError, subprocess.SubprocessError):
            continue
        fg = info.get("foreground") or {}
        pid, argv = fg.get("pid"), fg.get("argv") or []
        if agent == "claude":
            try:
                with open(f"{HOME}/.claude/sessions/{pid}.json") as f:
                    found[json.load(f)["sessionId"]] = t["address"]
            except (OSError, ValueError, KeyError):
                pass
        elif agent == "codex":
            try:
                for fd in os.listdir(f"/proc/{pid}/fd"):
                    match = re.search(r"rollout-.*-([0-9a-f-]{36})\.jsonl$", os.readlink(f"/proc/{pid}/fd/{fd}"))
                    if match:
                        found[match[1]] = t["address"]
            except OSError:
                pass
        else:
            # Busy sessions are in records; a TUI started with --session names it; else its title.
            ids = list(info.get("records") or {})
            for flag in ("--session", "-s"):
                if flag in argv[:-1]:
                    ids.append(argv[argv.index(flag) + 1])
            for id in ids:
                found[id] = t["address"]
            title = info.get("title") or ""
            if not ids and title.startswith("OC | "):
                guesses.append((t["address"], fg.get("cwd") or t.get("cwd"), title[5:].rstrip("…").strip()))
    return found, guesses


def main():
    limit = int(sys.argv[1])
    hidden = set(sys.argv[2:]) | automation_sessions()
    pool = limit * 3 + len(hidden)
    # A session opens again in its folder: one that is gone (a removed worktree) or a test run's
    # scratch folder has nothing to come back to.
    def kept(s):
        prompt, folder = s.pop("prompt") or "", s["folder"] or ""
        return (
            s["id"] not in hidden
            and not any(mark in prompt for mark in CHILD)
            and os.path.isdir(folder)
            and not folder.startswith("/tmp/")
        )

    sessions = [s for s in opencode(pool) + claude(pool) + codex(pool) if kept(s)]
    sessions = sorted(sessions, key=lambda s: s["updated"], reverse=True)[:limit]
    found, guesses = live()
    for s in sessions:
        s["live"] = found.get(s["id"])
    # An idle opencode TUI shows only its title, maybe cut: the newest session it starts, in its folder first.
    for address, folder, title in guesses:
        if not title or address in found.values():
            continue
        matches = [s for s in sessions if s["agent"] == "opencode" and not s["live"] and (s["title"] or "").startswith(title)]
        matches.sort(key=lambda s: s["folder"] != folder)
        if matches:
            matches[0]["live"] = address
    json.dump(sessions, sys.stdout)


main()
