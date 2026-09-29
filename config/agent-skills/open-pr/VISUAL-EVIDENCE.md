# Visual evidence

Establish the intended UI result from the task and diff before capturing evidence. Ask the user when those sources do not make the intent clear.

- Use available browser tools to capture the evidence yourself.
- Capture before/after screenshots when both states exist. For a wholly new UI, state that there is no before state.
- Capture a short recording when animation or interaction changed.
- Keep recordings focused and every asset free of secrets and personal data.
- Inspect every asset before sharing it and label it from verified provenance. Never present an after image as a before image.
- If required evidence cannot be captured, ask the user for it. If it remains unavailable, identify it in the PR body and leave its checklist item unchecked.

After the PR body contains `## UI Changes`, publish verified assets with [`scripts/upload-ui-evidence`](scripts/upload-ui-evidence):

```sh
scripts/upload-ui-evidence \
  --pr <number-or-url> \
  [--clickup <associated-task-id>] \
  --file '<path>#<concise description>' \
  [--file '<path>#<concise description>' ...]
```

GitHub is always updated. Add `--clickup` only when the PR has an associated task; each ClickUp attachment receives its description as the following comment. The script preserves the section's narrative and replaces its managed media block, but reruns upload the files again. If it fails, leave the corresponding checklist item unchecked and report every failed destination.
