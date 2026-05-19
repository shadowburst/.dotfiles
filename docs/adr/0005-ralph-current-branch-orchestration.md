# Ralph runs on the current branch instead of creating a worktree

Ralph will run its deterministic task loop on the current checkout and current branch. It will not create a separate git worktree, will not create a Ralph feature branch, and will not perform Automatic or Manual Handoff between Pi processes.

Before Ralph starts, it requires a clean working tree. If `git status --porcelain` is not empty, Ralph stops and asks the user to commit, stash, or clean the changes manually. During a task, Ralph may leave the tree dirty while implementation, validation, review, fix, and refactor phases are in progress. After a verified task, Ralph commits the task changes, including the Feature Spec checkbox update, and returns the working tree to clean before selecting the next task.

This replaces the previous worktree and handoff design. The worktree flow created fragile process-boundary assumptions because a Pi Extension command cannot reliably replace the active interactive Pi process with a new cwd-bound process. Running on the current branch removes that failure mode and makes Ralph primarily a deterministic orchestration and review tool rather than a branch manager.

We accept that the user is responsible for choosing or creating the branch before invoking Ralph. This keeps Ralph's git behavior easier to audit: clean tree at start, one conventional commit per verified task, optional refactor commits, final branch review against the recorded start commit, and cache cleanup after final review passes.
