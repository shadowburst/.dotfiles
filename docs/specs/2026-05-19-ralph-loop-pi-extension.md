# Ralph Loop Pi Extension

## Purpose

Provide a Pi Extension that orchestrates a Ralph Loop from a durable Feature Spec. The extension helps an implementation agent complete exactly one spec task at a time by isolating work in a git worktree, driving implementation, deterministic validation, clean-context review, bounded fixes, final verification, spec checkbox updates, and conventional commits.

The loop is intended to make task execution auditable and low-conflict: the Feature Spec remains the durable task ledger, each verified task becomes one commit, and a completed feature branch receives a final two-axis review against a Review Base. A Pull Request is not considered done merely because local checks passed; when hosted Pull Request checks are available, Ralph must use a Remote Check Gate before declaring the Pull Request ready.

## Requirements

### Requirement: Ralph command entrypoint

The Ralph Loop Pi Extension SHALL provide a slash-command entrypoint that accepts a Feature Spec path, optional mode or task selection arguments, Pull Request and remote-check modes, and a handoff opt-out flag.

#### Scenario: Running one task from a spec

- **WHEN** the user runs `/ralph docs/specs/example.md`
- **THEN** the extension selects exactly one unchecked implementation task from that Feature Spec
- **AND** the extension starts or resumes a Ralph Loop for that task.

#### Scenario: Running all tasks explicitly

- **WHEN** the user runs Ralph with an explicit all-tasks mode
- **THEN** the extension may continue through all unchecked tasks
- **AND** it still executes each task as a separate Ralph Loop iteration with its own review, verification, checkbox update, and commit.

#### Scenario: Selecting a specific task

- **WHEN** the user supplies a task number
- **THEN** the extension selects that unchecked top-level task under `## Implementation Tasks`
- **AND** it does not run unrelated unchecked tasks unless all-tasks mode is explicitly enabled.

#### Scenario: Remote check mode

- **WHEN** the user invokes `/ralph docs/specs/example.md --remote-checks`
- **THEN** Ralph resumes the Remote Check Gate for an existing Ralph Pull Request
- **AND** it does not create a new Pull Request when none exists.

#### Scenario: Disabling Automatic Handoff

- **WHEN** the user supplies `--no-handoff`
- **THEN** Ralph does not perform Automatic Handoff for that invocation
- **AND** it uses Manual Handoff if the command must continue from the Ralph worktree.

### Requirement: Feature Spec task ledger

The Ralph Loop Pi Extension SHALL treat the Feature Spec `## Implementation Tasks` checkbox list as the authoritative task ledger.

#### Scenario: Selecting the next task

- **WHEN** no task number is supplied
- **THEN** Ralph selects the first unchecked top-level checkbox task under `## Implementation Tasks`.

#### Scenario: Handling sub-bullets

- **WHEN** a task contains non-checkbox sub-bullets
- **THEN** Ralph treats those bullets as task guidance rather than independently runnable tasks.

#### Scenario: No unchecked tasks remain

- **WHEN** the Feature Spec contains no unchecked implementation tasks
- **THEN** Ralph reports that there is no task to run
- **AND** it makes no implementation changes.

#### Scenario: Completing a verified task

- **WHEN** a task passes review and final deterministic verification
- **THEN** Ralph updates that task checkbox in the Feature Spec from unchecked to checked
- **AND** it includes the checkbox update in the task commit.

### Requirement: Validation and review tasks

The Ralph Loop Pi Extension SHALL execute validation-only and review-only tasks as first-class tasks when they appear in the Feature Spec.

#### Scenario: Running a validation task

- **WHEN** the selected task is primarily a validation task
- **THEN** Ralph runs or discovers the specified validation checks
- **AND** it fixes only issues directly revealed by those checks and relevant to the Feature Spec.

#### Scenario: Validation task already passes

- **WHEN** a validation task produces no code changes because the relevant checks already pass
- **THEN** Ralph may check the task after deterministic verification
- **AND** it creates a conventional commit containing the spec checkbox update.

### Requirement: Meaningful test-first behavior

The Ralph Loop Pi Extension SHALL instruct the implementation agent to use TDD only when a meaningful automated test is applicable.

