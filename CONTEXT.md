# Dotfiles

Personal NixOS and Home Manager configuration for composing hosts from reusable modules and live-editable configuration assets.

## Language

**Nix Module**:
A Nix file that declares NixOS or Home Manager configuration for a feature, profile, or host.
_Avoid_: Component, service

**Config Asset**:
A non-Nix file or directory owned by a tool or app and linked or referenced for fast iteration without rebuilding.
_Avoid_: Static asset, resource

**Feature Module**:
A Nix Module for one installable or configurable capability such as Neovim, Noctalia, Television, Pi, or Hyprland.
_Avoid_: App module, package module

## Relationships

- A **Feature Module** may link one or more **Config Assets**.
- A **Config Asset** belongs to exactly one **Feature Module**.
- A **Config Asset** is organised by owning **Feature Module**, not by target filesystem path.
- A **Nix Module** should remain separate from the **Config Assets** it links.

## Example dialogue

> **Dev:** "Should the Neovim Lua files live beside the Neovim Nix Module?"
> **Domain expert:** "No — the Lua files are **Config Assets** because they are live-editable app files; the **Nix Module** only links and configures them."

## Flagged ambiguities

- "config" can mean Nix declarations or app-owned files — resolved: use **Nix Module** for Nix declarations and **Config Asset** for non-Nix live-editable files.
