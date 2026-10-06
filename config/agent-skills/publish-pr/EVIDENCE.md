# Evidence

For each material claim in `What Changed`, derive the intended result from the task/diff and select the smallest observable proof:

- Appearance/layout: screenshots.
- Animation/interaction: a recording of the changed flow and material branches.
- Logic/API/CLI: a targeted test or command.
- Documentation/refactor: a consistency or behavior-preservation check where applicable; explain when execution is not applicable.

Ask when intent is unclear. Publish observed before/after proof under `## Evidence`; explain unavailable before states and remaining gaps. Keep evidence free of secrets/personal data and label states accurately. Keep the full check table in `Validation`.

## Execution evidence

Include command/test, revision, and concise observed output for each state. Refresh inline evidence for the current head without approval. Pseudocode belongs in `What Changed`, not as execution proof. These examples illustrate format, not reusable results.

Regression — same targeted check on both revisions when available:

````markdown
Command: `python3 -m unittest tests.test_save.SaveTests.test_unchanged_content`

**Before** (`<base SHA>`):
```text
FAIL: test_unchanged_content
AssertionError: expected 0 writes, got 1
```

**After** (`<published SHA>`):
```text
Ran 1 test
OK
```
````

New CLI behavior — no comparable before state:

````markdown
**Before:** No `--dry-run` option existed; no baseline execution captured.

**After** (`<published SHA>`), `app import sample.csv --dry-run`:
```text
3 records validated; 0 records written
```
````

## UI evidence

Inspect existing PR body/comments for UI evidence. On existing PRs, generate or replace it only with explicit approval; ask if missing evidence would help. For new PRs or approved updates:

- Capture with available browser tools. Use at most six relevant, non-redundant screenshots total; before/after images each count.
- For animation/interaction changes, attempt an end-to-end recording plus materially changed error, validation, or alternate branches.
- Inspect each asset and caption it from verified provenance.
- Ask for required evidence you cannot capture; report any remaining gap.

### Publish UI assets

Require `## Evidence`, then publish verified files:

```sh
scripts/publish-evidence.sh github \
  --pr <number-or-url> \
  --file '<path>#<concise description>' \
  [--file '<path>#<concise description>' ...]
```

After GitHub succeeds, send the same assets to the explicitly associated ClickUp task through the official ClickUp MCP server:

1. Hash each file with SHA-256; name it `<stem>-<first 12 hex characters><extension>`.
2. Fetch task attachments; reuse exact filename matches. Otherwise call `clickup_request_attachment_upload` with task ID and filename. Save the ticket using a permission-restricted file-writing capability to a mode-`600` temporary file; never interpolate it into a shell command. Run `scripts/publish-evidence.sh clickup UPLOAD_URL TICKET_FILE MULTIPART_FIELD LOCAL_FILE HASHED_FILENAME`. Refetch to verify current filenames; retain older attachments.
3. Fetch all task comments. Update the newest exact heading match for `UI evidence · <owner>/<repository>#<PR number>`, or create one. Include PR link, current filenames, and verified descriptions; use `clickup_update_comment` or `clickup_create_comment`.

A missing expected association or failed ClickUp operation is a publication exception. Preserve successful GitHub delivery, report partial success, and retry only incomplete ClickUp work using the attachment/comment lookups. Distinguish the two destinations' delivery results.
