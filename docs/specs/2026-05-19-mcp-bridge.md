# MCP Bridge

## Purpose

The MCP Bridge provides Pi with Model Context Protocol support as a local Pi Extension Config Asset. It lets Pi discover tools from trusted local stdio MCP servers and expose those tools to the coding agent without adding MCP to Pi core or publishing a reusable package first.

The first version is deliberately tool-only. It prioritizes predictable local configuration, deterministic tool names, clear inspection through a slash command, and isolated failures so that one broken server or tool does not disable the whole bridge.

## Requirements

### Requirement: Local extension placement

The MCP Bridge SHALL be implemented as a Pi Extension named `mcp-bridge` under `config/pi/extensions/mcp-bridge/`.

#### Scenario: Pi discovers the extension

- **WHEN** Pi starts with the existing Home Manager symlink from `config/pi/extensions` to `~/.pi/agent/extensions`
- **THEN** Pi discovers and loads the `mcp-bridge` extension
- **AND** the extension can be reloaded through Pi's normal `/reload` flow

### Requirement: Local server configuration

The MCP Bridge SHALL read MCP server definitions from `config/pi/extensions/mcp-bridge/servers.json` and SHALL treat that file as local, untracked configuration.

#### Scenario: Missing server configuration

- **WHEN** `servers.json` is absent
- **THEN** the extension loads without a startup warning
- **AND** no MCP servers are started
- **AND** `/mcp` reports that no local server configuration was found and points the user toward the example configuration

#### Scenario: Example configuration exists

- **WHEN** the extension files are present in the repository
- **THEN** a tracked `servers.example.json` exists
- **AND** it contains valid JSON with an empty `servers` object

#### Scenario: Disabled configured server

- **WHEN** a server definition has `enabled` set to `false`
- **THEN** that server is not started
- **AND** `/mcp` reports it as disabled

#### Scenario: Default enabled server

- **WHEN** a server definition omits `enabled`
- **THEN** that server is treated as enabled

### Requirement: Stdio MCP server lifecycle

The MCP Bridge SHALL support stdio MCP servers launched from local commands and SHALL eagerly start enabled servers on Pi startup or reload.

#### Scenario: Enabled server starts successfully

- **WHEN** Pi starts or reloads and `servers.json` contains an enabled stdio server
- **THEN** the extension launches the configured command with configured arguments
- **AND** it connects to the server through stdio
- **AND** it discovers the server's tools before making them available to the model

#### Scenario: Server process cleanup

- **WHEN** Pi shuts down, reloads, switches sessions, creates a new session, or forks a session
- **THEN** MCP server child processes owned by the extension are terminated
- **AND** a later reload or session start creates fresh server processes from the current configuration

### Requirement: Environment interpolation

The MCP Bridge SHALL support per-server environment variables with `${VAR}` interpolation from Pi's process environment and SHALL NOT load dotenv files in v1.

#### Scenario: Environment variable is interpolated

- **WHEN** a server definition contains an environment value such as `${GITHUB_PERSONAL_ACCESS_TOKEN}`
- **THEN** the server process receives the value from Pi's process environment for `GITHUB_PERSONAL_ACCESS_TOKEN`

#### Scenario: Dotenv file is present

- **WHEN** a `.env` file exists near the extension or project
- **THEN** the MCP Bridge does not load it automatically

### Requirement: Tool-only MCP exposure

The MCP Bridge SHALL expose MCP tools as Pi custom tools and SHALL ignore MCP resources, prompts, and sampling in v1.

#### Scenario: Server advertises tools and resources

- **WHEN** an MCP server advertises tools, resources, and prompts
- **THEN** only tools are exposed to Pi
- **AND** resources and prompts are not listed, fetched, injected into context, or exposed through commands

### Requirement: Deterministic Pi tool names

The MCP Bridge SHALL expose each MCP tool with a deterministic Pi tool name using the format `mcp_<server>_<tool>` after sanitizing server and tool names.

#### Scenario: Tool name is registered

- **WHEN** server `github` exposes tool `search_issues`
- **THEN** Pi receives a custom tool named `mcp_github_search_issues`

#### Scenario: Names contain unsafe characters

- **WHEN** a server name or tool name contains characters outside the safe Pi tool-name character set
- **THEN** the extension sanitizes the name deterministically
- **AND** `/mcp` shows enough information to relate the Pi tool name back to the MCP server and MCP tool

#### Scenario: Sanitized names collide

- **WHEN** two MCP tools map to the same sanitized Pi tool name
- **THEN** the extension does not register the later colliding tool
- **AND** `/mcp` reports the collision

