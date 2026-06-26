# PR

Create or update a review-ready GitHub pull request for the current branch.

Treat `$ARGUMENTS` as optional extra instructions.

## Inspect

- Confirm this is a git repository.
- Determine the current branch with `git branch --show-current`.
- Refuse to create or update a PR from the base branch itself.
- If there are uncommitted changes, briefly note that they will be ignored. Use only committed branch state.
- Verify the remote is GitHub. If not, stop and provide a complete PR title/body draft.

## Resolve

- Check for an existing PR with `gh pr view --json url,title,baseRefName`.
- Choose the base branch in this order: `$ARGUMENTS`, existing PR base, GitHub default branch, `origin/HEAD`, `main`, `master`.
- If the base branch cannot be determined safely, stop and report the ambiguity.
- Push the branch if unpublished or strictly ahead of upstream.
- If the branch is behind upstream or diverged, stop and explain that manual sync is needed.

## Content

- Use only committed branch state: `git diff <base>...HEAD`, `git log <base>..HEAD --oneline`, and `git diff --name-only <base>...HEAD`.
- Infer a concise Conventional Commit-style PR title from the commits and diff.
- Reuse a single meaningful Conventional Commit title when appropriate.
- Otherwise synthesize the dominant change with a type such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `chore:`.
- Include a scope only when obvious.
- If the title remains ambiguous, stop and report the ambiguity.

Use this body structure:

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

## Execute

- Show the resolved base branch, whether this is a new or existing PR, the title, and the body.
- For a new PR, run `gh pr create --base <base> --head <branch> --title <title> --body <body>`.
- If `$ARGUMENTS` requests a draft PR, include `--draft`.
- For an existing PR, run `gh pr edit --title <title> --body <body>`.
- Report the PR URL.

## Failure

If creating or updating the PR fails, stop immediately and report the error.
