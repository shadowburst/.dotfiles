import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createMcpBridge } from "./src/bridge.mjs";

export default async function (pi: ExtensionAPI) {
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const bridge = createMcpBridge(pi, extensionDir);

  pi.registerCommand("mcp", {
    description: "Inspect local MCP bridge server and tool status.",
    handler: async (args, ctx) => bridge.inspect(args, ctx),
  });

  pi.on("session_shutdown", async () => {
    await bridge.shutdown();
  });

  await bridge.start();
}