### Requirement: Tool filtering

The MCP Bridge SHALL treat configured MCP servers as trusted while supporting optional per-server tool allow and deny filters at discovery time.

#### Scenario: Allow list is present

- **WHEN** a server definition contains `allowTools`
- **THEN** only MCP tools whose original MCP names are in `allowTools` are exposed

#### Scenario: Deny list is present

- **WHEN** a server definition contains `denyTools`
- **THEN** MCP tools whose original MCP names are in `denyTools` are not exposed

#### Scenario: Allow and deny both match

- **WHEN** a tool is included by `allowTools` and excluded by `denyTools`
- **THEN** the deny filter wins and the tool is not exposed

### Requirement: Schema conversion

The MCP Bridge SHALL convert MCP tool JSON Schemas to Pi-compatible tool parameter schemas on a best-effort basis and SHALL fall back to a generic object parameter shape when safe conversion is not possible.

#### Scenario: Common JSON Schema converts

- **WHEN** an MCP tool exposes a common object schema with properties, required fields, primitive types, arrays, and descriptions
- **THEN** the registered Pi tool presents a corresponding parameter schema to the model

#### Scenario: Unsupported JSON Schema falls back

- **WHEN** an MCP tool exposes schema features the bridge does not support
- **THEN** the tool remains available with a generic object fallback when possible
- **AND** `/mcp` marks the tool schema as fallback

#### Scenario: Tool cannot be registered

- **WHEN** schema conversion and fallback cannot produce a safe Pi tool definition
- **THEN** only that tool is skipped
- **AND** `/mcp` reports the skipped tool and reason

### Requirement: MCP tool execution

The MCP Bridge SHALL call the originating MCP server when a registered Pi MCP tool is invoked and SHALL return text-first results to Pi with the raw MCP response preserved in tool details.

#### Scenario: Text tool result

- **WHEN** an MCP tool returns text content
- **THEN** the Pi tool result contains that text as model-visible text content
- **AND** the raw MCP response is available in result details

#### Scenario: Non-text tool result

- **WHEN** an MCP tool returns non-text content
- **THEN** the Pi tool result contains a compact textual representation of that content
- **AND** the raw MCP response is available in result details

#### Scenario: MCP tool error

- **WHEN** an MCP tool call fails or returns an MCP error
- **THEN** the Pi tool result is marked as an error
- **AND** the model-visible result includes a concise error message

### Requirement: Isolated failures

The MCP Bridge SHALL isolate failures by server and by tool so that one failure does not disable unrelated MCP servers or tools.

#### Scenario: One server fails to start

- **WHEN** one configured MCP server fails during eager startup
- **THEN** that server is marked failed
- **AND** other configured servers continue starting and exposing tools
- **AND** `/mcp` reports the failed server and last error

#### Scenario: One tool fails during registration

- **WHEN** one discovered tool cannot be registered
- **THEN** that tool is skipped or marked failed
- **AND** other tools from that server remain available when possible
- **AND** `/mcp` reports the affected tool and reason

### Requirement: MCP inspection command

The MCP Bridge SHALL register an inspect-only `/mcp` command that reports configured MCP server and tool status.

#### Scenario: Inspect all servers

- **WHEN** the user runs `/mcp` with no arguments
- **THEN** Pi displays configured server names
- **AND** each server's enabled state, connection state, discovered tool count, and last error when present
- **AND** the output tells the user to edit configuration and run `/reload` for operational changes

#### Scenario: Inspect server tools

- **WHEN** the user runs `/mcp tools <server>` for a configured server
- **THEN** Pi displays the server's exposed, fallback, skipped, and failed tools
- **AND** the output includes the Pi tool names for exposed tools

#### Scenario: Unknown server inspection

- **WHEN** the user runs `/mcp tools <server>` for an unknown server
- **THEN** Pi displays a clear message that the server is not configured or not known

## Implementation Constraints

- The extension is a local **Pi Extension** Config Asset, not a published Pi package for v1.
- Server configuration lives in `config/pi/extensions/mcp-bridge/servers.json`; the repository tracks only `servers.example.json`.
- `servers.json` is gitignored.
- v1 supports stdio MCP transports only.
- v1 starts enabled servers eagerly during Pi startup/reload.
- v1 retries failed startup only through Pi's `/reload` lifecycle.
- v1 `/mcp` is inspect-only; it does not restart servers, reload configuration, or mutate tool availability.
- v1 does not implement MCP resources, prompts, sampling, remote HTTP/SSE transports, per-call confirmations, dotenv loading, or package publishing.
- The extension should use a small multi-file structure rather than a single large script.

