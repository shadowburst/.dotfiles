---
name: delegate
description: Delegate bounded implementation, research, or review to another agent harness in a visible Herdr pane. Use when independent parallel work or cross-harness delegation helps.
---

# Delegate

Use this skill from any harness inside Herdr. The parent keeps task ownership, review, and integration. Delegates do their assigned work directly; they cannot delegate again.

1. **Check the boundary.** Require `HERDR_ENV=1` and a caller pane. If this is a delegated session, do the work directly instead. Read the helper interface:

   ```sh
   bash <skill-directory>/scripts/delegate.sh --help
   ```

   Use the helper for task and pane operations. It keeps focus in the parent, splits right when no right column exists, and otherwise appends below the rightmost column. It preserves unrelated panes and refuses splits that do not fit. Outside Herdr, report the requirement and stop.

2. **Write the brief.** Choose an installed harness: `codex`, `claude`, `pi`, or `opencode`. Honor the user's harness, model, and effort choices. Use optional `--model MODEL` and `--effort LEVEL` at task creation; omit them to use the harness defaults. Model IDs and effort levels follow the selected harness, not a shared model catalog. Effort maps to Codex reasoning effort, Claude effort, Pi thinking, or an OpenCode model variant. Pi can reduce thinking to levels supported by the model. Follow-ups keep the same settings. Put a self-contained brief in a private temporary file: goal, owned scope, constraints, required checks, and expected result. Include relevant paths and prior findings, not the parent's conversation or credentials. Use the fewest independent tasks needed.
   - **Editing:** select an explicit commit baseline. The helper creates a worktree under persistent storage. Uncommitted parent changes are not included; resolve that dependency before starting. Require the delegate to commit its work and report the commit, checks, and remaining problems. Editing delegates run with full permission bypass, as authorized by the user; a worktree is not a sandbox.
   - **Research/review:** use the current checkout with the helper's read-only restrictions. State that shared files can change while the delegate reads them.

3. **Start and track.** Use these commands, with `<skill-directory>` resolved to this skill's directory:

   ```sh
   bash <skill-directory>/scripts/delegate.sh start --harness HARNESS --prompt-file BRIEF
   # Optional: --model MODEL --effort LEVEL
   # For Pi and OpenCode, prefer a full provider/model ID.
   # For editing, also pass: --edit --commit BASE_SHA --allow-full-permissions
   bash <skill-directory>/scripts/delegate.sh status TASK_ID
   bash <skill-directory>/scripts/delegate.sh wait TASK_ID --timeout 120
   bash <skill-directory>/scripts/delegate.sh follow-up TASK_ID --prompt-file BRIEF
   bash <skill-directory>/scripts/delegate.sh cancel TASK_ID
   bash <skill-directory>/scripts/delegate.sh cleanup TASK_ID
   ```

   Start the task through the helper. Record its returned task ID and temporary record path. Continue independent parent work; use status or wait when the result is needed. Read the saved final response and exit status, not terminal scrollback alone. Live pane output is for observation; the helper keeps the pane occupied between turns. Leave it under helper control until cleanup. If ownership is lost, the helper refuses follow-up and pane closure. A timeout is not cancellation or proof that a prompt was not delivered. On uncertain startup, inspect the existing task; do not launch a duplicate or silently switch harnesses.

4. **Resolve the result.** Treat delegate output as evidence. Review changes and run the relevant checks before integration. The parent integrates commits and resolves conflicts. For corrections, use a sequential follow-up in the saved conversation; preserve each earlier result. Report failed or blocked work and obtain missing user decisions. Cancel only the selected task when needed; cancellation preserves results and code.

5. **Clean up before finishing.** After integration, run `cleanup` for each task to remove session-created panes and worktrees. Cleanup requires the delegate's HEAD to be an ancestor of the parent's current HEAD; use a merge or fast-forward, not only a cherry-pick. Branches and temporary task records remain. Never force removal of dirty worktrees or discard unintegrated commits. Report any resources that remain, their paths, and why cleanup was refused. Temporary task files can disappear during system cleanup; missing records do not establish success and must not trigger a restart.

## Limits

The helper rejects nested calls, disables supported native subagent tools, and adds a no-delegation instruction. Pi delegates use built-in tools and skip project settings, extensions, and MCP; extension-defined providers are not available. These are practical controls, not a security boundary against an agent with shell access. Research/review restrictions differ by harness; editing permission bypass can expose files and credentials outside the worktree.

Requires Bash 4.4+, `jq`, `flock`, GNU coreutils, Git, Herdr, the selected harness, and Linux `/proc` for process ownership checks. Cancellation sends SIGTERM to the task's process group. Detached processes that retain the task marker also block cleanup but need separate termination. If work remains, report it instead of deleting its resources. Processes that remove the marker can escape these checks; this helper is not a sandbox.

Task records and results use private temporary files, not durable history. Harnesses can retain their own conversation history for follow-ups. There is no automatic retry, provider fallback, server, or non-Herdr mode.
