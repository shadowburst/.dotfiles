# Plan Implement Flow

## Purpose

Make the `/plan` to `/implement` handoff smooth and explicit for both durable feature work and lightweight session-only work. A completed `/plan` session should either leave the repository ready for `/implement <spec-path>` after a planning commit, or present a chat-only Session Plan that can be implemented immediately or consumed by `/implement` without requiring a Feature Spec. `/implement` should support both Feature Spec execution and tightly bounded Session Plan execution while preserving clean-tree discipline and avoiding implicit Boomerang orchestration.

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
- **THEN** `/plan` warns that `/implement` may refuse to start until the unrelated changes are committed, stashed, or cleaned

### Requirement: Plan offers a Session Plan branch after grilling

The `/plan` Pi Prompt Template SHALL, after the grilling session reaches stable understanding, classify whether the work warrants a durable Feature Spec or is appropriate for a chat-only Session Plan.

#### Scenario: Work does not warrant a Feature Spec

- **WHEN** `/plan` determines that the requested work does not introduce or change a durable behavior contract, domain term, cross-session decision, or non-obvious constraint
- **THEN** `/plan` recommends implementing immediately from a Session Plan
- **AND** it explains why no Feature Spec is warranted
- **AND** it asks the user whether to write or update a Feature Spec anyway, or implement immediately

#### Scenario: Work warrants a Feature Spec

- **WHEN** `/plan` determines that the requested work changes durable behavior, requirements, constraints, out-of-scope boundaries, domain language, or architectural decisions
- **THEN** `/plan` recommends writing or updating a Feature Spec
- **AND** it asks the user whether to write or update the Feature Spec, or implement immediately from a Session Plan

#### Scenario: User overrides toward a Feature Spec

- **WHEN** `/plan` recommends immediate Session Plan implementation
- **AND** the user chooses to write or update a Feature Spec instead
- **THEN** `/plan` follows the normal Feature Spec creation or update flow

#### Scenario: User overrides away from a Feature Spec

- **WHEN** `/plan` recommends writing or updating a Feature Spec
- **AND** the user chooses immediate Session Plan implementation instead
- **THEN** `/plan` warns what durable context may be lost by skipping the Feature Spec
- **AND** it asks for explicit confirmation before implementing

### Requirement: Session Plans are structured and chat-only

The `/plan` Pi Prompt Template SHALL use a recognizable, short Session Plan block when the user chooses immediate implementation or when a later `/implement` invocation may need to consume the session-only plan.

#### Scenario: Session Plan is presented

- **WHEN** `/plan` presents session-only work for immediate implementation
- **THEN** it writes a chat-only block headed `## Session Plan`
- **AND** the block includes why no Feature Spec is warranted, scope, acceptance, and validation
- **AND** it does not write the Session Plan to `docs/specs`

#### Scenario: Durable context is discovered during session planning

- **WHEN** the grilling session resolves durable domain language or a durable decision while preparing a Session Plan
- **THEN** `/plan` may update `CONTEXT.md` or offer an ADR according to the normal `grill-with-docs` rules
- **AND** the Session Plan itself remains chat-only

### Requirement: Plan may implement a Session Plan immediately after confirmation

The `/plan` Pi Prompt Template SHALL be allowed to implement a Session Plan in the same session only after explicit user confirmation.

#### Scenario: User confirms immediate implementation

- **WHEN** `/plan` presents a Session Plan
- **AND** the user confirms immediate implementation
- **THEN** `/plan` checks `git status --porcelain` before editing
- **AND** if the working tree is clean, it may implement the Session Plan
- **AND** it does not create a commit

#### Scenario: Working tree is dirty before immediate implementation

- **WHEN** `/plan` is about to implement a Session Plan
- **AND** `git status --porcelain` reports dirty files
- **THEN** `/plan` stops before editing
- **AND** it asks the user to commit, stash, or clean the working tree first

#### Scenario: Immediate implementation completes

- **WHEN** `/plan` implements a Session Plan
- **THEN** it reports changed files and validation evidence
- **AND** it leaves the implementation changes uncommitted for the user to inspect

### Requirement: Implement remains clean-tree gated

The `/implement` Pi Prompt Template SHALL continue to require a clean working tree before editing for both Feature Spec and Session Plan execution.

#### Scenario: Working tree is dirty at implementation start

- **WHEN** `/implement` is run for a valid Feature Spec or Session Plan
- **AND** `git status --porcelain` reports dirty files
- **THEN** `/implement` stops before editing
- **AND** it asks the user to commit, stash, or clean the working tree first

### Requirement: Implement can execute without a Feature Spec from current session context

The `/implement` Pi Prompt Template SHALL support implementation without a Feature Spec only when the current session provides a bounded implementation target.

#### Scenario: Explicit Session Plan exists

