# Ralph Loop Pi Extension

## Purpose

Provide a Pi Extension control surface and Ralph Orchestrator that deterministically implements a durable Feature Spec on the current branch. Ralph consumes the Feature Spec task ledger, runs phase-specific Pi Agent Sessions, validates behavior with project-relevant deterministic checks, performs clean-context reviews, applies bounded behavior-preserving refactors, creates one conventional commit per verified task, performs a final two-axis review of the Ralph-produced diff, and cleans Ralph cache after final review passes.

Ralph is intentionally not a branch manager, worktree manager, or Pull Request creator. The user chooses the branch before running Ralph.

## Requirements

### Requirement: Ralph command entrypoints

The Ralph Pi Extension SHALL expose `/ralph <spec>` and `/ralph:once <spec>` command entrypoints with no flags.

#### Scenario: Running all remaining tasks

- **WHEN** the user runs `/ralph docs/specs/example.md`
- **THEN** Ralph runs all remaining unchecked top-level tasks under `## Implementation Tasks`
- **AND** it stops only when all tasks complete, a task fails, review blocks, deterministic verification is unavailable, or final review fails or blocks.

#### Scenario: Running one task first

- **WHEN** the user runs `/ralph:once docs/specs/example.md`
- **THEN** Ralph runs one complete task loop
- **AND** after the task completes, Ralph asks whether to continue with the next task when unchecked tasks remain.

#### Scenario: Continuing after ralph once

- **WHEN** the user accepts the `/ralph:once` continuation prompt
- **THEN** Ralph continues like `/ralph` until a normal stop condition occurs.

#### Scenario: Stopping after ralph once

- **WHEN** the user declines the `/ralph:once` continuation prompt
- **THEN** Ralph stops cleanly
- **AND** it preserves Ralph cache for later resumption.

### Requirement: Orchestrator subprocess

The Ralph Pi Extension SHALL remain the user-facing command surface while delegating durable workflow execution to a Ralph Orchestrator subprocess.

#### Scenario: Launching Ralph

- **WHEN** the user invokes a Ralph command
- **THEN** the extension parses the spec path, performs user interaction needed by the command surface, launches or resumes the Orchestrator, and reports status.

#### Scenario: Orchestrating phases

- **WHEN** the Orchestrator runs
- **THEN** it coordinates phase-specific Pi Agent Sessions for implementation, refactoring, task review, and final review
- **AND** it persists phase state in Pi cache after phase transitions.

### Requirement: Task progress display

Ralph SHALL present a Docker BuildKit-style live task progress display for task and phase execution, using stable status rows and animated spinners for active work rather than fake percentage progress.

#### Scenario: Displaying task progress

- **WHEN** Ralph runs a task loop
- **THEN** it displays stable rows for the selected task and active phases
- **AND** each row reports a clear status such as `PENDING`, `RUNNING`, `DONE`, `FAILED`, or `BLOCKED`.

#### Scenario: Animating active work

- **WHEN** a task or phase is actively running
- **THEN** Ralph shows an animated spinner on the active row
- **AND** it does not show percentage progress unless the underlying operation exposes real measurable progress.

#### Scenario: Non-interactive output

- **WHEN** Ralph runs without an interactive terminal or spinner rendering is unavailable
- **THEN** Ralph falls back to deterministic line-oriented status updates without animation.

### Requirement: Current-branch git workflow

Ralph SHALL run on the current checkout and current branch without creating git worktrees, Ralph feature branches, Automatic Handoff, Manual Handoff, or Context-Capture Commits.

#### Scenario: Clean start

- **WHEN** Ralph starts and `git status --porcelain` is empty
- **THEN** Ralph records the current `HEAD` as the Review Base
- **AND** it begins or resumes the run on the current branch.

#### Scenario: Dirty start with matching Ralph cache

- **WHEN** Ralph starts and the working tree is dirty
- **AND** matching active Ralph cache exists for the repo and Feature Spec
- **THEN** Ralph shows the dirty status and asks whether to resume
- **AND** on approval it enters a reconcile phase before continuing.

