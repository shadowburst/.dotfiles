---
name: deliver-pr
description: Use when the user says "deliver" or "deliver-pr".
---

# Deliver PR

The user is not watching this thread. Updates and the final message go unread until long after you stop, so own the work from its current state to a PR that is **ready to merge**, then hand it over. The merge stays with the user.

## Grant

A "deliver" request gives permission to:

- Create a branch, commit, push, rebase, fix conflicts, and use `--force-with-lease` on this task's branch.
- Use the test methods that evidence needs without asking first: running the app or a dev server, browser automation, screenshots, and visual checks. Rules that name _how_ to test (the command, fixture, or check) still apply; only the ask-first step is lifted, and only for this task.

Outside the grant, always: merging, auto-merge, merge queues, pushes to the default branch, branch-protection bypasses, deleting data, touching production, changing things outside the repo, closing a PR, force-pushing any other branch. Disable auto-merge and leave any merge queue before work begins and before each push; report it. When automatic merging cannot be prevented, report the blocker first.

## Steps

1. **Finish the change.** Work in the current checkout with all its uncommitted changes. Resolve the base from the user's choice, existing PR, then `branch.<head>.gh-merge-base`; ask if unknown. Record the base there and align any existing PR. Make the smallest change that meets the request.
2. **Gather evidence.** Observe evidence for every change before it is pushed; see [Evidence](#evidence).
3. **Cross-review.** Run the `cross-review` skill until it agrees or asks the user.
4. **Publish.** Before every `publish-pr` run, here and in step 5, fetch the recorded base and rebase onto it when it moved, then gather evidence again for what the rebase touched. Run the `publish-pr` skill and ask it for ready for review, so review bots see code that cross-review already approved. Keep the cross-review line in the PR body.
5. **Watch.** Run the `watch-pr` skill until the PR is ready to merge or blocked. Gather evidence for each fix before it is pushed.
6. **Hand off.** See [Handoff](#handoff).

Stay active from step 1 to step 6. Ending the turn while checks or bots are pending stops the work, because nobody will prompt you again; `watch-pr`'s waiter is what wakes you.

## Evidence

Select evidence with step 2 and the execution evidence format of `publish-pr`'s `EVIDENCE.md`, and observe it yourself in this session; `publish-pr` later publishes it. Two additions hold here:

- When the behavior has no test and the repo has a test setup, add one focused test that fails without the change.
- For UI and runtime behavior, run the app and look at it; green mocked tests show nothing about the user experience.

A change without evidence is a change without full confidence: ask the user.

## Merge gate

Ready to merge means all of these hold on the latest head:

- Evidence covers every change in the final diff, including conflict fixes.
- The validation report names the head and passes; required checks are green.
- Review bots finished, and each finding is fixed or answered with a written reason.
- No review thread is open and no human review requests changes.
- The branch is up to date with its base, and GitHub reports it mergeable.

## Asking the user

A question in a normal message goes unseen and the thread looks done. Ask with the harness's question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex), putting the PR link, the blocker, and the options with your recommendation first. Ask only when you cannot continue alone: a change without evidence, a merge gate you cannot fix, a step outside the grant, an ambiguous goal that changes the result, or another PR that makes this one obsolete. Decide everything else with sensible defaults and list those decisions in the handoff. Without a question tool, or without an answer, take the safe path: leave the PR open and start the final message with the question.

## Handoff

Fetch the base and check the live PR's head, base, checks, reviews, and mergeability. Confirm it is open, not a draft, and not set to merge without the user; when someone else merged it, report that instead. Classify it:

- **Ready to merge:** the merge gate passes.
- **Waiting for approval:** only a required human approval remains, and that is the actual blocker.
- **Blocked:** what prevents readiness, what you tried, and what is needed.

Report the PR link, final head, classification, evidence, cross-review outcome, decisions made for the user, and remaining risks. State that the PR is open and unmerged.
