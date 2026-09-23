---
name: review-prs
description: Sweep a GitHub repository's open PRs, reviewing those you have not reviewed or whose heads changed since your last submitted review. Use when asked to review all outstanding PRs.
---

# Review PRs

Coordinate reviews of open PRs in the current GitHub repository. Each PR is reviewed and submitted through the `review-pr` skill; this skill selects PRs and aggregates outcomes, not findings.

1. Resolve the repository and authenticated login (`gh repo view`, `gh api user`). Enumerate **all** open PRs, not just the default first page (`gh api --paginate 'repos/OWNER/REPO/pulls?state=open&per_page=100'`). For each PR, paginate `repos/OWNER/REPO/pulls/NUMBER/reviews`; find your most recent **submitted** review (`user.login`, `submitted_at`, `commit_id`). Include PRs without one, or whose current `head.sha` differs from its `commit_id`. Skip PRs already reviewed at the current head. If any list or history request fails, report that PR as unclassified rather than silently skipping it.
2. Give each eligible PR to its own subagent. Follow the `subagents` skill for dispatch, selecting a valid model/effort. Pass the repository and PR number/URL, instruct it to read and run `review-pr`, submit its GitHub review, account for prior comments, use a distinct temporary worktree, clean it up, and return the review URL or error. Run independent reviews in parallel when resources permit; do not share worktree paths or mutate the user's checkout.
3. Collect every subagent result. Verify which reviews were actually submitted; report links and outcomes per PR, skipped PRs, and failures. If a review fails or the PR head advances during review, leave it flagged for a subsequent pass rather than claiming it was covered. Confirm temporary worktrees created for this sweep are removed; clean up only those created by this sweep.

Done when each open PR is either reviewed at its current head, skipped because your submitted review already covers that head, or explicitly reported as unresolved.