#### Scenario: Dirty start without matching Ralph cache

- **WHEN** Ralph starts and the working tree is dirty
- **AND** no matching active Ralph cache exists
- **THEN** Ralph shows the dirty status
- **AND** it stops so the user can commit, stash, or clean manually.

#### Scenario: Reconcile before resume

- **WHEN** Ralph resumes from dirty in-progress state
- **THEN** it verifies cache, spec checkbox state, current task, current commits, and dirty diff before selecting a safe next phase
- **AND** it stops if the state cannot be reconciled safely.

### Requirement: Feature Spec task ledger

Ralph SHALL treat the Feature Spec `## Implementation Tasks` checkbox list as the authoritative human-facing task ledger.

#### Scenario: Selecting tasks

- **WHEN** Ralph needs a task
- **THEN** it selects the first unchecked top-level checkbox task under `## Implementation Tasks`.

#### Scenario: Handling sub-bullets

- **WHEN** a task contains non-checkbox sub-bullets
- **THEN** Ralph treats those bullets as task guidance rather than independently runnable tasks.

#### Scenario: Completing a verified task

- **WHEN** a task passes review and final deterministic validation
- **THEN** Ralph updates that task checkbox from unchecked to checked
- **AND** includes the checkbox update in the task commit.

#### Scenario: No unchecked tasks at start

- **WHEN** no unchecked tasks remain
- **AND** matching active Ralph cache with a Review Base exists
- **THEN** Ralph runs final refactor, final validation, and final branch review.

#### Scenario: No unchecked tasks without cache

- **WHEN** no unchecked tasks remain
- **AND** no matching active Ralph cache exists
- **THEN** Ralph reports that no unchecked tasks remain and stops.

### Requirement: Pi cache state

Ralph SHALL persist orchestration state in Pi-owned cache storage, not in the repository.

#### Scenario: Persisting run state

- **WHEN** Ralph starts or transitions phases
- **THEN** it records repo identity, spec path, Review Base, current task, current phase, attempts, expected changed paths, validation evidence, review verdicts, task commits, and final review status as applicable.

#### Scenario: Cleaning cache

- **WHEN** final branch review passes
- **THEN** Ralph deletes the active cache for that Feature Spec immediately.

#### Scenario: Preserving cache

- **WHEN** Ralph stops because validation fails, review fails or blocks, deterministic verification is unavailable, final review fails or blocks, `/ralph:once` is declined, or the process is interrupted
- **THEN** Ralph preserves cache for later resumption.

### Requirement: Validation discovery and evidence

Ralph SHALL require project-relevant deterministic validation evidence before completing a task or final review.

#### Scenario: Run-level validation discovery

- **WHEN** Ralph starts a run
- **THEN** it discovers baseline validation options from project docs, agent instructions, Feature Spec guidance, and project files such as `package.json`, `flake.nix`, `Justfile`, `Makefile`, or CI configuration.

#### Scenario: Task-level validation refinement

- **WHEN** Ralph implements a task
- **THEN** it refines validation to the smallest meaningful task-specific checks
- **AND** runs broader checks when needed to support the completion claim.

#### Scenario: Manual verification only

- **WHEN** Ralph cannot produce meaningful deterministic validation evidence
- **THEN** it reports the task as unverified
- **AND** it does not check the task or create a success commit.

### Requirement: Meaningful test-first behavior

Ralph SHALL instruct implementation sessions to use TDD only when a meaningful automated behavior test is applicable.

#### Scenario: Meaningful behavior can be tested

- **WHEN** the selected task changes behavior covered by an existing test style or framework
- **THEN** Ralph instructs the implementation session to write or update a failing test before implementation.

#### Scenario: TDD is not meaningful

- **WHEN** the only possible test would assert incidental implementation details, or the task is declarative/tooling work without an applicable test framework
- **THEN** Ralph does not require a new test
- **AND** it requires the session to identify deterministic validation before editing.

### Requirement: Per-task implementation loop

Ralph SHALL complete each task through a persisted phase loop before committing it.

