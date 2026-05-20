# Import Opencode MCP Config for the Pi MCP Bridge

The MCP Bridge will use Opencode MCP Config as its only MCP server configuration source. On startup or reload, the bridge shells out to `opencode debug config` from Pi's project context, with a hard-coded 3000 ms timeout, and imports the resolved `mcp` map from opencode's normal configuration semantics, including plugins. Bridge-owned `servers.json` and Pi-only tool filters are removed rather than merged.

Project and global opencode configuration are therefore resolved by opencode itself. When the same MCP server name appears in multiple opencode configuration sources, opencode's resolved configuration is authoritative; the bridge does not reimplement merge rules.

The bridge supports imported local opencode MCP servers by mapping `type: "local"` command arrays to stdio MCP server processes. Disabled servers are reported but not started. Remote servers and unknown MCP server types are skipped and reported because the bridge remains local/stdio-only for now. Empty local command arrays are reported as invalid. Per-server opencode timeouts are preserved if the bridge can apply them to MCP calls; otherwise `/mcp` reports that they are ignored.

`/mcp` reports the opencode config command, cwd, load status, elapsed time, and any import errors or skipped servers so failures are debuggable without implying that a bridge-owned config file still exists.