- **WHEN** `/implement` is run without a Feature Spec path
- **AND** the current session contains exactly one explicit `## Session Plan` block that has not already been superseded
- **THEN** `/implement` may use that Session Plan as its implementation contract
- **AND** it follows the same clean-tree, validation, review, and final-report discipline used for Feature Spec implementation where applicable

#### Scenario: Immediately preceding instruction is unambiguous

- **WHEN** `/implement` is run without a Feature Spec path
- **AND** there is no explicit Session Plan
- **AND** the immediately preceding user instruction provides an unambiguous implementation target, scope, and acceptance expectation
- **THEN** `/implement` may proceed from that immediate session context

#### Scenario: Session context is ambiguous

- **WHEN** `/implement` is run without a Feature Spec path
- **AND** there is no current unambiguous Session Plan or immediately preceding implementation instruction
- **THEN** `/implement` stops before editing
- **AND** it asks the user to provide `/implement <spec-path>`, rerun `/plan`, or provide an explicit implementation instruction

#### Scenario: Multiple possible Session Plans exist

- **WHEN** `/implement` is run without a Feature Spec path
- **AND** the current session contains multiple plausible Session Plans or implementation targets
- **THEN** `/implement` stops before editing
- **AND** it asks the user to choose the intended target

### Requirement: Implement contains no Boomerang orchestration

The `/implement` Pi Prompt Template SHALL not mention, invoke, prefer, or schedule Boomerang.

#### Scenario: Implement prompt is read

- **WHEN** a user or agent reads the `/implement` prompt
- **THEN** the prompt describes bounded implementation of a Feature Spec or Session Plan
- **AND** its description and body contain no Boomerang-specific wording

#### Scenario: User wants Boomerang compaction

- **WHEN** a user wants to run implementation through Boomerang
- **THEN** they can explicitly invoke Boomerang outside `/implement`, such as `/boomerang /implement <spec-path>`
- **AND** `/implement` itself does not attempt to detect or schedule Boomerang

## Implementation Constraints

- `/plan` should create the planning commit directly with git commands for Feature Spec planning files, rather than invoking the general `commit` skill.
- `/plan` should commit only files it tracks as changed by the planning session, accepting that those touched files may include user amendments made before commit confirmation.
- `/plan` should not run implementation validation before committing planning documentation; its existing Feature Spec self-check remains required.
- `/plan` should not create commits for Session Plan implementation changes.
- `/implement` should keep its existing clean working tree precondition for both Feature Spec and Session Plan execution.
- Session Plans should use this chat-only shape:

```md
## Session Plan

No Feature Spec is warranted because: <reason>

Scope:
- <what will change>

Acceptance:
- <observable expected result or done condition>

Validation:
- <commands/checks to run, or why none applies>
```

## Implementation Context

This change extends the existing `/plan` and `/implement` handoff. The earlier flow fixed a handoff problem where `/plan` wrote a Feature Spec but left the working tree dirty, causing `/implement` to stop immediately on its clean-tree precondition. The desired durable-work flow remains: `/plan` owns the documentation handoff by offering a narrow planning commit, while `/implement` stays focused on implementation and does not embed Boomerang behavior.

The new session-only branch avoids forcing a Feature Spec for tiny or transient work. The boundary is not based on line count: one-line durable behavior changes may still warrant a Feature Spec, while larger mechanical edits may not. A Session Plan is appropriate when the work does not introduce or change a durable behavior contract, domain term, cross-session decision, or non-obvious constraint. It reduces documentation ceremony without weakening clean-tree discipline or diff hygiene.

## Validation Expectations

- Validate that `config/pi/prompts/plan.md` instructs the agent to ask for and create a narrow planning commit after a Feature Spec is written and self-checked.
- Validate that `config/pi/prompts/plan.md` instructs the agent to present the Feature Spec vs Session Plan choice after grilling reaches stable understanding.
- Validate that `config/pi/prompts/plan.md` includes the structured `## Session Plan` block shape and requires explicit confirmation before immediate implementation.
- Validate that `config/pi/prompts/implement.md` can proceed without a Feature Spec only from an explicit current-session Session Plan or an unambiguous immediately preceding instruction.
- Validate that `config/pi/prompts/implement.md` contains no case-insensitive `boomerang` references.
- Validate that `/implement` still checks `git status --porcelain` and stops on a dirty working tree before editing.

## Out of Scope

- Changing Boomerang itself or uninstalling the Boomerang extension.
- Removing the user's ability to explicitly run `/boomerang /implement <spec-path>`.
- Making `/implement` tolerant of dirty working trees.
- Creating implementation task ledgers in Feature Specs.
- Persisting Session Plans under `docs/specs` or another planning-file directory.
- Creating commits for implementation changes made from a Session Plan.

## Source Context

- `CONTEXT.md`
- `config/pi/prompts/plan.md`
- `config/pi/prompts/implement.md`
