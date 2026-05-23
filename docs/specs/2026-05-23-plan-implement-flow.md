# Plan Implement Flow

## Purpose

Make the `/plan` to `/implement` handoff smooth and explicit. A completed `/plan` session should leave the repository in a state where `/implement <spec-path>` can start directly after the user confirms the planning commit, and `/implement` should not contain implicit Boomerang orchestration.

## Requirements

### Requirement: Plan offers a planning commit after writing the spec

The `/plan` Pi Prompt Template SHALL, after creating or updating the Feature Spec and completing its spec self-check, identify the files it changed during the planning session and ask whether to commit those planning files.

#### Scenario: Spec-only planning change

- **WHEN** `/plan` creates or updates a Feature Spec
- **AND** no domain documentation or ADR files were changed by the planning session
- **THEN** `/plan` asks whether to commit the Feature Spec file
- **AND** the prompt invites the user to review or amend the file before confirming the commit

#### Scenario: Planning changes include domain docs

- **WHEN** `/plan` creates or updates a Feature Spec
- **AND** the planning session also changes `CONTEXT.md`, a context-specific glossary, or an ADR
- **THEN** `/plan` asks whether to commit all files changed by the planning session
- **AND** it does not intentionally stage unrelated files that were not changed by the planning session

### Requirement: Plan creates a narrow Conventional Commit when confirmed

The `/plan` Pi Prompt Template SHALL create a direct git commit for the tracked planning files when the user confirms the commit prompt.

#### Scenario: Commit confirmed for new spec

- **WHEN** `/plan` created a new Feature Spec
- **AND** the user confirms the planning commit
- **THEN** `/plan` stages only the files it changed during the planning session
- **AND** it creates a commit with a Conventional Commit message equivalent to `docs(specs): add <feature-slug> spec`

#### Scenario: Commit confirmed for existing spec

- **WHEN** `/plan` updated an existing Feature Spec
- **AND** the user confirms the planning commit
- **THEN** `/plan` stages only the files it changed during the planning session
- **AND** it creates a commit with a Conventional Commit message equivalent to `docs(specs): update <feature-slug> spec`

#### Scenario: Touched file had prior uncommitted edits

- **WHEN** a file changed by `/plan` already had uncommitted edits before `/plan` touched it
- **AND** the user confirms the planning commit
- **THEN** `/plan` may include the current contents of that touched file in the planning commit
- **AND** it does not refuse the commit solely because the file was already dirty

#### Scenario: Planning commit fails

- **WHEN** the user confirms the planning commit
- **AND** `git commit` fails
- **THEN** `/plan` reports the failure
- **AND** it does not claim the repository is ready for `/implement`

### Requirement: Plan handles declined or delayed commits honestly

The `/plan` Pi Prompt Template SHALL not claim the feature is ready for `/implement` when planning changes remain uncommitted or unstashed.

#### Scenario: User declines the planning commit

- **WHEN** `/plan` has written or updated planning files
- **AND** the user declines the planning commit
- **THEN** `/plan` reports that the spec was written but implementation is not ready until the planning changes are committed, stashed, or otherwise cleaned
- **AND** it does not end with the normal `Ready for: /implement <spec-path>` readiness line

#### Scenario: User delays for manual amendment

- **WHEN** `/plan` has written or updated planning files
- **AND** the user indicates they want to inspect or amend files before committing
- **THEN** `/plan` pauses for the user's next instruction
- **AND** it does not create the planning commit until the user confirms

#### Scenario: Unrelated dirty files remain after planning commit

- **WHEN** `/plan` successfully commits the tracked planning files
- **AND** unrelated dirty files remain in the working tree
- **THEN** `/plan` warns that `/implement` may still refuse to start until the unrelated changes are committed, stashed, or cleaned

### Requirement: Implement remains clean-tree gated

The `/implement` Pi Prompt Template SHALL continue to require a clean working tree before editing.

#### Scenario: Working tree is dirty at implementation start

- **WHEN** `/implement` is run for a valid Feature Spec
- **AND** `git status --porcelain` reports dirty files
- **THEN** `/implement` stops before editing
- **AND** it asks the user to commit, stash, or clean the working tree first

### Requirement: Implement contains no Boomerang orchestration

The `/implement` Pi Prompt Template SHALL not mention, invoke, prefer, or schedule Boomerang.

#### Scenario: Implement prompt is read

- **WHEN** a user or agent reads the `/implement` prompt
- **THEN** the prompt describes bounded implementation of a Feature Spec
- **AND** its description and body contain no Boomerang-specific wording

#### Scenario: User wants Boomerang compaction

- **WHEN** a user wants to run implementation through Boomerang
- **THEN** they can explicitly invoke Boomerang outside `/implement`, such as `/boomerang /implement <spec-path>`
- **AND** `/implement` itself does not attempt to detect or schedule Boomerang

## Implementation Constraints

- `/plan` should create the planning commit directly with git commands for this narrow case, rather than invoking the general `commit` skill.
- `/plan` should commit only files it tracks as changed by the planning session, accepting that those touched files may include user amendments made before commit confirmation.
- `/plan` should not run implementation validation before committing planning documentation; its existing Feature Spec self-check remains required.
- `/implement` should keep its existing clean working tree precondition.

## Implementation Context

This change fixes a handoff problem where `/plan` writes a Feature Spec but leaves the working tree dirty, causing `/implement` to stop immediately on its clean-tree precondition. The desired flow is that `/plan` owns the documentation handoff by offering a narrow planning commit, while `/implement` stays focused on implementation and does not embed Boomerang behavior. Boomerang remains available as an explicit user-level wrapper rather than an implicit implementation prompt concern.

## Validation Expectations

- Validate that `config/pi/prompts/plan.md` instructs the agent to ask for and create a narrow planning commit after the spec is written and self-checked.
- Validate that `config/pi/prompts/implement.md` contains no case-insensitive `boomerang` references.
- Validate that `/implement` still checks `git status --porcelain` and stops on a dirty working tree before editing.

## Out of Scope

- Changing Boomerang itself or uninstalling the Boomerang extension.
- Removing the user's ability to explicitly run `/boomerang /implement <spec-path>`.
- Making `/implement` tolerant of dirty working trees.
- Creating implementation task ledgers in Feature Specs.

## Source Context

- `CONTEXT.md`
- `config/pi/prompts/plan.md`
- `config/pi/prompts/implement.md`
