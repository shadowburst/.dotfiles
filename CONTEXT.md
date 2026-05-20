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

**Forge**:
A Feature Spec fulfillment command, invoked from Pi, that repeatedly selects unchecked implementation tasks, delegates task execution through a subagent chain, requires deterministic validation evidence, reviews completed work from a clean context, applies review-guided fixes once, and records progress one task at a time.
_Avoid_: Autonomous sprint, agent workflow, task runner

**Forge Driver**:
The thin deterministic Pi Extension command behind Forge that selects Feature Spec tasks, invokes the task chain, verifies machine-readable verdicts, updates the Feature Spec task ledger, and creates commits.
_Avoid_: Orchestrator, autonomous agent, workflow engine

**Forge Task Chain**:
The pi-subagents chain executed by Forge for one selected Feature Spec task, responsible for implementation, validation evidence, clean-context review, required fixes, and a machine-readable verdict.
_Avoid_: Orchestrator, task runner, nested Pi

**Review Base**:
The git ref or commit used as the left side of a Forge final branch review, recorded at the start of a Forge run on the current branch.
_Avoid_: Fixed point, base thing, original HEAD

## Relationships

- A **Feature Module** may link one or more **Config Assets**.
- A **Config Asset** belongs to exactly one **Feature Module**.
- A **Config Asset** is organised by owning **Feature Module**, not by target filesystem path.
- A **Nix Module** should remain separate from the **Config Assets** it links.
- An **MCP Bridge** is a **Pi Extension**.
- An **Agent Skill** may produce or maintain one or more **Feature Specs**.
- **Forge** consumes a **Feature Spec** and operates on exactly one implementation task at a time inside each **Forge Task Chain** run.
- **Forge** runs on the current branch and requires a clean working tree before starting.
- A **Forge Task Chain** may use an **Agent Skill** for phase-specific behavior such as behavior-preserving refactoring.

## Example dialogue

> **Dev:** "Should the Neovim Lua files live beside the Neovim Nix Module?"
> **Domain expert:** "No — the Lua files are **Config Assets** because they are live-editable app files; the **Nix Module** only links and configures them."
>
> **Dev:** "Should `to-spec` create an OpenSpec change proposal?"
> **Domain expert:** "No — `to-spec` creates a **Feature Spec**, which is a durable behavior spec under `docs/specs`, not a change proposal."

## Flagged ambiguities

- "config" can mean Nix declarations or app-owned files — resolved: use **Nix Module** for Nix declarations and **Config Asset** for non-Nix live-editable files.
- "spec" can mean OpenSpec delta artifacts or durable feature documentation — resolved: **Feature Spec** means a persisted spec under `docs/specs`.