#### Scenario: Meaningful behavior can be tested

- **WHEN** the selected task describes feature behavior covered by an existing test style or framework
- **THEN** Ralph instructs the agent to write or update a failing test before implementation.

#### Scenario: Mundane implementation detail

- **WHEN** the only possible test would assert an incidental detail such as a CSS class or HTML attribute without validating feature behavior
- **THEN** Ralph does not require a new test
- **AND** it relies on more appropriate deterministic validation.

#### Scenario: Declarative configuration task

- **WHEN** the task changes declarative configuration and no conventional test framework applies
- **THEN** Ralph instructs the agent to identify the smallest meaningful validation command before implementation.

#### Scenario: No sensible test can be added

- **WHEN** no meaningful automated test or project validation can be added
- **THEN** Ralph requires the agent to state why TDD is not applicable
- **AND** it must still seek deterministic verification before completion.

### Requirement: Deterministic verification gate

The Ralph Loop Pi Extension SHALL require deterministic verification evidence before marking a task complete or creating a success commit.

#### Scenario: Repository validation contract exists

- **WHEN** the repository contains `docs/agents/specs.md` with validation guidance
- **THEN** Ralph treats that repository-level validation contract as the baseline for merge readiness
- **AND** a Feature Spec may tighten but not weaken that contract unless the user explicitly approves an exception.

#### Scenario: Project checks exist

- **WHEN** the repository exposes relevant validation commands through project files such as `flake.nix`, `package.json`, `Justfile`, `Makefile`, or similar
- **THEN** Ralph runs the smallest relevant checks first
- **AND** it runs broader checks when needed to support the claim that CI-quality validation would pass.

#### Scenario: No deterministic verification exists

- **WHEN** Ralph cannot produce meaningful automated verification evidence
- **THEN** it reports the task as implemented but unverified
- **AND** it leaves the task unchecked unless the user explicitly allows manual verification.

#### Scenario: Verification command fails

- **WHEN** a validation command fails
- **THEN** Ralph treats the task as not complete
- **AND** it enters the bounded fix/retest flow or reports failure when the bound is exhausted.

### Requirement: Worktree isolation

The Ralph Loop Pi Extension SHALL isolate implementation work in a dedicated git worktree created under `.worktrees` from the repository HEAD at the start of a spec run.

#### Scenario: First Ralph invocation for a spec

- **WHEN** the user invokes Ralph for a spec outside an existing Ralph worktree
- **THEN** Ralph creates a feature branch and worktree under `.worktrees/ralph-<spec-slug>`
- **AND** implementation occurs in that worktree rather than the original checkout.

#### Scenario: Dirty original checkout before first worktree creation

- **WHEN** the user invokes Ralph outside an existing Ralph worktree
- **AND** no Ralph worktree exists yet for that Feature Spec
- **AND** the original checkout has tracked or untracked changes
- **THEN** Ralph shows the dirty status and warns that those changes will be missing from the Ralph worktree unless committed
- **AND** Ralph asks whether to commit all dirty changes before creating the worktree.

#### Scenario: User confirms Context-Capture Commit

- **WHEN** Ralph asks whether to commit dirty original-checkout changes before first worktree creation
- **AND** the user confirms
- **THEN** Ralph stages all dirty changes with `git add -A`
- **AND** Ralph creates a Context-Capture Commit on the current checkout branch titled `chore(ralph): capture pre-worktree changes`
- **AND** the commit body records that the user approved the Context-Capture Commit and includes the pre-commit `git status --short` output
- **AND** Ralph creates the Ralph branch and worktree from that new commit
- **AND** Ralph records that new commit as `createdFrom` in cache metadata.

#### Scenario: Context-Capture Commit fails

- **WHEN** Ralph attempts the user-approved Context-Capture Commit
- **AND** `git commit` fails because of hooks, signing, concurrent file changes, or any other git error
- **THEN** Ralph does not bypass hooks or retry with `--no-verify`
- **AND** Ralph stops before creating or handing off to the worktree
- **AND** it reports the failure and leaves the checkout in git's resulting state for the user to resolve.

#### Scenario: User declines Context-Capture Commit

