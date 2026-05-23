---
description: Grill an idea, resolve durable decisions, and write a lean Feature Spec
argument-hint: "<idea-or-spec-path>"
skill: grill-with-docs
thinking: medium
---

Plan this feature interactively: $ARGUMENTS

You are running the `/plan` Pi Prompt Template. Your job is to turn the user's idea into a durable lean Feature Spec, but only after an interactive grilling session.

## Operating mode

- Use the `grill-with-docs` skill behavior for the grilling session.
- Ask one question at a time and wait for the user's answer.
- If a question can be answered by inspecting the repository, inspect the repository instead of asking.
- Do not implement code.
- Do not use Boomerang by default; this is an interactive planning prompt.

## Domain documentation

Follow `grill-with-docs` exactly for domain docs:

- Read relevant `CONTEXT.md` / `CONTEXT-MAP.md` / ADRs when needed.
- Update `CONTEXT.md` inline when durable domain terms are resolved.
- Create ADRs only when the `grill-with-docs` criteria are met: hard to reverse, surprising without context, and a real trade-off.
- Do not force ADRs or glossary entries for transient implementation details.

## Spec target

After the grilling session is complete and the user confirms, create or update one Feature Spec under `docs/specs/`.

Use the `spec` skill's target-file behavior:

- If the user supplied an explicit existing spec path, update that spec.
- Otherwise derive a kebab-case slug from the feature name and use `docs/specs/YYYY-MM-DD-<slug>.md`.
- If today's matching spec exists, update it.
- If older matching specs exist, ask whether to update an older spec or create today's new spec.
- If multiple older matches exist, ask which one.

## Lean Feature Spec format

The produced spec is a behavior contract, not an execution ledger. It should include:

- `## Purpose`
- `## Requirements`
- one or more `### Requirement: ...`
- one or more `#### Scenario: ...`
- optional `## Implementation Constraints`
- optional `## Implementation Context`
- optional feature-specific `## Validation Expectations`
- `## Out of Scope`
- optional `## Source Context`

Do not include:

- `## Implementation Tasks`
- generic `## Review Checklist`
- generic validation boilerplate repeated in every spec
- raw chat transcript

Use `## Implementation Context` only for non-obvious planning context future implementers need: resolved trade-offs, rejected approaches, migration risks, compatibility constraints, or other durable handoff notes.

Use `## Validation Expectations` only for feature-specific validation guidance. If tests are called for, describe behavior to validate and avoid brittle implementation-detail assertions such as incidental CSS classes, HTML tag structure, snapshots, private methods, or collaborator call counts unless those details are the public contract.

## Completion protocol

When you believe the plan is spec-ready:

1. Say that you believe the plan is spec-ready.
2. Summarize:
   - resolved decisions
   - remaining assumptions
   - proposed spec path/title
   - any domain doc or ADR changes already made
3. Ask explicitly: “Write/update the Feature Spec now?”
4. Wait for user confirmation.
5. After confirmation, write/update the spec.
6. Self-check the spec before ending:
   - title exists
   - `## Purpose` exists
   - `## Requirements` exists
   - at least one `### Requirement: ...`
   - at least one `#### Scenario: ...`
   - `## Out of Scope` exists
   - no generic validation boilerplate
   - no implementation task ledger
   - no generic review checklist
7. Identify the planning files changed by this `/plan` session:
   - always include the Feature Spec that was created or updated
   - include any `CONTEXT.md`, context-specific glossary, or ADR files changed during this planning session
   - do not include unrelated dirty files that were not changed by this planning session
8. Ask whether to commit those planning files. Invite the user to review or amend them first, for example: “Review or amend the files now if desired. Commit these planning files?”
9. Wait for the user's answer:
   - If the user wants to inspect or amend first, pause for their next instruction and do not commit until they explicitly confirm.
   - If the user declines the commit, end with `Created/updated: <spec-path>` and explain that implementation is not ready until the planning changes are committed, stashed, or cleaned. Do not print `Ready for: /implement <spec-path>`.
   - If the user confirms the commit, create the planning commit directly with git commands for this narrow case. Do not invoke the general `commit` skill.
10. When creating the planning commit:
    - stage only the planning files identified in step 7 with `git add -- <planning-files...>`
    - if the Feature Spec is new, use a Conventional Commit message equivalent to `docs(specs): add <feature-slug> spec`
    - if the Feature Spec already existed, use a Conventional Commit message equivalent to `docs(specs): update <feature-slug> spec`
    - do not refuse solely because a touched planning file had pre-existing uncommitted edits; commit the current contents of that touched file if the user confirmed
    - if `git commit` fails, report the failure and do not print `Ready for: /implement <spec-path>`
11. After a successful planning commit, run `git status --porcelain`:
    - if unrelated dirty files remain, warn that `/implement` may refuse to start until those changes are committed, stashed, or cleaned
12. End only after a successful planning commit with:
    - `Created/updated: <spec-path>`
    - `Ready for: /implement <spec-path>`
