# Forge Pi Extension

## Purpose

Provide a lean Pi Extension command, `/forge <spec>`, that fulfills a durable Feature Spec by repeatedly running a pi-subagents chain over the first unchecked top-level implementation task. Forge keeps deterministic control in the command driver while delegating implementation, validation, review, review-guided fixes, and final summaries to subagent chains.

Forge is intentionally chain-first. The driver remains small: it selects tasks, invokes chains, parses simple machine-readable completion summaries, updates the Feature Spec task ledger, creates commits, and runs finalization after all tasks are complete.

## Requirements

### Requirement: Forge command entrypoint

The Forge Pi Extension SHALL expose a single `/forge <spec>` command entrypoint.

#### Scenario: Running Forge on a Feature Spec

- **WHEN** the user runs `/forge docs/specs/example.md`
- **THEN** Forge selects the first unchecked top-level checkbox task under `## Implementation Tasks`
- **AND** runs the Forge Task Chain for that task.

#### Scenario: Continuing through remaining tasks

- **WHEN** a Forge Task Chain reports `status: "done"`
- **THEN** Forge updates the selected task checkbox, creates the task commit, and continues to the next unchecked top-level task.

#### Scenario: Stopping on chain stop status

- **WHEN** a Forge Task Chain reports `status: "stop"`
- **THEN** Forge stops without updating the selected task checkbox
- **AND** prints the chain summary for the user.

### Requirement: Lean Forge Driver

The Forge Driver SHALL own deterministic control and repository mutations while delegating task work to pi-subagents chains.

#### Scenario: Driver responsibilities

- **WHEN** Forge runs a task
- **THEN** the driver selects the task, invokes the programmatic chain, parses the final JSON summary, verifies changed paths, updates the checkbox, and creates the commit.

#### Scenario: Chain responsibilities

- **WHEN** the Forge Task Chain runs
- **THEN** it gathers context, plans, implements, validates, refactors, runs clean-context review, synthesizes review feedback, applies review-guided fixes once, reruns validation, and emits final JSON.

### Requirement: Current-branch workflow

Forge SHALL run on the current checkout and current branch without creating worktrees or feature branches.

#### Scenario: Clean start

- **WHEN** Forge starts and `git status --porcelain` is empty
- **THEN** Forge records the current `HEAD` as the Review Base
- **AND** begins running on the current branch.

#### Scenario: Dirty start

- **WHEN** Forge starts and `git status --porcelain` is not empty
- **THEN** Forge reports the dirty status
- **AND** stops so the user can commit, stash, or clean manually.

### Requirement: Feature Spec task ledger

Forge SHALL treat the Feature Spec `## Implementation Tasks` checkbox list as the authoritative human-facing task ledger.

#### Scenario: Selecting tasks

- **WHEN** Forge needs a task
- **THEN** it selects the first unchecked top-level checkbox task under `## Implementation Tasks`.

#### Scenario: Handling sub-bullets

- **WHEN** a selected task contains non-checkbox sub-bullets
- **THEN** Forge passes those bullets to the Forge Task Chain as task guidance rather than independently runnable tasks.

#### Scenario: Completing a task

- **WHEN** the Forge Task Chain reports `status: "done"`
- **THEN** Forge updates exactly the selected task checkbox from unchecked to checked
- **AND** includes that checkbox update in the task commit.

### Requirement: Forge Task Chain

Forge SHALL implement each selected task with one programmatic pi-subagents chain.

#### Scenario: Task chain steps

- **WHEN** Forge invokes the task chain
- **THEN** the chain runs `context-builder`, `planner`, implementation `worker`, refactor-guided `worker`, parallel reviewers, review synthesis, fix `worker`, and final summary emission.

#### Scenario: Context and planning

- **WHEN** the chain begins
- **THEN** `context-builder` gathers relevant Feature Spec, selected task, repository, and validation context
- **AND** `planner` creates a concrete task plan, non-goals, likely changed paths, and validation expectations.

#### Scenario: Implementation and refactor

- **WHEN** the worker implements the task
- **THEN** it uses meaningful TDD only when an automated behavior test is applicable
- **AND** runs deterministic validation before the refactor step.

#### Scenario: Behavior-preserving refactor

- **WHEN** the refactor step runs
- **THEN** it uses the refactor skill or equivalent refactor instructions over the task diff or touched files
- **AND** prefers no change over speculative churn.

### Requirement: Parallel clean-context review

