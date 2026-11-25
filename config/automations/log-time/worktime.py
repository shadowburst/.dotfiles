#!/usr/bin/env python3
"""Shares each work day between the ClickUp tickets that were worked on, by the ratio of
the time between each ticket's first session activity and its last commit or PR update.

    draft              the open days and their work, as JSON (reads only)
    tickets REPO       the Roadmap tickets of a repository, newest change first
    plan DAY...        the entries and PR links for the days, from assign.json
    create REPO NAME   create a Roadmap ticket, or return the one with this name
    apply DAY...       write the plan of the days

Only `create` and `apply` write outside the state folder, and only in a Herdr terminal.
In an automation's agent they wait until its run has ended: the run is the draft turn,
and a later turn starts when a person writes. This prevents accidents, not abuse.

State: ~/.local/state/log-time/ holds assign.json (written by the agent, see PROMPT.md)
and <day>/plan.json and <day>/done.
"""

import argparse
import collections
import datetime as dt
import fcntl
import functools
import glob
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile

HOME = os.path.expanduser("~")
STATE = Path(os.environ.get("XDG_STATE_HOME") or f"{HOME}/.local/state") / "log-time"
ORG = "Lynx-Business"
WINDOWS = [(8 * 60 + 30, 13 * 60), (14 * 60, 17 * 60)]  # minutes of the day
DAY = sum(last - first for first, last in WINDOWS)
SLOT = 5  # minutes
SMALLEST = 15  # minutes: the smallest entry
ASKED = 10  # minutes: the smallest work that the draft lists, except your PRs without a ticket
GAP = 60  # minutes without activity that the draft shows
KEPT = 14  # days that a day stays open
OPEN_AT = 15 * 60  # today is open from this minute
COMPLETE_AT = 16 * 60 + 45  # before this minute, a plan of today has a warning
COMMENT_REPOS = set()  # repositories whose PRs do not show in the ticket's GitHub activity
SHARED_BRANCHES = {"main", "master", "dev", "develop", "staging", "HEAD"}

TASK_URL = re.compile(r"app\.clickup\.com/t/(?:[0-9]+/)?([A-Za-z0-9_-]+)")
TASK_MARK = re.compile(r"<!-- #([A-Za-z0-9_-]+)[\[ ]")
# A task named in a tool call: an argument, a URL, or a command.
TOUCH = re.compile(r"task_?[iI]ds?[\\\"']+\s*:\s*\[?[\\\"']+([A-Za-z0-9-]+)|app\.clickup\.com/t/(?:[0-9]+/)?([A-Za-z0-9_-]+)"
                   r"|clickup (?:task|api|status|comment|attachment)\b[^\n|;&]{0,60}?[ /]((?:CU-)?[0-9a-z]{9,11})\b")
TASK_ID = re.compile(r"^(?=.*[a-z])[0-9][0-9a-z]{7,11}$")
REVIEW = re.compile(r"repos/([\w.-]+/[\w.-]+)/pulls/(\d+)/reviews")

NOT_A_MESSAGE = ("Base directory for this skill", "[Image", "[Request interrupted", "Caveat:")

# One line of agent activity. `start` is the branch at session start, less exact than `branch`.
Event = collections.namedtuple("Event", "at cwd branch start session user")


class Failure(Exception):
    pass


def run(*cmd, cwd=None):
    try:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=120).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ""


def checked(*cmd, stdin=None):
    """stdout of a command that must succeed."""
    try:
        done = subprocess.run(cmd, input=stdin, capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise Failure(f"{cmd[0]} {' '.join(cmd[1:4])}: {error}") from error
    if done.returncode:
        raise Failure(f"{cmd[0]} {' '.join(cmd[1:4])}: {(done.stderr or done.stdout).strip()[-400:]}")
    return done.stdout


def parsed(text, what):
    try:
        return json.loads(text)
    except ValueError as error:
        raise Failure(f"{what}: the answer is not JSON.") from error


def load(path, default=None):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default
    except ValueError as error:
        raise Failure(f"{path} is not valid JSON: {error}") from error


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, indent=1, ensure_ascii=False))
    temp.replace(path)


# ---- time ---------------------------------------------------------------------------


