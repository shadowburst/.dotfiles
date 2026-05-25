# Spec Workflow Skills

## Purpose

Convert the existing `/plan` and `/implement` Pi Prompt Template workflows into reusable Agent Skills while keeping the slash prompts as thin Pi-specific entrypoints. The reusable planning, spec-writing, and implementation behavior should be available directly as skills and also remain accessible through the existing prompt names.

This feature clarifies the boundary between Pi Prompt Templates and Agent Skills: prompts own Pi invocation glue and Pi-specific capability selection, while skills own reusable workflow behavior that can be invoked without the prompts.

## Requirements

### Requirement: Spec skill family exists as standalone Agent Skills

The skills repository SHALL provide a `spec-write`, `spec-plan`, and `spec-implement` Agent Skill family for writing Feature Specs, planning spec-backed or session-only work, and implementing bounded implementation contracts.

#### Scenario: Current spec skill is renamed

- **WHEN** the skills repository is updated
- **THEN** the existing `skills/spec` skill is renamed to `skills/spec-write`
- **AND** its skill frontmatter name is `spec-write`
- **AND** its behavior remains otherwise unchanged except for name/title/description updates required by the rename

#### Scenario: No compatibility alias remains

- **WHEN** the skills repository is updated
- **THEN** there is no retained `spec` Agent Skill alias
- **AND** users and prompts must reference `spec-write`, `spec-plan`, or `spec-implement` explicitly

#### Scenario: New planning skill is directly usable

- **WHEN** a user invokes the `spec-plan` skill directly with a planning idea
- **THEN** the skill can run the full interactive planning workflow without requiring the `/plan` Pi Prompt Template

#### Scenario: New implementation skill is directly usable

- **WHEN** a user invokes the `spec-implement` skill directly with a Feature Spec path, accepted Session Plan, or bounded implementation instruction
- **THEN** the skill can run the implementation workflow without requiring the `/implement` Pi Prompt Template

### Requirement: Plan prompt delegates reusable behavior to spec-plan

The `/plan` Pi Prompt Template SHALL become a thin Pi-specific wrapper around the `spec-plan` skill.

#### Scenario: Plan prompt is invoked

- **WHEN** a user invokes `/plan` with arguments
- **THEN** the prompt passes the planning request from `$ARGUMENTS` to `spec-plan`
- **AND** it identifies itself as the `/plan` Pi Prompt Template
- **AND** it avoids duplicating the full reusable planning workflow in the prompt body

#### Scenario: Prompt keeps Pi-specific concerns

- **WHEN** reusable planning behavior is extracted
- **THEN** prompt-template frontmatter, slash-command identity, argument expansion, and Pi-specific invocation wording remain in `config/pi/prompts/plan.md`
- **AND** reusable grilling, Feature Spec vs Session Plan choice, Feature Spec writing, Session Plan presentation, and planning commit behavior live in `spec-plan`

### Requirement: Implement prompt delegates reusable behavior to spec-implement

The `/implement` Pi Prompt Template SHALL become a thin Pi-specific wrapper around the `spec-implement` skill.

#### Scenario: Implement prompt is invoked

- **WHEN** a user invokes `/implement` with arguments
- **THEN** the prompt interprets Pi prompt-template arguments sufficiently to identify the implementation request, Feature Spec path, and run-specific guidance
- **AND** it delegates implementation behavior to `spec-implement`
- **AND** it avoids duplicating the full reusable implementation workflow in the prompt body

#### Scenario: Pi subagent capability remains prompt-specific

- **WHEN** the `/implement` prompt delegates to `spec-implement`
- **THEN** the prompt instructs that subagent usage should use `pi-subagents`
- **AND** the `spec-implement` skill describes subagent usage generically without naming `pi-subagents`

### Requirement: Spec-plan orchestrates grilling and spec writing

The `spec-plan` skill SHALL own the reusable interactive planning workflow and delegate Feature Spec creation or update mechanics to `spec-write`.

#### Scenario: Planning starts

- **WHEN** `spec-plan` is invoked with a planning idea
- **THEN** it uses the `grill-with-docs` behavior for the grilling session
- **AND** it asks one question at a time unless the answer can be discovered by inspecting the repository
- **AND** it follows domain documentation behavior for reading and updating `CONTEXT.md` or ADRs when warranted

#### Scenario: User chooses Feature Spec

- **WHEN** grilling reaches stable understanding
- **AND** the user chooses the Feature Spec branch
- **THEN** `spec-plan` immediately creates or updates the Feature Spec through `spec-write`
- **AND** it does not ask an additional redundant “write/update the Feature Spec now?” confirmation

#### Scenario: User chooses Session Plan

- **WHEN** grilling reaches stable understanding
- **AND** the user chooses the Session Plan branch
- **THEN** `spec-plan` immediately prints the chat-only `## Session Plan` block
- **AND** it asks whether to implement the Session Plan immediately

#### Scenario: Planning commit behavior is preserved

- **WHEN** `spec-plan` creates or updates a Feature Spec
- **THEN** it performs the existing spec self-check
- **AND** it asks whether to commit the planning files it changed
- **AND** it uses the existing narrow planning commit behavior when the user confirms

