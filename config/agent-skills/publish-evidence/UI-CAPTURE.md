# UI capture

## Prepare

Capture runs inside Pest's in-process Laravel app. Before running, confirm an isolated test database and browser-test refresh protection (`RefreshDatabase` or equivalent). Reuse the project's factories, states, seeders, `actingAs`, shared setup, and page wrappers; ask before adding reusable setup. Use synthetic data and keep secrets/personal data out of every asset.

Use the project's working Pest 5 browser stack with Playwright >=1.63 and installed browsers. Prefer installed `pestphp/pest-plugin-agent` for both screenshots and recordings. Missing prerequisites (including the Playwright executable or frontend build) are setup gaps: report them or ask before installs. Retain project configuration and TIA settings.

- Run one `--agent` flow per process from the project root; teardown occurs at process termination. Do not batch capture paths in parallel or add unnecessary flags such as `--compact`.
- Agent snippets inherit resolved TestCase classes/traits (Browser preferred), but not path-scoped hooks. Explicitly reuse any required setup from those hooks.
- Keep `$page = visit(...)` as a visible statement in the snippet for browser discovery; wrap its result with the project's existing page wrapper when needed.
- If an installed agent plugin fails, surface the error; do not switch runners. Only when it is missing, use the temporary Browser test below.

Keep assets and diagnostics under `~/.cache/publish-evidence/<repository>/`; clean temporary capture files on success and failure. Replace example placeholders with absolute paths visible to PHP, including the helper path. Containers must see the project, helper, cache, and upload files at those paths. Lerd shares `$HOME` and the project, not host `/tmp` or arbitrary host environment variables.

Use [Pest's browser API](https://pestphp.com/docs/browser-testing) and project conventions for selectors, interactions, and assertions. Prove each intended state with assertions before capturing it. For recordings, wait about two seconds after meaningful asserted states, including initial/final states when helpful. These waits belong in capture-only flows, not ordinary regression tests.

## Screenshots

Pest clears top-level files in `tests/Browser/Screenshots/` at run start; use a subfolder. Adapt this snippet's setup, route, and assertion to the project:

```sh
mkdir -p tests/Browser/Screenshots/publish-evidence
php vendor/bin/pest --agent '
$user = \App\Models\User::factory()->create();
$this->actingAs($user);
$page = visit("/settings");
$page->assertSee("Notifications")
    ->screenshot(fullPage: false, filename: "publish-evidence/settings-after");
'
```

After success, move the PNGs into the cache and remove the capture subfolder. For a before state, when the screen exists at the PR base, create a base-commit worktree through the environment's worktree tool, confirm its dependencies/assets are ready, and run the same flow there with `-before` filenames, then remove the worktree.

## Recordings

Record the PR head's focused changed interaction, with separate captures for materially changed error, validation, or alternate branches. Aim for a compact native WebM under 10 MB.

Require `scripts/record.php` inside the Pest snippet/test. Its public helper is `\PublishEvidence\record(object $page, string $output, \Closure $flow): void`. Pass an already-visited, asserted Pest page (or the project's existing wrapper providing `page()`):

```sh
php vendor/bin/pest --agent '
require_once "/absolute/path/to/publish-evidence/scripts/record.php";
$user = \App\Models\User::factory()->create();
$this->actingAs($user);
$page = visit("/settings");
$page->resize(1280, 720)->assertSee("Notifications");
\PublishEvidence\record($page, "/absolute/path/to/.cache/publish-evidence/repository/settings.webm", function () use ($page) {
    $page->wait(2);
    $page->click("role=button[name=Save]")
        ->assertSee("Settings saved")
        ->wait(2);
});
'
```

The helper runs the closure **once**, recording the same page and interactions through native Playwright screencast via Pest internals. It creates directories and exports `OUTPUT.webm` plus sibling `OUTPUT-frames/` (PNG approximately once per second plus the last), decoded with the same existing browser/canvas. Use the frame folder for inspection; the WebM is the recording asset. No recording-specific package, FFmpeg install, or separate action plan is needed.

Existing output or frame directories are refused; choose fresh paths. Errors surface, and a failed flow retains diagnostic WebM where possible: never publish a failed capture. Outputs over 10 MB are rejected without conversion; shorten the interaction and recapture.

The bridge was verified with Pest browser 5.1.2 and Playwright 1.63. Run `php <skill-directory>/scripts/record-self-test.php` for its transport/file-lifecycle self-check; after package upgrades, also run one real capture to verify the private integration.

## Only if the agent plugin is missing

Put the same snippet body inside `it("captures evidence", function () { ... });` in a unique temporary `tests/Browser/*Test.php`, leaving existing tests unchanged. Run that file explicitly with unconditional cleanup, for example:

```sh
CAPTURE_DIR=$(mktemp -d tests/Browser/PublishEvidenceXXXXXX)
CAPTURE_TEST="$CAPTURE_DIR/CaptureTest.php"
(
    trap 'rm -rf -- "$CAPTURE_DIR"' EXIT
    # Write the test into "$CAPTURE_TEST" here, then run it.
    php vendor/bin/pest "$CAPTURE_TEST"
)
```

Reuse the Browser setup and the same recording helper/flow.

## Inspect and finish

Visually inspect **every** screenshot and generated recording frame, including the final state. Each must show the claimed state; error pages, debug output, login screens, or private data invalidate the asset even if assertions passed. Publish only successful, verified captures. Offer to retain useful tests only with approval and following project conventions.