#### Scenario: Task phases

- **WHEN** Ralph selects a task
- **THEN** it creates an implementation Pi Agent Session, implements the task, validates it, runs a bounded per-task refactor using the refactor skill, validates again if refactor changed files, runs clean-eye task review, fixes real review failures through a bounded loop, updates the task checkbox, validates the exact tree to be committed, and creates the task commit.

#### Scenario: Per-task refactor

- **WHEN** initial implementation validation passes
- **THEN** Ralph runs a bounded behavior-preserving refactor session guided by the refactor skill and scoped to the task diff or touched files
- **AND** it prefers no change over speculative churn.

#### Scenario: Fix loop refactor

- **WHEN** a review failure requires fixes
- **AND** the fixes introduce obvious complexity or duplication
- **THEN** Ralph may run the refactor skill on the touched fix area before revalidation and re-review.

### Requirement: Clean-eye task review

Ralph SHALL review each task from a fresh context before completion.

#### Scenario: Task review inputs

- **WHEN** task review runs
- **THEN** the review session receives the selected task, relevant Feature Spec sections, final task diff, changed files, validation evidence, and implementation summary.

#### Scenario: Task review verdict

- **WHEN** the review session completes
- **THEN** it returns machine-readable `PASS`, `FAIL`, or `BLOCKED`
- **AND** `FAIL` includes required fixes rather than subjective preferences.

### Requirement: Bounded fix and retest

Ralph SHALL limit review-driven task fix iterations.

#### Scenario: Review fails

- **WHEN** task review returns `FAIL`
- **THEN** Ralph fixes only required issues, reruns relevant validation, and reruns task review.

#### Scenario: Fix limit reached

- **WHEN** three fix/retest/re-review iterations have occurred without `PASS`
- **THEN** Ralph stops without checking the task or creating a success commit.

#### Scenario: Review blocked

- **WHEN** task review returns `BLOCKED`
- **THEN** Ralph stops and preserves cache.

### Requirement: Task commits

Ralph SHALL create one conventional commit for each verified completed task.

#### Scenario: Expected files only

- **WHEN** Ralph is ready to commit a task
- **THEN** it compares dirty files to expected changed paths for the task
- **AND** it stops for human intervention if unexpected dirty files exist.

#### Scenario: Commit contents

- **WHEN** Ralph creates a task commit
- **THEN** the commit includes implementation changes, meaningful tests or validation changes, per-task refactor changes, and the Feature Spec checkbox update.

#### Scenario: Commit message generation

- **WHEN** Ralph needs a commit message
- **THEN** it may use a cheap non-thinking model to propose a Conventional Commit title and body
- **AND** Ralph validates or falls back to deterministic formatting before committing.

### Requirement: Whole-feature refactor

Ralph SHALL perform a bounded whole-feature refactor after all implementation tasks are complete and before final review.

#### Scenario: Whole-feature refactor changes files

- **WHEN** the whole-feature refactor makes behavior-preserving changes
- **THEN** Ralph runs broad relevant validation
- **AND** creates a separate conventional `refactor(...)` commit.

#### Scenario: Whole-feature refactor makes no changes

- **WHEN** the whole-feature refactor finds no worthwhile simplification
- **THEN** Ralph reports that no refactor changes were needed and proceeds to final validation and review.

### Requirement: Final branch review

Ralph SHALL perform a final clean-context two-axis branch review after all tasks and whole-feature refactor are complete.

#### Scenario: Review diff

- **WHEN** final review runs
- **THEN** it reviews `git diff <Review Base>..HEAD`, where Review Base is the `HEAD` recorded at Ralph run start.

#### Scenario: Standards axis

- **WHEN** final review runs
- **THEN** it evaluates repository standards, domain language, architecture conventions, maintainability, and CI-quality validation expectations.

#### Scenario: Spec axis

- **WHEN** final review runs
- **THEN** it evaluates whether the Ralph-produced diff faithfully implements the Feature Spec.

#### Scenario: Final review passes

