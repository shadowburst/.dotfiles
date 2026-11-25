"""Run: python3 -B config/automations/log-time/test_worktime.py. Uses fake agent logs, gh and clickup."""
import datetime as dt
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import time
import unittest

os.environ["TZ"] = "Europe/Paris"
time.tzset()
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import worktime as w  # noqa: E402

TUESDAY, WEDNESDAY = dt.date(2026, 11, 17), dt.date(2026, 11, 18)
A, B, C = "1amwpdaaaaa", "1amwpdbbbbb", "1amwpdccccc"

FAKE = r'''#!/usr/bin/env python3
import json, os, re, sys
path = os.environ["FAKE"]
state = json.load(open(path))
args = sys.argv[1:]
def end(value=None, code=0):
    json.dump(state, open(path, "w"))
    if value is not None:
        print(value if isinstance(value, str) else json.dumps(value))
    sys.exit(code)
state["calls"].append(args)
if sys.argv[0].endswith("/hc"):
    end({"labels": state["labels"]} if args == ["get", "t1", "--json"] else "not found", 0 if args[1] == "t1" else 1)
if sys.argv[0].endswith("gh"):
    if args[:2] == ["api", "user"]: end(state["login"])
    if args[:2] == ["api", "graphql"]:
        number = next(a for a in args if a.startswith("number="))[7:]
        end({"data": {"repository": {"pullRequest": next(p for p in state["pulls"] if str(p["number"]) == number)}}})
    if args[:2] == ["pr", "list"]:
        head = args[args.index("--head") + 1] if "--head" in args else None
        end([p for p in state["pulls"] if p["repo"] == args[3] and (p["headRefName"] == head if head else not p.get("quiet"))])
    pull = next((p for p in state["pulls"] if str(p["number"]) == args[2]), None)
    if args[:2] == ["pr", "view"] and pull:
        if state.get("race") and [c[:2] for c in state["calls"]].count(["pr", "view"]) == 2:
            pull["body"] += "\n- ClickUp: [x](https://app.clickup.com/t/1amwpdzzzzz)"
        end(pull)
    if args[:2] == ["pr", "edit"] and pull:
        pull["body"] = open(args[args.index("--body-file") + 1], newline="").read(); end()
    end("no pull request", 1)
url, body = args[1], json.loads(sys.stdin.read()) if "--input" in args else None
if url == "user": end({"user": {"id": 1}})
if url == "team": end({"teams": [{"id": "9"}]})
if url.endswith("/current"): end({"data": state.get("running")})
if "/time_entries" in url and body:
    mode = state["post"].pop(0) if state["post"] else "ok"
    if mode != "lost":
        state["entries"].append({"id": str(len(state["entries"]) + 100), "user": {"id": 1}, "task": {"id": body["tid"]}, "start": str(body["start"]), "duration": str(body["duration"])})
    end({"data": {}} if mode == "ok" else "server error", 0 if mode == "ok" else 1)
if "/time_entries" in url: end({"data": state["entries"]})
if re.fullmatch(r"task/\w+/comment", url):
    if body: state["comments"].append(body["comment_text"])
    end({"comments": [{"comment_text": c} for c in state["comments"]]})
if url.startswith("task/"):
    t = next((t for t in state["tasks"] if t["id"] == url[5:]), None)
    end(t) if t else end("not found", 1)
if re.fullmatch(r"list/\w+/task", url):
    t = {"id": "1amwpdnewww", "name": body["name"], "url": "u", "status": {"status": body.get("status", "à faire")}, "list": {"id": "L"}, "date_updated": "5"}
    state["tasks"].append(t); end(t)
if url.startswith("list/") and "/task" in url: end({"tasks": state["tasks"]})
if url.startswith("list/"): end({"statuses": [{"status": s, "orderindex": i} for i, s in enumerate(["à faire", "en cours", "en revue", "bloqué", "en prod"])]})
end("unknown " + url, 1)
'''


