# Update Old Specs to New Format

## Purpose

Migrate the repository's existing old-format Feature Specs to the lean Feature Spec format so `docs/specs/` contains durable behavior contracts rather than implementation ledgers.

The migration preserves the identity and behavioral intent of each existing spec while removing sections that describe implementation progress or generic review activity.

## Requirements

### Requirement: Current old specs are migrated

The migration SHALL update the old-format Feature Specs that currently exist under `docs/specs/` and SHALL NOT broaden scope to future or unrelated spec files.

#### Scenario: Existing old-format specs are found

- **WHEN** the migration is performed
- **THEN** it updates the current old-format specs in `docs/specs/`
- **AND** it treats `docs/specs/2026-05-19-mcp-bridge.md`, `docs/specs/2026-05-19-to-spec-skill.md`, and `docs/specs/2026-05-20-opencode-mcp-config-for-pi-bridge.md` as the migration target set

#### Scenario: A spec is already lean

- **WHEN** a Feature Spec already follows the lean format
- **THEN** the migration does not rewrite it solely because it is under `docs/specs/`

### Requirement: Spec identity is preserved

The migration SHALL preserve each migrated spec's existing filename and title.

#### Scenario: Migrating an old spec

- **WHEN** an old-format spec is migrated
- **THEN** its path remains unchanged
- **AND** its top-level title remains unchanged

### Requirement: Task ledgers are removed

The migration SHALL remove implementation task ledgers from migrated Feature Specs.

#### Scenario: Completed task ledger exists

- **WHEN** a migrated spec contains `## Implementation Tasks` with completed tasks
- **THEN** the migrated spec omits that section
- **AND** it does not preserve completed tasks as progress history in the Feature Spec

#### Scenario: Unchecked task ledger exists

- **WHEN** a migrated spec contains unchecked implementation tasks
- **THEN** the migrated spec omits those tasks from the Feature Spec
- **AND** any durable constraint, compatibility risk, or non-obvious handoff context from those tasks is preserved only when it remains relevant to future implementation or review

### Requirement: Generic review checklists are removed

The migration SHALL remove generic `## Review Checklist` sections from migrated Feature Specs.

#### Scenario: Generic review checklist exists

- **WHEN** a migrated spec contains checklist items that restate requirement coverage or generic review activity
- **THEN** the migrated spec omits the checklist
- **AND** it does not replace the checklist with equivalent generic validation boilerplate

### Requirement: Durable context is preserved selectively

The migration SHALL preserve non-obvious durable planning context while excluding transient implementation details.

#### Scenario: Removed sections contain durable context

- **WHEN** removed implementation tasks or checklist items contain trade-offs, migration risks, compatibility constraints, or other non-obvious context needed by future implementers
- **THEN** the migrated spec preserves that information under `## Implementation Context`

#### Scenario: Removed sections contain only execution progress

- **WHEN** removed implementation tasks or checklist items only describe progress, ordering, or generic verification activity
- **THEN** the migrated spec omits that information entirely

### Requirement: Feature-specific validation is retained

The migration SHALL include `## Validation Expectations` only when a migrated spec has feature-specific validation guidance.

#### Scenario: Feature-specific validation exists

- **WHEN** an old spec contains concrete validation commands or behavior-specific validation risks
- **THEN** the migrated spec may preserve that guidance under `## Validation Expectations`

#### Scenario: Only generic validation exists

- **WHEN** an old spec contains only generic review checklist items or generic validation reminders
- **THEN** the migrated spec omits `## Validation Expectations`

### Requirement: Source context remains material

The migration SHALL preserve `## Source Context` sections only when their entries remain materially relevant to the lean spec.

#### Scenario: Source context still informs the spec

- **WHEN** a migrated spec's source context entries materially support its requirements, constraints, or durable context
- **THEN** the migrated spec keeps those entries

#### Scenario: Source context is stale or irrelevant

- **WHEN** a source context entry no longer materially informs the lean spec
- **THEN** the migrated spec removes that entry

## Implementation Constraints

- Migrated specs must keep the lean Feature Spec structure: `## Purpose`, `## Requirements`, one or more `### Requirement: ...`, one or more `#### Scenario: ...`, and `## Out of Scope`.
- Migrated specs must not include `## Implementation Tasks`, generic `## Review Checklist`, or OpenSpec delta headings.
- Migration must not change feature behavior merely to fit the new format.
- Migration must not rename, re-date, or split the target specs.

## Implementation Context

The repository glossary defines a **Feature Spec** as a durable behavior contract rather than an implementation task ledger or generic review checklist. This migration aligns older specs with that domain meaning.

The target set is intentionally fixed to the old-format specs present when this migration was planned. Future old-format specs can be handled by a later explicit update.

## Out of Scope

- Building a reusable converter, command, prompt template, or Agent Skill for spec migration.
- Migrating specs outside the current `docs/specs/` target set.
- Renaming or re-dating existing specs.
- Tracking implementation progress inside Feature Specs.
- Creating ADRs for this format cleanup.

## Source Context

- `CONTEXT.md`
- `docs/specs/2026-05-19-mcp-bridge.md`
- `docs/specs/2026-05-19-to-spec-skill.md`
- `docs/specs/2026-05-20-opencode-mcp-config-for-pi-bridge.md`
