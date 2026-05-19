# Superseded: Ralph Context-Capture Commits

This ADR is superseded by `docs/adr/0005-ralph-current-branch-orchestration.md`.

The previous design had Ralph create a Context-Capture Commit before first worktree creation so uncommitted original-checkout context would not be omitted from the Ralph worktree. Ralph no longer creates a worktree and no longer captures dirty context automatically.

Ralph now runs on the current checkout and current branch. At startup, if the working tree is dirty, Ralph reports the dirty status and asks how to proceed. Without matching Ralph cache for an interrupted run, Ralph stops and asks the user to commit, stash, or clean manually. With matching cache, Ralph may resume through a reconcile phase after user confirmation. Ralph never auto-commits, stashes, merges, or ports pre-existing dirty changes.
