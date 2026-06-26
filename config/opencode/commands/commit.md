# Commit

Create one Conventional Commit from the current repository changes.

Treat `$ARGUMENTS` as optional extra instructions.

## Inspect

- Confirm this is a git repository.
- Inspect `git status --short`, `git diff`, `git diff --staged`, and untracked files.
- If there are no staged, unstaged, or untracked changes, stop with:
  `No staged, unstaged, or untracked changes found. Nothing to commit.`

## Rules

- Make exactly one commit that best reflects the included changes.
- Consider staged, unstaged, and untracked files together. Do not treat staged files as a separate source of truth.
- Stage whole files/paths. Avoid hunk-level staging.
- Include untracked files that clearly belong to the change.
- Exclude suspicious untracked files, including secrets, logs, build outputs, archives, binaries, generated files, and local-only files.
- If the correct included file set or commit type is ambiguous, stop and report the ambiguity.

## Message

Use this Conventional Commit format:

```txt
<type>(<optional-scope>): <imperative summary>

<short intent-focused description>
```

- Infer the type from the diff, such as `feat`, `fix`, `docs`, `test`, `refactor`, or `chore`.
- Use a scope only when obvious.
- Always include the short body.
- Do not list files in the commit body.

## Execute

- Show the selected files and final commit message.
- Stage the selected files and create the commit immediately.
- Report the created commit hash, message, and final `git status --short`.

## Failure

If staging or committing fails, stop immediately, report the error, and show `git status --short`.