def holiday(day):
    """French public holidays."""
    y = day.year  # Easter: the anonymous Gregorian algorithm
    a, b, c = y % 19, y // 100, y % 100
    d = (19 * a + b - b // 4 - (b - (b + 8) // 25 + 1) // 3 + 15) % 30
    e = (32 + 2 * (b % 4) + 2 * (c // 4) - d - c % 4) % 7
    f = d + e - 7 * ((a + 11 * d + 22 * e) // 451) + 114
    easter = dt.date(y, f // 31, f % 31 + 1)
    return (day.month, day.day) in {(1, 1), (5, 1), (5, 8), (7, 14), (8, 15), (11, 1), (11, 11), (12, 25)} \
        or (day - easter).days in (1, 39, 50)


def instant(day, minute):
    """Epoch seconds of a local minute of a day. The clock can change on that day."""
    return (dt.datetime.combine(day, dt.time()) + dt.timedelta(minutes=minute)).timestamp()


def minute_of(at):
    now = dt.datetime.fromtimestamp(at)
    return now.hour * 60 + now.minute


def in_hours(at):
    return WINDOWS[0][0] <= minute_of(at) < WINDOWS[-1][1]


def clock(minute):
    return f"{minute // 60:02}:{minute % 60:02}"


def minute_from(text):
    found = re.fullmatch(r"(\d{1,2}):(\d{2})", text)
    if not found:
        raise Failure(f"Not a time: {text}")
    return int(found[1]) * 60 + int(found[2])


def slots_of_day():
    return [m for first, last in WINDOWS for m in range(first, last, SLOT)]


# ---- agent logs -----------------------------------------------------------------------


def stamp(value):
    """Epoch seconds from an ISO string or epoch milliseconds."""
    if isinstance(value, (int, float)):
        return value / 1000
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError):
        return None


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(c.get("text") or "" for c in content if isinstance(c, dict) and "text" in c)
    return ""


class Logs:
    """Activity between two instants, from every agent log found."""

    def __init__(self, since, until):
        self.since, self.until = since, until
        self.events = []
        self.reviews = collections.defaultdict(list)  # session -> [(at, repo, pr)]
        self.touched = collections.defaultdict(list)  # session -> [(at, task ID)]
        self.prompts = collections.defaultdict(list)  # session -> the user's messages
        self.remotes = {}  # cwd -> owner/repo, where the log holds it
        self.jsonl(f"{HOME}/.claude/projects/**/*.jsonl")
        self.jsonl(f"{HOME}/.codex/sessions/**/*.jsonl")
        self.jsonl(f"{HOME}/.pi/agent/sessions/**/*.jsonl")
        self.opencode()

    def add(self, at, cwd, branch, start, session, user, raw, call=False, prompt=None):
        if at is None or not cwd or not self.since <= at < self.until:
            return
        self.events.append(Event(at, cwd, branch, start, session, user is not None))
        if prompt and not prompt.lstrip().startswith(NOT_A_MESSAGE):
            self.prompts[session].append(prompt)
        if user:
            self.touch(session, at, [(task,) for task in TASK_URL.findall(user)])
        if call:
            self.touch(session, at, TOUCH.findall(raw))
        if "POST" in raw:
            found = REVIEW.search(raw)
            if found:
                self.reviews[session].append((at, *found.groups()))

    def touch(self, session, at, found):
        for groups in found:
            task = next(filter(None, groups)).removeprefix("CU-")
            if TASK_ID.match(task):  # harnesses have "task_id" arguments of their own
                self.touched[session].append((at, task))

    def jsonl(self, pattern):
        for path in glob.glob(pattern, recursive=True):
            if os.path.getmtime(path) < self.since:
                continue
            cwd = start = None
            sub = "/subagents/" in path
            session = path.split("/subagents/")[0].removesuffix(".jsonl")  # sub-agents work for their parent
            with open(path, errors="replace") as lines:
                for raw in lines:
                    try:
                        row = json.loads(raw)
                    except ValueError:
                        continue
                    if not isinstance(row, dict):
                        continue
                    body = row.get("payload") if isinstance(row.get("payload"), dict) else {}
                    if row.get("type") == "session_meta":
                        source = body.get("source")
                        sub = sub or source == "exec" or isinstance(source, dict)
                        spawn = ((source.get("subagent") or {}) if isinstance(source, dict) else {})
                        spawn = spawn.get("thread_spawn") if isinstance(spawn, dict) else None
                        session = (spawn or {}).get("parent_thread_id") or body.get("id") or session
                        git = body.get("git") or {}
                        start = git.get("branch")
                        remote = repo_name(git.get("repository_url") or "")
                        if remote and body.get("cwd"):
                            self.remotes[body["cwd"]] = remote
                    cwd = row.get("cwd") or body.get("cwd") or cwd
                    user = prompt = None
                    message = row.get("message") if isinstance(row.get("message"), dict) else body
                    if message.get("role") == "user":
                        text = text_of(message.get("content"))
                        # Harnesses inject context as user messages; those start with a tag or heading.
                        if text and not text.lstrip().startswith(("<", "# AGENTS.md")):
                            prompt = text  # the task of a sub-agent is evidence, but no presence of the user
                            user = None if sub or row.get("isSidechain") else text
                    branch = row.get("gitBranch")
                    call = row.get("type") == "assistant" or str(body.get("type")).endswith("tool_call") or body.get("type") == "function_call"
                    self.add(stamp(row.get("timestamp")), cwd, branch if branch != "HEAD" else None, start, session, user, raw, call, prompt)

    def opencode(self):
        for path in {os.path.realpath(p) for p in glob.glob(f"{HOME}/.local/share/opencode/opencode*.db")}:
            db = None
            try:
                db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
                rows = db.execute(
                    "select m.time_created, m.type, m.data, s.id, s.directory, s.parent_id from session_message m"
                    " join session_v2 s on s.id = m.session_id where m.time_created >= ? and m.time_created < ?",
                    (self.since * 1000, self.until * 1000))
                for at, kind, data, session, cwd, parent in rows:
                    user = None
                    if kind == "user" and not parent:
                        try:
                            user = json.loads(data).get("text") or data
                        except (ValueError, AttributeError):
                            user = data
                    self.add(at / 1000, cwd, None, None, parent or session, user, data, kind == "assistant", user)
            except sqlite3.Error as error:
                print(f"OpenCode log skipped: {path}: {error}", file=sys.stderr)
            finally:
                if db:
                    db.close()


# ---- git and GitHub -------------------------------------------------------------------


def repo_name(url):
    found = re.search(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?/?$", url)
    return found[1] if found else None


def is_org(repo):
    return bool(repo) and repo.split("/")[0] == ORG


@functools.cache
def checkouts():
    """owner/repo -> its main checkout in ~/Projects."""
    found = {}
    for git in sorted(glob.glob(f"{HOME}/Projects/*/.git") + glob.glob(f"{HOME}/Projects/*/*/.git")):
        if os.path.isdir(git):
            repo = repo_name(run("git", "remote", "get-url", "origin", cwd=os.path.dirname(git)))
            if is_org(repo):
                found.setdefault(repo, os.path.dirname(git))
    return found


def project(repo):
    """The .clickup.json of a repository, or None."""
    root = checkouts().get(repo)
    return load(Path(root) / ".clickup.json") if root else None


def task_ids(body):
    ids = set(TASK_MARK.findall(body or ""))
    for line in (body or "").splitlines():
        if re.match(r"\s*-\s*ClickUp:", line):
            ids.update(TASK_URL.findall(line))
    return {task for task in ids if TASK_ID.match(task)}  # a body can show the format with a placeholder


PULL = "number,title,state,isDraft,author,url,headRefName,baseRefName,body,closedAt"


UPDATES = """query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) {
  createdAt author { login } mergedAt mergedBy { login }
  commits(last: 100) { nodes { commit { authoredDate authors(first: 5) { nodes { user { login } } } } } }
  userContentEdits(first: 100) { nodes { editedAt editor { login } } }
  comments(last: 100) { nodes { createdAt author { login } } }
  reviews(last: 100) { nodes { submittedAt author { login } } }
  timelineItems(last: 100, itemTypes: [HEAD_REF_FORCE_PUSHED_EVENT, READY_FOR_REVIEW_EVENT]) { nodes {
    ... on HeadRefForcePushedEvent { createdAt actor { login } } ... on ReadyForReviewEvent { createdAt actor { login } } } }
} } }"""


class Works:
    """Maps activity to a unit of work: a PR, a branch without a PR, or a session on a shared branch."""

    def __init__(self, logs):
        self.logs = logs
        self.roots, self.heads, self.pulls, self.keys, self.units = {}, {}, {}, {}, {}
        self.asked = set()  # branches whose PRs GitHub was asked for
        self.login = checked("gh", "api", "user", "--jq", ".login").strip()
        self.local = checkouts()
        for event in logs.events:
            self.root(event.cwd)
        repos = {repo for _, repo in self.roots.values() if repo} | set(logs.remotes.values()) | set(self.local)
        self.known = {repo.split("/")[1]: repo for repo in sorted(repos, key=is_org)}

    def root(self, cwd):
        """(worktree root, owner/repo) of a directory; the directory itself when it is gone."""
        if cwd not in self.roots:
            top = run("git", "rev-parse", "--show-toplevel", cwd=cwd) if os.path.isdir(cwd) else ""
            remote = repo_name(run("git", "remote", "get-url", "origin", cwd=top)) if top else None
            self.roots[cwd] = (top or cwd, remote or self.logs.remotes.get(cwd))
        return self.roots[cwd]

    def repo(self, cwd):
        _, repo = self.root(cwd)
        if repo:
            return repo
        # A removed worktree: its path holds the repository name.
        parts = cwd.split("/")
        for name in sorted(self.known, key=len, reverse=True):
            if any(part == name or part.startswith(f"{name}-") for part in parts):
                return self.known[name]
        return None

    def head(self, root, at):
        """Branch of a worktree at an instant, from its HEAD reflog."""
        if root not in self.heads:
            moves = []
            git_dir = run("git", "rev-parse", "--absolute-git-dir", cwd=root) if os.path.isdir(root) else ""
            try:
                with open(f"{git_dir}/logs/HEAD", errors="replace") as log:
                    for line in log:
                        found = re.search(r"> (\d+) [+-]\d{4}\tcheckout: moving from (\S+) to (\S+)", line)
                        if found:
                            moves.append((int(found[1]), found[2]))
            except OSError:
                pass
            self.heads[root] = (moves, run("git", "branch", "--show-current", cwd=root) if git_dir else "")
        moves, current = self.heads[root]
        return next((before for moment, before in moves if at < moment), current) or None

    def recent(self, repo):
        """number -> pull request, for the recent ones of a repository."""
        if repo not in self.pulls:
            day = dt.date.fromtimestamp(self.logs.since).isoformat()
            out = checked("gh", "pr", "list", "-R", repo, "--state", "all", "--limit", "500", "--search", f"updated:>={day}", "--json", PULL)
            self.pulls[repo] = {pull["number"]: pull for pull in parsed(out, f"Pull requests of {repo}")}
        return self.pulls[repo]

    def pull(self, repo, number):
        pulls = self.recent(repo)
        if number not in pulls:
            found = run("gh", "pr", "view", str(number), "-R", repo, "--json", PULL)
            pulls[number] = json.loads(found) if found else None
        return pulls[number]

    def of_branch(self, repo, branch, at=None):
        """The newest PR of a branch. A branch name can be used again: a PR has no work after the day it closed."""
        pulls = self.recent(repo)

        def found():
            return [n for n, pull in pulls.items() if pull and pull["headRefName"] == branch and (
                at is None or not pull["closedAt"] or dt.date.fromtimestamp(stamp(pull["closedAt"])) >= dt.date.fromtimestamp(at))]

        if not found() and (repo, branch) not in self.asked:  # a PR without an update in the period
            self.asked.add((repo, branch))
            out = checked("gh", "pr", "list", "-R", repo, "--state", "all", "--head", branch, "--json", PULL)
            for pull in parsed(out, f"Pull requests of {repo} {branch}"):
                pulls.setdefault(pull["number"], pull)
        return max(found(), default=None)

    def shared(self, repo, branch):
        """Also an integration branch: the base of PRs, with no PR of its own."""
        return branch in SHARED_BRANCHES or not self.of_branch(repo, branch) and any(
            pull and pull["baseRefName"] == branch for pull in self.recent(repo).values())

    def gone(self, repo, cwd):
        """The branch of a removed worktree, when its folder has the name of a PR's branch."""
        name = repo.split("/")[1]
        parts = {part.removeprefix(f"{name}-") for part in cwd.split("/")}
        branches = {pull["headRefName"] for pull in self.recent(repo).values() if pull}
        return next((b for b in sorted(branches - SHARED_BRANCHES) if b.replace("/", "-") in parts), None)

    def of(self, event):
        """The key of an event's unit of work; None outside the organization."""
        review = next(((where, int(number)) for at, where, number in self.logs.reviews.get(event.session, []) if event.at <= at), None)
        root, _ = self.root(event.cwd)
        branch = event.branch or self.head(root, event.at) or event.start
        cache = (event.cwd, branch, event.session, review, dt.date.fromtimestamp(event.at))
        if cache not in self.keys:
            self.keys[cache] = self.find(event, root, branch, review)
        return self.keys[cache]

    def find(self, event, root, branch, review):
        if review and is_org(review[0]) and self.pull(*review):
            return self.unit(review[0], pull=review[1], event=event)
        repo = self.repo(event.cwd)
        if not is_org(repo):
            return None
        if not os.path.isdir(root):
            branch = branch or self.gone(repo, event.cwd)
        if branch and not self.shared(repo, branch):
            return self.unit(repo, pull=self.of_branch(repo, branch, event.at), branch=branch, event=event)
        return self.unit(repo, event=event)

    def unit(self, repo, pull=None, branch=None, event=None):
        data = self.pull(repo, pull) if pull else None
        if data:
            key = f"{repo}#{pull}"
        elif branch:
            key = f"{repo} {branch}"
        else:
            # A shared branch: each session can be on a different subject.
            key = f"{repo} session {event.session.split('/')[-1][-12:]}" if event and event.session else f"{repo} commits"
        unit = self.units.setdefault(key, {
            "key": key, "repo": repo, "branch": data["headRefName"] if data else branch, "pull": data,
            "tasks": sorted(task_ids(data["body"])) if data else [], "sessions": set(), "commits": [], "committed": []})
        if event and event.session:
            unit["sessions"].add(event.session)
        return key

    def times(self, unit):
        """(ends, merges) in epoch seconds. Ends: commits, and PR updates by the user (creation, pushes, body edits,
        comments, reviews). A merge can come long after the work, so it counts only when a day has no other end.
        `updatedAt` is not used: bots and other people move it, and only its last value stays."""
        if "times" not in unit:
            ends, merges, pull = list(unit["committed"]), [], unit["pull"]
            if pull:
                number = pull["number"]
                ends += [at for s in unit["sessions"] for at, repo, n in self.logs.reviews.get(s, []) if (repo, int(n)) == (unit["repo"], number)]
                owner, name = unit["repo"].split("/")
                out = checked("gh", "api", "graphql", "-f", f"query={UPDATES}", "-f", f"owner={owner}", "-f", f"name={name}", "-F", f"number={number}")
                data = parsed(out, f"{unit['repo']}#{number}")["data"]["repository"]["pullRequest"]

                def by_user(items, who, when):
                    return [stamp(x[when]) for x in items["nodes"] if x and (x[who] or {}).get("login") == self.login]

                # A rebase moves the commit date, not the author date.
                ends += [stamp(c["commit"]["authoredDate"]) for c in data["commits"]["nodes"]
                         if self.mine(unit) or self.login in [(a["user"] or {}).get("login") for a in c["commit"]["authors"]["nodes"]]]
                ends += by_user({"nodes": [data]}, "author", "createdAt") + by_user(data["userContentEdits"] or {"nodes": []}, "editor", "editedAt")
                ends += by_user(data["comments"], "author", "createdAt") + by_user(data["reviews"], "author", "submittedAt")
                ends += by_user(data["timelineItems"], "actor", "createdAt")
                merges = by_user({"nodes": [data]}, "mergedBy", "mergedAt")
            unit["times"] = ([at for at in ends if at], [at for at in merges if at])
        return unit["times"]

    def mine(self, unit):
        return bool(unit["pull"]) and unit["pull"]["author"]["login"] == self.login

    def commits(self):
        """[(author time, repo, key)] of the user's commits in the period."""
        found, seen = [], set()
        for repo, root in self.local.items():
            email = run("git", "config", "user.email", cwd=root)
            if not email:
                continue
            # A rebase moves the commit date, not the author date.
            out = run("git", "log", "--all", "--no-merges", "--source", f"--since={int(self.logs.since)}", "--fixed-strings",
                      f"--author=<{email}>", "--format=%at%x09%S%x09%s", cwd=root)
            for line in out.splitlines():
                at, ref, subject = line.split("\t", 2)
                at = int(at)
                if not self.logs.since <= at < self.logs.until or (repo, at, subject) in seen:
                    continue
                seen.add((repo, at, subject))
                number = re.search(r"\(#(\d+)\)$", subject)
                branch = re.sub(r"^refs/(heads|remotes/[^/]+)/", "", ref)
                branch = None if branch.startswith("refs/") or self.shared(repo, branch) else branch
                pull = int(number[1]) if number else self.of_branch(repo, branch, at) if branch else None
                key = self.unit(repo, pull=pull, branch=branch)
                self.units[key]["commits"].append(subject)
                self.units[key]["committed"].append(at)
                found.append((at, repo, key))
        return found

    def evidence(self, unit):
        touched = collections.Counter(task for s in unit["sessions"] for _, task in self.logs.touched.get(s, []))
        touched.update(part for part in re.split(r"[/_-]", unit["branch"] or "") if TASK_ID.match(part) and len(part) >= 9)
        stack = []
        if unit["pull"]:
            near = [p for p in self.recent(unit["repo"]).values() if p and (
                p["headRefName"] == unit["pull"]["baseRefName"] or p["baseRefName"] == unit["pull"]["headRefName"])]
            stack = [{"pull": p["number"], "tasks": sorted(task_ids(p["body"]))} for p in near if p["headRefName"] not in SHARED_BRANCHES]
        prompts = [" ".join(text.split())[:300] for s in sorted(unit["sessions"]) for text in self.logs.prompts.get(s, [])[:2]]
        return {"tickets_touched_in_sessions": dict(touched.most_common(6)), "stack": stack,
                "first_messages": prompts[:6], "commits": unit["commits"][:8]}


class Period:
    """Activity of some days: slot -> units of work, for each day."""

    def __init__(self, days):
        logs = Logs(instant(min(days), 0), instant(max(days), 24 * 60))
        self.works = Works(logs)
        self.active = {day: collections.defaultdict(set) for day in days}  # units, and None outside the organization
        self.moments = {day: {} for day in days}  # unit -> first and last activity of the day, epoch seconds
        self.present = set()  # days with a message of the user in the organization's repositories
        for event in logs.events:
            day = dt.date.fromtimestamp(event.at)
            if day not in self.active:
                continue
            key = self.works.of(event)
            self.active[day][minute_of(event.at) // SLOT * SLOT].add(key)
            self.moment(day, key, event.at)
            if event.user and key:
                self.present.add(day)
        for at, repo, key in self.works.commits():
            day = dt.date.fromtimestamp(at)
            if day not in self.active:
                continue
            keys = self.active[day][minute_of(at) // SLOT * SLOT]
            # The logs know better which work a commit belongs to.
            if not any(k and self.works.units[k]["repo"] == repo for k in keys):
                keys.add(key)
                self.moment(day, key, at)

    def moment(self, day, key, at):
        if not in_hours(at):
            return
        first, last = self.moments[day].get(key, (at, at))
        self.moments[day][key] = (min(first, at), max(last, at))

    def keys(self, day):
        return {key for minute in slots_of_day() for key in self.active[day].get(minute, ()) if key}

    def span(self, day, key):
        """(start, end, what ends it) of a unit's work on a day, in epoch seconds."""
        first, last = self.moments[day][key]
        for times, what in zip(self.works.times(self.works.units[key]), ("commit or PR update", "merge")):
            found = [at for at in times if at >= first and dt.date.fromtimestamp(at) == day and in_hours(at)]
            if found:
                return first, max(found), what
        return first, last, "session"


# ---- ClickUp --------------------------------------------------------------------------


def clickup(path, *options, body=None):
    stdin = json.dumps(body) if body is not None else None
    out = checked("clickup", "api", path, *options, *(["--input", "-"] if stdin else []), stdin=stdin)
    return parsed(out, f"ClickUp {path}") if out.strip() else {}


class ClickUp:
    def __init__(self):
        self.user = int(clickup("user")["user"]["id"])
        teams = clickup("team")["teams"]
        if len(teams) != 1:
            raise Failure("Expected one ClickUp workspace.")
        self.team = teams[0]["id"]
        self.known = {}

    def entries(self, first, last):
        """The user's entries that touch the days, and the running timer."""
        since, until = int(instant(first, 0) * 1000), int(instant(last, 24 * 60) * 1000)
        data = clickup(f"team/{self.team}/time_entries?start_date={since - 86_400_000}&end_date={until}")["data"]
        running = clickup(f"team/{self.team}/time_entries/current").get("data") or {}
        found = {}
        for e in [*data, *([running] if running.get("id") else [])]:
            if int((e.get("user") or {}).get("id") or self.user) != self.user:
                continue
            timer = int(e["duration"]) < 0
            task = e.get("task")
            found[e["id"]] = {"id": e["id"], "task": task.get("id") if isinstance(task, dict) else None,
                              "start": int(e["start"]), "end": None if timer else int(e["start"]) + int(e["duration"])}
        return list(found.values())

    def task(self, task):
        if task not in self.known:
            t = clickup(f"task/{task}")
            self.known[task] = {"id": t["id"], "name": t["name"], "url": t["url"], "status": t["status"]["status"], "list": t["list"]["id"]}
        return self.known[task]


def on_day(entries, day):
    """[(start, end)] in epoch seconds of the part of each entry inside a day."""
    first, last = instant(day, 0), instant(day, 24 * 60)
    parts = []
    for e in entries:
        start = e["start"] / 1000
        if e["end"] is None:  # a running timer holds the rest of its work day
            end = instant(dt.date.fromtimestamp(start), WINDOWS[-1][1])
        else:
            end = e["end"] / 1000
        start, end = max(start, first), min(end, last)
        if end > start:
            parts.append((start, end))
    return parts


def signature(entries, day):
    touching = [e for e in entries if on_day([e], day)]
    return sorted([e["id"], e["task"], e["start"], e["end"]] for e in touching)


def free_slots(day, entries, away):
    """The slots outside existing entries and absences, and how many of them the day needs."""
    taken = on_day(entries, day)
    free = []
    for minute in slots_of_day():
        at, end = instant(day, minute), instant(day, minute + SLOT)
        # A slot half covered by an existing entry is taken.
        if sum(max(0, min(end, b) - max(at, a)) for a, b in taken) < SLOT * 30 and not any(a < minute + SLOT and minute < b for a, b in away):
            free.append(minute)
    free = [m for block in blocks(free) if len(block) * SLOT >= SMALLEST for m in block]
    absent = sum(1 for m in slots_of_day() if any(a < m + SLOT and m < b for a, b in away)) * SLOT
    logged = sum(b - a for a, b in taken) / 60
    return free, max(0, min(len(free), int((DAY - absent - logged + SLOT / 2) // SLOT)))


# ---- dividing a day ---------------------------------------------------------------------


def blocks(minutes):
    """Runs of consecutive slots."""
    out = []
    for m in minutes:
        if out and out[-1][-1] + SLOT == m:
            out[-1].append(m)
        else:
            out.append([m])
    return out


def divide(weights, total):
    """Whole slots for each task by largest remainder; shares that are too small go to the others."""
    weights = {task: w for task, w in weights.items() if w > 0}
    small = SMALLEST // SLOT
    while weights:
        whole = sum(weights.values())
        exact = {task: w * total / whole for task, w in weights.items()}
        out = {task: int(v) for task, v in exact.items()}
        for task in sorted(exact, key=lambda t: (-(exact[t] - out[t]), t))[:total - sum(out.values())]:
            out[task] += 1
        least = min(out, key=lambda t: (out[t], t))
        if out[least] >= small:
            return out
        del weights[least]
    return {}


def place(slots, order, free):
    """Entries [task, first minute, last minute], one task after the other, none under the smallest size."""
    small = SMALLEST // SLOT
    left, out = {t: slots[t] for t in order if slots[t]}, []
    for block in blocks(free):
        room, at = len(block), block[0]

        def put(task, n):
            nonlocal room, at
            out.append([task, at, at + n * SLOT])
            at, room = at + n * SLOT, room - n
            left[task] -= n
            if not left[task]:
                del left[task]

        while left and room:
            fits = [t for t, n in left.items() if n == room or n <= room - small or n >= room + small or len(left) == 1 and n < room]
            # A task that continues from the block before comes first.
            task = next(iter(fits or left))
            need = left[task]
            if not fits and need > room:  # the rest would be too small: another task takes it
                other = max((t for t in left if t != task), key=left.get, default=None)
                if other:
                    left[other] += need - room
                    left[task] = room
                elif room - (small - (need - room)) >= small:
                    need = room - (small - (need - room))
                    put(task, need)
                    break
                else:  # no task and no room for the rest: at most 10 minutes of the day stay empty
                    left[task] = room
            elif not fits:  # the room left would be too small: this task takes it from another
                other = max((t for t in left if t != task), key=left.get)
                more = room - need
                if left[other] - more >= small or left[other] == more:
                    left[other] -= more
                    left[task] += more
                    if not left[other]:
                        del left[other]
                else:
                    put(task, need)
                    break
            put(task, min(left[task], room))
    return out


def read_assign():
    value = load(STATE / "assign.json", {})
    return {"work": value.get("work") or {}, "days": value.get("days") or {}}


def tasks_of(unit, assign):
    """(task IDs, sure): an answer in assign.json is stronger than the PR's own links."""
    answer = assign["work"].get(unit["key"])
    if answer and (answer.get("confirmed") or answer.get("confidence") != "possible"):
        return ([answer["task"]] if answer.get("task") else []), bool(answer.get("confirmed"))
    return unit["tasks"], True


def gaps(active):
    out, quiet = [], []
    for block in blocks([m for m in slots_of_day() if not active.get(m)]):
        if len(block) * SLOT > GAP:
            quiet.append(block)
    for block in quiet:
        out.append(f"{clock(block[0])}-{clock(block[-1] + SLOT)}")
    return out


def plan_day(day, period, assign, entries):
    active = period.active[day]
    special = assign["days"].get(day.isoformat()) or {}
    away = [tuple(minute_from(t) for t in pair) for pair in special.get("away") or []]
    fixed = {task: round(minutes / SLOT) for task, minutes in (special.get("minutes") or {}).items()}
    if any(0 < n < SMALLEST // SLOT for n in fixed.values()):
        raise Failure(f"{day}: an entry is at least {SMALLEST} minutes.")
    free, total = free_slots(day, entries, away)
    if sum(fixed.values()) > total:
        raise Failure(f"{day}: the requested minutes are more than the {total * SLOT} free minutes.")

    keys, units = period.keys(day), period.works.units
    spans = {}  # task -> first start and last end of its work
    for key in keys:
        for task in tasks_of(units[key], assign)[0]:
            start, end, what = period.span(day, key)
            known = spans.get(task, (start, end, what))
            spans[task] = (min(start, known[0]), *max((end, what), known[1:]))

    def weigh(minutes):
        """The work time between the start and the end of each task: the ratio that divides the day."""
        return {task: sum(instant(day, m) < end and instant(day, m + SLOT) > start for m in minutes) or
                sum(instant(day, m) <= end < instant(day, m + SLOT) for m in minutes)
                for task, (start, end, _) in spans.items() if task not in fixed}

    weights = weigh(free)
    if not any(weights.values()):
        weights = weigh(slots_of_day())
    first = {task: start for task, (start, _, _) in spans.items()}
    shares = divide(weights, total - sum(fixed.values()))
    order = sorted({**fixed, **shares}, key=lambda t: (first.get(t, float("inf")), t))
    result = place({**shares, **fixed}, order, free)

    # One proposal that is not confirmed makes the whole entry not confirmed.
    unsure = {t for key in keys for t in tasks_of(units[key], assign)[0] if not tasks_of(units[key], assign)[1]} - set(fixed)
    used = {task for task, _, _ in result}
    links = []
    for key in sorted(keys):
        unit, answer = units[key], assign["work"].get(key) or {}
        if answer.get("task") in tasks_of(unit, assign)[0] and period.works.mine(unit) and not unit["tasks"]:
            links.append({"repo": unit["repo"], "pull": unit["pull"]["number"], "task": answer["task"], "confirmed": bool(answer.get("confirmed"))})

    org = collections.Counter()
    for minute in slots_of_day():
        found = {k for k in active.get(minute, ()) if k}
        if any(k is None for k in active.get(minute, ())) and not found:
            org["outside"] += SLOT
        if found:
            org["active"] += SLOT
            org["linked"] += SLOT * sum(bool(tasks_of(units[k], assign)[0]) for k in found) / len(found)
    warnings = []
    if total and not result:
        warnings.append("No ticket found: nothing is written for this day.")
    elif total and org["linked"] * 2 < org["active"]:
        warnings.append(f"Weak evidence: {round(org['linked'])} of {org['active']} active minutes have a ticket.")
    if org["outside"]:
        warnings.append(f"{org['outside']} minutes had activity only outside {ORG}; tickets absorb them.")
    warnings += [f"No activity {gap}: filled unless it is an absence or a meeting." for gap in gaps(active)]
    now = dt.datetime.now()
    if day == now.date() and now.hour * 60 + now.minute < COMPLETE_AT:
        warnings.append("This day is not finished: later work is not in the ratio.")
    if (dt.date.today() - day).days >= KEPT - 2:
        warnings.append(f"This day closes after {day + dt.timedelta(days=KEPT)}.")
    return {
        "date": day.isoformat(), "logged_minutes": round(sum(b - a for a, b in on_day(entries, day)) / 60),
        "entries": [{"task": task, "start": clock(a), "end": clock(b), "minutes": b - a, "confirmed": task not in unsure,
                     "start_ms": int(instant(day, a) * 1000), "end_ms": int(instant(day, b) * 1000)} for task, a, b in result],
        "under_minimum": sorted(set(weights) - used),
        "spans": {task: f"{clock(minute_of(start))}-{clock(minute_of(end))} ({what})" for task, (start, end, what) in spans.items()}, "links": links, "warnings": warnings,
        "signature": signature(entries, day)}


# ---- days ---------------------------------------------------------------------------------


def done(day):
    return (STATE / day.isoformat() / "done").exists()


def open_days(now):
    """Work days since the first run that are not done. Today counts near the end of the day."""
    today = dt.date.fromtimestamp(now)
    marker = STATE / "start"
    if not marker.exists():
        marker.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        marker.write_text(today.isoformat())
    first = max(dt.date.fromisoformat(marker.read_text().strip()), today - dt.timedelta(days=KEPT))
    days = [first + dt.timedelta(days=n) for n in range((today - first).days + 1)]
    return [d for d in days if d.weekday() < 5 and not holiday(d) and not done(d) and (d < today or minute_of(now) >= OPEN_AT)]


def draft_days(days, api):
    """Each day's own work. A day is never moved to another date."""
    if not days:
        return {"days": [], "work": []}
    period, entries = Period(days), api.entries(min(days), max(days))
    assign, units = read_assign(), period.works.units
    out, shown = [], collections.Counter()  # unit -> minutes
    for day in days:
        keys = period.keys(day)
        free, total = free_slots(day, entries, [])
        unlinked = [k for k in keys if period.works.mine(units[k]) and not units[k]["tasks"]]
        if day not in period.present:
            out.append({"date": day.isoformat(), "skipped": f"no message of the user in {ORG}"})
        elif not total and not unlinked:
            out.append({"date": day.isoformat(), "skipped": "already logged"})
        else:
            minutes = collections.Counter()
            for minute in slots_of_day():
                found = {k for k in period.active[day].get(minute, ()) if k}
                for k in found:
                    minutes[k] += SLOT / len(found)
            shown.update(minutes)
            out.append({"date": day.isoformat(), "free_minutes": total * SLOT,
                        "work": {k: round(v) for k, v in minutes.most_common() if round(v)}})
    work = []
    for key, minutes in shown.most_common():
        unit, pull = units[key], units[key]["pull"]
        if minutes < ASKED and not (period.works.mine(unit) and not unit["tasks"]):
            continue
        item = {"key": key, "minutes": round(minutes), "linked": unit["tasks"], "answer": assign["work"].get(key)}
        if pull:
            item |= {"title": pull["title"], "state": "DRAFT" if pull["isDraft"] and pull["state"] == "OPEN" else pull["state"], "url": pull["url"],
                     "kind": "your PR" if period.works.mine(unit) else f"PR of {pull['author']['login']}"}
        else:
            item["kind"] = "branch without a PR" if unit["branch"] else "work on a shared branch"
        if not unit["tasks"]:
            item |= period.works.evidence(unit)
        work.append(item)
    return {"days": out, "work": work}


def make_plans(days, api):
    period, entries, assign = Period(days), api.entries(min(days), max(days)), read_assign()
    plans = []
    for day in days:
        if done(day):
            raise Failure(f"{day} is already done.")
        plan = plan_day(day, period, assign, entries)
        for item in plan["entries"] + plan["links"]:
            task = api.task(item["task"])
            item |= {"name": task["name"], "status": task["status"]}
        plans.append(plan)
    return plans


# ---- writes -------------------------------------------------------------------------------


def need_terminal():
    terminal = os.environ.get("HC_TERMINAL_ID")
    if not terminal:
        raise Failure("Writes are permitted only in a Herdr terminal, after the user approved the plan.")
    labels = parsed(checked("hc", "get", terminal, "--json"), "hc get").get("labels") or {}
    if "automation.agent" in labels:
        runs = Path(HOME) / ".local/state/herdr-automations/runs"
        state = load(runs / labels["automation.agent"] / labels.get("automation.run", "") / "run.json", {})
        if state.get("state", "running") == "running":
            raise Failure("This is the draft turn: end it with the draft. Writes are permitted after the user answers.")


def roadmap(repo):
    config = project(repo)
    if not config:
        raise Failure(f"{repo} has no .clickup.json here. Use `clickup task search`.")
    return config, config["lists"]["roadmap"]


def roadmap_tasks(repo):
    _, number = roadmap(repo)
    tasks = clickup(f"list/{number}/task?include_closed=true&subtasks=true", "--paginate")["tasks"]
    return sorted(tasks, key=lambda t: -int(t["date_updated"]))


def create(repo, name, status):
    need_terminal()
    api = ClickUp()
    same = next((t for t in roadmap_tasks(repo) if t["name"].strip().casefold() == name.strip().casefold()), None)
    if same:
        return {"id": same["id"], "name": same["name"], "status": same["status"]["status"], "created": False}
    _, number = roadmap(repo)
    made = clickup(f"list/{number}/task", "-X", "POST", body={"name": name.strip(), "assignees": [api.user], **({"status": status} if status else {})})
    return {"id": made["id"], "name": made["name"], "status": made["status"]["status"], "created": True}


def marker(repo, pull, task):
    """deliver-pr's marker moves the ticket to review: only for a ready PR whose ticket is before review."""
    plain = f"<!-- #{task['id']} -->"
    config = project(repo)
    if not config or pull["state"] != "OPEN" or pull["isDraft"] or task["list"] != config["lists"]["roadmap"]:
        return plain
    review = config["statuses"]["roadmap"]["review"]
    order = {s["status"]: s["orderindex"] for s in clickup(f"list/{task['list']}")["statuses"]}
    if review not in order or task["status"] not in order or order[task["status"]] >= order[review]:
        return plain
    return f"<!-- #{task['id']}[{review}] -->"


def link(repo, number, task, api):
    """Adds the ticket to the PR body. Returns what happened."""
    def view():
        return parsed(checked("gh", "pr", "view", str(number), "-R", repo, "--json", PULL), f"{repo}#{number}")

    pull = view()
    if pull["author"]["login"] != checked("gh", "api", "user", "--jq", ".login").strip():
        raise Failure(f"{repo}#{number} is not your PR.")
    ids = task_ids(pull["body"])
    if ids and task not in ids:
        return f"not changed: it has a link to {', '.join(sorted(ids))}"
    result = "already linked"
    if not ids:
        api.known.pop(task, None)  # the status can have changed since the plan
        ticket = api.task(task)
        name = re.sub(r"([\[\]\\])", r"\\\1", ticket["name"])
        lines = f"- ClickUp: [{name}]({ticket['url']})\n{marker(repo, pull, ticket)}\n"
        # The shortest time between the last read and the write: GitHub has no conditional edit.
        latest = view()
        if task_ids(latest["body"]) or (latest["state"], latest["isDraft"]) != (pull["state"], pull["isDraft"]):
            raise Failure(f"{repo}#{number} changed during the write. Run apply again.")
        body = latest["body"].rstrip()
        with tempfile.NamedTemporaryFile("w", suffix=".md", newline="") as file:
            file.write(f"{body}\n\n{lines}" if body else lines)
            file.flush()
            checked("gh", "pr", "edit", str(number), "-R", repo, "--body-file", file.name)
        if task not in task_ids(view()["body"]):
            raise Failure(f"{repo}#{number}: the link is not in the body after the write.")
        result = "linked"
    if repo in COMMENT_REPOS:
        title = f"PR summary · {repo}#{number}"
        comments = clickup(f"task/{task}/comment")["comments"]
        if not any(title in (c.get("comment_text") or "").split("\n")[0] for c in comments):
            clickup(f"task/{task}/comment", "-X", "POST", body={"comment_text": f"{title}\n\n{pull['url']}", "notify_all": False})
    return result


def same_entry(entry, existing):
    return entry["task"] == existing["task"] and entry["start_ms"] == existing["start"] and entry["end_ms"] == existing["end"]


def check_plan(day, plan):
    for entry in plan["entries"]:
        start, end = dt.datetime.fromtimestamp(entry["start_ms"] / 1000), dt.datetime.fromtimestamp(entry["end_ms"] / 1000)
        inside = any(instant(day, a) * 1000 <= entry["start_ms"] < entry["end_ms"] <= instant(day, b) * 1000 for a, b in WINDOWS)
        if start.date() != day or end.date() != day or not inside:
            raise Failure(f"{day}: the entry {start} - {end} is outside its day.")
    pending = [e["task"] for e in plan["entries"] if not e["confirmed"]] + [f"{i['repo']}#{i['pull']}" for i in plan["links"] if not i["confirmed"]]
    if pending:
        raise Failure(f"{day}: not confirmed: {', '.join(dict.fromkeys(pending))}. Confirm or remove them in assign.json, then plan again.")


def apply_day(day, api):
    if done(day):
        return {"date": day.isoformat(), "result": "already done"}
    plan = load(STATE / day.isoformat() / "plan.json")
    if not plan:
        raise Failure(f"{day} has no plan.")
    check_plan(day, plan)

    def remaining():
        """The planned entries that do not exist yet. Stops when anything else changed."""
        existing = api.entries(day, day)
        missing = [e for e in plan["entries"] if not any(same_entry(e, x) for x in existing)]
        others = [x for x in existing if not any(same_entry(e, x) for e in plan["entries"])]
        if signature(others, day) != [list(s) for s in plan["signature"]]:
            raise Failure(f"{day}: your ClickUp entries changed since the plan. Plan this day again.")
        return missing

    for entry in remaining():
        try:
            clickup(f"team/{api.team}/time_entries", "-X", "POST",
                    body={"tid": entry["task"], "start": entry["start_ms"], "duration": entry["end_ms"] - entry["start_ms"]})
        except Failure as error:
            # The entry can exist after an unclear answer. A read decides.
            if entry in remaining():
                raise Failure(f"{day} {entry['start']}: {error}") from error
    links = {}
    for item in plan["links"]:
        links[f"{item['repo']}#{item['pull']}"] = link(item["repo"], item["pull"], item["task"], api)
    if remaining():
        raise Failure(f"{day}: some entries are not in ClickUp after the write. Run apply again.")
    (STATE / day.isoformat() / "done").touch()
    return {"date": day.isoformat(), "result": "done", "minutes": sum(e["minutes"] for e in plan["entries"]),
            "entries": len(plan["entries"]), "links": links}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("draft")
    command.add_argument("days", nargs="*", type=dt.date.fromisoformat, help="instead of the open days")
    commands.add_parser("tickets").add_argument("repo")
    command = commands.add_parser("create")
    command.add_argument("repo")
    command.add_argument("name")
    command.add_argument("--status")
    for name in ("plan", "apply"):
        commands.add_parser(name).add_argument("days", nargs="+", type=dt.date.fromisoformat)
    args = parser.parse_args()
    now = dt.datetime.now().timestamp()
    show = lambda value: print(json.dumps(value, indent=1, ensure_ascii=False))
    try:
        if args.command == "tickets":
            for t in roadmap_tasks(args.repo):
                print(t["id"], t["status"]["status"], dt.date.fromtimestamp(int(t["date_updated"]) / 1000), " ".join(t["name"].split()), sep="\t")
        elif args.command == "create":
            show(create(args.repo, args.name, args.status))
        elif args.command == "draft":
            show(draft_days(sorted(set(args.days)) or open_days(now), ClickUp()))
        else:
            STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
            with open(STATE / "lock", "a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                days = sorted(set(args.days))
                if args.command == "plan":
                    plans = make_plans(days, ClickUp())
                    for day, plan in zip(days, plans):
                        save(STATE / day.isoformat() / "plan.json", plan)
                    show(plans)
                else:
                    need_terminal()
                    api = ClickUp()
                    for day in days:  # each day alone: a failure leaves the days before it done
                        show(apply_day(day, api))
    except Failure as error:
        sys.exit(str(error))


if __name__ == "__main__":
    main()
