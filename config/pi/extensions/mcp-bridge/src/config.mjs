import { execFile } from "node:child_process";

const OPENCODE_CONFIG_COMMAND = "opencode debug config";
const OPENCODE_CONFIG_TIMEOUT_MS = 3000;

export function interpolateEnv(value, env = process.env) {
  return String(value).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => env[name] ?? "");
}

function defaultRunCommand({ command, args, timeoutMs, cwd }) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr, statusCode: 0 });
    });
  });
}

function isTimeoutError(error) {
  return Boolean(error?.timedOut || error?.code === "ETIMEDOUT" || (error?.killed && error?.signal === "SIGTERM") || /timed out/i.test(error?.message ?? ""));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function baseConfig(cwd) {
  return {
    found: true,
    source: OPENCODE_CONFIG_COMMAND,
    command: "opencode",
    args: ["debug", "config"],
    timeoutMs: OPENCODE_CONFIG_TIMEOUT_MS,
    cwd,
    status: "pending",
    elapsedMs: 0,
    servers: [],
    errors: [],
  };
}

function complete(config, startedAt, updates) {
  return { ...config, ...updates, elapsedMs: Date.now() - startedAt };
}

function timeoutErrorMessage(config) {
  return `${config.source} timed out after ${config.timeoutMs} ms`;
}

export async function loadConfig(_extensionDir, _env = process.env, options = {}) {
  const startedAt = Date.now();
  const cwd = options.cwd;
  const config = baseConfig(cwd);
  const runCommand = options.runCommand ?? defaultRunCommand;

  let result;
  let timeoutId;
  try {
    const commandPromise = runCommand({
      command: config.command,
      args: config.args,
      timeoutMs: config.timeoutMs,
      cwd: config.cwd,
    });
    const timeoutPromise = new Promise((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(timeoutErrorMessage(config));
        error.timedOut = true;
        reject(error);
      }, config.timeoutMs);
      timeoutId.unref?.();
    });
    result = await Promise.race([commandPromise, timeoutPromise]);
  } catch (error) {
    if (isTimeoutError(error)) return complete(config, startedAt, { status: "timed_out", errors: [timeoutErrorMessage(config)] });
    return complete(config, startedAt, { status: "failed", errors: [errorMessage(error)] });
  } finally {
    clearTimeout(timeoutId);
  }

  if (typeof result?.statusCode === "number" && result.statusCode !== 0) {
    return complete(config, startedAt, { status: "failed", errors: [`${config.source} exited with status ${result.statusCode}`] });
  }

  let parsed;
  try {
    parsed = JSON.parse(result?.stdout ?? "");
  } catch (error) {
    return complete(config, startedAt, { status: "failed", errors: [`invalid JSON from ${config.source}: ${errorMessage(error)}`] });
  }

  if (!isObjectRecord(parsed)) {
    return complete(config, startedAt, { status: "failed", errors: [`invalid JSON from ${config.source}: root must be an object`] });
  }

  const mcp = parsed.mcp ?? {};
  if (!isObjectRecord(mcp)) {
    return complete(config, startedAt, { status: "failed", errors: [`invalid JSON from ${config.source}: mcp must be an object when present`] });
  }

  const servers = Object.entries(mcp).map(([name, raw]) => ({ name, raw }));
  return complete(config, startedAt, { status: "success", servers, errors: [] });
}

export function toolAllowed(server, toolName) {
  if (server.allowTools && !server.allowTools.includes(toolName)) return false;
  if (server.denyTools && server.denyTools.includes(toolName)) return false;
  return true;
}
