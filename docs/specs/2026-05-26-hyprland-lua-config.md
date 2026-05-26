# Hyprland Lua Config

## Purpose

Hyprland configuration should move from Home Manager-rendered Hyprlang settings to Hyprland 0.55 Lua syntax while preserving all existing window-manager behavior. The migration should make Hyprland a live-editable Config Asset where reusable, feature-specific, and host-specific behavior can be changed without a Nix rebuild when the value does not depend on Nix evaluation.

The Nix Feature Modules should continue to install and enable Hyprland-related capabilities, but ordinary Hyprland behavior should live in checked-in Lua files. Nix-generated Lua is reserved for values that genuinely depend on Nix evaluation, and those generated files should live under an ignored path inside the Hyprland Config Asset and be imported by Lua.

## Requirements

### Requirement: Lua config asset owns Hyprland behavior

The Hyprland configuration SHALL be represented as checked-in Lua Config Assets rather than Home Manager-rendered Hyprlang settings for behavior that does not depend on Nix evaluation.

#### Scenario: User edits reusable Hyprland behavior

- **WHEN** a reusable Hyprland behavior such as keybindings, rules, gestures, decoration, layout, or animation is changed in the dotfiles repository
- **THEN** the changed behavior is made in a checked-in Lua file under the Hyprland Config Asset
- **AND** the behavior does not require adding or changing Home Manager `wayland.windowManager.hyprland.settings` unless it depends on Nix evaluation

#### Scenario: Hyprland reads the migrated config

- **WHEN** Home Manager activates the Hyprland module
- **THEN** Hyprland reads the Lua Config Asset through a symlinked dynamic configuration entry point
- **AND** the previous Home Manager Hyprlang renderer is no longer the source of truth for ordinary Hyprland behavior

### Requirement: Existing behavior is preserved

The migration SHALL preserve the effective Hyprland behavior that exists before the migration.

#### Scenario: Core behavior after migration

- **WHEN** Hyprland starts with the Lua configuration
- **THEN** existing core environment values, monitor defaults, workspace rules, window rules, layer rules, layout settings, decoration, animations, input settings, gestures, cursor settings, ecosystem settings, mouse bindings, and keyboard bindings remain represented in the migrated configuration

#### Scenario: Feature-owned behavior after migration

- **WHEN** Hyprland starts with feature modules such as Noctalia and hyprwhspr-rs available
- **THEN** the existing Noctalia exec and keybindings remain available from Lua module fragments
- **AND** the existing hyprwhspr-rs press/release bindings remain available from Lua module fragments
- **AND** the corresponding Nix modules retain responsibility for installing or enabling their packages and services

#### Scenario: Host-owned behavior after migration

- **WHEN** Hyprland starts on Zephyrus
- **THEN** the existing Zephyrus `AQ_DRM_DEVICES` environment value remains applied from a checked-in Lua host fragment

### Requirement: Lua config is split by ownership

The Hyprland Lua Config Asset SHALL be organized so that the main entry point imports dedicated fragments for coherent feature and host ownership.

#### Scenario: Feature-specific behavior is maintained

- **WHEN** behavior belongs to a specific feature such as Noctalia or hyprwhspr-rs
- **THEN** that behavior is placed in a dedicated checked-in Lua module fragment for that feature
- **AND** the main Lua entry point imports that fragment

#### Scenario: Host-specific behavior is maintained

- **WHEN** behavior applies only to a specific host
- **THEN** that behavior is placed in a checked-in host-specific Lua fragment
- **AND** the main Lua entry point imports it conditionally by hostname or an equivalent runtime host check

### Requirement: Nix-dependent values use generated Lua only when necessary

The configuration SHALL use ignored generated Lua fragments only for values that must be produced by Nix evaluation.

#### Scenario: Runtime environment values are available

- **WHEN** Lua needs the configured terminal or browser
- **THEN** Lua reads the runtime `TERMINAL` and `BROWSER` environment variables rather than requiring generated Nix output
- **AND** generated Lua is not introduced for those values solely because they are configured by Home Manager session variables

#### Scenario: Shared theme values depend on Nix

- **WHEN** a Hyprland value must come from Nix-evaluated shared theme data such as Stylix or Catppuccin colors
- **THEN** Nix may write that value to an ignored generated Lua file or directory inside the Hyprland Config Asset
- **AND** the checked-in Lua entry point imports the generated fragment without making the generated file itself a tracked source of truth

## Implementation Constraints

- Preserve the repository vocabulary: the Lua files are Hyprland Config Assets, and the Nix files are Feature Modules that link or generate only what is needed.
- Use checked-in Lua fragments for reusable, feature-specific, and host-specific Hyprland behavior unless the value truly depends on Nix evaluation.
- Generated Hyprland Lua files must be placed in a git-ignored path inside the Hyprland Config Asset.
- The migration must account for all existing contributors to `wayland.windowManager.hyprland.settings`, including `modules/desktop/hypr/hyprland.nix`, `modules/desktop/noctalia.nix`, `modules/desktop/hypr/hyprwhspr-rs.nix`, and `hosts/zephyrus/home.nix`.

## Implementation Context

- The current main Hyprland behavior is in `modules/desktop/hypr/hyprland.nix` with `configType = "hyprlang"`.
- Noctalia and hyprwhspr-rs currently append Hyprland exec/bind settings from their Home Manager modules, but those values are not known to depend on Nix evaluation and should move to Lua module fragments under the Hyprland Config Asset.
- Zephyrus currently contributes `AQ_DRM_DEVICES` through Home Manager Hyprland settings; the chosen plan is to represent this as a checked-in host fragment imported conditionally by hostname rather than as generated Nix output.
- `TERMINAL` and `BROWSER` are Home Manager session variables, but the Lua config can read them from the runtime environment with `os.getenv` instead of generating Lua from Nix.
- Catppuccin Hyprland support is currently disabled because the existing Hyprlang renderer cannot consume the Lua-only values it emits. After moving to Lua, shared color integration may be revisited, but only Nix-dependent color values should be generated.

## Validation Expectations

- Validate that the flake still evaluates after the migration, for example with `nix flake check` if available for this repository.
- Validate that all pre-migration Hyprland settings contributed by the main Hyprland, Noctalia, hyprwhspr-rs, and Zephyrus modules have an equivalent representation in Lua or a justified Nix-generated fragment.
- Manually validate in a Hyprland session that core keybindings, Noctalia keybindings, hyprwhspr-rs press/release behavior, host-specific GPU environment, and runtime `TERMINAL`/`BROWSER` launches still work.

## Out of Scope

- Redesigning the Hyprland keymap, workspace model, visual style, or feature set beyond what is required for the Lua migration.
- Moving non-Hyprland application configuration into the Hyprland Config Asset.
- Generating Lua from Nix for values that can be read from the runtime environment or represented as checked-in host or module fragments.

## Source Context

- `CONTEXT.md`
- `modules/desktop/hypr/hyprland.nix`
- `modules/desktop/hypr/default.nix`
- `modules/desktop/noctalia.nix`
- `modules/desktop/hypr/hyprwhspr-rs.nix`
- `hosts/zephyrus/home.nix`
- `modules/shared/catppuccin.nix`
- `modules/shared/stylix.nix`
- `.gitignore`
