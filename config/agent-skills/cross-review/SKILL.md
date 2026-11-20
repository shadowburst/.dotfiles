---
name: cross-review
description: Use when the user says "cross-review", or another skill asks for a review of a local change.
---

# Cross-review

Make the change more correct before it is published: a reviewer from the other provider reads the diff, and you answer each finding. Hold the change to its intent and its plan.

## Budget

- **Normal tier:** 1 round; a 2nd only while a blocker or should stays open. **Risky:** up to 3 rounds. Direct use without a tier: normal.
- Stop early when a round returns only nits. Fixes to comments, docs, or format need no new round.
- Keep a **ledger**: id, severity, outcome (`fixed`, `disagree`, `declined`), evidence.

## Round

1. **Scope.** The base is `git config branch.<head>.gh-merge-base` (deliver-pr sets it), else the PR's base, else the default branch. Diff from `git merge-base HEAD origin/<base>` through the working tree, untracked files included. Keep paths you did not change out of the diff. Run `composer test -- <file>` for each test file of the change.
2. **Brief**, in a temporary file:

   ```
   Review only. Do not edit, commit, push, comment on PRs, or start agents.
   Repo: <abs path> Base: <sha> Intent: <intent> Out of scope: <scope> Checks: <results>
   Plan: <the plan, or none>
   See: git diff <base> [-- <paths>]; git status --short (read untracked files).
   Read surrounding code. Find bugs, broken callers, and mismatch with intent.
   Compare the change with the plan. Flag any pattern the project does not
   already use, and name the existing pattern it should follow.
   Before you report a finding, try to disprove it: name the trigger, the
   reachable path, and the impact. Skip style unless it hides a bug. Flag code,
   tests, or guards the intent does not need.
   blocker = intended case wrong. should = real bug callers will hit. nit = rest.
   Reply:
   VERDICT: APPROVE or CHANGES
   S1 [blocker|should|nit] <file>:<line> <claim>. Fix: <suggestion>
   ```

   Later rounds add the ledger and the diff since the last round, and ask for the open ids and changed code only, each old id marked `resolved` or `still open: <reason>`.
3. **Run** as a background command: `<skill-directory>/scripts/run-reviewer.sh <codex|claude> <repo> <brief> <output>`: `codex` when you are a Claude model, `claude` when you are an OpenAI model. It stops the reviewer after 600 s. `CROSS_REVIEW_CODEX_MODEL`, `CROSS_REVIEW_CLAUDE_MODEL`, and `CROSS_REVIEW_EFFORT` carry a model or effort the user names. On any non-zero exit, give the same brief to a fresh sub-agent on your own model, and write `fallback: same model (<reason>)` on the PR's review line. Leave the diffed files alone while a round runs.
4. **Answer** each finding after you check it and its severity yourself:
   - Agree: the smallest fix. Before you copy a suggested fix, find how the project already solves the same problem, and follow that pattern. Prefer delete or narrow over a new lock, cache, helper, or option.
   - Disagree: say why with evidence (`file:line`, test, output).
   - Out of scope or nit: decline in one line; list it as a follow-up.

   Rerun `composer test -- <file>` for the tests of the changed code. When the review grew the diff, cut first.

## Stop

- **Agreed:** `VERDICT: APPROVE` on the current diff, and no blocker or should open.
- **Budget end:** list the open findings with both sides in one line each. The caller decides (`deliver-pr`: Risks, and draft for an open blocker). Direct use: report them.

For a PR, add to How verified: `Cross-reviewed: <N> rounds with <model>. Verdict: <approved | open: ids>`. Report the rounds, the reviewer, what changed, and the declined findings with reasons.
