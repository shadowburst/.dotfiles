# Noctalia v5 Alpha Migration

## Purpose

Noctalia SHALL be migrated from the current v4-style Nix package and JSON configuration to the upstream Noctalia v5 alpha flake and configuration model. The migration exists so the shared desktop profile can use the current Noctalia alpha while preserving the repository's ownership split between Nix Feature Modules and live-editable Config Assets.

The Noctalia Feature Module SHALL own package, service, cache, and module integration concerns. The Noctalia Config Asset SHALL remain checked in and live-editable outside Nix evaluation, and Hyprland-specific startup/keybinding integration SHALL be updated only where the Noctalia v5 interface requires it.

## Requirements

### Requirement: Noctalia v5 alpha is sourced from the upstream flake

The desktop configuration SHALL source Noctalia from the upstream v5 alpha flake input rather than from the `pkgs.noctalia-shell` package.

#### Scenario: Desktop host evaluates Noctalia package source

- **WHEN** a desktop host imports the shared Noctalia Feature Module
- **THEN** Noctalia is provided by the `github:noctalia-dev/noctalia-shell/v5` flake input resolved in `flake.lock`
- **AND** the upstream Noctalia Home Manager module is available to the home configuration

#### Scenario: Noctalia input is updated later

- **WHEN** the Noctalia v5 alpha should be refreshed
- **THEN** the flake input can be updated through the lockfile without changing the configured input URL away from the v5 alpha branch

### Requirement: Noctalia Cachix is configured by the Feature Module

The Noctalia Feature Module SHALL configure the Noctalia Cachix substituter and trusted public key for hosts that import it.

#### Scenario: Desktop host builds Noctalia

- **WHEN** a host imports the Noctalia NixOS Feature Module
- **THEN** Nix is configured with `https://noctalia.cachix.org` as an extra substituter
- **AND** Nix trusts `noctalia.cachix.org-1:pCOR47nnMEo5thcxNDtzWpOxNFQsBRglJzxWPp3dkU4=`
- **AND** the cache configuration is colocated with Noctalia rather than global core configuration

### Requirement: Upstream Home Manager module owns package and service integration

The Home Manager Noctalia integration SHALL use the upstream Noctalia v5 Home Manager module for enabling Noctalia and starting it as a user service.

#### Scenario: Home Manager activates the desktop profile

- **WHEN** Home Manager activates a desktop profile that imports Noctalia
- **THEN** `programs.noctalia.enable` is enabled through the upstream Noctalia module
- **AND** the upstream Noctalia package is installed through that module
- **AND** the Noctalia systemd user service is enabled

#### Scenario: Hyprland starts

- **WHEN** Hyprland starts after the migration
- **THEN** Hyprland no longer launches Noctalia through a startup exec command
- **AND** Noctalia lifecycle is managed by the Home Manager systemd user service

### Requirement: Noctalia configuration remains a Config Asset

The v5 Noctalia configuration SHALL be stored as a checked-in TOML Config Asset and linked into the user configuration, not represented as Nix `programs.noctalia.settings`.

#### Scenario: User edits Noctalia settings

- **WHEN** the user changes ordinary Noctalia settings
- **THEN** the change is made in the checked-in Noctalia TOML Config Asset
- **AND** the change does not require a Nix rebuild unless package, service, cache, or module integration changes

#### Scenario: Home Manager links Noctalia config

- **WHEN** Home Manager activates the Noctalia home module
- **THEN** `~/.config/noctalia/config.toml` points at the repository Noctalia Config Asset
- **AND** the upstream module's declarative settings attrset is not the source of truth for ordinary Noctalia settings

### Requirement: v4 configuration is migrated as completely as practical

The migration SHALL preserve every obvious v4 Noctalia setting in the v5 TOML configuration and SHALL identify plausible but uncertain mappings for review.

#### Scenario: v4 setting has an obvious v5 equivalent

- **WHEN** a setting from `config/noctalia/settings.json` or `config/noctalia/colors.json` has a clear v5 TOML equivalent
- **THEN** the v5 Noctalia Config Asset contains the equivalent value
- **AND** the old JSON file is no longer required for Noctalia behavior

#### Scenario: v4 setting has a plausible but uncertain v5 equivalent

- **WHEN** a v4 setting appears migratable but the equivalent v5 key or value is uncertain
- **THEN** the implementation report lists the v4 key/value, suggested v5 key/value, and reason for uncertainty
- **AND** the uncertain setting is not silently discarded without review context

#### Scenario: v4 behavior has no v5 equivalent

- **WHEN** a v4 setting, plugin setting, or keybinding depends on functionality that does not exist in v5
- **THEN** the obsolete behavior is dropped
- **AND** the implementation report identifies the dropped behavior

### Requirement: Obsolete v4 assets are removed

After the v5 Config Asset is created, obsolete v4 Noctalia JSON and plugin Config Assets SHALL be removed from the repository.

#### Scenario: Repository is inspected after migration

- **WHEN** the Noctalia Feature Module links Noctalia configuration
- **THEN** it links the v5 TOML Config Asset
- **AND** it no longer links `settings.json`, `colors.json`, `plugins.json`, or plugin settings JSON files
- **AND** obsolete v4 JSON assets are absent from the Noctalia Config Asset directory

### Requirement: Hyprland integration uses the v5 Noctalia command interface

Hyprland Noctalia integration SHALL use the v5 `noctalia` command and `noctalia msg` IPC interface for keybindings.

#### Scenario: User opens Noctalia panels from Hyprland

