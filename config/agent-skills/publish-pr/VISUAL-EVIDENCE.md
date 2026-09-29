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
  --file '<path>#<concise description>' \
  [--file '<path>#<concise description>' ...]
```

The script publishes only to GitHub. It preserves the section's narrative and replaces its managed media block. A content manifest reuses existing uploads when the files and descriptions are unchanged.

After GitHub succeeds, publish the same verified local assets to an explicitly associated ClickUp task through the official ClickUp MCP server:

1. Compute each file's SHA-256 digest and use `<stem>-<first 12 hex characters><extension>` as its ClickUp filename.
2. Fetch the task with attachments included. Reuse an attachment whose filename exactly matches; otherwise call `clickup_request_attachment_upload` with the task ID and hash-derived filename. Save its ticket through a permission-restricted file-writing capability to a mode-`600` temporary file; never interpolate the ticket into a shell command. Run `scripts/upload-clickup-attachment UPLOAD_URL TICKET_FILE MULTIPART_FIELD LOCAL_FILE HASHED_FILENAME`; it removes the ticket file and keeps the credential out of process arguments. Refetch the task to verify every current filename. Do not remove older attachments; the summary below identifies the current set.
3. Use the stable heading `UI evidence · <owner>/<repository>#<PR number>` for one summary comment containing the PR link and every current filename with its verified description. Fetch all task comments. Update the newest exact heading match with `clickup_update_comment`, or create it with `clickup_create_comment` when none exists.

If ClickUp association is expected but no explicit task ID or link is available, ask for it and then report a publication exception if it remains unavailable. If any ClickUp operation fails, keep the successful GitHub publication, report partial success, and retry only the incomplete ClickUp work; the attachment lookup and managed comment make that retry safe. The PR screenshot and video checklist items reflect evidence published to GitHub, not ClickUp delivery.
