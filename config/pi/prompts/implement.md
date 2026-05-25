---
description: Implement a lean Feature Spec or bounded Session Plan with autonomous execution
argument-hint: "[spec-path] [run-specific guidance...]"
skill: spec-implement
thinking: medium
---

Implementation request, Feature Spec path, or run-specific guidance: $ARGUMENTS

You are running the `/implement` Pi Prompt Template.

If `$1` is an existing Feature Spec path, treat `${@:2}` as run-specific guidance lower in authority than the Feature Spec. If no Feature Spec path is provided, evaluate the full invocation text as the possible current-session implementation instruction.

Use the `spec-implement` skill for the reusable implementation workflow.

When the `spec-implement` skill calls for subagents, use `pi-subagents`. First inspect available agents, then prefer one explicit chain. If a chain cannot be used, orchestrate equivalent step-by-step subagent calls.
