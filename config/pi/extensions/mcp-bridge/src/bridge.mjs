import { loadConfig, toolAllowed } from "./config.mjs";
import { piToolName } from "./names.mjs";
import { convertMcpInputSchema } from "./schema.mjs";
import { normalizeMcpError, normalizeMcpResult } from "./results.mjs";
import { inspectAll, inspectTools } from "./inspect.mjs";

function createServerState(config) {
  return {
    name: config.name,
    enabled: config.enabled,
    config,
    connectionState: config.enabled ? "pending" : "disabled",
    client: undefined,
    transport: undefined,
    lastError: undefined,
    exposedTools: [],
    fallbackTools: [],
    skippedTools: [],
    failedTools: [],
  };
}

async function loadMcpSdk() {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/client/stdio.js"),
  ]);
  return { Client, StdioClientTransport };
}

function recordTool(server, tool) {
  if (tool.status === "exposed") server.exposedTools.push(tool);
  else if (tool.status === "fallback") server.fallbackTools.push(tool);
  else if (tool.status === "skipped") server.skippedTools.push(tool);
  else server.failedTools.push(tool);
}

export function createMcpBridge(pi, extensionDir) {
  const state = { config: { found: false, path: "", examplePath: "", servers: [], errors: [] }, servers: new Map(), toolNames: new Map() };

  async function discoverServer(server, sdk) {
    if (!server.enabled) return;
    try {
      const transport = new sdk.StdioClientTransport({
        command: server.config.command,
        args: server.config.args,
        env: { ...process.env, ...server.config.env },
      });
      const client = new sdk.Client({ name: "pi-mcp-bridge", version: "0.1.0" }, { capabilities: {} });
      server.transport = transport;
      server.client = client;
      await client.connect(transport);
      server.connectionState = "connected";

      const listed = await client.listTools();
      const tools = Array.isArray(listed?.tools) ? listed.tools : [];
      for (const tool of tools) registerDiscoveredTool(server, tool);
    } catch (error) {
      server.connectionState = "failed";
      server.lastError = error instanceof Error ? error.message : String(error);
      await closeServer(server);
    }
  }

  function registerDiscoveredTool(server, tool) {
    const mcpName = tool?.name;
    if (typeof mcpName !== "string" || !mcpName) {
      recordTool(server, { status: "failed", mcpName: String(mcpName), reason: "missing MCP tool name" });
      return;
    }
    if (!toolAllowed(server.config, mcpName)) {
      recordTool(server, { status: "skipped", mcpName, reason: "filtered by allow/deny configuration" });
      return;
    }

    const name = piToolName(server.name, mcpName);
    const existing = state.toolNames.get(name);
    if (existing) {
      recordTool(server, { status: "skipped", mcpName, piName: name, reason: `sanitized name collides with ${existing.server}/${existing.tool}` });
      return;
    }

    const converted = convertMcpInputSchema(tool.inputSchema);
    const record = { status: converted.fallback ? "fallback" : "exposed", mcpName, piName: name, fallback: converted.fallback, reason: converted.reason };
    try {
      pi.registerTool({
        name,
        label: `MCP ${server.name}/${mcpName}`,
        description: tool.description || `Call MCP tool ${mcpName} on server ${server.name}`,
        promptSnippet: `Call MCP tool ${mcpName} on trusted local server ${server.name}`,
        parameters: converted.schema,
        async execute(_toolCallId, params, signal) {
          if (!server.client || server.connectionState !== "connected") return normalizeMcpError(new Error(`MCP server ${server.name} is not connected`));
          try {
            const response = await server.client.callTool({ name: mcpName, arguments: params ?? {} }, undefined, { signal });
            return normalizeMcpResult(response);
          } catch (error) {
            return normalizeMcpError(error);
          }
        },
      });
      state.toolNames.set(name, { server: server.name, tool: mcpName });
      recordTool(server, record);
    } catch (error) {
      recordTool(server, { status: "failed", mcpName, piName: name, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  async function closeServer(server) {
    const errors = [];
    try {
      if (server.client?.close) await server.client.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      if (server.transport?.close) await server.transport.close();
    } catch (error) {
      errors.push(error);
    }
    server.client = undefined;
    server.transport = undefined;
    if (server.connectionState === "connected") server.connectionState = "stopped";
    if (errors.length > 0) server.lastError = errors.map((error) => (error instanceof Error ? error.message : String(error))).join("; ");
  }

  return {
    state,
    async start() {
      state.config = await loadConfig(extensionDir);
      state.servers.clear();
      state.toolNames.clear();
      for (const config of state.config.servers) state.servers.set(config.name, createServerState(config));
      if (!state.config.found || state.config.errors.length > 0) return;
      let sdk;
      try {
        sdk = await loadMcpSdk();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const server of state.servers.values()) {
          if (server.enabled) {
            server.connectionState = "failed";
            server.lastError = `Unable to load @modelcontextprotocol/sdk: ${message}`;
          }
        }
        return;
      }
      await Promise.all([...state.servers.values()].map((server) => discoverServer(server, sdk)));
    },
    async shutdown() {
      await Promise.all([...state.servers.values()].map((server) => closeServer(server)));
    },
    async inspect(args, ctx) {
      const tokens = String(args ?? "").trim().split(/\s+/).filter(Boolean);
      const text = tokens[0] === "tools" && tokens[1] ? inspectTools(state, tokens[1]) : inspectAll(state);
      if (ctx.hasUI) ctx.ui.notify(text, "info");
      else console.log(text);
    },
  };
}
