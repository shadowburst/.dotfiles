# UI evidence

For a change to pages or components: before screenshots, after screenshots, and a WebM recording of each changed interaction. A sub-agent captures them and looks at them, and you work from its asset list: an image you open yourself stays in your context for the rest of the session. When the environment offers no sub-agent, do its brief yourself.

## When

- **Before:** before the first edit, while the checkout is still at the base. Start the sub-agent and wait for it before you edit. When the before state was not captured, write "before not captured" in How verified; the checkout stays on the task's branch.
- **After:** on the pushed head after review, before `scripts/verify.sh`. No test runs during a capture: the test database is shared.

## Sub-agent

Brief:

```
Capture UI evidence. Change no tracked file; no commit or push.
Repo: <abs path>  State: before | after  Out dir: <abs out dir>
Show: <states from the plan: page, user, data, interaction>
Follow "Capture" in <skill-directory>/EVIDENCE.md.
Look at every screenshot and every recording frame. Drop an asset that shows
an error page, a login screen, debug output, or private data, or that does
not show the state it claims.
Reply with one line per asset: <abs path> — <what it shows>.
Last line: GAPS: <states you could not capture, or none>.
```

Out dir: `~/.cache/deliver-pr/<repo>/<branch with / as ->/` (lerd containers see `$HOME`, not `/tmp`). Names end in `-before` or `-after`.

## Capture

- Run each flow with `vendor/bin/pest --agent='<code>'`: one flow per process, the code in single quotes, PHP strings in double quotes. Install nothing; report a missing prerequisite (such as `pestphp/pest-plugin-agent`) under GAPS. Build front-end assets first when the repo's browser tests need them.
- Use factories, `actingAs`, and the project's page helpers with synthetic data. Assert each state before you capture it.
- At most 4 screenshots per state, and one recording per changed interaction.
- Pest clears the top level of `tests/Browser/Screenshots/`, so use a subfolder; move the files to the out dir and remove the subfolder.

```sh
vendor/bin/pest --agent='
$this->actingAs(\App\Models\User::factory()->create());
$page = visit("/settings");
$page->assertSee("Notifications")
    ->screenshot(fullPage: false, filename: "deliver-pr/settings-after");
'
```

Recording: copy `<skill-directory>/scripts/record.php` to the out dir and require that copy in the snippet (a lerd container sees `$HOME/.cache`, not always the skill folder). `\DeliverPr\record($page, $output, $flow)` runs the flow once on an asserted page, writes `<output>.webm` (refused over 10 MB, or when the path exists) and `<output>-frames/` (one PNG per second, plus the last), which you look at.

```sh
vendor/bin/pest --agent='
require_once "<out dir>/record.php";
$this->actingAs(\App\Models\User::factory()->create());
$page = visit("/settings");
$page->resize(1280, 720)->assertSee("Notifications");
\DeliverPr\record($page, "<out dir>/save-after.webm", function () use ($page) {
    $page->wait(2);
    $page->click("role=button[name=Save]")->assertSee("Settings saved")->wait(2);
});
'
```

## GitHub

Reference each asset in How verified as `![<description>](<path>)` and pass it to `gh pr create` or `gh pr edit` as `--attach '<path>#<description>'`; `gh` uploads it and rewrites the reference. A refresh with new assets replaces the old references.

## ClickUp

Once, at the end. Copy each file to `<stem>-<first 12 hex of its SHA-256><ext>`, and attach to the task each copy whose name is not among its attachments.
