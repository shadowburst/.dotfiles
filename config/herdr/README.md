# Personal Herdr layout

Local source copy from https://github.com/berkeatac/herdr-usage-bar at
`06681e546737ff56eab84b045e69b975f7e973b3`.
The source repository had no license file at this revision. Redistribution
permission is not confirmed. Do not publish this copy without checking permission.

Local change: default to Codex and Claude. Cursor remains available in the
provider picker. Saved UI choices override these defaults.

Home Manager installs both mods and the `personal` layout. The Herdr package
wrapper supplies Python. After activation, restart Herdr and select `personal`
in its layout picker. Installation does not switch layouts or change shipped
layouts. Do not run the source installers.

Auto-tabs is an unchanged local source copy from
https://github.com/longwave/herdr-auto-tabs at
`7804deaa29f509a1bc462bcd64fce4a4b43577f1`.
Its source repository has no license file at this revision. Check permission
before publishing this copy. Update these files explicitly to change revisions.
Home Manager uses recursive file links, so the mod directory itself is real,
not a symlink. Restart Herdr after updates; do not rely on hot reload.

Before the first activation, move the earlier manual `~/.config/herdr-app/mods/auto-tabs`
installation outside `mods/` to keep a backup and avoid Home Manager file conflicts.
The old local `layouts/main-auto-tabs.json` is no longer needed. Remove it after
selecting `personal`. Neither migration step is performed by this module.

Auto-tabs replaces the top tab bar. Every three seconds, it renames tabs across
all spaces using Claude Code titles, program names, or shell folder names.
Manual names are preserved under the upstream rules. Pi titles have no special
handling. Its shared state uses `tab-titles.set`; usage-bar uses `usage-bar.*`.

The layout is a copy of Herdr Desktop 0.1.9's `main` layout, with auto-tabs at
the top and the original status display beside the usage bar at the bottom. It does not track later layout changes.
Herdr source: https://github.com/herdrdev/herdr-app/tree/v0.1.9 (Apache-2.0).
Edit managed code and layouts here, not through their Home Manager symlinks.
Herdr continues to manage provider choices and readings in its shared state.

The mod reads existing local sign-ins and makes HTTPS requests to
`chatgpt.com/backend-api/wham/usage` and `api.anthropic.com/api/oauth/usage`.
It does not renew credentials. Percentages show quota used. Usage updates every
two minutes; countdowns update every minute. Missing or expired sign-ins show
an error without blocking other providers.

On this Linux setup, no clipboard reads or credential writes occur. The retained
source includes macOS-only Keychain and explicit clipboard connection code.
Enabling Cursor permits reads of its existing sign-in and requests to
`cursor.com/api/usage-summary`. Mods are trusted code, not a security sandbox.
Never copy credentials into this repository or the Nix store.

Checks (from the repository root):

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s config/herdr/tests
node config/herdr/tests/popup-actions.mjs
herdr-app check "$PWD/config/herdr/mods/auto-tabs"
herdr-app check "$PWD/config/herdr/mods/usage-bar"
```

The native check can read sign-ins and request usage when it initializes the bar.
Use an isolated app home and empty sign-in directories for an offline check.
