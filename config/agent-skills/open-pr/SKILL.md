---
name: open-pr
description: Open or update GitHub PRs; request missing UI screenshots and clarify intent instead of guessing.
---

# Open PR

1. Inspect the branch, base diff, repository guidance, and checks actually run. For an existing PR, read its current body and record its remote head before pushing; review the commits and diff from that head to the new `HEAD`. If the task has no clear ClickUp ID, ask whether it has a ticket. When it does, put `#<CLICKUP ID>[in review]` in the PR body (substitute the real ID); this marker does not require changing the ClickUp task status.
2. Gather evidence before writing claims. For a UI change, first check whether the user already supplied visual evidence and whether the intended change is clear from the diff and task context. If evidence is missing, ask the user for before/after screenshots; request a short video only when an interaction is necessary to demonstrate the change. If the intended UI change is not completely clear, ask the user to explain it rather than guessing. Use screenshots by default, never infer or fabricate visual details, and inspect supplied evidence before sharing it. If the user cannot provide required evidence, state what is missing in the PR body and leave the corresponding checklist item unchecked. Never present an after image as a before image.
3. Set the PR title (new or existing) in Conventional Commits format (`type(scope): summary` or `type: summary`). Write the body with the template below. Keep scope focused, describe the problem and why this approach solves it, and mark checklist items only when true. Delete `UI Changes` for non-UI PRs. For UI PRs, embed visual evidence in that section, or explain why a required screenshot/video is missing; leave its checklist item unchecked until evidence exists.
4. Create the PR with `gh pr create`, or update it with `gh pr edit` when its title, scope, or evidence changes. Upload local screenshots/videos with GitHub CLI's `--attach` flag and embed them in `UI Changes` as below. On an existing PR, use `gh pr comment` for a concise summary of incremental changes; attach new evidence there when runnable UI behavior changes. Check the published body and media, and report the PR URL plus any missing evidence or failed checks. If an upload fails, fix the published body/checklist rather than claiming the evidence is present.

## Uploading visual evidence with `gh`

Put local paths in the Markdown body, then pass each same path with `--attach`; `gh` uploads the files and rewrites those Markdown references to GitHub-hosted URLs. For example, save the PR body as `PR_BODY.md`:

```markdown
## UI Changes

Before:
![Before: original screen](evidence/before.png)

After:
![After: updated screen](evidence/after.png)

Demo:
![](evidence/demo.mp4)
```

Create or update the PR by attaching every referenced file:

```sh
gh pr create --title "fix(ui): improve sign-in" --body-file PR_BODY.md \
  --attach evidence/before.png \
  --attach evidence/after.png \
  --attach evidence/demo.mp4

# For an existing PR, use its number or URL:
gh pr edit 123 --body-file PR_BODY.md \
  --attach evidence/before.png \
  --attach evidence/after.png \
  --attach evidence/demo.mp4
```

For an incremental comment, use `gh pr comment 123 --body-file COMMENT.md --attach evidence/demo.mp4`. A video embeds as a player only when its `![](path)` reference is the sole content in its Markdown paragraph. If an attached file is not referenced in the body, `gh` appends it. Repeat `--attach` for multiple files (up to 50); images can use `--attach 'evidence/after.png#Updated screen'` for alt text, while videos have no alt text. Attachment upload requires push access. Check `gh pr create --help` or `gh pr edit --help` for `--attach` if the installed CLI does not recognize the flag.

```markdown
## What Changed

<Brief, concrete change.>

## Why

<Problem and rationale.>

## UI Changes

<!-- For UI changes: before/after screenshots; video when interaction is necessary to demonstrate the change or requested. Delete section otherwise. -->

## Checklist

- [ ] I explained what changed and why
- [ ] I included before/after screenshots for any UI changes
- [ ] I included a video for animation/interaction changes
```