- **WHEN** the user presses the configured Hyprland keybindings for launcher, session menu, calendar-like/date behavior, or clipboard
- **THEN** Hyprland invokes the v5 Noctalia IPC command that provides the corresponding available v5 panel behavior
- **AND** the old `noctalia-shell ipc call ...` command is not used

#### Scenario: User controls hardware/media keys from Hyprland

- **WHEN** the user presses configured audio, microphone, media, brightness, or lock keybindings
- **THEN** Hyprland invokes the corresponding available v5 `noctalia msg` command
- **AND** media, volume, brightness, and lock behavior remain available where v5 exposes equivalent commands

#### Scenario: Removed plugin keybinding is pressed

- **WHEN** a previous keybinding only controlled a v4 plugin without a v5 built-in equivalent, such as the screen recorder plugin toggle
- **THEN** that keybinding is removed rather than invoking a stale Noctalia plugin command

### Requirement: Migration applies to shared desktop hosts

The Noctalia v5 migration SHALL apply to all hosts that import the shared desktop modules.

#### Scenario: Any shared desktop host evaluates

- **WHEN** `xps-9305`, `lenovo-p14s`, or `zephyrus` imports the shared desktop profile
- **THEN** it receives the v5 Noctalia Feature Module behavior
- **AND** no host remains on the old v4 Noctalia module path unless explicitly configured outside this feature

## Implementation Constraints

- Use the upstream Noctalia Home Manager module for package and service integration, but do not use `programs.noctalia.settings` as the durable source of ordinary Noctalia configuration.
- Keep Noctalia-owned Nix integration in `modules/desktop/noctalia.nix` where practical.
- Keep Noctalia application settings in the Noctalia Config Asset directory.
- Change the Hyprland Config Asset only for Noctalia-specific startup and keybinding compatibility with v5.
- Track the `github:noctalia-dev/noctalia-shell/v5` input URL and rely on `flake.lock` for the exact revision.
- Do not preserve v4 plugin files or plugin-only keybindings when v5 has no equivalent plugin system or built-in behavior.

## Implementation Context

- Current Noctalia integration lives in `modules/desktop/noctalia.nix` and installs `pkgs.noctalia-shell`, `gpu-screen-recorder`, links v4 JSON files, and sets `QT_AUDIO_BACKEND`.
- Current Hyprland Noctalia integration lives in `config/hypr/modules/noctalia.lua` and starts `noctalia-shell` from Hyprland before binding v4 IPC commands.
- Noctalia v5 docs show the flake input `github:noctalia-dev/noctalia-shell/v5`, upstream Home Manager module `inputs.noctalia.homeModules.default`, package `inputs.noctalia.packages.${pkgs.stdenv.hostPlatform.system}.default`, and Cachix settings.
- Noctalia v5 uses `noctalia`, `noctalia --daemon`, and `noctalia msg ...` rather than the v4 `noctalia-shell ipc call ...` command shape.
- Noctalia v5 sample configuration is TOML at `~/.config/noctalia/config.toml` and includes settings for shell, wallpaper, theme, notifications, OSD, system monitor, weather, audio, brightness, night light, idle behavior, bar, dock, desktop widgets, control center shortcuts, hooks, and widgets.
- Implementation should use the Noctalia v5 documentation and upstream sample/config source to discover valid option names and values before deciding whether a v4 setting has an obvious, uncertain, or unavailable migration target.
- v5 appears to include polkit agent support as `shell.polkit_agent`; v4 plugin configuration for polkit should migrate to the built-in setting when enabled.
- v4 screen-recorder plugin configuration and keybinding should be dropped unless an explicit v5 built-in equivalent is discovered during implementation.

## Validation Expectations

- Run the strongest affordable Nix validation for this flake, preferring `nix flake check` when practical.
- At minimum, evaluate or build a representative desktop host/home configuration if full flake checks are too expensive.
- If the v5 `noctalia` CLI exposes a configuration validation command, run it against the migrated TOML Config Asset.
- Manual runtime validation after switching should verify that Noctalia starts through the Home Manager systemd user service; Hyprland keybindings open launcher/session/clipboard or available v5 equivalents; audio, microphone, media, brightness, and lock bindings work; obsolete plugin bindings are absent; and visible theme/bar/wallpaper/clipboard/session preferences are preserved where migrated.

## Out of Scope

- Redesigning the Noctalia visual style, bar layout, widgets, or keymap beyond what is required for v5 compatibility and obvious preference preservation.
- Adding a replacement screen recorder workflow for the removed v4 screen-recorder plugin.
- Moving non-Noctalia application configuration into the Noctalia Config Asset.
- Host-gating the migration or keeping selected shared desktop hosts on Noctalia v4.
- Converting ordinary Noctalia settings to Nix `programs.noctalia.settings`.

## Source Context

- `CONTEXT.md`
- `flake.nix`
- `modules/desktop/noctalia.nix`
- `modules/desktop/default.nix`
- `modules/desktop/hypr/hyprland.nix`
- `config/hypr/modules/noctalia.lua`
- `config/noctalia/settings.json`
- `config/noctalia/colors.json`
- `config/noctalia/plugins.json`
- `config/noctalia/plugins/pomodoro.json`
- `config/noctalia/plugins/screen-recorder.json`
- `docs/specs/2026-05-26-hyprland-lua-config.md`
- `https://docs.noctalia.dev/v5/getting-started/nixos/`
- `https://github.com/noctalia-dev/noctalia-shell/blob/v5/flake.nix`
- `https://github.com/noctalia-dev/noctalia-shell/blob/v5/nix/home-module.nix`
- `/tmp/pi-github-repos/noctalia-dev/noctalia-shell@v5/example.toml`
