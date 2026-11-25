---
name: deliver-pr
description: Use when the user says "deliver" or "publish", or asks to open or refresh a PR or its evidence.
---

# Deliver PR

Take the task to a PR that is ready to merge; the merge stays with the user. "Publish" on a branch with a PR refreshes it (steps 6–9) without new implementation.

## Mode

- **Interactive** (default). Ask only: (1) plan confirmation before risky or design-level work, in one batched call; (2) a product or UX choice that changes what users see and has no clear default; (3) money, or a step outside the grant.
- **Auto**: `deliver auto`, or "auto" or "don't ask" in the request. Ask nothing. Blocked: publish a draft PR whose body starts with `Needs you:`, one line per item, then stop.

Both modes take these defaults and list each under Decisions taken. Running or rerunning tests, review rounds within budget, ready state, and replacing screenshots are yours to decide.

| Situation | Default |
|---|---|
| Product or UX choice (auto) | the recommended option |
| Change you could not verify | `not verified: <what>` in How verified |
| Failure the base also has | a note in Risks; no fix here |
| No ClickUp task found | skip ClickUp |
| Unrelated changes in the checkout | commit only your paths |
| Paid API call, missing prerequisite | spend and install nothing |
| Review budget ends, finding open | list it in Risks; open blocker: draft |
| Another session works in this checkout | stop |

**Grant:** commit, push, rebase on the base, `git push --force-with-lease` on this task's branch, run any test or capture, create and edit this PR, write to its ClickUp task. Merging, auto-merge, other branches, closing a PR, deleting data, production, and anything outside the repo stay with the user.

## Tier

From `git diff --stat <base>` (or the plan); the user can override it ("deliver risky").

- **Trivial:** only docs, translations, comments, formatting, CI scripts, or test deletions; or a conflict-only rebase.
- **Risky:** migrations, auth, permissions, money, queues or concurrency, lock files, or more than 400 changed lines or 15 files.
- **Normal:** everything else.

**Base:** the PR's base, then an existing `git config branch.<head>.gh-merge-base`, then this repo's `branches.integration` in `.clickup.json`, then the default branch. Store it in `branch.<head>.gh-merge-base`; the other skills and `scripts/verify.sh` read that key. In a stack, the base is the PR directly below; store it again when the stack changes.

## Steps