def at(day, text):
    return int(w.instant(day, w.minute_from(text)) * 1000)


class Divide(unittest.TestCase):
    def test_every_division_is_complete_and_has_no_small_entry(self):
        rng = random.Random(1)
        worst = 0
        for _ in range(20000):
            free = [m for m in w.slots_of_day() if rng.random() > 0.0]
            for _ in range(rng.randint(0, 3)):
                cut = rng.choice(w.slots_of_day())
                free = [m for m in free if not cut <= m < cut + 5 * rng.randint(1, 20)]
            free = [m for b in w.blocks(free) if len(b) >= 3 for m in b]
            total = rng.choice([len(free), rng.randint(0, len(free))])
            tasks = [f"t{i}" for i in range(rng.randint(1, 12))]
            shares = w.divide({t: rng.random() ** 3 for t in tasks}, total)
            self.assertEqual(sum(shares.values()), total if total >= 3 else 0)
            placed = w.place(dict(shares), sorted(shares), free)
            used = [m for _, a, b in placed for m in range(a, b, 5)]
            self.assertEqual(len(used), len(set(used)))
            self.assertLessEqual(set(used), set(free))
            self.assertTrue(all(b - a >= 15 for _, a, b in placed), (shares, placed))
            worst = max(worst, sum(shares.values()) - len(used))
        self.assertLessEqual(worst, 4)  # slots; only days that existing entries cut in pieces

    def test_a_free_day_is_always_seven_and_a_half_hours(self):
        rng = random.Random(2)
        for _ in range(5000):
            shares = w.divide({f"t{i}": rng.random() ** 3 + 0.001 for i in range(rng.randint(1, 14))}, 90)
            placed = w.place(dict(shares), sorted(shares), w.slots_of_day())
            self.assertEqual(sum(b - a for _, a, b in placed), 450)

    def test_shares_are_proportional_and_the_small_one_goes_to_the_others(self):
        self.assertEqual(w.divide({"a": 2, "b": 1}, 90), {"a": 60, "b": 30})
        self.assertEqual(w.divide({"a": 50, "b": 50, "c": 1}, 90), {"a": 45, "b": 45})

    def test_clock_change_and_holidays(self):
        for day in (dt.date(2026, 3, 30), dt.date(2026, 10, 26), dt.date(2026, 3, 29), dt.date(2026, 10, 25)):
            self.assertEqual(dt.datetime.fromtimestamp(w.instant(day, 510)), dt.datetime.combine(day, dt.time(8, 30)))
        self.assertTrue(w.holiday(dt.date(2026, 11, 11)) and w.holiday(dt.date(2026, 4, 6)) and w.holiday(dt.date(2026, 5, 14)))
        self.assertFalse(w.holiday(TUESDAY))