### Requirement: Spec-implement owns reusable implementation discipline

The `spec-implement` skill SHALL own clean-tree gated implementation from a Feature Spec, accepted Session Plan, or bounded implementation instruction.

#### Scenario: Implementation starts from a Feature Spec

- **WHEN** `spec-implement` is invoked with an existing Feature Spec path
- **THEN** it reads and validates the Feature Spec structure before editing
- **AND** it uses the spec as the authoritative implementation contract

#### Scenario: Implementation starts without a Feature Spec

- **WHEN** `spec-implement` is invoked without a Feature Spec path
- **AND** the current session contains exactly one accepted Session Plan or an unambiguous bounded implementation instruction
- **THEN** it may use that session contract for implementation
- **AND** it does not infer a Feature Spec path implicitly

#### Scenario: Dirty working tree blocks implementation

- **WHEN** `spec-implement` is about to edit implementation files
- **AND** `git status --porcelain` reports dirty files
- **THEN** it stops before editing
- **AND** it asks the user to commit, stash, or clean first

#### Scenario: Subagents are used generically

- **WHEN** `spec-implement` plans or reviews implementation work
- **THEN** it uses subagents wherever practical
- **AND** it describes desired subagent roles and review axes generically
- **AND** it does not mention Pi-specific `pi-subagents`

#### Scenario: Implementation report is preserved

- **WHEN** implementation completes
- **THEN** `spec-implement` reports implementation summary, requirements covered, validation evidence, review/fix pass, spec amendments, changed files, and follow-up recommendations
- **AND** it does not create commits

### Requirement: Skills README lightly reflects the new workflow split

The skills repository README SHALL acknowledge that the skills include planning, writing, and implementing spec-backed work.

#### Scenario: README is updated

- **WHEN** the skills repository is updated
- **THEN** `README.md` lightly describes the expanded specification workflow coverage
- **AND** it does not become a full reference manual for the `spec-*` skills

## Implementation Constraints

- Skill source changes belong in `~/Projects/skills`.
- Prompt template changes belong in this dotfiles repository under `config/pi/prompts/`.
- Do not change skill installation, symlink management, or dotfiles Nix wiring for skill discovery.
- Agent Skill names must use Pi-compatible hyphenated names, not colon names: `spec-write`, `spec-plan`, and `spec-implement`.
- The `spec-write` skill should preserve the current `spec` skill behavior except for rename-related wording.
- Keep Pi-specific prompt-template mechanics in prompts rather than skills.
- Keep `pi-subagents` references in the `/implement` prompt rather than in `spec-implement`.

## Implementation Context

The user originally described the desired family as `spec:write`, `spec:plan`, and `spec:implement`, but Pi Agent Skill names allow lowercase letters, numbers, and hyphens only. The chosen implementation uses `spec-write`, `spec-plan`, and `spec-implement` while treating them conceptually as the same spec skill family.

The extraction boundary is intentionally not “prompts vs skills by size.” Prompts remain because they provide Pi slash-command UX and prompt-template argument expansion. Skills are introduced so the same workflows are reusable without the prompt templates and so prompts avoid maintaining duplicate copies of long workflow instructions.

## Validation Expectations

- Verify `~/Projects/skills/skills/spec-write/SKILL.md` exists with frontmatter `name: spec-write`.
- Verify `~/Projects/skills/skills/spec/SKILL.md` or `~/Projects/skills/skills/spec/` no longer exists.
- Verify `~/Projects/skills/skills/spec-plan/SKILL.md` and `~/Projects/skills/skills/spec-implement/SKILL.md` exist with valid hyphenated frontmatter names.
- Verify `config/pi/prompts/plan.md` points to `spec-plan` and no longer duplicates the full reusable planning workflow.
- Verify `config/pi/prompts/implement.md` points to `spec-implement` and no longer duplicates the full reusable implementation workflow.
- Verify `config/pi/prompts/implement.md` mentions `pi-subagents` for subagent execution.
- Verify `~/Projects/skills/skills/spec-implement/SKILL.md` does not mention `pi-subagents`.
- Use static text/audit commands such as `rg "skill: spec|spec-write|spec-plan|spec-implement|pi-subagents"` rather than adding a new deterministic validation script.

## Out of Scope

- Changing Pi skill discovery, symlink installation, or dotfiles Nix wiring for skills.
- Keeping a compatibility `spec` skill alias.
- Changing the core behavior of the current spec-writing skill beyond rename-related wording.
- Creating deterministic validation scripts for this migration.
- Changing Boomerang behavior or adding Boomerang orchestration.
- Creating commits for implementation changes made by `spec-implement`.

## Source Context

- `CONTEXT.md`
- `config/pi/prompts/plan.md`
- `config/pi/prompts/implement.md`
- `docs/specs/2026-05-23-plan-implement-flow.md`
- `~/Projects/skills/README.md`
- `~/Projects/skills/skills/spec/SKILL.md`
- Pi docs: `docs/skills.md`, `docs/prompt-templates.md`
