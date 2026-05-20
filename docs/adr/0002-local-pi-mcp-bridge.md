# Use a local Pi MCP Bridge extension for stdio MCP tools

Pi will gain MCP support through a local `mcp-bridge` Pi Extension under `config/pi/extensions/`, not through a published package or Pi core change. The first version was a tool-only bridge for trusted stdio MCP servers configured in a gitignored `servers.json`; it eagerly started enabled servers, exposed discovered MCP tools as prefixed Pi tools, isolated failures per server/tool, and provided an inspect-only `/mcp` command while leaving resources, prompts, remote transports, per-call confirmations, and restart controls out of scope.

Superseded for server configuration by ADR-0006: the MCP Bridge now imports Opencode MCP Config instead of owning `servers.json`.