1. **Start** in the current checkout, on the task's branch; all steps run there. Read the ClickUp task once; its ID comes from the branch name, the session's messages, or the PR's `- ClickUp:` line.
2. **Plan** (normal, risky) in 5–10 lines: goal, approach, the existing pattern you follow (`file:line`), what stays out. Use the shape the code already has; add a layer, abstraction, or registry only when the task needs one, in its smallest version, listed under Decisions taken (auto mode: the PR stays draft). Interactive, risky or design-level: the user confirms the plan once; a plan or design already confirmed in this session (grilling, a summary) counts. Auto: the plan goes at the top of the PR body.
3. **Before capture** (UI change), before the first edit: [EVIDENCE.md](EVIDENCE.md).
4. **Build.** Normal and risky: first a test that fails without the change; keep its red and green output as the behaviour evidence. Before each commit: `composer fix` and `pnpm run fix` (those the repo has). Conventional commits.
5. **Review** (normal, risky): the `cross-review` skill, with the tier and the plan.
6. **Push.** `git fetch`; when the base moved, rebase on `origin/<base>`; `git push --force-with-lease`.
7. **Verify.** UI change: capture the after state ([EVIDENCE.md](EVIDENCE.md)). Then `scripts/verify.sh --full` (normal, risky) or `scripts/verify.sh` (trivial), per [Tests](#tests). On failure: fix, commit, push, `scripts/verify.sh`.
8. **PR.** Write the [body](#pr-body). Title: a conventional commit that the repo's `.github/workflows/pr-title.yml` accepts. New PR, once: `gh pr create --base <base> --body-file <file> [--attach '<path>#<description>' …]`, ready unless blocked. Existing PR: `gh pr edit --body-file` only when the content changed.
9. **ClickUp**, once at the end: [ClickUp](#clickup).
10. **Report:** PR link, ready or draft, decisions, risks. In a stack, the stack is the task: go on to the next PR, and report once, after the top PR.

**Ready to merge:** `local/verify` success on the head (plus, for normal and risky, the one full run of this PR or its stack top, with each failed test fixed and passing alone), no open review blocker or should, and GitHub reports the PR mergeable.

## Tests

While coding and between review rounds, run the tests the change needs. Under Composer, options need `--`: `composer test -- <file> --filter=<name>`. Verify runs on the host, after the push:

- **`scripts/verify.sh`** on each head you push: static checks, then the test files changed since the stack's base. Status `changed: …`. In a stack, run it on the top PR only: its success marks every PR below (`… (via stack top <sha>)`).
- **`scripts/verify.sh --full`** once per PR (normal, risky); in a stack, once on the top PR after the stack's review. That run stays valid, pass or fail: run it again only when the user asks. It runs both test steps, so it lists every failure. After a failure: fix each failed test, run its file, push, and run `scripts/verify.sh`. Status `full: …`.
- Run verify in the background (`timeout 90m scripts/verify.sh --full` for the full run) and act on its exit; no "still waiting" turns, no `sleep` loops. Exit 124 is a blocker to report (auto: draft with `Needs you:`), not a reason to run it again.
- A failing step prints its end. Read `storage/logs/verify.log` only when that is not enough, and only the lines you need (`grep`, `tail`).
- **Flaky:** a test that fails in the `--full` run and passes alone. Add Pest's `->flaky()` to it with `// Flaky under parallel load (found <YYYY-MM-DD>).`, commit, run `scripts/verify.sh`, and name it in How verified.
- A repo without `scripts/verify.sh`: run its documented checks, then `gh api repos/{owner}/{repo}/statuses/<sha> -f state=success -f context=local/verify -f description="full: <result>"`.

## PR body

`Needs you:` first, only when blocked. Then `##` sections:

- **Why:** problem and outcome, 1–2 sentences.
- **What changed:** user-visible behaviour first, then what a reviewer needs.
- **How verified:** tier; red-then-green test output; the commit of the full run (in a stack, the top PR's run) and its result; after a failure, each failed test with its fix; tests marked flaky; review rounds and reviewer model; UI assets as `![<description>](<path>)`, or "before not captured".
- **Decisions taken.**
- **Risks:** rollback (two-way, or one-way and what is lost), blast radius, flaky tests, base failures.

Last lines, when a task is linked (`ship-release` and ClickUp's GitHub link read them):

```markdown
- ClickUp: [<task name>](<task URL>)
<!-- #<task ID>[<statuses.roadmap.review>] -->
```

## ClickUp

Skip without a task. IDs: `.clickup.json` (format: the `ship-release` skill's CONFIG.md).

- **Fields:** an empty `fields.release_note` gets a [release note](#release-note); `fields.deploy_actions` gets each missing line: `ENV+ KEY=<à renseigner>` for a new environment key, `ENV- KEY` for a removed one, `RUN <command>` for a one-time command. Migrations need no line. Keep lines people wrote; write a value only when the repo holds it in plain text and it is no secret.
- **Assets** the task does not have yet: [EVIDENCE.md](EVIDENCE.md#clickup).
- **One comment** `PR summary · <owner>/<repo>#<n>`: PR link; **Problem**, **Solution**, **Conclusion** in plain domain words, no code; asset names. On a refresh, edit it only when its content changed.

### Release note

One sentence for the client, in the space's language: what changes for the user, in product words, no technical term. A security fix reads « Sécurité renforcée de … » and never describes the flaw.

> ❌ Fix du z-index sur les dropdowns
> ✅ Correction : les menus déroulants s'ouvrent de nouveau normalement.
