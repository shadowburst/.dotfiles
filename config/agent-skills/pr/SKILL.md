---
name: pr
description: Create or update a review-ready GitHub pull request for the current branch using committed branch state.
---

# PR

Build a PR for the current branch without confirmation prompts.

## Arguments

- `$ARGUMENTS` is one free-form instruction block.
- Parse it once into these intent keys:
  - `base`: explicit base branch (optional)
  - `draft`: true/false
  - `ready`: true/false
  - `title`: custom PR title override (optional)
  - `body`: custom PR body override (optional)
  - `skipSync`: true/false
- If both `draft` and `ready` are true, prefer draft.

## Workflow

1. **Repository checks**
   - Confirm this is a git repository.
   - Determine current branch: `git branch --show-current`.
   - Refuse when running on a base branch (default branch / branch pointed by `origin/HEAD`).
   - If uncommitted changes exist, continue using committed state only and note they are excluded.
2. **Remote check**
   - Verify the configured `origin` remote is GitHub.
   - If not GitHub, do not call GitHub APIs; output a complete PR title/body draft and stop.
3. **Existing PR and base resolution**
   - Check for existing PR for current branch via `gh pr view --json url,title,baseRefName`.
   - Choose base branch (first successfully resolved):
     1. explicit `base` intent
     2. existing PR base
     3. GitHub default branch (`gh repo view --json defaultBranchRef`)
     4. `origin/HEAD`
     5. `main`, then `master`
   - If base cannot be determined, stop and report ambiguity.
4. **Sync branch safely**
   - If intent key `skipSync` is true, skip this step and continue.
   - Otherwise:
     - Check upstream state (`git rev-list --left-right --count` equivalent).
     - If branch is unpublished: `git push -u origin <branch>`.
     - If ahead only: `git push`.
     - If behind or diverged: stop and request manual sync.
5. **Build PR content from committed state only**
   - `git diff <base>...HEAD`
   - `git log <base>..HEAD --oneline`
   - `git diff --name-only <base>...HEAD`
6. **Infer or apply title/body**
   - If intent has `title`, use it.
   - If intent has `body`, use it as the exact body.
   - Otherwise infer title from commit history:
     - Use a concise Conventional Commit-style title.
     - If one commit is representative, reuse it as title when meaningful; otherwise synthesize dominant change with `feat|fix|docs|test|refactor|chore` (+ optional scope when obvious).
   - If title intent is ambiguous, stop and report the required user input.
   - Build body:

```md
## Purpose

<why this branch exists>

## Changes

- review-relevant change
- review-relevant change

## Review Notes

<tradeoffs, risks, migration notes, or "None">
```

7. **Create or update**
   - If PR exists: `gh pr edit --title <title> --body <body>`
   - If not: `gh pr create --base <base> --head <branch> --title <title> --body <body>`
   - Add `--draft` when intent key `draft` is true.
8. **Report**
   - Show resolved base, whether created or updated, PR URL, title, and body draft.

## Failure mode

If push/create/update fails, stop immediately, report the error, and include `git status --short`.