- **WHEN** final review returns `PASS` on both axes
- **THEN** Ralph reports the current branch as reviewed and ready
- **AND** deletes Ralph cache for the Feature Spec.

#### Scenario: Final review fails or blocks

- **WHEN** final review returns `FAIL` or `BLOCKED`
- **THEN** Ralph preserves cache and does not claim the branch is ready.

## Implementation Constraints

- The command surface remains a Pi Extension Config Asset under `config/pi/extensions` or a directory linked from there.
- Durable workflow execution belongs in a Ralph Orchestrator subprocess rather than a monolithic extension command.
- Ralph runs on the current branch and never creates worktrees, Ralph feature branches, Automatic Handoff, Manual Handoff, or Context-Capture Commits.
- Ralph exposes commands, not flags: `/ralph <spec>` and `/ralph:once <spec>`.
- Pull Request creation is out of scope.
- Ralph cache is stored under Pi-owned cache storage and is deleted immediately after final review PASS.
- Refactor phases follow the existing refactor skill contract: improve code shape without changing behavior.
- Final branch review uses the existing review skill for two-axis Standards and Spec review.
- Per-task review uses a Ralph-specific clean-eye task review prompt.
- Commit message generation may use a cheap non-thinking model, but Ralph must validate or fall back deterministically.

## Implementation Tasks

- [x] 1. Replace the existing Ralph extension with a thin `/ralph` and `/ralph:once` command surface that accepts only a Feature Spec path and launches the Ralph Orchestrator subprocess.
  - Covers: Requirement: Ralph command entrypoints; Requirement: Orchestrator subprocess
- [x] 2. Implement current-branch startup safety, including clean-start Review Base recording, dirty-start prompting, matching-cache detection, and reconcile-before-resume behavior.
  - Covers: Requirement: Current-branch git workflow
- [x] 3. Implement Pi cache state for run metadata, current task, phase transitions, attempts, expected changed paths, validation evidence, review verdicts, task commits, final review status, preservation on stop, and deletion after final review PASS.
  - Covers: Requirement: Pi cache state
- [x] 4. Implement Feature Spec task parsing and deterministic checkbox updates for top-level `## Implementation Tasks` checkboxes, including no-unchecked-task behavior with and without active cache.
  - Covers: Requirement: Feature Spec task ledger
- [x] 5. Implement run-level validation discovery and per-task validation refinement using project docs, agent instructions, Feature Spec guidance, project files, and existing test patterns.
  - Covers: Requirement: Validation discovery and evidence
- [x] 6. Implement the task implementation phase with meaningful TDD guidance, deterministic validation selection before editing, and task-specific implementation prompts.
  - Covers: Requirement: Meaningful test-first behavior; Requirement: Per-task implementation loop
- [x] 7. Implement per-task refactor sessions using the refactor skill after initial validation, scoped to task diff or touched files, with validation rerun when refactor changes files.
  - Covers: Requirement: Per-task implementation loop
- [ ] 8. Implement fresh-context Ralph-specific task review with machine-readable `PASS`, `FAIL`, or `BLOCKED` verdicts and review inputs limited to relevant spec, diff, files, summaries, and validation evidence.
  - Covers: Requirement: Clean-eye task review
- [ ] 9. Implement bounded fix/retest/re-review with at most three iterations, required-fix-only scope, optional fix-area refactor when fixes introduce complexity, and stop behavior for exhausted or blocked reviews.
  - Covers: Requirement: Bounded fix and retest
- [ ] 10. Implement verified task completion, including checkbox update before final validation, expected-file commit safety, cheap-model-assisted Conventional Commit generation with deterministic fallback, and one commit per verified task.
  - Covers: Requirement: Task commits; Requirement: Feature Spec task ledger
- [ ] 11. Implement `/ralph` all-remaining-tasks control flow and `/ralph:once` one-task-then-confirm continuation behavior, including Docker BuildKit-style live task and phase status rows with spinners for active work and deterministic non-interactive fallback output.
  - Covers: Requirement: Ralph command entrypoints; Requirement: Per-task implementation loop; Requirement: Task progress display
