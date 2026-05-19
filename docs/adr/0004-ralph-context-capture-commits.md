# Ralph uses Context-Capture Commits before first worktree creation

When Ralph is invoked before a Ralph worktree exists and the original checkout is dirty, Ralph will warn, show the dirty status, ask for confirmation, and on approval create a Context-Capture Commit on the current checkout branch before creating the Ralph branch and worktree.

Ralph will stage all dirty changes with `git add -A`, use the commit title `chore(ralph): capture pre-worktree changes`, and include a commit body recording user approval and the pre-commit `git status --short` output. Ralph will use normal `git commit` behavior and will not bypass hooks with `--no-verify`.

If the user declines, confirmation is unavailable, or the commit fails, Ralph stops before creating or handing off to the worktree. If a Ralph worktree already exists, Ralph may warn that dirty original-checkout changes are not part of the Ralph branch, but it will not automatically commit, merge, cherry-pick, or otherwise port those changes into the existing Ralph worktree.

This preserves the user's current planning and spec context in the branch Ralph operates on without silently omitting uncommitted files. We accept the extra confirmation step and the broad `git add -A` commit because it is explicit, auditable, and safer than an automatic commit or a hidden stash-like mechanism.
