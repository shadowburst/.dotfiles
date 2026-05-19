import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function interpolateEnv(value, env = process.env) {
  return String(value).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => env[name] ?? "");
}

function asStringArray(value, field, serverName) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Server ${serverName}: ${field} must be an array of strings`);
  }
  return value;
}

function parseServer(name, raw, env) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Server ${name}: definition must be an object`);
  const transport = raw.transport ?? "stdio";
  if (transport !== "stdio") throw new Error(`Server ${name}: only stdio transport is supported`);
  const enabled = raw.enabled !== false;
  if (raw.command !== undefined && typeof raw.command !== "string") throw new Error(`Server ${name}: command must be a string`);
  if (enabled && !raw.command) throw new Error(`Server ${name}: enabled stdio servers require command`);
  if (raw.args !== undefined && (!Array.isArray(raw.args) || !raw.args.every((arg) => typeof arg === "string"))) {
    throw new Error(`Server ${name}: args must be an array of strings`);
  }
  if (raw.env !== undefined && (!raw.env || typeof raw.env !== "object" || Array.isArray(raw.env))) {
    throw new Error(`Server ${name}: env must be an object`);
  }

  const serverEnv = {};
  for (const [key, value] of Object.entries(raw.env ?? {})) {
    if (typeof value !== "string") throw new Error(`Server ${name}: env.${key} must be a string`);
    serverEnv[key] = interpolateEnv(value, env);
  }

  return {
    name,
    enabled,
    transport,
    command: raw.command,
    args: raw.args ?? [],
    env: serverEnv,
    allowTools: asStringArray(raw.allowTools, "allowTools", name),
    denyTools: asStringArray(raw.denyTools, "denyTools", name),
  };
}

export async function loadConfig(extensionDir, env = process.env) {
  const configPath = join(extensionDir, "servers.json");
  const examplePath = join(extensionDir, "servers.example.json");
  if (!existsSync(configPath)) {
    return { found: false, path: configPath, examplePath, servers: [], errors: [] };
  }

  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("root must be an object");
    const serversObject = parsed.servers ?? {};
    if (!serversObject || typeof serversObject !== "object" || Array.isArray(serversObject)) throw new Error("servers must be an object");
    const servers = Object.entries(serversObject).map(([name, raw]) => parseServer(name, raw, env));
    return { found: true, path: configPath, examplePath, servers, errors: [] };
  } catch (error) {
    return { found: true, path: configPath, examplePath, servers: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export function toolAllowed(server, toolName) {
  if (server.allowTools && !server.allowTools.includes(toolName)) return false;
  if (server.denyTools && server.denyTools.includes(toolName)) return false;
  return true;
}
