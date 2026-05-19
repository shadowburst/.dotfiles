# To-Spec Skill

## Purpose

Define an agent skill that converts the current conversation and codebase context into a durable, reviewable feature spec under `docs/specs`.

## Requirements

### Requirement: Spec-only output

The `to-spec` skill SHALL produce a feature spec file under `docs/specs` and SHALL NOT create an OpenSpec change directory, PRD, issue tracker entry, or implementation code. It SHALL create the `docs/specs` directory when it is missing.

#### Scenario: Creating a new feature spec

- **WHEN** the user asks to convert the current context into a spec
- **THEN** the skill creates a Markdown feature spec under `docs/specs`
- **AND** the skill does not create files under `openspec/changes`
- **AND** the skill does not publish to the issue tracker

#### Scenario: Specs directory is missing

- **WHEN** `docs/specs` does not exist
- **THEN** the skill creates `docs/specs`
- **AND** the skill does not create unrelated documentation directories

### Requirement: Date-prefixed filename

The `to-spec` skill SHALL name feature spec files using `YYYY-MM-DD-<feature-slug>.md`.

#### Scenario: Naming a new spec

- **WHEN** the current date is `2026-05-19`
- **AND** the feature slug is `to-spec-skill`
- **THEN** the skill writes the spec to `docs/specs/2026-05-19-to-spec-skill.md`

#### Scenario: Updating today's matching spec

- **WHEN** `docs/specs/YYYY-MM-DD-<feature-slug>.md` already exists for the current date
- **THEN** the skill updates that file rather than creating a duplicate

#### Scenario: Handling older matching specs

- **WHEN** no spec exists for the current date and feature slug
- **AND** one or more older specs match the same slug after the date prefix
- **THEN** the skill asks whether to update an older spec or create a new date-prefixed spec

### Requirement: Persisted OpenSpec-style format

The `to-spec` skill SHALL use the persisted OpenSpec-style format with `Purpose`, `Requirements`, requirement statements, and `Scenario` blocks.

#### Scenario: Writing requirements

- **WHEN** the skill writes a feature behavior
- **THEN** it expresses the behavior as a `### Requirement: <name>` section
- **AND** the requirement statement uses normative `SHALL` language

#### Scenario: Writing scenarios

- **WHEN** the skill writes acceptance behavior
- **THEN** it expresses the behavior as `#### Scenario: <name>`
- **AND** it uses `WHEN`, `THEN`, and optional `AND` bullets

#### Scenario: Avoiding delta spec format

- **WHEN** the skill creates or updates a feature spec
- **THEN** it does not use `ADDED Requirements`, `MODIFIED Requirements`, or other OpenSpec delta headings

### Requirement: Synthesis-first behavior

The `to-spec` skill SHALL synthesize from the current conversation and codebase context without interviewing the user by default. It SHALL read existing domain context when present, use canonical project vocabulary, and avoid editing domain glossary files.

#### Scenario: Context is sufficient

- **WHEN** the conversation and repository context provide enough information to identify the feature, scope, and expected behavior
- **THEN** the skill creates or updates the spec without asking discovery questions

#### Scenario: Critical ambiguity blocks creation

- **WHEN** the feature name, scope, or target spec file cannot be inferred safely
- **THEN** the skill asks one concise clarification before writing the spec

#### Scenario: Domain context exists

- **WHEN** `CONTEXT.md` or `CONTEXT-MAP.md` exists
- **THEN** the skill reads the relevant domain context before writing the spec
- **AND** the skill uses canonical glossary terms from the relevant context
- **AND** the skill does not edit domain glossary files

### Requirement: Existing spec merge behavior

The `to-spec` skill SHALL update existing matching specs by merging new information instead of overwriting them wholesale.

#### Scenario: Preserving existing requirements

- **WHEN** an existing matching spec contains requirements not contradicted by the current context
- **THEN** the skill preserves those requirements

#### Scenario: Incorporating new decisions

- **WHEN** the current context adds or clarifies feature behavior
- **THEN** the skill updates the relevant requirement, scenario, implementation task, out-of-scope item, or review checklist entry

### Requirement: Review-oriented structure

The `to-spec` skill SHALL generate specs that can be used after implementation to review whether produced code follows the spec. It SHALL include source context references when repository files were materially used to create the spec.

#### Scenario: Review checklist is present

- **WHEN** the skill creates or updates a spec
- **THEN** the spec includes a `## Review Checklist` section derived from the requirements and constraints

#### Scenario: Out-of-scope boundaries are present

- **WHEN** the skill creates or updates a spec
- **THEN** the spec includes a `## Out of Scope` section that identifies behavior the implementation should not introduce

#### Scenario: Source context was materially used

- **WHEN** the skill reads and materially uses repository files such as domain context, ADRs, or related specs
- **THEN** the spec includes a short `## Source Context` section listing those file paths

#### Scenario: No repository files were materially used

- **WHEN** the spec is based only on conversation context or repository files did not materially affect the spec
- **THEN** the skill omits `## Source Context`

### Requirement: Implementation tasks

The `to-spec` skill SHALL include detailed implementation tasks in the same spec file. Verification tasks SHALL appear at the end of the task list and use project-specific validation commands when they are safely discoverable.

#### Scenario: Tasks guide implementation loops