Forge SHALL review each implemented task through four clean-context reviewer axes.

#### Scenario: Review axes

- **WHEN** task review runs
- **THEN** Forge runs reviewers for spec compliance, correctness and regressions, validation and tests, and simplicity and maintainability.

#### Scenario: Review synthesis

- **WHEN** parallel reviewers finish
- **THEN** a synthesis step separates required fixes from optional improvements and feedback to ignore.

#### Scenario: Review-guided fixes

- **WHEN** required fixes are identified
- **THEN** a worker applies synthesized required fixes once
- **AND** reruns focused deterministic validation.

### Requirement: Final chain summary

Forge SHALL require a simple final JSON summary from the task chain before mutating the task ledger or committing.

#### Scenario: Done summary

- **WHEN** the task chain successfully completes a task
- **THEN** its final output contains a final fenced `json` block with `status: "done"`, `summary`, `changedPaths`, `validation`, and `commitTitle`.

#### Scenario: Stop summary

- **WHEN** the task chain cannot safely complete a task
- **THEN** its final output contains a final fenced `json` block with `status: "stop"` and `summary`.

#### Scenario: Missing validation evidence

- **WHEN** the final JSON has `status: "done"` without non-empty `validation`
- **THEN** Forge rejects the summary and stops without updating the checkbox or committing.

### Requirement: Task commits

Forge SHALL create one Conventional Commit for each completed Feature Spec task.

#### Scenario: Expected files only

- **WHEN** Forge is ready to commit a task
- **THEN** it compares dirty files to the chain-reported `changedPaths` plus the Feature Spec checkbox update
- **AND** stops if unexpected dirty files exist.

#### Scenario: Commit title

- **WHEN** Forge creates a task commit
- **THEN** it uses the chain-proposed `commitTitle` if it is a valid Conventional Commit title
- **AND** falls back to `feat: complete spec task N` when the proposed title is invalid.

### Requirement: Finalization after all tasks

Forge SHALL run a finalization sequence after all implementation tasks are checked and committed.

#### Scenario: Final branch review

- **WHEN** no unchecked tasks remain
- **THEN** Forge runs a final clean-context review over `git diff <Review Base>..HEAD` for standards and full Feature Spec compliance.

#### Scenario: Final review autofix

- **WHEN** final review finds required fixes
- **THEN** Forge runs one autofix chain step for required final review findings
- **AND** validates before creating a `fix: address final review findings` commit when files changed.

#### Scenario: Final simplification refactor

- **WHEN** final review fixes are committed or no fixes were needed
- **THEN** Forge runs one behavior-preserving simplification refactor over the Forge-produced diff
- **AND** validates before creating a `refactor: simplify forged implementation` commit when files changed.

#### Scenario: Final summary

- **WHEN** finalization completes
- **THEN** Forge prints a concise summary of task commits, final review fixes, refactor outcome, and validation evidence.

### Requirement: Progress display

Forge SHALL present clear task and chain progress without fake percentage progress.

#### Scenario: Interactive output

- **WHEN** Forge runs in an interactive terminal
- **THEN** it displays stable rows for the selected task and active chain phase with statuses such as `PENDING`, `RUNNING`, `DONE`, and `STOPPED`.

#### Scenario: Non-interactive output

- **WHEN** interactive rendering is unavailable
- **THEN** Forge falls back to deterministic line-oriented status updates.

## Implementation Constraints

- The command surface remains a Pi Extension Config Asset under `config/pi/extensions` or a directory linked from there.
- Forge exposes one command: `/forge <spec>`.
- Forge uses pi-subagents programmatic chain configuration for the task chain so it can include parallel review axes from day one.
- Forge does not create worktrees, feature branches, Pull Requests, automatic handoff processes, or context-capture commits.
- Forge Driver owns Feature Spec checkbox updates and git commits.
- Forge Task Chain treats the Feature Spec task ledger as read-only.
- Forge parses the last fenced `json` block from the task chain output as the task completion summary.
- `status: "done"` requires non-empty deterministic validation evidence.
- Final fix and final refactor commits use deterministic commit titles.

## Implementation Tasks

- [x] 1. Replace the old spec-fulfillment command surface with `/forge <spec>` only, removing legacy command names and one-task continuation behavior.
  - Covers: Requirement: Forge command entrypoint
- [x] 2. Implement current-branch startup safety with clean-tree enforcement and Review Base recording.
  - Covers: Requirement: Current-branch workflow