- [ ] 12. Implement whole-feature refactor after all tasks complete, using the refactor skill over the Ralph-produced diff and creating a separate `refactor(...)` commit only when files change.
  - Covers: Requirement: Whole-feature refactor
- [ ] 13. Implement final validation and final clean-context two-axis branch review using the existing review skill over `git diff <Review Base>..HEAD`, with cache cleanup only after PASS.
  - Covers: Requirement: Final branch review
- [ ] 14. Add deterministic validation for Ralph itself, including extension command loading, Orchestrator subprocess behavior, task parsing, cache persistence/cleanup, git safety behavior, phase transitions, and repository-level checks discoverable for this project.
  - Covers: Requirement: Validation discovery and evidence
- [ ] 15. Perform a Ralph-readiness review of the revised spec and implementation, ensuring obsolete worktree, handoff, Context-Capture Commit, flag, and Pull Request behavior has been removed and the current-branch deterministic loop is auditable.
  - Covers: Requirement: Final branch review; Requirement: Task commits

## Out of Scope

- Creating git worktrees.
- Creating Ralph feature branches.
- Automatic Handoff or Manual Handoff between Pi processes.
- Context-Capture Commits or any automatic commit/stash of pre-existing dirty changes.
- Command flags such as `--all`, `--task`, `--base`, `--final-review`, `--pr`, or `--no-handoff`.
- Pull Request creation.
- Marking tasks complete without deterministic verification.
- Rewriting prior task commits during final review by default.
- Refactors that change behavior, public contracts, data shape, or user-visible output.
- Inventing heavyweight test infrastructure solely to satisfy TDD.

## Source Context

- `CONTEXT.md`
- `docs/adr/0005-ralph-current-branch-orchestration.md`
- `docs/adr/0003-ralph-automatic-handoff.md`
- `docs/adr/0004-ralph-context-capture-commits.md`
- `/home/pbaudry/.agents/skills/refactor/SKILL.md`
- `/home/pbaudry/.agents/skills/review/SKILL.md`
- `config/pi/extensions/ralph-loop.ts`
- `modules/terminal/pi.nix`
- `config/pi/settings.json`
- `flake.nix`
- `/nix/store/jxl3pw46n1mr71h4hfxq3cg89hzg2cb6-pi-coding-agent-0.73.0/lib/node_modules/pi-monorepo/docs/extensions.md`
- `/nix/store/jxl3pw46n1mr71h4hfxq3cg89hzg2cb6-pi-coding-agent-0.73.0/lib/node_modules/pi-monorepo/docs/sdk.md`

## Review Checklist

- [ ] `/ralph <spec>` runs all remaining tasks and has no flags.
- [ ] `/ralph:once <spec>` runs one task and asks whether to continue.
- [ ] Ralph shows Docker BuildKit-style task and phase status rows with spinners for active work, without fake percentage progress.
- [ ] Ralph runs on the current branch and does not create worktrees or branches.
- [ ] Ralph records Review Base as `HEAD` at clean run start.
- [ ] Dirty startup without matching cache stops after reporting status.
- [ ] Dirty startup with matching cache asks and reconciles before resume.
- [ ] Feature Spec checkboxes are updated only after review PASS and before final validation.
- [ ] Deterministic validation evidence is required before task completion.
- [ ] TDD is used only when it meaningfully validates behavior.
- [ ] Per-task refactor uses the refactor skill before task review.
- [ ] Task review is fresh-context and returns `PASS`, `FAIL`, or `BLOCKED`.
- [ ] Fix/retest/re-review is capped at three iterations.
- [ ] Task commits include only expected files and one verified task each.
- [ ] Commit messages are Conventional Commit formatted with deterministic fallback.
- [ ] Whole-feature refactor runs before final review and commits only if files change.
- [ ] Final branch review uses the review skill over `git diff <Review Base>..HEAD`.
- [ ] Ralph cache is deleted immediately after final review PASS.
- [ ] Pull Request creation, worktrees, handoff, context-capture commits, and command flags are absent.