- **WHEN** the skill writes implementation tasks
- **THEN** the tasks are checkbox-based and sequenced for an implementation agent to follow
- **AND** tasks reference requirement names where useful
- **AND** tasks describe intended outcomes rather than brittle line-level edits

#### Scenario: Ordering dependent tasks

- **WHEN** one implementation task depends on the outcome of another task
- **THEN** the dependent task appears later in the task list than the task it depends on
- **AND** the task list follows a natural implementation order from setup through verification

#### Scenario: Writing verification tasks

- **WHEN** the skill writes implementation tasks
- **THEN** final tasks verify the completed work against the spec
- **AND** final tasks use the smallest relevant project-specific validation commands when those commands are safely discoverable
- **AND** final tasks use generic validation wording when specific commands cannot be inferred safely

### Requirement: Implementation constraints

The `to-spec` skill SHALL include implementation constraints only when they are stable and review-relevant.

#### Scenario: Stable constraints exist

- **WHEN** the conversation or codebase establishes non-negotiable technical boundaries
- **THEN** the skill captures them under `## Implementation Constraints`

#### Scenario: Details are transient or brittle

- **WHEN** a detail is merely a possible helper name, line number, or incidental implementation path
- **THEN** the skill omits it from implementation constraints

## Implementation Constraints

- The skill should live as an Agent Skill under `.agents/skills/to-spec/SKILL.md`.
- Specs must be stored under `docs/specs`.
- Spec filenames must start with the current date in `YYYY-MM-DD` format.
- Specs must use persisted OpenSpec-style `## Requirements`, not OpenSpec delta headings.
- The generated spec should be one Markdown file containing purpose, requirements, constraints, tasks, out-of-scope boundaries, source context when useful, and review checklist.
- The skill should be concise enough to fit in a single `SKILL.md` unless the instructions become too long.

## Implementation Tasks

- [x] 1. Create `.agents/skills/to-spec/SKILL.md` with frontmatter name `to-spec` and a trigger-oriented description.
  - Covers: Requirement: Spec-only output
- [x] 2. Document that the skill creates `docs/specs` when missing and avoids creating unrelated documentation structures.
  - Covers: Requirement: Spec-only output
- [x] 3. Document the synthesis-first workflow: inspect current conversation and relevant repository context, then write the spec without interviewing by default.
  - Covers: Requirement: Synthesis-first behavior
- [x] 4. Define the feature slug and filename selection rules, including date prefixing and existing-spec matching by slug after the date prefix.
  - Covers: Requirement: Date-prefixed filename
- [x] 5. Define the required spec template with `Purpose`, `Requirements`, `Implementation Constraints`, `Implementation Tasks`, `Out of Scope`, optional `Source Context`, and `Review Checklist`.
  - Covers: Requirement: Persisted OpenSpec-style format; Requirement: Review-oriented structure; Requirement: Implementation tasks
- [x] 6. Add merge/update guidance for existing matching specs so the agent preserves non-conflicting requirements and incorporates new decisions.
  - Covers: Requirement: Existing spec merge behavior
- [x] 7. Add quality rules for requirements and scenarios: normative `SHALL` statements, `WHEN`/`THEN` scenarios, externally observable behavior, and no vague acceptance criteria.
  - Covers: Requirement: Persisted OpenSpec-style format
- [x] 8. Add guardrails that prevent creating OpenSpec change directories, PRDs, issue tracker entries, or implementation code.
  - Covers: Requirement: Spec-only output
- [x] 9. Inspect the repository for safely discoverable validation commands relevant to Agent Skill changes.
  - Covers: Requirement: Implementation tasks
- [x] 10. Run the smallest relevant validation command if one is safely discoverable; otherwise perform a manual review of the generated skill file.
  - Covers: Requirement: Implementation tasks
- [x] 11. Review the skill against this spec and adjust any missing behavior before considering it complete.
  - Covers: Requirement: Review-oriented structure

## Out of Scope

- Creating OpenSpec change directories under `openspec/changes`.
- Publishing PRDs or issues to the issue tracker.
- Implementing the feature described by the generated spec.
- Generating OpenSpec delta spec headings such as `ADDED Requirements`.
- Creating separate task files for the same feature spec.

## Review Checklist

- [ ] The skill creates or updates only `docs/specs/YYYY-MM-DD-<feature-slug>.md` feature specs.
- [ ] The skill creates `docs/specs` when missing and does not create unrelated documentation directories.
- [ ] The skill uses persisted OpenSpec-style requirements and scenarios.
- [ ] Requirement statements use `SHALL` language.
- [ ] Scenarios use `WHEN`, `THEN`, and optional `AND` bullets.
- [ ] The skill does not interview by default when context is sufficient.
- [ ] The skill reads relevant domain context when present, uses canonical terms, and does not edit glossary files.
- [ ] The skill asks a concise clarification only when blocked by critical ambiguity.
- [ ] Existing spec updates preserve non-conflicting content and merge new decisions.
- [ ] Generated specs include implementation tasks in the same file.
- [ ] Implementation tasks are ordered so dependent tasks naturally come after their prerequisites.
- [ ] Final implementation tasks verify the work using safely discoverable project-specific commands or generic validation wording.
- [ ] Generated specs include out-of-scope boundaries and a review checklist.
- [ ] Generated specs include source context references when repository files materially informed the spec.
- [ ] The skill does not create PRDs, issue tracker entries, OpenSpec change directories, or implementation code.
