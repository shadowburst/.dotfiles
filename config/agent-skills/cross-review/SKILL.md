---
name: cross-review
description: Use when the user says "cross-review".
---

# Cross-review

Make the change more correct before it is published: one reviewer from the other provider reads the diff, and you answer each finding until you both agree. Hold the change to its intent. Push back on scope creep with evidence.

## Budget

- 3 rounds. Round 1 is full; later rounds check only changed code and open findings.
- Extend to 5 only for security, permissions, auth, data loss, or concurrency, while a blocker or should stays open with evidence, or when the user asks.
- Stop early when a round returns only nits. Declined nits and comment, doc, or format-only fixes need no new round.
- One reviewer per round. Keep a **ledger**: id, severity, outcome (`fixed`, `disagree`, `declined`), evidence.

## 1. Scope

Run `git status --short`. Keep unrelated changes out: limit the review to the change paths when they separate cleanly; otherwise ask. After `git fetch origin`, select the base from the PR, `branch.<head>.gh-merge-base`, or the default branch, in that order. Review from `git merge-base HEAD origin/<base>` through the working tree in those paths, including untracked files; use one diff command in every round. Run the covering checks and note missing or pre-failing ones in the brief.

## 2. Pick the reviewer

The reviewer is the other provider's model: Sol for a Claude model, Opus for an OpenAI model, or the model and effort the user names.

- When your harness can start a subagent on that model, run each round as a read-only subagent.
- Otherwise run `<skill-directory>/scripts/run-reviewer.sh PROVIDER REPO_DIR BRIEF_FILE OUTPUT_FILE`, with PROVIDER `codex` or `claude`, and a 1800-second timeout. The script keeps the reviewer read-only and, for Claude, sets the `CLAUDE_CODE_ENTRYPOINT` label that keeps headless usage at the interactive rate. `CROSS_REVIEW_CLAUDE_MODEL`, `CROSS_REVIEW_CODEX_MODEL`, and `CROSS_REVIEW_EFFORT` carry the user's model and effort.

When the reviewer cannot start or fails twice, report the blocker. A same-provider model is no substitute, and a timeout or a reply without a `VERDICT:` line is no approval. Leave scoped files untouched while a round runs.

Round 1 brief, written to a temporary file:

```
Review only. Do not edit, commit, push, comment on PRs, or start subagents.
Repo: <abs path> Base: <sha> Intent: <intent> Out of scope: <scope> Checks: <results>
See: git diff <base> [-- <paths>]; git status --short (read untracked files).
Read surrounding code. Find bugs, broken callers, and mismatch with intent.
Before you report a finding, try to disprove it: name the trigger, the
reachable path, and the impact, and check caller guarantees and tests.
Skip style unless it hides a bug. Hold to the smallest change. Flag code,
tests, or guards the intent does not need. Other paths, rare cases, small
perf, extra compat: nits.
blocker = intended case wrong. should = real bug callers will hit, in intent. nit = rest.
Reply:
VERDICT: APPROVE or CHANGES
S1 [blocker|should|nit] <file>:<line> <claim>. Fix: <suggestion> (stable ids)
```

## 3. Answer findings

Check each finding and its severity yourself; another path, rare case, or small cost is a nit whatever its label.

- Agree: smallest fix. Prefer delete or narrow over a new lock, cache, helper, or option. Add one focused test that fails without the fix when the intent needs it.
- Disagree: say why with evidence (file:line, test, output).
- Out of scope or nit: decline in one line and list it as a follow-up.

Update the ledger, re-run checks and `git diff --shortstat <base>`. When review grew the diff, cut first.

## 4. Next round

Start one only while budget remains and a blocker or should is open, behavior code changed, or approval does not cover the current behavior diff. Each round is a fresh reviewer: send the round 1 brief, the ledger, the same base diff, and the change since the last round. Ask it to check open ids and changed code only, and to mark each old id `resolved` or `still open: <reason>`.

## 5. Stop

- **Agreed:** `VERDICT: APPROVE` on the current behavior diff, no blocker or should open, no concern of your own.
- **Stuck:** an item stays disputed after two replies, or the budget ends. Ask the user with the question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex), showing both sides in 2-3 lines each and your recommendation first. Budget end is no approval.

Push only when the user or a calling skill asked to publish. On a PR, add one line to the PR body above any model line: `Cross-reviewed: <N> rounds with <model>. Verdict: approved`.

Report rounds, reviewer model, what the review changed, diff size before and after, fixed and declined findings with reasons, and whether anything was pushed.