class Day(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="log-time-")
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)
        self.fake, self.state = self.home / "fake.json", self.home / "state/log-time"
        (self.home / "bin").mkdir()
        for name in ("gh", "clickup", "hc"):
            (self.home / "bin" / name).write_text(FAKE)
            (self.home / "bin" / name).chmod(0o755)
        self.env = {"PATH": f"{self.home}/bin:{os.environ['PATH']}", "HOME": str(self.home), "XDG_STATE_HOME": str(self.home / "state"),
                    "FAKE": str(self.fake), "TZ": "Europe/Paris", "TZDIR": os.environ.get("TZDIR", ""), "HC_TERMINAL_ID": "t1", "GIT_CONFIG_GLOBAL": "/dev/null"}
        self.repo = self.home / "Projects/app"
        self.git("init", "-qb", "dev", str(self.repo), cwd=self.home)
        self.git("remote", "add", "origin", "git@github.com:Lynx-Business/app.git")
        self.git("config", "user.email", "me@example.test")
        self.git("config", "user.name", "me")
        (self.repo / ".clickup.json").write_text(json.dumps({"lists": {"roadmap": "L"}, "statuses": {"roadmap": {"review": "en revue"}}}))
        self.data = {"login": "me", "labels": {}, "calls": [], "entries": [], "post": [], "comments": [], "pulls": [],
                     "tasks": [{"id": t, "name": f"Ticket {t[-1]}", "url": f"https://app.clickup.com/t/{t}", "status": {"status": "en cours"},
                                "list": {"id": "L"}, "date_updated": "1"} for t in (A, B, C)]}
        self.lines = []

    def git(self, *args, cwd=None, **env):
        subprocess.run(["git", *args], cwd=cwd or self.repo, check=True, capture_output=True, env={**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", **env})

    def pull(self, number, branch, task=None, state="OPEN", draft=False, author="me", base="dev"):
        body = "Why.\r\n\r\nText." + (f"\n- ClickUp: [x](https://app.clickup.com/t/{task})\n<!-- #{task}[en revue] -->" if task else "")
        self.data["pulls"].append({"repo": "Lynx-Business/app", "number": number, "headRefName": branch, "baseRefName": base, "title": f"PR {number}",
                                   "state": state, "isDraft": draft, "author": {"login": author}, "createdAt": "2026-11-01T09:00:00Z", "closedAt": None, "mergedAt": None, "mergedBy": None, **{k: {"nodes": []} for k in ("commits", "userContentEdits", "comments", "reviews", "timelineItems")}, "url": f"https://github.com/x/{number}", "body": body})

    def work(self, day, first, last, branch, cwd=None, user=True, session="s1", step=1):
        for m in range(w.minute_from(first), w.minute_from(last), step):
            self.lines.append((session, {"type": "user" if user else "assistant", "cwd": str(cwd or self.repo), "gitBranch": branch,
                                         "timestamp": dt.datetime.fromtimestamp(w.instant(day, m), dt.timezone.utc).isoformat().replace("+00:00", "Z"),
                                         "message": {"role": "user" if user else "assistant", "content": "hello"}}))

    def entry(self, day, first, last, task=A):
        self.data["entries"].append({"id": str(len(self.data["entries"]) + 1), "user": {"id": 1}, "task": {"id": task},
                                     "start": str(at(day, first)), "duration": str(at(day, last) - at(day, first))})

    def store(self):
        logs = self.home / ".claude/projects/app"
        logs.mkdir(parents=True, exist_ok=True)
        for session in {s for s, _ in self.lines}:
            (logs / f"{session}.jsonl").write_text("\n".join(json.dumps(r) for s, r in self.lines if s == session))
        self.fake.write_text(json.dumps(self.data))

    def tool(self, *args, ok=True, **env):
        done = subprocess.run([sys.executable, "-B", str(HERE / "worktime.py"), *map(str, args)], env={**self.env, **env}, capture_output=True, text=True)
        self.data = json.loads(self.fake.read_text())
        self.assertEqual(done.returncode == 0, ok, done.stderr + done.stdout)
        return json.loads(done.stdout) if ok and done.stdout.startswith(("[", "{")) and args[0] != "apply" else done.stdout + done.stderr

    def assign(self, work=None, days=None):
        self.state.mkdir(parents=True, exist_ok=True)
        (self.state / "assign.json").write_text(json.dumps({"work": work or {}, "days": days or {}}))

    def minutes(self, plan):
        out = {}
        for e in plan["entries"]:
            out[e["task"]] = out.get(e["task"], 0) + e["minutes"]
        return out

    def posts(self):
        return [c for c in self.data["calls"] if "POST" in c and "time_entries" in c[1]]

    # ---- the plan of a day

    def test_fills_the_day_and_absorbs_work_without_a_ticket(self):
        self.pull(1, "feat/a", A)
        self.pull(2, "feat/b", B)
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.work(TUESDAY, "10:00", "10:30", "feat/b")
        self.work(TUESDAY, "10:30", "12:00", "feat/none")
        self.work(TUESDAY, "15:00", "16:00", "main", cwd="/tmp/other")
        self.work(TUESDAY, "18:00", "20:00", "feat/b")
        self.store()
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual(self.minutes(plan), {A: 300, B: 150})
        self.assertEqual(plan["spans"], {A: "09:00-09:59 (session)", B: "10:00-10:29 (session)"})
        self.assertEqual([plan["entries"][0]["start"], plan["entries"][-1]["end"]], ["08:30", "17:00"])
        self.assertEqual(plan["warnings"][:1], ["60 minutes had activity only outside Lynx-Business; tickets absorb them."])
        self.assertFalse(any("No activity" in x for x in plan["warnings"]))

    def test_the_span_ends_at_the_last_commit_or_pr_update(self):
        commit = lambda clock, day="2026-11-17", who="me": {"commit": {"authoredDate": f"{day}T{clock}:00+01:00", "authors": {"nodes": [{"user": {"login": who}}]}}}
        nodes = lambda *items: {"nodes": list(items)}
        by = lambda who, field, at, name: {who: {"login": name}, field: f"2026-11-17T{at}:00+01:00"}
        cases = [  # (pull fields, the end of the span of a session from 09:00 to 15:59, the author)
            ({"commits": nodes(commit("10:00"), commit("11:00"))}, "11:00 (commit or PR update)", "me"),
            ({"commits": nodes(commit("11:00")), **by("mergedBy", "mergedAt", "14:30", "me")}, "11:00 (commit or PR update)", "me"),
            ({"commits": nodes(commit("10:00")), "createdAt": "2026-11-17T10:30:00Z"}, "11:30 (commit or PR update)", "me"),
            ({"commits": nodes(commit("10:00")), "userContentEdits": nodes(by("editor", "editedAt", "12:00", "me"), by("editor", "editedAt", "13:00", "bot"))}, "12:00 (commit or PR update)", "me"),
            ({"timelineItems": nodes(by("actor", "createdAt", "12:30", "me"))}, "12:30 (commit or PR update)", "me"),
            ({"commits": nodes(commit("10:00", "2026-11-16")), **by("mergedBy", "mergedAt", "14:30", "me")}, "14:30 (merge)", "me"),
            (by("mergedBy", "mergedAt", "14:30", "other"), "15:59 (session)", "me"),
            ({"commits": nodes(commit("08:40"), commit("19:00"))}, "15:59 (session)", "me"),
            ({"commits": nodes(commit("10:00", who="other")), "comments": nodes(by("author", "createdAt", "12:00", "me"))}, "12:00 (commit or PR update)", "other"),
        ]
        for fields, end, author in cases:
            with self.subTest(fields=fields):
                self.setUp()
                self.pull(1, "feat/a", A, author=author)
                self.data["pulls"][0] |= fields
                self.work(TUESDAY, "09:00", "16:00", "feat/a")
                self.store()
                [plan] = self.tool("plan", TUESDAY)
                self.assertEqual(plan["spans"], {A: f"09:00-{end}"})

    def test_the_spans_are_the_ratio(self):
        self.pull(1, "feat/a", A)
        self.pull(2, "feat/b", B)
        self.data["pulls"][0]["commits"]["nodes"] = [{"commit": {"authoredDate": "2026-11-17T15:00:00+01:00", "authors": {"nodes": []}}}]
        self.work(TUESDAY, "09:00", "09:05", "feat/a")  # 5 hours without lunch
        self.work(TUESDAY, "09:00", "11:30", "feat/b")  # 2.5 hours
        self.store()
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual(self.minutes(plan), {A: 300, B: 150})

    def test_a_branch_name_used_again_and_a_pull_without_an_update(self):
        self.pull(1, "feat/a", A, state="MERGED")
        self.data["pulls"][0]["closedAt"] = "2026-11-17T10:00:00Z"
        self.pull(2, "feat/b", B)
        self.data["pulls"][1]["quiet"] = True
        for day in (TUESDAY, WEDNESDAY):
            self.work(day, "09:00", "12:00", "feat/a")
        self.work(WEDNESDAY, "09:00", "12:00", "feat/b")
        self.store()
        first, second = self.tool("plan", TUESDAY, WEDNESDAY)
        self.assertEqual((self.minutes(first), self.minutes(second)), ({A: 450}, {B: 450}))
        self.assertIn("Lynx-Business/app feat/a", [x["key"] for x in self.tool("draft", WEDNESDAY)["work"]])

    def test_a_possible_proposal_counts_only_after_confirmation(self):
        self.pull(1, "feat/a", A)
        self.pull(2, "feat/b")
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.work(TUESDAY, "10:00", "11:00", "feat/b")
        self.store()
        self.assign({"Lynx-Business/app#2": {"task": B, "confidence": "possible", "confirmed": False}})
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual((self.minutes(plan), plan["links"]), ({A: 450}, []))
        self.assign({"Lynx-Business/app#2": {"task": B, "confidence": "possible", "confirmed": True}})
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual((self.minutes(plan), len(plan["links"])), ({A: 225, B: 225}, 1))

    def test_parallel_tickets_share_a_slot(self):
        self.pull(1, "feat/a", A)
        self.pull(2, "feat/b", B)
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.work(TUESDAY, "09:00", "10:00", "feat/b", session="s2")
        self.store()
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual(self.minutes(plan), {A: 225, B: 225})

    def test_each_day_gets_only_its_own_work(self):
        self.pull(1, "feat/a", A)
        self.pull(2, "feat/b", B)
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.work(TUESDAY, "23:30", "23:59", "feat/a")
        self.work(WEDNESDAY, "00:01", "00:30", "feat/a")
        self.work(WEDNESDAY, "09:00", "10:00", "feat/b")
        self.store()
        first, second = self.tool("plan", WEDNESDAY, TUESDAY)
        self.assertEqual((first["date"], self.minutes(first)), ("2026-11-17", {A: 450}))
        self.assertEqual((second["date"], self.minutes(second)), ("2026-11-18", {B: 450}))
        for plan, day in ((first, TUESDAY), (second, WEDNESDAY)):
            self.assertEqual({dt.date.fromtimestamp(e["start_ms"] / 1000) for e in plan["entries"]}, {day})
        self.tool("apply", TUESDAY, WEDNESDAY)
        self.assertEqual([dt.date.fromtimestamp(int(e["start"]) / 1000) for e in self.data["entries"]], [TUESDAY, TUESDAY, WEDNESDAY, WEDNESDAY])

    def test_existing_entries_and_a_timer_are_subtracted(self):
        self.pull(1, "feat/a", A)
        self.work(TUESDAY, "09:00", "16:00", "feat/a")
        self.entry(TUESDAY, "08:40", "12:59", C)
        self.store()
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual([(e["start"], e["end"]) for e in plan["entries"]], [("14:00", "17:00")])
        self.data["running"] = {"id": "77", "user": {"id": 1}, "task": {"id": B}, "start": str(at(TUESDAY, "15:00")), "duration": "-5"}
        self.store()
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual([(e["start"], e["end"]) for e in plan["entries"]], [("14:00", "15:00")])

    def test_time_logged_in_the_lunch_hour_counts(self):
        self.pull(1, "feat/a", A)
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.entry(TUESDAY, "12:30", "14:00", C)
        self.store()
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual(self.minutes(plan), {A: 360})

    def test_placeholder_integration_branch_and_task_of_a_sub_agent(self):
        self.pull(1, "feat/a", A, base="feat/all")
        self.data["pulls"][0]["body"] += "\n<!-- #ID[en revue] -->"
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.work(TUESDAY, "10:00", "11:00", "feat/all", session="s-integrate")
        self.lines.append(("x/subagents/y", {"type": "user", "cwd": str(self.repo), "gitBranch": "feat/z", "timestamp": "2026-11-17T10:20:00Z",
                                             "message": {"role": "user", "content": "Do task Z"}}))
        (self.home / ".claude/projects/app/x/subagents").mkdir(parents=True)
        self.work(TUESDAY, "14:00", "15:00", "feat/z", user=False, session="x/subagents/y")
        self.store()
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual(self.minutes(plan), {A: 450})
        work = {x["key"]: x for x in self.tool("draft", TUESDAY)["work"]}
        self.assertEqual(work["Lynx-Business/app session " + "s-integrate"[-12:]]["kind"], "work on a shared branch")
        self.assertEqual(work["Lynx-Business/app feat/z"]["first_messages"], ["Do task Z"])

    def test_absence_and_requested_minutes(self):
        self.pull(1, "feat/a", A)
        self.pull(2, "feat/b", B)
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.work(TUESDAY, "10:00", "11:00", "feat/b")
        self.store()
        self.assign(days={"2026-11-17": {"away": [["14:00", "16:00"]], "minutes": {C: 60, B: 30}}})
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual(self.minutes(plan), {A: 240, B: 30, C: 60})
        self.assign(days={"2026-11-17": {"minutes": {C: 600}}})
        self.assertIn("more than", self.tool("plan", TUESDAY, ok=False))

    def test_a_day_without_a_ticket_writes_nothing(self):
        self.work(TUESDAY, "09:00", "10:00", "feat/none")
        self.store()
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual((plan["entries"], "No ticket found" in plan["warnings"][0]), ([], True))

    def test_removed_worktree_rebased_commit_and_review(self):
        self.pull(1, "feat/a", A, state="MERGED")
        self.pull(2, "feat/b", B)
        self.pull(3, "feat/c", C, author="other")
        self.work(TUESDAY, "09:00", "10:00", None, cwd=self.home / "wt/app/feat-a")
        self.git("checkout", "-qb", "feat/b")
        when = f"{TUESDAY} 11:02 +0100"
        self.git("commit", "-q", "--allow-empty", "-m", "b", GIT_AUTHOR_DATE=when, GIT_COMMITTER_DATE="2026-11-20 09:00 +0100")
        self.work(TUESDAY, "15:00", "15:10", "dev", session="s3")
        self.lines.append(("s3", {"type": "assistant", "cwd": str(self.repo), "timestamp": "2026-11-17T14:15:00Z",
                                  "message": {"role": "assistant", "content": "gh api -X POST repos/Lynx-Business/app/pulls/3/reviews"}}))
        self.store()
        [plan] = self.tool("plan", TUESDAY)
        got = self.minutes(plan)
        self.assertEqual((set(got), sum(got.values())), ({A, B, C}, 450))
        self.assertGreater(got[A], got[C])

    # ---- the draft

    def test_open_days(self):
        self.pull(1, "feat/a", A)
        for day in range(9, 21):
            self.work(dt.date(2026, 11, day), "09:00", "09:30", "feat/a")
        self.store()
        (self.state / "2026-11-12").mkdir(parents=True)
        (self.state / "2026-11-12/done").touch()
        code = ("import sys, datetime as dt; sys.path.insert(0, %r); import worktime as w;"
                "print([d.day for h in ((14, 59), (16, 50)) for d in [0] for d in w.open_days(dt.datetime(2026, 11, 18, *h).timestamp())])" % str(HERE))
        (self.state / "start").write_text("2026-11-10")
        done = subprocess.run([sys.executable, "-B", "-c", code], env=self.env, capture_output=True, text=True)
        self.assertEqual(done.stdout.strip(), "[10, 13, 16, 17, 10, 13, 16, 17, 18]", done.stderr)  # 11 is a holiday

    def test_draft_gives_evidence_and_writes_nothing(self):
        self.pull(1, "feat/a", A)
        self.pull(2, "feat/b", base="feat/a")
        self.pull(3, "feat/c", author="other")
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.work(TUESDAY, "10:00", "11:00", "feat/b")
        self.work(TUESDAY, "11:00", "12:00", "feat/c")
        self.store()
        draft = self.tool("draft", TUESDAY, WEDNESDAY, HC_TERMINAL_ID="")
        work = {x["key"]: x for x in draft["work"]}
        self.assertEqual(work["Lynx-Business/app#2"]["stack"], [{"pull": 1, "tasks": [A]}])
        self.assertEqual([x["kind"] for x in draft["work"]], ["your PR", "your PR", "PR of other"])
        self.assertNotIn("stack", work["Lynx-Business/app#1"])
        self.assertIn("skipped", draft["days"][1])
        self.assertFalse([c for c in self.data["calls"] if "POST" in c or "edit" in c])

    # ---- writes

    def proposal(self, confirmed=True, **pull):
        self.pull(1, "feat/a", **pull)
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.store()
        self.assign({"Lynx-Business/app#1": {"task": A, "reason": "r", "confirmed": confirmed}})
        self.tool("plan", TUESDAY)

    def test_scheduled_run_and_unconfirmed_proposal_cannot_write(self):
        self.proposal(confirmed=False)
        self.assertIn("Herdr terminal", self.tool("apply", TUESDAY, ok=False, HC_TERMINAL_ID=""))
        self.assertIn("Herdr terminal", self.tool("create", "Lynx-Business/app", "X", ok=False, HC_TERMINAL_ID=""))
        self.assertIn("not confirmed", self.tool("apply", TUESDAY, ok=False))
        self.assertEqual((self.data["entries"], len(self.data["tasks"])), ([], 3))

    def test_the_draft_turn_of_an_automation_cannot_write(self):
        self.proposal()
        self.data["labels"] = {"automation.agent": "a1", "automation.run": "m1"}
        self.store()
        run = self.home / ".local/state/herdr-automations/runs/a1/m1"
        self.assertIn("draft turn", self.tool("apply", TUESDAY, ok=False))  # no state: refused
        run.mkdir(parents=True)
        (run / "run.json").write_text('{"state": "running"}')
        self.assertIn("draft turn", self.tool("apply", TUESDAY, ok=False))
        self.assertIn("draft turn", self.tool("create", "Lynx-Business/app", "X", ok=False))
        self.assertIn("not found", self.tool("apply", TUESDAY, ok=False, HC_TERMINAL_ID="t9"))
        self.assertEqual(self.data["entries"], [])
        (run / "run.json").write_text('{"state": "done"}')
        self.tool("apply", TUESDAY)

    def test_one_unconfirmed_source_makes_the_entry_unconfirmed(self):
        self.pull(1, "feat/a", A)
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.work(TUESDAY, "10:00", "11:00", "feat/none")
        self.store()
        self.assign({"Lynx-Business/app feat/none": {"task": A}})
        self.tool("plan", TUESDAY)
        self.assertIn("not confirmed", self.tool("apply", TUESDAY, ok=False))

    def test_apply_writes_once_and_links_a_ready_pr(self):
        self.proposal()
        self.assertIn('"result": "done"', self.tool("apply", TUESDAY))
        body = self.data["pulls"][0]["body"]
        self.assertTrue(body.startswith("Why.\r\n\r\nText.\n\n- ClickUp: [Ticket a](https://app.clickup.com/t/1amwpdaaaaa)\n<!-- #1amwpdaaaaa[en revue] -->"), repr(body))
        self.assertEqual(sum(int(e["duration"]) for e in self.data["entries"]), 450 * 60_000)
        self.assertIn("already done", self.tool("apply", TUESDAY))
        self.assertEqual((len(self.posts()), self.data["comments"]), (2, []))
        self.assertIn("already done", self.tool("plan", TUESDAY, ok=False))

    def test_marker_has_no_status_for_other_pulls_and_tickets(self):
        for number, (pull, status) in enumerate([({"state": "MERGED"}, "en cours"), ({"state": "CLOSED"}, "en cours"), ({"draft": True}, "en cours"),
                                                 ({}, "en revue"), ({}, "bloqué"), ({}, "en prod"), ({}, "inconnu")]):
            with self.subTest(pull=pull, status=status):
                self.setUp()
                self.data["tasks"][0]["status"]["status"] = status
                self.proposal(**pull)
                self.tool("apply", TUESDAY)
                self.assertTrue(self.data["pulls"][0]["body"].endswith("<!-- #1amwpdaaaaa -->\n"))

    def test_the_marker_uses_the_status_at_the_write(self):
        self.proposal()
        self.data["tasks"][0]["status"]["status"] = "en prod"
        self.store()
        self.tool("apply", TUESDAY)
        self.assertNotIn("[en revue]", self.data["pulls"][0]["body"])

    def test_pull_of_another_person_and_branch_are_not_linked(self):
        self.pull(1, "feat/a", author="other")
        self.work(TUESDAY, "09:00", "10:00", "feat/a")
        self.work(TUESDAY, "10:00", "11:00", "feat/none")
        self.store()
        self.assign({"Lynx-Business/app#1": {"task": A, "confirmed": True}, "Lynx-Business/app feat/none": {"task": B, "confirmed": True}})
        [plan] = self.tool("plan", TUESDAY)
        self.assertEqual((plan["links"], self.minutes(plan)), ([], {A: 225, B: 225}))
        self.tool("apply", TUESDAY)
        self.assertFalse([c for c in self.data["calls"] if c[:2] == ["pr", "edit"]])

    def test_a_link_made_meanwhile_stays(self):
        self.proposal()
        self.data["pulls"][0]["body"] += f"\n- ClickUp: [x](https://app.clickup.com/t/{B})"
        self.store()
        self.assertIn("not changed", self.tool("apply", TUESDAY))
        self.assertNotIn(A, self.data["pulls"][0]["body"])

    def test_a_body_changed_during_the_write_stops_and_a_retry_finishes(self):
        self.proposal()
        self.data |= {"race": True, "calls": []}
        self.store()
        self.assertIn("changed during the write", self.tool("apply", TUESDAY, ok=False))
        self.assertFalse((self.state / "2026-11-17/done").exists())
        self.data["race"] = False
        self.data["pulls"][0]["body"] = "Why."
        self.store()
        self.tool("apply", TUESDAY)
        self.assertEqual((len(self.posts()), A in self.data["pulls"][0]["body"]), (2, True))

    def test_unclear_answers_make_no_duplicate(self):
        self.proposal()
        self.data["post"] = ["written", "lost"]
        self.store()
        self.assertIn("server error", self.tool("apply", TUESDAY, ok=False))
        self.assertEqual(len(self.data["entries"]), 1)
        self.tool("apply", TUESDAY)
        self.assertEqual(sum(int(e["duration"]) for e in self.data["entries"]), 450 * 60_000)

    def test_changed_entries_stop_the_write(self):
        self.proposal()
        self.entry(TUESDAY, "09:00", "10:00", C)
        self.store()
        self.assertIn("changed since the plan", self.tool("apply", TUESDAY, ok=False))
        self.tool("plan", TUESDAY)
        self.tool("apply", TUESDAY)
        self.assertEqual(sum(int(e["duration"]) for e in self.data["entries"]), 450 * 60_000)

    def test_an_entry_outside_its_day_is_refused(self):
        self.proposal()
        path = self.state / "2026-11-17/plan.json"
        plan = json.loads(path.read_text())
        for key in ("start_ms", "end_ms"):
            plan["entries"][0][key] += 86_400_000
        path.write_text(json.dumps(plan))
        self.assertIn("outside its day", self.tool("apply", TUESDAY, ok=False))
        self.assertEqual(self.data["entries"], [])

    def test_create_returns_the_ticket_with_the_same_name(self):
        self.store()
        first = self.tool("create", "Lynx-Business/app", "Nouveau", "--status", "en cours")
        again = self.tool("create", "Lynx-Business/app", " nouveau ")
        self.assertEqual((first["created"], again["created"], first["id"]), (True, False, again["id"]))


if __name__ == "__main__":
    unittest.main()
