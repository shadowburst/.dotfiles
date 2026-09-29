---
name: open-pr
description: Open or update GitHub pull requests, including visual evidence for UI changes.
---

# Open PR

1. Inspect the branch, complete base diff, repository guidance, local checks actually run, and available CI status. For an existing PR, also read its current body and record its remote head before pushing; review both the complete base diff and the incremental diff from that head to `HEAD`. If the repository or task uses ClickUp and no ID is visible, ask for it; include `#<CLICKUP ID>[in review]` in the PR body without changing the ClickUp task status.
2. Gather evidence before making claims. For a runnable UI change, read [`VISUAL-EVIDENCE.md`](VISUAL-EVIDENCE.md) and finish with the intended result established and every required asset either verified or explicitly recorded as missing.
3. Set the title in Conventional Commits format (`type(scope): summary` or `type: summary`). Make the body describe the problem, rationale, and complete PR scope using the template below. Mark checklist items only when true; remove `UI Changes` for non-UI PRs.
4. Create a new PR as a draft with `gh pr create --draft`, or update an existing PR's title and body with `gh pr edit`. Then publish UI evidence with the script in `VISUAL-EVIDENCE.md`; add ClickUp only when the PR has an associated task. For an existing PR, add a concise `gh pr comment` only when material incremental changes should be surfaced. Verify the published title, body, media, and CI status.

```markdown
## What Changed

<Brief, concrete change.>

## Why

<Problem and rationale.>

## UI Changes

<Verified visual evidence, or an explicit account of what is missing.>

## Checklist

- [ ] I explained what changed and why
- [ ] I included screenshots for UI changes (before/after when both states exist)
- [ ] I included a video when animation or interaction changed
```
