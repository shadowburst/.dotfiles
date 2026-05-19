---
name: to-spec
description: Converts current conversation and repository context into a durable, reviewable feature spec under docs/specs. Use when the user asks to create a spec, feature spec, implementation spec, review contract, or Ralph-loop-ready task/spec document.
---

# To Spec

Convert the current conversation and repository context into a single durable **Feature Spec** under `docs/specs`.

Do not implement the feature. Do not create an OpenSpec change. Do not create a PRD. Do not publish to the issue tracker.

## Process

1. **Gather context without interviewing by default**
   - Use the current conversation as the primary source.
   - Explore relevant repository files when needed to understand current behavior, vocabulary, constraints, related specs, and validation commands.
   - If `CONTEXT-MAP.md` exists, read it and then the relevant context file. Otherwise read root `CONTEXT.md` when present.
   - Use canonical glossary terms from domain context, but do not edit glossary files.
   - Ask one concise clarification only if the feature name, scope, or target spec file cannot be inferred safely.

2. **Choose the target file**
   - Create `docs/specs` if it does not exist. Do not create unrelated docs directories.
   - Derive a kebab-case `<feature-slug>` from the feature name.
   - Use `docs/specs/YYYY-MM-DD-<feature-slug>.md`, where `YYYY-MM-DD` is the current date.
   - If today's matching file exists, update it.
   - If no same-day file exists but older `*-<feature-slug>.md` files exist, ask whether to update an older spec or create today's new spec.
   - If multiple older matches exist, ask which to update or whether to create today's new spec.

3. **Create or update the spec**
   - If creating, use the template below.
   - If updating, read the existing spec first and merge new information into the right sections.
   - Preserve existing requirements, scenarios, tasks, and boundaries unless the current context clearly supersedes them.
   - Summarize what was created or changed.

## Spec template

```md
# <Feature Name>

## Purpose

<One or two paragraphs explaining why this feature exists and what durable behavior the implementation must provide.>

## Requirements

### Requirement: <Behavior name>

<Subject> SHALL <externally observable behavior>.

#### Scenario: <Concrete scenario name>

- **WHEN** <trigger or state>
- **THEN** <observable result>
- **AND** <additional observable result, if needed>

## Implementation Constraints

- <Stable, review-relevant technical constraint. Omit this section if none are known.>

## Implementation Tasks

- [ ] 1. <First setup or discovery task.>
  - Covers: Requirement: <name>
- [ ] 2. <Next task, ordered after prerequisites.>
- [ ] N. <Final validation or review task using safely discoverable project-specific commands/checks, or generic validation wording.>

## Out of Scope

- <Behavior the implementation must not introduce.>

## Source Context

- `<path-read-and-materially-used>`

## Review Checklist

- [ ] Implementation satisfies “Requirement: <name>”.
- [ ] Scenarios under “<name>” are covered by behavior or tests.
- [ ] Implementation tasks were completed in dependency order.
- [ ] No out-of-scope behavior was introduced.
- [ ] Public behavior matches the spec language.
```

Omit `## Source Context` if no repository files materially informed the spec. Omit `## Implementation Constraints` only when no stable constraints are known.

## Quality rules

- Use persisted OpenSpec-style specs: `## Requirements`, `### Requirement: ...`, `#### Scenario: ...`.
- Never use OpenSpec delta headings such as `ADDED Requirements`, `MODIFIED Requirements`, or `REMOVED Requirements`.
- Requirement statements use normative `SHALL` language.
- Scenarios use `WHEN`, `THEN`, and optional `AND` bullets.
- Specify externally observable behavior; avoid implementation details unless they are stable review constraints.
- Avoid vague acceptance criteria like “works well”, “is robust”, or “handles errors” without concrete scenarios.
- Include detailed checkbox tasks in the same file.
- Implementation tasks may include validation-only or review-only tasks when they represent meaningful completion work.
- Order tasks naturally: prerequisites first, dependent tasks later, verification tasks last.
- Validation tasks should name the intended confidence outcome and, when safely discoverable, the command/check to use.
- Prefer the smallest safely discoverable validation commands from project files such as `package.json`, `Justfile`, `Makefile`, `pyproject.toml`, or `flake.nix`; do not invent commands.
- Make `## Out of Scope` explicit. If only a generic boundary is known, use: `Unspecified behavior changes outside this feature.`
- Make `## Review Checklist` useful for post-implementation review against the spec.

## Guardrails

- Do not write application code.
- Do not create files under `openspec/changes`.
- Do not publish or update issue tracker entries.
- Do not create PRDs.
- Do not create a separate task file; tasks belong in the spec file.
- Do not silently overwrite an existing spec; merge or ask when ambiguous.
