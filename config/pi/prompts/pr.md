---
description: Create or update a GitHub PR for the current branch
argument-hint: "[base/draft/title instructions]"
---

Create or update a review-ready GitHub pull request for the current branch.

Use any arguments as optional natural-language instructions: `$ARGUMENTS`.
They may mention a base branch, draft PR, title/body preference, or other PR-specific request.

Package committed branch state for review; do not run tests or perform a code review unless explicitly asked.

## Steps

1. Inspect repository state

- Confirm this is a git repository.
- Determine the current branch with `git branch --show-current`.
- Refuse to create or update a PR from the base branch itself.
- If there are uncommitted changes, briefly note that they will be ignored. Use only committed branch state.
- Verify the remote is GitHub. If not, do not create/update remotely; instead provide a complete PR title/body draft.

2. Detect existing PR and choose base

- Check for an existing PR for the current branch with `gh pr view --json url,title,baseRefName`.
- Choose the base branch in this order:
  1. base branch explicitly mentioned in `$ARGUMENTS`
  2. existing PR base, when updating an existing PR
  3. GitHub default branch via `gh repo view --json defaultBranchRef`
  4. local `origin/HEAD`
  5. `main`, then `master`
- Report the chosen base. Ask only if it cannot be determined safely.

3. Sync branch safely

- Check upstream/ahead/behind state.
- If the branch is unpublished, push it with `git push -u origin <branch>`.
- If the branch is strictly ahead of upstream, push it.
- If the branch has diverged from upstream or is behind upstream, stop and explain that manual sync is needed.

4. Gather committed PR context

Use only committed branch state:

- `git diff <base>...HEAD`
- `git log <base>..HEAD --oneline`
- `git diff --name-only <base>...HEAD`

5. Infer title

Infer a concise Conventional Commit-style PR title from the commits and diff.

- Reuse a single meaningful Conventional Commit title when appropriate.
- Otherwise synthesize the dominant change with a type such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `chore:`.
- Include a scope only when obvious.
- Ask before create/update if the title remains ambiguous.

6. Build body

Use this structure:

```md
## Purpose

<Why this branch exists.>

## Changes

- <Review-relevant change>
- <Review-relevant change>

## Review Notes

<Known tradeoffs, risky areas, migration notes, or "None">
```

Add optional sections such as `## Screenshots`, `## Follow-ups`, or `## Out of Scope` only when clearly relevant or requested.
Do not infer reviewers, labels, assignees, milestones, projects, or issue-closing keywords unless explicitly requested.

7. Confirm and create or update

Show the resolved base branch, whether this is a new or existing PR, the title, and the full body draft.

- For a new PR: ask for explicit confirmation before running `gh pr create --base <base> --head <branch> --title <title> --body <body>`.
- If `$ARGUMENTS` requests a draft PR, include `--draft`.
- For an existing PR: ask for explicit confirmation before running `gh pr edit --title <title> --body <body>`.
- After creation or update, report the PR URL.
