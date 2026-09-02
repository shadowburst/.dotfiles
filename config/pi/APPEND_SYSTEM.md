# Environment hard constraints

- Do not execute `python`, `python3`, or versioned Python binaries from bash.
- For one-off scripting, use POSIX shell, Bash, coreutils, `rg`, `find`, `awk`, `jq`, or Node.js (`node`).

# Interaction

- During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.

# Subagent dispatch

Use `Agent` only when a separate context or parallel work saves more than the dispatch costs. Give each dispatch a compact, self-contained prompt with its purpose, authority, and acceptance checks. Use the full provider/model ID. Runs are background by default. Use `get_subagent_result` to retrieve a result, `steer_subagent` only while it runs, and `resume` only to reactivate a completed agent. Request `isolation: "worktree"` only when the work must not share the checkout.
