---
description: Implement a lean Feature Spec or bounded Session Plan with autonomous execution
argument-hint: "[spec-path] [run-specific guidance...]"
thinking: medium
---

Implementation request, Feature Spec path, or run-specific guidance: $ARGUMENTS

If `$1` is an existing Feature Spec path, treat `${@:2}` as run-specific guidance lower in authority than the Feature Spec. If no Feature Spec path is provided, evaluate the full invocation text as the possible current-session implementation instruction.

You are running the `/implement` Pi Prompt Template. Implement an existing lean Feature Spec or bounded current-session Session Plan/current instruction. Do not commit changes.

## Preconditions

Before editing anything:

1. Determine the implementation contract from the full invocation and current session:
   - If `$1` is an existing Feature Spec path, use Feature Spec mode.
   - If no path is provided and the current session contains exactly one explicit `## Session Plan` block that has not already been superseded and has been accepted by the user or explicitly selected by the current invocation, use Session Plan mode.
   - If no path is provided, no explicit accepted Session Plan applies, and the current invocation text or immediately preceding user instruction provides an unambiguous implementation target, scope, and acceptance expectation, use that instruction as the implementation contract.
   - If no path is provided and the current session is ambiguous or absent, stop before editing and ask the user to provide `/implement <spec-path>`, rerun `/plan`, or provide an explicit implementation instruction.
   - If multiple plausible Session Plans or implementation targets exist, stop before editing and ask the user to choose the intended target.
   - If `$1` is not a path and looks like a loose idea or action request, evaluate the full invocation text, not `$1` alone. Proceed only when the full invocation is an unambiguous implementation instruction with target, scope, and acceptance expectation; otherwise stop and ask the user to run `/plan`, provide `/implement <spec-path>`, or provide an explicit implementation instruction.
   - Do not infer a Feature Spec path in no-path mode. Feature Spec mode requires an explicit existing Feature Spec path.
2. In Feature Spec mode, read the Feature Spec.
3. In Feature Spec mode, verify it appears to be a lean Feature Spec with:
   - a title
   - `## Purpose`
   - `## Requirements`
   - at least one `### Requirement: ...`
   - at least one `#### Scenario: ...`
   - `## Out of Scope`
4. In Session Plan or immediate-instruction mode, verify the selected contract has enough scope, acceptance, and validation expectations to implement. If not, stop for clarification.
5. Check `git status --porcelain`. If the working tree is dirty, stop and ask the user to commit, stash, or clean first. This clean-tree gate applies to Feature Spec, Session Plan, and immediate-instruction modes.
6. Record the starting `HEAD` or current revision as the review base for your final summary.

Run-specific guidance may constrain order or focus, but it may not override the selected implementation contract's requirements, constraints, validation expectations, acceptance expectations, or out-of-scope boundaries. If guidance conflicts with the selected contract, stop for clarification or amend the Feature Spec intentionally under the amendment policy below when in Feature Spec mode.

## Contract amendment and persistence policy

In Feature Spec mode, the spec remains the authoritative behavior contract.

You may make minor clarifying amendments autonomously when they do not change scope or behavior, such as:

- clarifying ambiguous wording without changing meaning
- adding a discovered validation command to `## Validation Expectations`
- adding a stable implementation constraint discovered in code
- correcting source context paths

Stop for user confirmation before any Feature Spec amendment that would:

- add or remove requirements
- change behavior semantics
- expand scope
- remove an out-of-scope boundary
- accept a major trade-off not already planned

In Session Plan or immediate-instruction mode, the current-session contract is authoritative for this run. Do not persist it to `docs/specs` unless the user explicitly asks to plan/spec it.

Do not append execution logs, review transcripts, or process summaries to a Feature Spec.

## Subagent execution

Use `pi-subagents` when available. First inspect available agents, then prefer one explicit chain. If a chain cannot be used, orchestrate equivalent step-by-step subagent calls.

Preferred chain shape:

1. `context-builder`
   - Read the Feature Spec or Session Plan/current-session contract, `CONTEXT.md`/domain docs, relevant code, and validation command sources.
   - Produce concise implementation context.
2. `planner`
   - Derive an implementation plan from requirements, scenarios, acceptance criteria, constraints, implementation context, and current code.
   - Identify validation strategy.
   - Decide whether TDD applies.
3. `worker`
   - Implement the plan.
   - Use the `tdd` skill when the selected contract explicitly requires tests, observable behavior changes with a discoverable test harness, or regression risk justifies automated coverage.
   - When testing, validate behavior through public/user-observable interfaces. Avoid brittle implementation-detail assertions such as incidental CSS classes, HTML tag structure, snapshots, private methods, or collaborator call counts unless those details are the public contract.
4. Validate the implementation with relevant deterministic commands.
5. Parallel clean-context review with four axes:
   - spec/session-contract compliance
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
- If the selected contract requires tests and they cannot be run, stop with failure.

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

- <Feature Spec requirement/scenario coverage or Session Plan acceptance coverage>

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