- **WHEN** Ralph asks whether to commit dirty original-checkout changes before first worktree creation
- **AND** the user declines
- **THEN** Ralph stops before creating or handing off to the worktree
- **AND** it explains that continuing would omit uncommitted context.

#### Scenario: Pre-worktree commit confirmation unavailable

- **WHEN** the original checkout is dirty before first worktree creation
- **AND** Ralph cannot ask for interactive confirmation
- **THEN** Ralph stops safely without committing
- **AND** it shows the dirty status and the manual commands needed to commit the changes before rerunning Ralph.

#### Scenario: Dirty original checkout after worktree already exists

- **WHEN** the user invokes Ralph outside the Ralph worktree
- **AND** a Ralph worktree already exists for that Feature Spec
- **AND** the original checkout has tracked or untracked changes
- **THEN** Ralph warns that those changes are not part of the existing Ralph branch
- **AND** Ralph does not automatically commit, merge, cherry-pick, or otherwise port those changes into the Ralph worktree.

#### Scenario: Repeated manual invocation

- **WHEN** the user invokes Ralph again for the same spec from the existing Ralph worktree
- **THEN** Ralph reuses the current worktree and branch
- **AND** it does not create another worktree.

#### Scenario: Worktree path is not ignored

- **WHEN** `.worktrees` is not ignored by the repository
- **THEN** Ralph warns the user
- **AND** it does not edit `.gitignore` automatically.

#### Scenario: Automatic Handoff from outside the worktree

- **WHEN** the user invokes Ralph for any mode from outside the Ralph worktree
- **THEN** Ralph creates or reuses the feature branch and worktree under `.worktrees/ralph-<spec-slug>`
- **AND** Ralph performs Automatic Handoff by starting a replacement Pi process rooted in that worktree and rerunning the Ralph command there.

#### Scenario: Review or Pull Request mode without an existing run

- **WHEN** the user invokes Ralph with `--final-review` or `--pr`
- **AND** no Ralph state or worktree exists for that Feature Spec
- **THEN** Ralph stops without creating a new worktree
- **AND** it reports that final-review and Pull Request modes require an existing Ralph run.

#### Scenario: Automatic Handoff preserves Ralph intent

- **WHEN** Ralph performs Automatic Handoff
- **THEN** it preserves the user's Ralph semantic arguments, including task number, all-tasks mode, Review Base override, final-review mode, and Pull Request mode
- **AND** it rewrites the Feature Spec path relative to the worktree
- **AND** it does not preserve the prior Pi conversation history or arbitrary original Pi CLI flags.

#### Scenario: Automatic Handoff loop prevention

- **WHEN** a replacement Pi process has already attempted Automatic Handoff and still cannot continue inside the Ralph worktree
- **THEN** Ralph does not attempt another Automatic Handoff
- **AND** it falls back to Manual Handoff or reports the unsafe state.

#### Scenario: Manual Handoff fallback

- **WHEN** Automatic Handoff is disabled, unavailable, already attempted, or fails
- **THEN** Ralph stops after creating or reusing the worktree and metadata
- **AND** it performs Manual Handoff by showing or writing the command needed to start Pi from the worktree and rerun Ralph.

### Requirement: Pi cache metadata

The Ralph Loop Pi Extension SHALL store durable run metadata in Pi cache rather than in the target repository.

#### Scenario: Persisting run state

- **WHEN** Ralph creates or resumes a spec run
- **THEN** it records metadata in a Pi-owned cache location keyed by repository and Feature Spec
- **AND** it does not require the target repository to ignore Ralph metadata files.

#### Scenario: Metadata contents

- **WHEN** Ralph persists run metadata
- **THEN** the metadata includes the repository root, canonical Feature Spec path, worktree path, branch name, Review Base, created-from commit, task commit map, and final review status when known.

#### Scenario: Pull Request and remote check metadata

- **WHEN** Ralph creates or resumes a Pull Request flow
- **THEN** the metadata includes Pull Request URL or number when known, draft or ready state when known, Remote Check Gate verdict when known, failed or pending check summaries when known, and remote-fix attempt count.

### Requirement: Fresh-session clean-eye review

The Ralph Loop Pi Extension SHALL perform review from a fresh Pi session seeded only with review-relevant artifacts.

#### Scenario: Starting review