## Implementation Tasks

- [ ] 1. Create the `config/pi/extensions/mcp-bridge/` extension skeleton with `index.ts`, supporting modules, `package.json`, and `servers.example.json`.
  - Covers: Requirement: Local extension placement; Requirement: Local server configuration
- [ ] 2. Define and validate the `servers.json` configuration model, including default-enabled servers, disabled servers, command/args, env interpolation, and allow/deny filters.
  - Covers: Requirement: Local server configuration; Requirement: Environment interpolation; Requirement: Tool filtering
- [ ] 3. Integrate the MCP SDK for stdio server startup, eager tool discovery, per-server state tracking, and session shutdown cleanup.
  - Covers: Requirement: Stdio MCP server lifecycle; Requirement: Isolated failures
- [ ] 4. Implement deterministic server/tool name sanitization, collision detection, and Pi tool-name construction.
  - Covers: Requirement: Deterministic Pi tool names
- [ ] 5. Implement best-effort MCP JSON Schema to Pi tool parameter schema conversion with generic fallback and per-tool failure reporting.
  - Covers: Requirement: Schema conversion; Requirement: Isolated failures
- [ ] 6. Register discovered MCP tools as Pi custom tools and proxy tool calls to the originating MCP server.
  - Covers: Requirement: Tool-only MCP exposure; Requirement: MCP tool execution
- [ ] 7. Normalize MCP tool results into text-first Pi tool results with raw MCP responses in result details and errors marked as errors.
  - Covers: Requirement: MCP tool execution
- [ ] 8. Implement the inspect-only `/mcp` command, including missing-config guidance, server status output, and `/mcp tools <server>` output.
  - Covers: Requirement: MCP inspection command; Requirement: Local server configuration
- [ ] 9. Add focused tests or executable validation fixtures for config parsing, env interpolation, name sanitization, schema conversion fallback, and result normalization.
  - Covers: Requirement: Local server configuration; Requirement: Environment interpolation; Requirement: Deterministic Pi tool names; Requirement: Schema conversion; Requirement: MCP tool execution
- [ ] 10. Validate repository integration by checking that `servers.json` remains untracked, Pi can load/reload the extension, and the repository still passes `nix flake check` when Nix validation is available; record the reason if that check is skipped.
  - Covers: Requirement: Local extension placement; Requirement: Local server configuration

## Out of Scope

- Publishing `mcp-bridge` as an npm, git, or Pi package.
- Adding MCP support to Pi core.
- HTTP, SSE, or other remote MCP transports.
- MCP resources, prompts, sampling, or roots.
- Per-call user confirmation for MCP tools.
- `/mcp` restart, reload, enable, disable, or other operational mutation commands.
- Automatic `.env` loading.
- Automatic creation of `servers.json`.
- Unspecified behavior changes outside this feature.

## Source Context

- `CONTEXT.md`
- `.gitignore`
- `flake.nix`
- `docs/adr/0002-local-pi-mcp-bridge.md`
- `modules/terminal/pi.nix`
- `config/pi/settings.json`
- `config/pi/extensions/pi-header.ts`
- `/nix/store/jxl3pw46n1mr71h4hfxq3cg89hzg2cb6-pi-coding-agent-0.73.0/lib/node_modules/pi-monorepo/docs/extensions.md`
- `/nix/store/jxl3pw46n1mr71h4hfxq3cg89hzg2cb6-pi-coding-agent-0.73.0/lib/node_modules/pi-monorepo/docs/sdk.md`

## Review Checklist

- [ ] Implementation satisfies “Requirement: Local extension placement”.
- [ ] Implementation satisfies “Requirement: Local server configuration”.
- [ ] Implementation satisfies “Requirement: Stdio MCP server lifecycle”.
- [ ] Implementation satisfies “Requirement: Environment interpolation”.
- [ ] Implementation satisfies “Requirement: Tool-only MCP exposure”.
- [ ] Implementation satisfies “Requirement: Deterministic Pi tool names”.
- [ ] Implementation satisfies “Requirement: Tool filtering”.
- [ ] Implementation satisfies “Requirement: Schema conversion”.
- [ ] Implementation satisfies “Requirement: MCP tool execution”.
- [ ] Implementation satisfies “Requirement: Isolated failures”.
- [ ] Implementation satisfies “Requirement: MCP inspection command”.
- [ ] Scenarios under each requirement are covered by behavior or tests.
- [ ] Implementation tasks were completed in dependency order.
- [ ] No out-of-scope behavior was introduced.
- [ ] Public behavior matches the spec language.
