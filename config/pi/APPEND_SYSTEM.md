# Interaction

- During grilling sessions, ask every round through the `question` tool, batching the whole frontier into one call.

# Subagent dispatch

Use subagents sparingly, when a bounded task benefits from separate context or parallel work enough to justify the dispatch cost:

- Delegate read-only research that would flood the main context window.
- Use a fresh context for independent judgment, such as a code review.
- Delegate phases of a large implementation when that keeps the whole job moving in one session.

Give each dispatch a compact, self-contained prompt with its purpose, authority, and acceptance checks. Use the full provider/model ID. Runs are background by default. Use `get_subagent_result` to retrieve a result, `steer_subagent` only while it runs, and `resume` only to reactivate a completed agent. Request `isolation: "worktree"` only when the work must not share the checkout.