- **WHEN** implementation and initial validation for a task are complete
- **THEN** Ralph hands off to a fresh Pi session for review
- **AND** the review session receives the Feature Spec path, selected task, implementation summary, relevant diff, changed files, commands run, and validation results.

#### Scenario: Avoiding implementation bias

- **WHEN** the clean-eye review runs
- **THEN** it does not rely on the full implementation conversation
- **AND** it reviews the final artifacts against the selected task, related requirements, Review Checklist, Out of Scope, code quality, maintainability, and validation evidence.

#### Scenario: Structured review verdict

- **WHEN** the reviewer completes review
- **THEN** it returns one of `PASS`, `FAIL`, or `BLOCKED`
- **AND** `FAIL` includes required fixes rather than subjective preferences.

### Requirement: Bounded fix and retest flow

The Ralph Loop Pi Extension SHALL limit review-driven fix/retest iterations for a task to at most three.

#### Scenario: Review fails with real issues

- **WHEN** the clean-eye review returns `FAIL`
- **THEN** Ralph instructs the agent to fix only the required issues
- **AND** it reruns relevant tests or checks
- **AND** it repeats clean-eye review until pass or until three fix/retest iterations have occurred.

#### Scenario: Review remains failing

- **WHEN** the third fix/retest iteration does not produce a passing review and verification result
- **THEN** Ralph stops the task as failed
- **AND** it does not check the task or create a success commit.

#### Scenario: Review is blocked

- **WHEN** review returns `BLOCKED`
- **THEN** Ralph stops and reports the missing information or unverifiable state
- **AND** it does not check the task or create a success commit.

### Requirement: Conventional commit per verified task

The Ralph Loop Pi Extension SHALL create one conventional commit for each verified completed task.

#### Scenario: Task passes

- **WHEN** the selected task passes clean-eye review and final deterministic verification
- **THEN** Ralph checks the task in the Feature Spec
- **AND** it creates a conventional commit containing implementation changes, meaningful tests or validation changes, and the spec checkbox update.

#### Scenario: Spec checkbox edit affects validation

- **WHEN** the task checkbox update changes repository files after verification
- **THEN** Ralph reruns or confirms the final relevant validation before committing.

#### Scenario: Unrelated changes exist

- **WHEN** the working tree contains unrelated pre-existing user changes that cannot be separated safely
- **THEN** Ralph refuses to create the task commit
- **AND** it asks for human intervention.

### Requirement: Review Base selection

The Ralph Loop Pi Extension SHALL use a Review Base for final branch review and default it to the branch point recorded when the Ralph feature branch is created.

#### Scenario: Creating a branch from a named branch

- **WHEN** Ralph creates a worktree from a normal branch such as `main`
- **THEN** it records that branch or its resolved branch point as the default Review Base.

#### Scenario: Creating a branch from detached HEAD

- **WHEN** Ralph creates a worktree from detached `HEAD`
- **THEN** it records the exact commit SHA as the Review Base.

#### Scenario: Resuming without metadata

- **WHEN** Ralph is invoked on an existing Ralph branch and no Review Base metadata exists
- **THEN** it may infer the upstream branch if set
- **AND** otherwise asks the user to provide a Review Base.

#### Scenario: User overrides Review Base

- **WHEN** the user supplies an explicit Review Base
- **THEN** Ralph uses the supplied base for final branch review
- **AND** records it for subsequent invocations unless overridden again.

### Requirement: Final branch review

The Ralph Loop Pi Extension SHALL perform a final clean-context branch review when all implementation tasks in the Feature Spec are complete.

#### Scenario: All tasks complete

- **WHEN** all Feature Spec implementation tasks are checked
- **THEN** Ralph performs a fresh-session branch review of the diff between Review Base and the Ralph branch head.

#### Scenario: Standards axis

- **WHEN** the final branch review runs
- **THEN** it evaluates whether the code conforms to the repository's documented coding standards, domain language, architecture conventions, and CI-quality validation expectations.

#### Scenario: Spec axis

- **WHEN** the final branch review runs
- **THEN** it evaluates whether the branch faithfully implements the originating Feature Spec and any explicitly linked external issue.

#### Scenario: Final review fails

