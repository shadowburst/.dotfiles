# Superseded: Ralph Automatic Handoff

This ADR is superseded by `docs/adr/0005-ralph-current-branch-orchestration.md`.

The previous design had Ralph create a worktree and perform Automatic Handoff into a replacement Pi process rooted in that worktree. Ralph no longer uses that workflow. Ralph now runs on the current checkout and current branch, requires a clean working tree before starting, and focuses on deterministic task orchestration, validation, review, refactor, commits, and final branch review.
