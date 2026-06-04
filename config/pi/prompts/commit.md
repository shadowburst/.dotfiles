---
description: Plans simple Conventional Commits from all current changes, asks for approval, then creates the approved commits.
---

# Commit

Plan and create Conventional Commits from the current git repository changes.

## Workflow

1. Confirm the current directory is inside a git repository.
2. Inspect all current changes:
   - `git status --short`
   - `git diff`
   - `git diff --staged`
   - `git ls-files --others --exclude-standard`
3. If there are no staged, unstaged, or untracked changes, stop with:
   `No staged, unstaged, or untracked changes found. Nothing to commit.`
4. Propose a commit plan from the whole working directory.
5. Ask for approval before staging or committing.
6. After approval, re-check `git status --short`. If anything changed since the plan, stop and make a new plan.
7. Create the approved commits.
8. Report the created commit hash(es), message(s), and final `git status --short`.

## Planning rules

- Consider staged, unstaged, and untracked files together. Do not treat staged files as a separate source of truth.
- Prefer one commit by default.
- Split into multiple commits only when changes are clearly unrelated or when one commit naturally depends on another.
- Use whole files/paths for staging. Avoid fragile hunk-level staging; if unrelated edits are mixed in one file, keep that file in a single commit.
- Include untracked files that clearly belong to the change.
- Flag and exclude suspicious untracked files unless the user explicitly approves them, including secrets, logs, build outputs, archives, binaries, generated files, and local-only files.

## Commit messages

Use Conventional Commit messages:

```txt
<type>(<optional-scope>): <imperative summary>

<short intent-focused description>
```

- Infer the type from the diff, such as `feat`, `fix`, `docs`, `test`, `refactor`, or `chore`.
- Use a scope only when it is obvious from the changed area.
- Ask only when the type would otherwise be misleading.
- Always include a short description body.
- Do not list files in the actual commit body; list them only in the proposed plan.

## Proposed plan format

Show the plan in this compact shape:

```md
## Proposed commits

### 1. feat(scope): summary

Description:
Short intent-focused body.

Files:
- path/a
- path/b

### 2. fix(scope): summary

Description:
Short intent-focused body.

Files:
- path/c

## Notes

- Only include this section when there is something useful to flag.
```

Do not show exact commands unless the user asks.

## Execution failure

If staging or committing fails, stop immediately, report the error, and show `git status --short`.