- **WHEN** the final branch review finds real issues
- **THEN** Ralph creates additional conventional fix commits by default
- **AND** it does not rewrite prior task commits unless a future explicit mode supports that behavior.

### Requirement: Pull Request creation

The Ralph Loop Pi Extension SHALL create a detailed draft Pull Request only after all tasks are complete, final branch review passes, and the user explicitly approves Pull Request creation.

#### Scenario: Final review passes

- **WHEN** all implementation tasks are checked
- **AND** the final branch review passes both the Standards and Spec axes
- **THEN** Ralph records the final review PASS
- **AND** Ralph asks the user whether to create a Pull Request now instead of creating one automatically.

#### Scenario: User approves Pull Request creation after final review

- **WHEN** final review has passed
- **AND** the user explicitly approves Pull Request creation through a Pi confirmation, a clear natural-language approval after Ralph asks, or an explicit `/ralph <spec> --pr` invocation
- **THEN** Ralph creates a draft Pull Request for the Ralph feature branch
- **AND** the Pull Request title uses Conventional Commit format.

#### Scenario: User declines Pull Request creation after final review

- **WHEN** final review has passed
- **AND** the user declines Pull Request creation
- **THEN** Ralph stops without creating a Pull Request
- **AND** it tells the user that they can run `/ralph <spec> --pr` later.

#### Scenario: Explicit Pull Request mode creates or resumes

- **WHEN** the user invokes `/ralph <spec> --pr`
- **AND** final review status is recorded as PASS
- **THEN** Ralph treats that invocation as explicit approval to create a draft Pull Request when none is recorded
- **AND** Ralph resumes the Remote Check Gate when a Pull Request is already recorded.

#### Scenario: Pull Request body content

- **WHEN** Ralph creates the Pull Request
- **THEN** the Pull Request body includes review-relevant information derived mostly from the Feature Spec
- **AND** it includes the feature purpose, completed requirements, notable implementation constraints, validation evidence, final review result, out-of-scope boundaries, Review Base, target branch, source branch, and a human review checklist.

#### Scenario: Final review fails or blocks

- **WHEN** final branch review returns `FAIL` or `BLOCKED`
- **THEN** Ralph does not create a Pull Request.

#### Scenario: GitHub CLI is available

- **WHEN** the repository supports GitHub Pull Requests and `gh` is available
- **THEN** Ralph creates the draft Pull Request with `gh pr create --draft`.

### Requirement: Remote Check Gate

The Ralph Loop Pi Extension SHALL watch hosted Pull Request checks after draft Pull Request creation and SHALL treat those checks as the final gate before declaring the Pull Request ready.

#### Scenario: Hosted checks pass

- **WHEN** a draft Pull Request exists
- **AND** all relevant hosted Pull Request checks for the current head commit succeed or are marked neutral/skipped by the host
- **THEN** Ralph records the Remote Check Gate as `PASS`
- **AND** Ralph marks the draft Pull Request ready for review by default.

#### Scenario: Hosted checks fail

- **WHEN** any relevant hosted Pull Request check fails
- **THEN** Ralph records the Remote Check Gate as `FAIL`
- **AND** it treats the failure as deterministic validation evidence for a bounded remote-fix loop.

#### Scenario: Hosted checks remain pending

- **WHEN** hosted Pull Request checks remain pending beyond the configured watch timeout
- **THEN** Ralph records the Remote Check Gate as `BLOCKED`
- **AND** it reports the pending checks and the command to resume the gate later.

#### Scenario: Hosted check support unavailable

- **WHEN** the repository host, CLI, authentication, or permissions do not support hosted check watching
- **THEN** Ralph records the Remote Check Gate as `BLOCKED`
- **AND** it does not mark the Pull Request ready automatically.

#### Scenario: Non-code hosted check fails

- **WHEN** a hosted check for Pull Request metadata such as title, labels, release policy, or dependency review fails
- **THEN** Ralph includes that check in the Remote Check Gate by default
- **AND** it fixes the metadata when safe or reports `BLOCKED` when it cannot.

#### Scenario: Policy narrows hosted checks

