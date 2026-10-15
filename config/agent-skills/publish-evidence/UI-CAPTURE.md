# UI capture

Capture runs inside Pest's in-process Laravel app: `actingAs` signs the user in and factories create the data in the project's test database. Confirm the project's browser tests refresh it (`RefreshDatabase` or similar), so every run starts clean. The project needs Pest 5 with `pestphp/pest-plugin-browser` and a working browser setup; when they are missing, ask before installing them, or report the gap.

## Temporary Browser tests

Create a uniquely named `*Test.php` under `tests/Browser/`, using the project's setup and page helpers. Leave existing tests unchanged. Run from the project root:

```sh
CAPTURE_TEST=tests/Browser/PublishEvidenceCaptureTest.php
(
    trap 'rm -f -- "$CAPTURE_TEST"' EXIT
    php vendor/bin/pest "$CAPTURE_TEST"
)
```

`tests/Browser/` initializes Playwright even through project wrappers. Pass the capture file explicitly and retain the project's test/TIA settings; `--agent` recreates it in `/tmp`.

- Reuse existing factories, states, seeders, and authentication; ask before adding reusable test setup.
- Generate plans and setup from the target project; cache them, logs, and assets under `~/.cache/publish-evidence/<repository>/`. No pre-existing evidence cache is required. In containers, the shell and PHP/Node must see the project, Cutaway, cache, and upload files at the same absolute paths; Lerd shares `$HOME` and the project, but not `/tmp` or arbitrary host environment variables.
- First prove the expected page state with `assertSee()` or `assertVisible()`, then capture. Resolve selectors against the rendered page.
- Remove temporary tests and capture-only files even on failure; retain diagnostics only in the cache.

## Selectors

Pest passes selector strings containing `#`, `.`, `[`, `=`, or `:` straight to Playwright, so the same string works in capture tests and recording plans: CSS, `role=button[name="Save"]`, `text=Save`, `@testid` (a `data-testid` or `data-test` match, Pest tests only). Prefer these over bare words, which Pest resolves by guessing id, name, then text. Each selector must match exactly one visible element.

For nested labels, use `role=menuitem[name="Rename"]` or `[role="menuitem"]:has-text("Rename")`. `:text-is()` on a parent does not match text held only in a child element.

## Screenshots

Pest writes screenshots under `tests/Browser/Screenshots/` and deletes that folder's top-level files at the start of each run, so save into a subfolder created beforehand:

```sh
mkdir -p tests/Browser/Screenshots/publish-evidence
```

Adapt this test to the project's conventions:

```php
<?php

it('captures settings evidence', function () {
    $user = \App\Models\User::factory()->create();
    $this->actingAs($user);
    $page = visit('/settings');
    $page->assertSee('Notifications')
        ->screenshot(fullPage: false, filename: 'publish-evidence/settings-after');
});
```

Pest's full browser API is available here (devices, dark mode, `hover`, `select`, `resize`). Move the PNGs to the cache folder and remove `tests/Browser/Screenshots/publish-evidence` afterwards.

For a before state, when the changed screen exists at the PR's base: create a worktree at the base commit (through lerd's worktree tool on a lerd site, so dependencies are installed), run the same temporary test there with `-before` filenames, then remove the worktree.

## Recordings

Recordings show the PR head only. Smoke-test new selectors and state transitions in a short plan with the same setup. Extend to the end-to-end flow only when every expectation passes and its frames show the intended state. Run from the project root:

```sh
<skill-directory>/scripts/record.sh PLAN.json SETUP.php OUTPUT.webm
```

`SETUP.php` contains setup statements for a test closure; use fully qualified class names. The script runs a temporary Browser test and [cutaway](https://github.com/half144/cutaway) against Pest's in-process server, exporting 720p WebM and `OUTPUT-frames/` (one frame per second plus the last). The test is always removed; failures print errors and retain its copy and logs in the cache.

The plan is a cutaway plan whose `url` is replaced by `path`:

```json
{
  "path": "/operations",
  "steps": [
    { "action": "type", "selector": "input[type=\"search\"]", "text": "Tilleuls", "expect": "tr:has-text(\"allée des Tilleuls\")" },
    { "action": "click", "selector": "role=link[name=\"12 allée des Tilleuls\"]", "expect": "role=heading[name=\"Résidence Les Tilleuls\"]" }
  ]
}
```

| `action` | Fields | Optional |
| --- | --- | --- |
| `click` / `tap` | `selector`, `expect` | `hold` (0.05–5 s) |
| `press` | `key` (Playwright key, e.g. `ControlOrMeta+K`), `expect` | |
| `upload` | `selector`, `file` (path or array, relative to the plan), `expect` | |
| `type` | `selector`, `text` | `expect` |
| `focus` | `selector` | `duration`, `expect` |
| `scroll` / `swipe` | `y` (relative pixels) | `duration` |
| `wait` | | `duration` |

Every step also takes `pause` (seconds of rest after it). Plan options: `colorScheme`, `hide` (CSS selectors to hide), `timeout` (ms).

To clear an input, Cutaway's empty `type` selects its existing text; follow with Backspace, then submit if the page requires it. For a search field with a placeholder:

```json
[
  { "action": "type", "selector": "input[type=\"search\"]", "text": "" },
  { "action": "press", "key": "Backspace", "expect": "input[type=\"search\"]:placeholder-shown" }
]
```

- `expect` names a selector that becomes visible once the step took effect. Clicks, presses, and uploads require it: without it, a step that lands on an error page still records as a success.
- The plan opens one page; reach every later page by clicking. Hover, select, and drag have no step.
- Steps really happen against the test database.

## Inspect

Read every screenshot and every recording frame. Each must show the claimed state; an error page, debug output, or login screen means the capture failed, even when the run passed.

## Keep as a test

Offer to retain useful capture tests only with approval, following project conventions.
