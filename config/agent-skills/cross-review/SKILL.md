---
name: cross-review
description: Use when the user says "cross-review", or another skill asks for a review of a local change.
---

# Cross-review

Make the change more correct before it is published: another agent reads the diff, and you answer each finding. Hold the change to its intent and its plan.

**Reviewer:** a fresh agent, started with any tool the environment offers. Model: the one the user or their instructions name, else another provider's, else your own. When a reviewer fails, try another one. When you can start none, skip the review and report the reason; on a PR, write it in Merge Danger, and a risky change stays draft.

**Rounds:** normal tier, or direct use without a tier: 1; a 2nd only while a blocker or should stays open. Risky: up to 3. Stop early when a round returns only nits. Fixes to comments, docs, or format need no new round.

## Round

1. **Scope.** The base is `git config branch.<head>.gh-merge-base` (deliver-pr sets it), else the PR's base, else the default branch. Diff from `git merge-base HEAD origin/<base>` through the working tree, untracked files included. Keep paths you did not change out of the diff. Run the tests of the change.
2. **Brief** the reviewer:
   - Review only: no edit, commit, push, PR comment, or other agent.
   - The repository path, the base SHA, the diff command, and the untracked files.
   - The intent, the plan, what is out of scope, and the test results.
   - Find bugs, broken callers, mismatch with the intent or plan, patterns the project does not already use (name the one to follow), and code, tests, or guards the intent does not need. Skip style unless it hides a bug.
   - Try to disprove each finding before reporting it: trigger, reachable path, impact.
   - Reply with approve or changes, then the findings: **blocker** (the intended case is wrong), **should** (a real bug callers will hit), or **nit** (the rest), each with `file:line` and a suggested fix.

   A later round adds the earlier findings with your answers, and covers the open ones and the code changed since.
3. **Run** it, and leave the diffed files alone until it replies. Then check that `git status` and HEAD are unchanged.
4. **Answer** each finding after you check it and its severity yourself:
   - Agree: the smallest fix. Before you copy a suggested fix, find how the project already solves the same problem, and follow that pattern. Prefer delete or narrow over a new lock, cache, helper, or option.
   - Disagree: say why with evidence (`file:line`, test, output).
   - Out of scope or nit: decline in one line; list it as a follow-up.

   Rerun the tests of the changed code. When the review grew the diff, cut first.

## Stop

- **Agreed:** the reviewer approves the current diff, and no blocker or should is open.
- **Rounds used:** list the open findings with both sides in one line each. The caller decides (`deliver-pr`: `Open finding:` lines in Merge Danger, and draft for an open blocker). Direct use: report them.

For a PR, add to Evidence: `Cross-reviewed: <N> rounds with <model>. Verdict: <approved | open findings>`. Report the rounds, the reviewer, what changed, and the declined findings with reasons.