- **WHEN** repository documentation such as `docs/agents/specs.md` explicitly narrows or names the hosted checks that count for merge readiness
- **THEN** Ralph follows that policy
- **AND** it otherwise defaults to requiring all hosted Pull Request checks to pass.

### Requirement: Remote check fix loop

The Ralph Loop Pi Extension SHALL use a bounded fix loop for Remote Check Gate failures and SHALL create additional conventional commits for fixes rather than rewriting prior task commits.

#### Scenario: Reproducible remote failure

- **WHEN** a failing hosted check maps to a local validation command
- **THEN** Ralph runs the mapped local validation before pushing a fix
- **AND** it includes the command result in the Remote Check Gate evidence.

#### Scenario: Remote-only failure

- **WHEN** a failing hosted check cannot be reproduced locally
- **THEN** Ralph states why the remote check is the verifier
- **AND** it makes only a narrowly targeted fix before re-running the Remote Check Gate.

#### Scenario: Remote fix succeeds

- **WHEN** Ralph fixes a Remote Check Gate failure
- **THEN** it pushes an additional conventional commit
- **AND** it watches the hosted checks for the new head commit.

#### Scenario: Remote fix limit exhausted

- **WHEN** Ralph has attempted three remote-fix iterations and the Remote Check Gate still does not pass
- **THEN** Ralph stops and reports `BLOCKED`
- **AND** it leaves the Pull Request in draft state.

## Implementation Constraints

- The extension should live as a Pi-owned Config Asset under `config/pi/extensions`, linked into `~/.pi/agent/extensions` by the existing Pi Feature Module.
- The primary entrypoint should be a Pi Extension command, not an external SDK-only runner.
- Extension implementation should use Pi Extension APIs for commands, session replacement, user messages, UI notifications, and context handoffs where available.
- Worktrees must be created under `.worktrees` in the repository root.
- Ralph metadata must be stored under Pi-owned cache storage, not committed into the target repository.
- The extension must not modify `.gitignore` automatically.
- The extension should prefer existing repository validation mechanisms. In this repository, `flake.nix` is the visible root validation source.
- Fresh review phases should use new Pi sessions or equivalent session replacement rather than ordinary continuation of the implementation conversation.
- Review verdicts must be machine-readable enough for the extension to distinguish `PASS`, `FAIL`, and `BLOCKED`.
- Remote Check Gate verdicts must be machine-readable enough for the extension to distinguish `PASS`, `FAIL`, and `BLOCKED`.
- Pull Request creation should use `gh pr create --draft` when the repository supports GitHub Pull Requests and the GitHub CLI is available.
- Hosted Pull Request check watching should use GitHub tooling first when the repository supports GitHub Pull Requests, while keeping the Remote Check Gate concept host-neutral.
- Automatic Handoff is a best-effort process handoff rather than an in-process cwd mutation; see `docs/adr/0003-ralph-automatic-handoff.md`.
- Manual Handoff must remain available as the fallback when Automatic Handoff is disabled, unavailable, already attempted, or fails.
- Pull Request creation must not happen automatically after final review PASS unless the user explicitly approves it or invokes `--pr`.
- Pull Requests created by Ralph should remain draft until both final review and the Remote Check Gate pass; see `docs/adr/0005-ralph-remote-check-gate.md`.

## Implementation Tasks

- [ ] 1. Create the Ralph Pi Extension skeleton under `config/pi/extensions` and register a `/ralph` command with spec path, optional task number, optional all-tasks mode, optional Review Base parsing, optional final-review and Pull Request modes, and a `--no-handoff` flag.
  - Covers: Requirement: Ralph command entrypoint
- [ ] 2. Implement Feature Spec parsing for `## Implementation Tasks`, including top-level checkbox selection, task-number targeting, all-tasks iteration, validation/review task recognition, and deterministic checkbox updates.
  - Covers: Requirement: Feature Spec task ledger; Requirement: Validation and review tasks
- [ ] 3. Implement Pi cache metadata storage keyed by repository and Feature Spec, including resume behavior for branch, worktree path, Review Base, created-from commit, task commits, and final review status.
  - Covers: Requirement: Pi cache metadata; Requirement: Review Base selection
