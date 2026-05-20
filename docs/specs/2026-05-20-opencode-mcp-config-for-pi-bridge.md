# Opencode MCP Config for Pi Bridge

## Purpose

The MCP Bridge should make Pi use the same MCP server setup that opencode resolves for the current project. Instead of maintaining a separate bridge-owned `servers.json`, Pi imports Opencode MCP Config through opencode itself so project and global MCP server definitions behave consistently across tools.

This feature replaces the MCP Bridge's local server configuration source while preserving its existing tool-only, local stdio MCP behavior: discovered MCP tools are exposed as Pi custom tools, failures remain isolated, and `/mcp` remains the inspection surface.

## Requirements

### Requirement: Opencode config as server source

The MCP Bridge SHALL use resolved Opencode MCP Config as its only MCP server configuration source.

#### Scenario: Resolved opencode config is loaded

- **WHEN** Pi starts or reloads in a project where opencode resolves an `mcp` map
- **THEN** the MCP Bridge imports MCP server definitions from that resolved `mcp` map
- **AND** no bridge-owned `servers.json` is read or required

#### Scenario: No opencode MCP servers are configured

- **WHEN** opencode resolves no `mcp` entries
- **THEN** the MCP Bridge starts without a configuration warning
- **AND** no MCP servers are started
- **AND** `/mcp` reports that no opencode MCP servers are configured

#### Scenario: Previous bridge configuration is absent

- **WHEN** `config/pi/extensions/mcp-bridge/servers.json` is absent
- **THEN** the MCP Bridge still attempts to load Opencode MCP Config
- **AND** `/mcp` does not instruct the user to create `servers.json`

### Requirement: Opencode-owned config resolution

The MCP Bridge SHALL obtain MCP configuration by running opencode's normal resolved configuration command from Pi's project context.

#### Scenario: Opencode config command succeeds

- **WHEN** `opencode debug config` completes successfully within 3000 ms
- **THEN** the MCP Bridge parses the command's JSON output
- **AND** imports the output's `mcp` map as resolved by opencode

#### Scenario: Opencode config command fails

- **WHEN** `opencode debug config` exits non-zero or emits invalid JSON
- **THEN** the MCP Bridge starts no MCP servers
- **AND** `/mcp` reports the opencode config load failure

#### Scenario: Opencode config command times out

- **WHEN** `opencode debug config` does not complete within 3000 ms
- **THEN** the MCP Bridge stops waiting for config resolution
- **AND** starts no MCP servers
- **AND** `/mcp` reports that opencode config resolution timed out

#### Scenario: Opencode plugins affect config

- **WHEN** opencode plugins contribute to the resolved config
- **THEN** the MCP Bridge imports the config as reported by `opencode debug config`
- **AND** the bridge does not use `--pure`

### Requirement: Project context for opencode resolution

The MCP Bridge SHALL run opencode config resolution from Pi's project context.

#### Scenario: Extension context provides a project directory

- **WHEN** Pi exposes a project directory through the extension command/session context or equivalent runtime context
- **THEN** `opencode debug config` runs with that directory as its current working directory

#### Scenario: No project directory is available

- **WHEN** Pi does not expose a project directory to the extension
- **THEN** `opencode debug config` runs from the Pi process current working directory

### Requirement: Local opencode MCP server import

The MCP Bridge SHALL support imported opencode MCP servers with `type: "local"` by launching them as stdio MCP servers.

#### Scenario: Enabled local server starts

- **WHEN** the resolved opencode `mcp` map contains an enabled local server with `command: ["cmd", "arg"]`
- **THEN** the MCP Bridge launches `cmd` with argument `arg` through stdio
- **AND** discovers and exposes the server's MCP tools as Pi custom tools

#### Scenario: Disabled local server

- **WHEN** a resolved opencode MCP server has `enabled: false`
- **THEN** the MCP Bridge does not start that server
- **AND** `/mcp` reports it as disabled

#### Scenario: Empty local command

- **WHEN** a resolved local opencode MCP server has an empty or invalid `command` array
- **THEN** the MCP Bridge does not start that server
- **AND** `/mcp` reports the server as invalid

#### Scenario: Server environment is inherited from opencode config

- **WHEN** a local opencode MCP server defines `environment`
- **THEN** the MCP Bridge passes those environment entries to the MCP server process in the same resolved form opencode reports
- **AND** the MCP server process also receives Pi's process environment unless explicitly overridden by the server environment

### Requirement: Unsupported opencode MCP servers

The MCP Bridge SHALL skip unsupported opencode MCP server types without preventing supported servers from loading.

#### Scenario: Remote server is present

- **WHEN** the resolved opencode `mcp` map contains a server with `type: "remote"`
- **THEN** the MCP Bridge does not start that server
- **AND** `/mcp` reports it as skipped because remote transport is unsupported

#### Scenario: Unknown server type is present

- **WHEN** the resolved opencode `mcp` map contains a server with an unknown or missing type
- **THEN** the MCP Bridge does not start that server
- **AND** `/mcp` reports it as skipped because the opencode MCP type is unsupported

### Requirement: Pi-only tool filters removed

The MCP Bridge SHALL NOT support bridge-owned `allowTools` or `denyTools` filters for imported Opencode MCP Config.

#### Scenario: MCP tools are discovered from an imported server

- **WHEN** an imported local opencode MCP server advertises MCP tools
- **THEN** the MCP Bridge exposes tools according to its normal tool registration behavior
- **AND** no bridge-owned allow or deny filter is applied

