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

**Feature Spec**:
A durable behavior specification for one feature, stored under `docs/specs` with a date-prefixed filename and OpenSpec-style persisted requirements and scenarios.
_Avoid_: PRD, change proposal, delta spec

**MCP Bridge**:
A Pi Extension that exposes Model Context Protocol server capabilities to Pi.
_Avoid_: MCP plugin, MCP package

**Ralph Loop**:
A Pi Extension-driven implementation loop that consumes one Feature Spec, selects exactly one unchecked implementation task, asks Pi to implement it, validates it with tests or CI-quality checks, hands off to a fresh Pi session seeded only with review-relevant artifacts, performs a clean-eye review, fixes real issues through a bounded fix/retest cycle, verifies, commits the completed task, and then completes that one task before stopping or continuing by explicit loop control.
_Avoid_: Autonomous sprint, agent workflow, task runner

**Review Base**:
The git ref or commit used as the left side of a Ralph Loop final branch review, defaulting to the closest branch point from which the Ralph feature branch was created unless the user supplies an explicit base.
_Avoid_: Fixed point, base thing, original HEAD

**Automatic Handoff**:
A Ralph Loop transfer where Ralph starts a replacement Pi process rooted in the Ralph worktree and reruns the Ralph command without requiring the user to accept or perform a manual prompt.
_Avoid_: Automatic restart, cwd switch

**Manual Handoff**:
A Ralph Loop transfer where Ralph shows or writes the worktree startup command for the user to perform because Automatic Handoff is disabled, unavailable, or failed.
_Avoid_: Manual restart, cd prompt

## Relationships

- A **Feature Module** may link one or more **Config Assets**.
- A **Config Asset** belongs to exactly one **Feature Module**.
- A **Config Asset** is organised by owning **Feature Module**, not by target filesystem path.
- A **Nix Module** should remain separate from the **Config Assets** it links.
- An **MCP Bridge** is a **Pi Extension**.
- An **Agent Skill** may produce or maintain one or more **Feature Specs**.
- A **Ralph Loop** consumes a **Feature Spec** and operates on exactly one implementation task at a time.

## Example dialogue

> **Dev:** "Should the Neovim Lua files live beside the Neovim Nix Module?"
> **Domain expert:** "No — the Lua files are **Config Assets** because they are live-editable app files; the **Nix Module** only links and configures them."
>
> **Dev:** "Should `to-spec` create an OpenSpec change proposal?"
> **Domain expert:** "No — `to-spec` creates a **Feature Spec**, which is a durable behavior spec under `docs/specs`, not a change proposal."

## Flagged ambiguities

- "config" can mean Nix declarations or app-owned files — resolved: use **Nix Module** for Nix declarations and **Config Asset** for non-Nix live-editable files.
- "spec" can mean OpenSpec delta artifacts or durable feature documentation — resolved: **Feature Spec** means a persisted spec under `docs/specs`.