- [x] 3. Implement Feature Spec task parsing for top-level `## Implementation Tasks` checkboxes and deterministic checkbox updates owned by the Forge Driver.
  - Covers: Requirement: Feature Spec task ledger
- [x] 4. Implement the programmatic Forge Task Chain with `context-builder`, `planner`, implementation worker, refactor-guided worker, four parallel reviewers, synthesis, fix worker, and final JSON summary emission.
  - Covers: Requirement: Forge Task Chain; Requirement: Parallel clean-context review; Requirement: Final chain summary
- [x] 5. Implement final JSON extraction and validation, accepting only `status: "done"` or `status: "stop"` and requiring validation evidence for `done`.
  - Covers: Requirement: Final chain summary
- [x] 6. Implement task commit safety, including changed-path verification, checkbox inclusion, Conventional Commit title validation, and deterministic fallback titles.
  - Covers: Requirement: Task commits
- [x] 7. Implement the all-tasks repeat loop that continues after `done` and stops after `stop` or unsafe driver checks.
  - Covers: Requirement: Forge command entrypoint; Requirement: Lean Forge Driver
- [x] 8. Implement finalization: final branch review, one autofix pass with validation and commit, one simplification refactor with validation and commit, and final summary printing.
  - Covers: Requirement: Finalization after all tasks
- [x] 9. Add task and phase progress display with deterministic non-interactive fallback output.
  - Covers: Requirement: Progress display
- [x] 10. Add deterministic validation for Forge itself, including extension command loading, task parsing, chain invocation shape, final JSON parsing, checkbox updates, commit safety, and finalization behavior.
  - Covers: Requirement: Lean Forge Driver; Requirement: Final chain summary; Requirement: Task commits
- [ ] 11. Perform a Forge-readiness review of the spec and implementation, confirming the command is chain-first, driver-owned mutations are deterministic, validation evidence is required, and legacy behavior is absent.
  - Covers: Requirement: Finalization after all tasks

## Out of Scope

- Creating git worktrees.
- Creating feature branches.
- Creating Pull Requests.
- Running only one task by command option or continuation prompt.
- Automatic handoff to replacement Pi processes.
- Context-capture commits or automatic commits of pre-existing dirty changes.
- Retrying review/fix loops until pass.
- Marking tasks complete without deterministic validation evidence.
- Letting subagent chains mutate the Feature Spec task ledger.
- Rewriting prior task commits during finalization.
- Refactors that change behavior, public contracts, data shape, or user-visible output.
- Inventing heavyweight test infrastructure solely to satisfy TDD.

## Source Context

- `CONTEXT.md`
- `/home/pbaudry/.local/share/pi/npm/lib/node_modules/pi-subagents/README.md`
- `/home/pbaudry/.local/share/pi/npm/lib/node_modules/pi-subagents/skills/pi-subagents/SKILL.md`
- `/home/pbaudry/.local/share/pi/npm/lib/node_modules/pi-subagents/src/agents/chain-serializer.ts`
- `/home/pbaudry/.local/share/pi/npm/lib/node_modules/pi-subagents/src/runs/foreground/chain-execution.ts`
- `/home/pbaudry/.local/share/pi/npm/lib/node_modules/pi-subagents/src/slash/slash-commands.ts`

## Review Checklist

- [ ] `/forge <spec>` is the only command entrypoint for this feature.
- [ ] Forge runs on the current branch and requires a clean tree before start.
- [ ] Forge selects the first unchecked top-level Feature Spec implementation task.
- [ ] Forge Task Chain includes context building, planning, implementation, refactor, four parallel review axes, synthesis, one fix pass, and final JSON emission.
- [ ] Review axes include spec compliance, correctness/regressions, validation/tests, and simplicity/maintainability.
- [ ] Forge accepts only `status: "done"` or `status: "stop"` from the final JSON summary.
- [ ] `status: "done"` requires deterministic validation evidence.
- [ ] Forge Driver, not the chain, updates the selected checkbox.
- [ ] Forge Driver, not the chain, creates commits.
- [ ] Task commits include implementation changes and the Feature Spec checkbox update.
- [ ] Finalization runs final review, autofix with validation and commit, simplification refactor with validation and commit, then prints a summary.
- [ ] No legacy command names, one-task continuation mode, worktree behavior, handoff behavior, Pull Request behavior, or retry-loop behavior remains.
