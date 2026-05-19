export function inspectAll(state) {
  const lines = ["MCP Bridge", ""];
  if (!state.config.found) {
    lines.push(`No local server configuration found at ${state.config.path}.`);
    lines.push(`Copy or adapt ${state.config.examplePath}, then create servers.json and run /reload.`);
    return lines.join("\n");
  }
  if (state.config.errors.length > 0) lines.push(`Configuration errors: ${state.config.errors.join("; ")}`);
  if (state.servers.size === 0) lines.push("No MCP servers are configured.");
  for (const server of state.servers.values()) {
    lines.push(`- ${server.name}: ${server.enabled ? "enabled" : "disabled"}; ${server.connectionState}; tools ${server.exposedTools.length}; last error ${server.lastError ?? "none"}`);
  }
  lines.push("");
  lines.push("Edit config/pi/extensions/mcp-bridge/servers.json and run /reload for operational changes.");
  return lines.join("\n");
}

function formatTool(tool) {
  const suffix = tool.reason ? ` (${tool.reason})` : "";
  const piName = tool.piName ? ` -> ${tool.piName}` : "";
  return `- ${tool.status}: ${tool.mcpName}${piName}${tool.fallback ? " [schema fallback]" : ""}${suffix}`;
}

export function inspectTools(state, serverName) {
  const server = state.servers.get(serverName);
  if (!server) return `MCP server '${serverName}' is not configured or not known.`;
  const lines = [`MCP tools for ${server.name}`, `State: ${server.enabled ? "enabled" : "disabled"}; ${server.connectionState}; last error ${server.lastError ?? "none"}`, ""];
  const tools = [...server.exposedTools, ...server.fallbackTools, ...server.skippedTools, ...server.failedTools];
  if (tools.length === 0) lines.push("No tools discovered or recorded.");
  else tools.forEach((tool) => lines.push(formatTool(tool)));
  return lines.join("\n");
}
