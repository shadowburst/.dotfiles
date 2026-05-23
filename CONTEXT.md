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

**Pi Extension**:
A Pi-owned Config Asset that extends the coding agent at runtime and is linked into Pi's extension discovery path.
_Avoid_: Plugin, package

**Agent Skill**:
A reusable agent instruction bundle stored as a Config Asset under `.agents/skills`.
_Avoid_: Command, script, workflow

**Pi Prompt Template**:
A Pi-owned Config Asset invoked by slash-style prompt name, such as `/plan` or `/implement`, that expands into agent instructions rather than registering deterministic extension code.
_Avoid_: Command, workflow, extension

**Feature Spec**:
A durable behavior contract for one feature, stored under `docs/specs` with a date-prefixed filename and OpenSpec-style persisted requirements and scenarios. It captures externally observable behavior plus durable constraints or context, not implementation task ledgers or generic review checklists.
_Avoid_: PRD, change proposal, delta spec, task list, review checklist

**MCP Bridge**:
A Pi Extension that exposes Model Context Protocol server capabilities to Pi.
_Avoid_: MCP plugin, MCP package

**Opencode MCP Config**:
An opencode-owned configuration source that declares MCP servers which the MCP Bridge may import for Pi use.
_Avoid_: Pi MCP config, bridge config

## Relationships

- A **Feature Module** may link one or more **Config Assets**.
- A **Config Asset** belongs to exactly one **Feature Module**.
- A **Config Asset** is organised by owning **Feature Module**, not by target filesystem path.
- A **Nix Module** should remain separate from the **Config Assets** it links.
- An **MCP Bridge** is a **Pi Extension**.
- An **Agent Skill** may produce or maintain one or more **Feature Specs**.
- A **Pi Prompt Template** may invoke or instruct the use of **Agent Skills** and Pi Extensions.

## Example dialogue

> **Dev:** "Should the Neovim Lua files live beside the Neovim Nix Module?"
> **Domain expert:** "No — the Lua files are **Config Assets** because they are live-editable app files; the **Nix Module** only links and configures them."
>
> **Dev:** "Should `to-spec` create an OpenSpec change proposal?"
> **Domain expert:** "No — `to-spec` creates a **Feature Spec**, which is a durable behavior spec under `docs/specs`, not a change proposal."

## Flagged ambiguities

- "config" can mean Nix declarations or app-owned files — resolved: use **Nix Module** for Nix declarations and **Config Asset** for non-Nix live-editable files.
- "spec" can mean OpenSpec delta artifacts or durable feature documentation — resolved: **Feature Spec** means a persisted spec under `docs/specs`.
