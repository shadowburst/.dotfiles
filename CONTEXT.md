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

**Opencode MCP Config**:
An opencode-owned configuration source that declares MCP servers which the MCP Bridge may import for Pi use.
_Avoid_: Pi MCP config, bridge config

**Ralph Loop**:
A deterministic implementation loop, invoked from Pi, that consumes one Feature Spec, selects exactly one unchecked implementation task, asks Pi to implement it, validates it with tests or CI-quality checks, hands off to a fresh Pi session seeded only with review-relevant artifacts, performs a clean-eye review, fixes real issues through a bounded fix/retest cycle, verifies, commits the completed task, and then completes that one task before stopping or continuing by explicit loop control.
_Avoid_: Autonomous sprint, agent workflow, task runner

**Ralph Orchestrator**:
The workflow engine behind a Ralph Loop that coordinates phase-specific Pi sessions, validation gates, review gates, task completion commits, and final review on the current branch.
_Avoid_: Handoff script, wrapper command, extension logic

**Ralph Agent Session**:
A fresh Pi agent session created for one Ralph phase, such as task implementation, task review, refactoring, or final branch review.
_Avoid_: Subagent, nested Pi, continuation

**Review Base**:
The git ref or commit used as the left side of a Ralph Loop final branch review, recorded at the start of a Ralph run on the current branch.
_Avoid_: Fixed point, base thing, original HEAD

## Relationships

- A **Feature Module** may link one or more **Config Assets**.
- A **Config Asset** belongs to exactly one **Feature Module**.
- A **Config Asset** is organised by owning **Feature Module**, not by target filesystem path.
- A **Nix Module** should remain separate from the **Config Assets** it links.
- An **MCP Bridge** is a **Pi Extension**.
- An **Agent Skill** may produce or maintain one or more **Feature Specs**.
- A **Ralph Loop** consumes a **Feature Spec** and operates on exactly one implementation task at a time.
- A **Ralph Loop** runs on the current branch and requires a clean working tree before starting.
- A **Ralph Agent Session** may be guided by an **Agent Skill** for phase-specific behavior such as behavior-preserving refactoring.

## Example dialogue

> **Dev:** "Should the Neovim Lua files live beside the Neovim Nix Module?"
> **Domain expert:** "No — the Lua files are **Config Assets** because they are live-editable app files; the **Nix Module** only links and configures them."
>
> **Dev:** "Should `to-spec` create an OpenSpec change proposal?"
> **Domain expert:** "No — `to-spec` creates a **Feature Spec**, which is a durable behavior spec under `docs/specs`, not a change proposal."

## Flagged ambiguities

- "config" can mean Nix declarations or app-owned files — resolved: use **Nix Module** for Nix declarations and **Config Asset** for non-Nix live-editable files.
- "spec" can mean OpenSpec delta artifacts or durable feature documentation — resolved: **Feature Spec** means a persisted spec under `docs/specs`.