### Requirement: MCP inspection reflects opencode source

The MCP Bridge SHALL report opencode config source details through `/mcp`.

#### Scenario: Inspecting bridge status

- **WHEN** the user runs `/mcp`
- **THEN** the output reports `opencode debug config` as the config source
- **AND** reports the current working directory used for config resolution
- **AND** reports whether config loading succeeded, failed, or timed out
- **AND** reports elapsed config load time when available

#### Scenario: Inspecting skipped and invalid servers

- **WHEN** imported opencode MCP servers are disabled, skipped, invalid, or failed
- **THEN** `/mcp` reports each affected server and the reason

## Implementation Constraints

- The feature supersedes the `servers.json` configuration source from `docs/specs/2026-05-19-mcp-bridge.md` and `docs/adr/0002-local-pi-mcp-bridge.md`.
- The MCP Bridge remains a local Pi Extension Config Asset under `config/pi/extensions/mcp-bridge/`.
- The opencode config command is exactly `opencode debug config`; it must not use `--pure`.
- The opencode config command timeout is hard-coded to 3000 ms.
- The bridge remains tool-only and stdio/local-only for MCP runtime support.
- Existing deterministic Pi tool naming, schema conversion, tool result normalization, tool registration, and failure isolation behavior should remain unless explicitly superseded by this spec.

## Implementation Tasks

- [ ] 1. Replace `servers.json` loading with an opencode config loader that runs `opencode debug config`, captures stdout, enforces a 3000 ms timeout, parses JSON, and returns config status metadata for inspection.
  - Covers: Requirement: Opencode config as server source; Requirement: Opencode-owned config resolution
- [ ] 2. Resolve and pass the correct working directory for the opencode config command, preferring Pi project context when available and falling back to `process.cwd()`.
  - Covers: Requirement: Project context for opencode resolution
- [ ] 3. Map resolved opencode local MCP server definitions into the bridge runtime shape, including command array splitting, enabled state, environment, and invalid-command reporting.
  - Covers: Requirement: Local opencode MCP server import
- [ ] 4. Record remote, unknown, missing-type, invalid, and disabled opencode MCP servers in bridge state so they are visible in `/mcp` without blocking supported local servers.
  - Covers: Requirement: Unsupported opencode MCP servers; Requirement: MCP inspection reflects opencode source
- [ ] 5. Remove bridge-owned `servers.json`, `servers.example.json`, and `allowTools`/`denyTools` behavior from configuration parsing and tests.
  - Covers: Requirement: Opencode config as server source; Requirement: Pi-only tool filters removed
- [ ] 6. Update `/mcp` output to describe opencode as the config source, show command/cwd/load status/elapsed time, and remove instructions about creating `servers.json`.
  - Covers: Requirement: MCP inspection reflects opencode source
- [ ] 7. Add or update deterministic tests for successful opencode config import, missing `mcp`, command failure, timeout, invalid JSON, disabled local server, invalid local command, remote skip, unknown-type skip, and removed tool filters.
  - Covers: all requirements
- [ ] 8. Run the extension test suite with `npm --prefix config/pi/extensions/mcp-bridge test` and fix regressions in existing naming, schema, and result normalization tests.
  - Covers: all requirements
- [ ] 9. Validate repository integration by checking that Pi can load/reload the extension without `servers.json`, `/mcp` reports opencode config status, and no tracked docs or examples still instruct users to create `servers.json` as the active configuration source.
  - Covers: Requirement: Opencode config as server source; Requirement: MCP inspection reflects opencode source

## Out of Scope

- Adding MCP support to Pi core.
- Publishing the MCP Bridge as an npm, git, or Pi package.
- Implementing remote MCP transports, OAuth, headers, SSE, or HTTP MCP support.
- Implementing MCP resources, prompts, sampling, or roots.
- Reimplementing opencode's config merge, plugin, or secret resolution logic inside the MCP Bridge.
- Bridge-owned `servers.json` configuration or bridge-owned `allowTools`/`denyTools` filters.
- Configurable opencode command timeout.
- `/mcp` mutation commands such as restart, reload, enable, disable, auth, or logout.

## Source Context

- `CONTEXT.md`
- `docs/adr/0002-local-pi-mcp-bridge.md`
- `docs/adr/0006-opencode-mcp-config-for-pi-bridge.md`
- `docs/specs/2026-05-19-mcp-bridge.md`
- `config/pi/extensions/mcp-bridge/index.ts`
- `config/pi/extensions/mcp-bridge/src/config.mjs`
- `config/pi/extensions/mcp-bridge/src/bridge.mjs`
- `config/pi/extensions/mcp-bridge/src/inspect.mjs`
- `config/pi/extensions/mcp-bridge/package.json`

## Review Checklist

- [ ] Implementation satisfies “Requirement: Opencode config as server source”.
- [ ] Implementation satisfies “Requirement: Opencode-owned config resolution”.
- [ ] Implementation satisfies “Requirement: Project context for opencode resolution”.
- [ ] Implementation satisfies “Requirement: Local opencode MCP server import”.
- [ ] Implementation satisfies “Requirement: Unsupported opencode MCP servers”.
- [ ] Implementation satisfies “Requirement: Pi-only tool filters removed”.
- [ ] Implementation satisfies “Requirement: MCP inspection reflects opencode source”.
- [ ] Scenarios under each requirement are covered by behavior or tests.
- [ ] Implementation tasks were completed in dependency order.
- [ ] No out-of-scope behavior was introduced.
- [ ] Public behavior matches the spec language.
