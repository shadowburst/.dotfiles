# UI evidence

Establish the intended UI result from the task and diff before capturing evidence. Ask the user when those sources do not make the intent clear.

- Use available browser tools to capture UI evidence yourself.
- Include only relevant, non-redundant screenshots, with at most six screenshots total in the PR body. Six is a ceiling, not a target: use the smallest set that demonstrates the UI change.
- Capture before/after screenshots when both states exist; each image counts toward the six-screenshot limit. For a wholly new UI, state that there is no before state.
- When animation or interaction changed, attempt a short recording with available tools. Show the main flow end-to-end plus materially changed branches, such as validation, errors, or alternate outcomes; keep coverage focused rather than repeating similar interactions.
- Keep every evidence asset free of secrets and personal data.
- Inspect every evidence asset before sharing it and give it a concise visible caption from verified provenance. Never present an after screenshot as a before screenshot.
- If required evidence cannot be captured, ask the user for it. If it remains unavailable, identify it in the PR body and leave its checklist item unchecked.

After the PR body contains `## UI Evidence`, publish verified evidence assets with [`scripts/publish-evidence.sh`](scripts/publish-evidence.sh):

```sh
scripts/publish-evidence.sh github \
  --pr <number-or-url> \
  --file '<path>#<concise description>' \
  [--file '<path>#<concise description>' ...]
```

The `github` subcommand publishes only to GitHub. It preserves the section's narrative and replaces its managed evidence block. A content manifest reuses a complete set of existing uploads when the files and descriptions are unchanged.

After GitHub succeeds, publish the same verified local evidence assets to an explicitly associated ClickUp task through the official ClickUp MCP server. The authenticated agent performs the MCP operations; the script's `clickup` subcommand only transfers a ticket-authorized file:

1. Compute each file's SHA-256 digest and use `<stem>-<first 12 hex characters><extension>` as its ClickUp filename.
2. Fetch the task with attachments included. Reuse an attachment whose filename exactly matches; otherwise call `clickup_request_attachment_upload` with the task ID and hash-derived filename. Save its ticket through a permission-restricted file-writing capability to a mode-`600` temporary file; never interpolate the ticket into a shell command. Run `scripts/publish-evidence.sh clickup UPLOAD_URL TICKET_FILE MULTIPART_FIELD LOCAL_FILE HASHED_FILENAME`; it removes the ticket file and keeps the credential out of process arguments. Refetch the task to verify every current filename. Do not remove older attachments; the summary below identifies the current set.
3. Use the stable heading `UI evidence · <owner>/<repository>#<PR number>` for one summary comment containing the PR link and every current filename with its verified description. Fetch all task comments. Update the newest exact heading match with `clickup_update_comment`, or create it with `clickup_create_comment` when none exists.

If an expected ClickUp association remains unavailable, report a publication exception. If any ClickUp operation fails, keep the successful GitHub publication, report partial success, and retry only the incomplete ClickUp work; the attachment lookup and managed comment make that retry safe. The PR screenshot and recording checklist items reflect UI evidence published to GitHub, not ClickUp delivery.
