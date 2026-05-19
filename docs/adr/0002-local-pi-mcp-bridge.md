# Use a local Pi MCP Bridge extension for stdio MCP tools

Pi will gain MCP support through a local `mcp-bridge` Pi Extension under `config/pi/extensions/`, not through a published package or Pi core change. The first version is a tool-only bridge for trusted stdio MCP servers configured in a gitignored `servers.json`; it eagerly starts enabled servers, exposes discovered MCP tools as prefixed Pi tools, isolates failures per server/tool, and provides an inspect-only `/mcp` command while leaving resources, prompts, remote transports, per-call confirmations, and restart controls out of scope.
