# UI capture

Capture runs inside Pest's in-process Laravel app: `actingAs` signs the user in and factories create the data in the project's test database. Confirm the project's browser tests refresh it (`RefreshDatabase` or similar), so every run starts clean. The project needs Pest 5 with `pestphp/pest-plugin-browser` and `pestphp/pest-plugin-agent` and a working browser setup; when they are missing, ask before installing them, or report the gap.

## Snippets

Each capture is a `pest --agent` snippet: the body of a throwaway test, run from the project root.

```sh
php vendor/bin/pest --agent="$(<"$SNIPPET")"
```

- Write snippets and outputs under `~/.cache/publish-evidence/<repository>/`. Under lerd, `php` runs in the site's container, which shares `$HOME` but keeps its own `/tmp` and receives no host environment variables, so snippets carry absolute paths.
- Start with setup: the project's existing factories, states, and seeders, then `$this->actingAs($user)`. Read existing `tests/Browser` tests for the setup a screen needs. Adding factories, states, or seeders changes the PR's diff; ask first.
- Use fully qualified class names.
- Explore with snippets before capturing: `visit()`, `assertSee()`, `assertVisible()` show whether the page renders and selectors resolve. A failure saves a screenshot to `tests/Browser/Screenshots/`.

## Selectors

Pest passes selector strings containing `#`, `.`, `[`, `=`, or `:` straight to Playwright, so the same string works in snippets and recording plans: CSS, `role=button[name="Save"]`, `text=Save`, `@testid` (a `data-testid` or `data-test` match, snippets only). Prefer these over bare words, which Pest resolves by guessing id, name, then text. Each selector must match exactly one visible element.

## Screenshots

Pest writes screenshots under `tests/Browser/Screenshots/` and deletes that folder's top-level files at the start of each run, so save into a subfolder created beforehand:

```sh
mkdir -p tests/Browser/Screenshots/publish-evidence
```

```php
$user = \App\Models\User::factory()->create();
$this->actingAs($user);
visit('/settings')
    ->assertSee('Notifications')
    ->screenshot(fullPage: false, filename: 'publish-evidence/settings-after');
```

Pest's full browser API is available here (devices, dark mode, `hover`, `select`, `resize`). Move the PNGs to the cache folder and remove `tests/Browser/Screenshots/publish-evidence` afterwards.

For a before state, when the changed screen exists at the PR's base: create a worktree at the base commit (through lerd's worktree tool on a lerd site, so dependencies are installed), run the same snippet there with `-before` filenames, then remove the worktree.

## Recordings

Recordings show the PR head only. Write a plan and a setup file, then run, from the project root:

```sh
$SKILL_DIR/scripts/record.sh PLAN.json SETUP.php OUTPUT.webm
```

`SETUP.php` holds the snippet's setup statements (data and `actingAs`). The script opens `path` in Pest's browser, records the plan against the same in-process server with [cutaway](https://github.com/half144/cutaway), and writes a 720p WebM plus `OUTPUT-frames/` (a frame per second and the last frame). On failure it prints Pest's and cutaway's errors and keeps the snippet and logs.

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

- `expect` names a selector that becomes visible once the step took effect. Clicks, presses, and uploads require it: without it, a step that lands on an error page still records as a success.
- The plan opens one page; reach every later page by clicking. Hover, select, and drag have no step.
- Steps really happen against the test database.

## Inspect

Read every screenshot and every recording frame. Each must show the claimed state; an error page, debug output, or login screen means the capture failed, even when the run passed.

## Keep as a test

When a snippet asserts behavior worth keeping, offer to save it as a test in `tests/Browser`; write it only on approval.