- [ ] 4. Implement git worktree orchestration under `.worktrees`, including first-run creation, dirty original-checkout detection, interactive Context-Capture Commit creation, existing-worktree dirty warnings, existing-worktree reuse, branch naming, Review Base recording, `.worktrees` ignore warning, Automatic Handoff from outside the worktree, loop prevention, `--no-handoff`, and Manual Handoff fallback.
  - Covers: Requirement: Worktree isolation; Requirement: Review Base selection
- [ ] 5. Implement the task implementation prompt/handoff that loads the Feature Spec context, instructs meaningful TDD only when applicable, avoids tests for mundane implementation details, and asks for deterministic validation evidence.
  - Covers: Requirement: Meaningful test-first behavior; Requirement: Deterministic verification gate
- [ ] 6. Implement fresh-session clean-eye task review that seeds the review with the selected task, relevant spec sections, diff, changed files, commands run, and validation output, and requires a `PASS`, `FAIL`, or `BLOCKED` verdict.
  - Covers: Requirement: Fresh-session clean-eye review
- [ ] 7. Implement the bounded fix/retest controller with at most three review-driven fix iterations and clear stop behavior for exhausted failures or blocked reviews.
  - Covers: Requirement: Bounded fix and retest flow
- [ ] 8. Implement verified task completion: update the spec checkbox, rerun or confirm final validation after the checkbox edit, create one conventional commit for the task, and record the commit in metadata.
  - Covers: Requirement: Conventional commit per verified task; Requirement: Feature Spec task ledger
- [ ] 9. Implement all-tasks mode so it repeats one complete Ralph Loop per task and stops for failures, blocked reviews, or unavailable deterministic verification.
  - Covers: Requirement: Ralph command entrypoint; Requirement: Deterministic verification gate
- [ ] 10. Implement final branch review when all tasks are complete, using a fresh context and a two-axis Standards and Spec review over the diff between Review Base and branch head.
  - Covers: Requirement: Final branch review
- [ ] 11. Implement draft Pull Request creation after final branch review passes and the user explicitly approves it, including `/ralph <spec> --pr` as approval or resume, a Conventional Commit style title, and a detailed body derived mostly from the Feature Spec and validation evidence.
  - Covers: Requirement: Pull Request creation
- [ ] 12. Extend Ralph command parsing, prompts, and cache metadata for Remote Check Gate state, including `--remote-checks`, Pull Request URL/number, draft/ready state, remote check verdict, failed or pending check summaries, and remote-fix attempt count.
  - Covers: Requirement: Ralph command entrypoint; Requirement: Pi cache metadata; Requirement: Remote Check Gate
- [ ] 13. Implement a deterministic `ralph_watch_remote_checks` tool that watches hosted Pull Request checks, defaults to all hosted checks, returns `PASS`, `FAIL`, or `BLOCKED`, reports failed or pending check names, and times out pending checks with resume guidance.
  - Covers: Requirement: Remote Check Gate
- [ ] 14. Implement the bounded remote-check fix loop with at most three remote-fix iterations, mapped local validation when available, remote-only verifier explanations when needed, additional conventional fix commits, pushes, and repeated Remote Check Gate watches.
  - Covers: Requirement: Remote check fix loop
- [ ] 15. Implement a `ralph_mark_pull_request_ready` tool that marks a draft Pull Request ready only after final review PASS and Remote Check Gate PASS.
  - Covers: Requirement: Remote Check Gate; Requirement: Pull Request creation
- [ ] 16. Add validation for the extension itself using the smallest safely discoverable checks for this repository, including TypeScript or Pi extension loading checks if available and Nix validation from `flake.nix` where applicable.
  - Covers: Requirement: Deterministic verification gate
- [ ] 17. Perform a manual Ralph-readiness review of this spec and the implemented extension, ensuring review verdicts, Remote Check Gate verdicts, cache state, worktree behavior, commit behavior, draft Pull Request behavior, and mark-ready behavior are auditable before marking the feature complete.
  - Covers: Requirement: Final branch review; Requirement: Conventional commit per verified task; Requirement: Pull Request creation; Requirement: Remote Check Gate

## Out of Scope

