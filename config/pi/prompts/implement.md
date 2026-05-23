---
description: Implement a lean Feature Spec with Boomerang-preferred subagent execution
argument-hint: "[spec-path] [run-specific guidance...]"
thinking: medium
---

Implement this Feature Spec path if provided: $1

Run-specific guidance, lower authority than the spec: ${@:2}

You are running the `/implement` Pi Prompt Template. Implement an existing lean Feature Spec using bounded autonomous execution. Do not commit changes.

## Boomerang preference

Prefer Boomerang context compaction without requiring the user to type `/boomerang`.

- If an agent-callable `boomerang` tool is available and this work is not already running inside a Boomerang task, schedule the autonomous implementation through that tool using a plain task string that includes these workflow requirements and explicitly says not to invoke Boomerang again. Then stop the current turn after telling the user Boomerang has been scheduled.
- If Boomerang is unavailable or disabled, continue directly in the current session and mention that Boomerang compaction was unavailable.
- Never ask the user to re-run the prompt as `/boomerang /implement`.

## Preconditions

Before editing anything:

1. Determine the Feature Spec path:
   - If `$1` is an existing Feature Spec path, use it.
   - If no path is provided, infer the spec path from the most recent `/plan` result in the current session, but only when exactly one recent created/updated spec path is clear.
   - If no path is provided and no unambiguous current-session `/plan` spec path is available, stop and tell the user to run `/plan` first or rerun `/implement <spec-path>`.
   - If `$1` is not a path and looks like a loose idea or action request, stop and tell the user to run `/plan` first or rerun `/implement <spec-path>`.
2. Read the Feature Spec.
3. Verify it appears to be a lean Feature Spec with:
   - a title
   - `## Purpose`
   - `## Requirements`
   - at least one `### Requirement: ...`
   - at least one `#### Scenario: ...`
   - `## Out of Scope`
4. Check `git status --porcelain`. If the working tree is dirty, stop and ask the user to commit, stash, or clean first.
5. Record the starting `HEAD` or current revision as the review base for your final summary.

Run-specific guidance may constrain order or focus, but it may not override requirements, constraints, validation expectations, or out-of-scope boundaries. If guidance conflicts with the spec, stop for clarification or amend the spec intentionally under the amendment policy below.

## Spec amendment policy

The spec remains the authoritative behavior contract.

You may make minor clarifying amendments autonomously when they do not change scope or behavior, such as:

- clarifying ambiguous wording without changing meaning
- adding a discovered validation command to `## Validation Expectations`
- adding a stable implementation constraint discovered in code
- correcting source context paths

Stop for user confirmation before any amendment that would:

- add or remove requirements
- change behavior semantics
- expand scope
- remove an out-of-scope boundary
- accept a major trade-off not already planned

Do not append execution logs, review transcripts, or process summaries to the spec.

## Subagent execution

Use `pi-subagents` when available. First inspect available agents, then prefer one explicit chain. If a chain cannot be used, orchestrate equivalent step-by-step subagent calls.

Preferred chain shape:

1. `context-builder`
   - Read the spec, `CONTEXT.md`/domain docs, relevant code, and validation command sources.
   - Produce concise implementation context.
2. `planner`
   - Derive an implementation plan from requirements, scenarios, constraints, implementation context, and current code.
   - Identify validation strategy.
   - Decide whether TDD applies.
3. `worker`
   - Implement the plan.
   - Use the `tdd` skill when the spec explicitly requires tests, observable behavior changes with a discoverable test harness, or regression risk justifies automated coverage.
   - When testing, validate behavior through public/user-observable interfaces. Avoid brittle implementation-detail assertions such as incidental CSS classes, HTML tag structure, snapshots, private methods, or collaborator call counts unless those details are the public contract.
4. Validate the implementation with relevant deterministic commands.
5. Parallel clean-context review with four axes:
   - spec compliance
   - correctness and regressions
   - validation and tests
   - simplicity and maintainability
6. Synthesis step
   - separate required fixes, optional improvements, and feedback to ignore.
7. Fix step
   - apply synthesized required fixes once.
8. Optional final refactor/polish
   - behavior-preserving only
   - use `refactor` skill or equivalent guidance when useful
   - prefer no change over speculative churn
   - do not start another review loop
9. Final validation
   - always run after review/fix/refactor, even if no fixes were applied.
10. Final report
   - print the structured report described below.

## Validation policy

- Run discoverable relevant validation commands.
- If validation fails, fix the issue or report failure; do not claim success.
- If validation is genuinely unavailable or inapplicable, the final report must explain what was attempted, why validation could not be run, and what manual validation remains.
- If the spec requires tests and they cannot be run, stop with failure.

## Completion constraints

- Do not create commits.
- Do not create a PR.
- Do not update task checkboxes or invent task ledgers.
- Leave the working tree with the implementation changes for the user to inspect, amend, commit, and possibly create a PR using separate skills.
- Do not write a final report file by default; print the report in chat.

## Final report format

End with this exact structure:

```md
## Implementation Summary

<concise summary of what changed>

## Requirements Covered

- <requirement/scenario coverage summary>

## Validation Evidence

- <commands run and results, or unavailable validation explanation>

## Review/Fix Pass

- <review axes used, required fixes applied once, optional items left for user if any>

## Spec Amendments

- <spec amendments made, or “None”>

## Changed Files

- `<path>` — <why it changed>

## Follow-up Recommendations

- <manual inspection notes, suggested commit/pr next steps, or “None”>
```
