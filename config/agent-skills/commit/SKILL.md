---
name: commit
description: Inspect current git changes and create Conventional Commit(s) from staged, unstaged, and untracked files (no confirmation step).
---

# Commit

Create conventional commits from the current repository changes in one pass.

## Arguments

- `$ARGUMENTS` is one free-form instruction block.
- Parse it once into these intent keys:
  - `mode`: `single` (default) or `split`
  - `amend`: true/false
  - `type`: Conventional Commit type (optional)
  - `scope`: Conventional Commit scope (optional)
  - `message`: commit summary override (single-commit mode)
  - `includeUntracked`: boolean
  - `allow`: list of path/glob patterns
  - `exclude`: list of path/glob patterns
- If intent conflicts, keep the last applicable instruction.

## Workflow

1. **Validate context**
   - Confirm current directory is inside a git repository.
   - Run:
     - `git status --short`
     - `git diff`
     - `git diff --staged`
     - `git ls-files --others --exclude-standard`
2. **No-op check**
   - If there are no staged, unstaged, or untracked files, stop with:
     `No staged, unstaged, or untracked changes found. Nothing to commit.`
3. **Select files**
   - Treat staged, unstaged, and untracked files together.
   - Exclude suspicious untracked files unless intent has `includeUntracked` or matching `allow` entries.
   - Exclude anything matching `exclude` when specified.
   - Include untracked files that clearly belong to the work.
4. **Plan commits**
   - Default: prefer a single commit.
   - Use intent `mode` to choose single vs split commits.
   - Use whole-file staging (`git add <paths>`), avoid hunk-level staging.
5. **Compose messages**
   - Commit type and scope come from intent keys (`type`, `scope`) when set, otherwise infer from diff.
   - Use this exact format:

```text
<type>(<optional-scope>): <imperative summary>

<short intent-focused body>
```

   - If intent has `message`, use it (must remain imperative), especially for single-commit mode.
6. **Execute**
   - Stage each planned file group.
   - Commit immediately with the inferred/forced message.
   - If intent key `amend` is true, use `--amend` on the first commit operation.
   - Capture each commit hash.
7. **Report**
   - Show each planned commit with hash, message, and selected files.
   - Show final `git status --short`.

## Failure mode

If staging or committing fails, stop immediately, report the error, and include the current `git status --short`.