- Creating an external SDK-only runner as the primary Ralph implementation.
- Creating or updating OpenSpec change directories.
- Creating PRDs or issue tracker entries.
- Automatically editing `.gitignore` for `.worktrees`.
- Rewriting prior task commits during final review by default.
- Completing multiple tasks inside a single Ralph Loop iteration.
- Marking tasks complete without deterministic verification unless the user explicitly authorizes manual verification.
- Inventing heavyweight test infrastructure solely to satisfy TDD.
- Creating a Pull Request before final branch review passes.
- Automatically creating a Pull Request after final review PASS without explicit user approval.
- Treating a Pull Request as ready when supported hosted checks are failing, pending beyond timeout, or unavailable.
- Rewriting prior task commits to fix Remote Check Gate failures by default.

## Source Context

- `CONTEXT.md`
- `.agents/skills/to-spec/SKILL.md`
- `docs/specs/2026-05-19-to-spec-skill.md`
- `docs/adr/0003-ralph-automatic-handoff.md`
- `docs/adr/0004-ralph-context-capture-commits.md`
- `docs/adr/0005-ralph-remote-check-gate.md`
- `modules/terminal/pi.nix`
- `config/pi/extensions/pi-header.ts`
- `config/pi/settings.json`
- `flake.nix`
- `/nix/store/jxl3pw46n1mr71h4hfxq3cg89hzg2cb6-pi-coding-agent-0.73.0/lib/node_modules/pi-monorepo/docs/extensions.md`
- `/nix/store/jxl3pw46n1mr71h4hfxq3cg89hzg2cb6-pi-coding-agent-0.73.0/lib/node_modules/pi-monorepo/docs/sdk.md`

## Review Checklist

- [ ] The extension provides `/ralph` as the primary Pi Extension command entrypoint.
- [ ] Default behavior runs exactly one unchecked top-level implementation task.
- [ ] Explicit all-tasks mode still processes one task per loop iteration.
- [ ] Feature Spec checkboxes are updated only after review and deterministic verification pass.
- [ ] Validation-only and review-only tasks are supported as first-class tasks.
- [ ] TDD is used only for meaningful feature behavior, not incidental implementation details.
- [ ] Ralph leaves tasks unchecked when deterministic verification evidence is unavailable unless manual verification is explicitly authorized.
- [ ] Work is isolated in `.worktrees/ralph-<spec-slug>` and reused across repeated invocations for the same spec.
- [ ] Ralph performs Automatic Handoff from outside the Ralph worktree unless `--no-handoff` is supplied or Automatic Handoff is unavailable, already attempted, or fails.
- [ ] Manual Handoff remains available as the fallback path.
- [ ] Ralph metadata is stored in Pi cache and not in the target repository.
- [ ] Fresh-session review receives only review-relevant artifacts and returns `PASS`, `FAIL`, or `BLOCKED`.
- [ ] Fix/retest is capped at three iterations per task.
- [ ] Each verified task produces one conventional commit including the spec checkbox update.
- [ ] The default Review Base is recorded when the Ralph branch is created and can be overridden by the user.
- [ ] Final branch review evaluates both Standards and Spec axes against the diff from Review Base to branch head.
- [ ] Final review fixes are additional conventional commits by default, not rewrites of prior task commits.
- [ ] A detailed draft Pull Request is created only after final branch review passes and the user explicitly approves Pull Request creation.
- [ ] The Pull Request title uses Conventional Commit format.
- [ ] The Pull Request body is derived mostly from the Feature Spec and includes validation evidence, final review result, Review Base, source/target branches, out-of-scope boundaries, and a human review checklist.
- [ ] `/ralph <spec> --pr` creates a draft Pull Request when none exists and resumes Remote Check Gate handling when one is already recorded.
- [ ] `/ralph <spec> --remote-checks` watches hosted checks for an existing Pull Request without creating a new Pull Request.
- [ ] Remote Check Gate PASS requires all relevant hosted Pull Request checks to pass by default, including non-code metadata checks.
- [ ] Remote Check Gate FAIL enters a bounded remote-fix loop with additional conventional fix commits and no history rewrite.
- [ ] Remote Check Gate BLOCKED reports unavailable tooling, authentication, permissions, or pending-check timeout with resume guidance.
- [ ] Ralph marks a draft Pull Request ready only after final review PASS and Remote Check Gate PASS.
