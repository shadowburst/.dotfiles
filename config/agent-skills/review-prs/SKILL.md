---
name: review-prs
description: Review all open GitHub pull requests that are new or changed since your last submitted review.
---

# Review PRs

Classify open PRs, delegate each needed review to `review-pr`, and aggregate outcomes. Findings belong to `review-pr`.

1. Resolve the repository and authenticated login (`gh repo view`, `gh api user`). Enumerate every open PR with pagination (`gh api --paginate 'repos/OWNER/REPO/pulls?state=open&per_page=100'`). If authentication or enumeration fails, report the sweep as unresolved and stop. For each PR, paginate `repos/OWNER/REPO/pulls/NUMBER/reviews`. Classify it as covered if any review by the authenticated login has a non-null `submitted_at` and a `commit_id` matching its current `head.sha`; classify it as needing review otherwise. If its review history cannot be fetched, classify it as unresolved. Classification is complete when every enumerated PR is covered, needs review, or unresolved.
2. For each PR needing review, assign and record a unique temporary worktree path and give the PR to its own subagent. Invoke `subagents` for dispatch and model/effort selection. Pass the repository, PR number or URL, and worktree path; instruct the subagent to invoke `review-pr` and return its review URL and outcome or its error. Dispatch independent reviews in parallel.
3. Collect every subagent result, then re-fetch each delegated PR's current head and paginated reviews. Count a delegated review as submitted only when its returned URL identifies a submitted review by the authenticated login whose `commit_id` matches the current head. Report reviewed PRs with links and outcomes, already-covered PRs, and unresolved PRs. Mark failed reviews and reviews of superseded heads unresolved. Confirm every recorded worktree path is removed, removing leftovers only from those recorded paths.

Done when every open PR is reviewed at its current head, already covered by your submitted review at that head, or explicitly unresolved, and every recorded temporary worktree is gone.
