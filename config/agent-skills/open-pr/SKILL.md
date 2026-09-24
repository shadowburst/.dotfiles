---
name: open-pr
description: Open or update a GitHub pull request, write its body, gather evidence, and attach UI screenshots or a browser recording when relevant.
---

# Open PR

1. Inspect the branch, base diff, repository guidance, and checks actually run. For an existing PR, read its current body and record its remote head before pushing; review the commits and diff from that head to the new `HEAD`. If the task has no clear ClickUp ID, ask whether it has a ticket. When it does, put `#<CLICKUP ID>[in review]` in the PR body (substitute the real ID); this marker does not require changing the ClickUp task status.
2. Gather evidence before writing claims. For a runnable UI change, capture clear **before and after screenshots** when feasible. If it changes motion or interaction, capture a short recording as well. Use whatever browser automation, extensions, or screenshot/recording tools are available to capture the evidence yourself. Keep recordings focused and free of secrets or personal data; inspect the result before sharing it. If you cannot generate a needed screenshot or recording, prompt the user to provide it before publishing. If they cannot, state what is missing in the PR body and leave the corresponding checklist item unchecked. Never present an after image as a before image.
3. Set the PR title (new or existing) in Conventional Commits format (`type(scope): summary` or `type: summary`). Write the body with the template below. Keep scope focused, describe the problem and why this approach solves it, and mark checklist items only when true. Delete `UI Changes` for non-UI PRs. For UI PRs, embed visual evidence in that section, or explain why a required screenshot/video is missing; leave its checklist item unchecked until evidence exists.
4. Create the PR with `gh pr create`, or update it with `gh pr edit` when its title, scope, or evidence changes. Upload screenshots/video through available attachment tools and embed or link them in `UI Changes`. On an existing PR, use `gh pr comment` for a concise summary of incremental changes; add new visual evidence when they change runnable UI behavior. Check the published body and media, and report the PR URL plus any missing evidence or failed checks. If an upload fails, fix the published body/checklist rather than claiming the evidence is present.

```markdown
## What Changed

<Brief, concrete change.>

## Why

<Problem and rationale.>

## UI Changes

<!-- For UI changes: before/after screenshots; short video for motion/interaction. Delete section otherwise. -->

## Checklist

- [ ] I explained what changed and why
- [ ] I included before/after screenshots for any UI changes
- [ ] I included a video for animation/interaction changes
```
