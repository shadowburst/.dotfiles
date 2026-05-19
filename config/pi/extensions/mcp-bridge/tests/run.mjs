import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, interpolateEnv, toolAllowed } from "../src/config.mjs";
import { piToolName, sanitizeName } from "../src/names.mjs";
import { convertMcpInputSchema } from "../src/schema.mjs";
import { normalizeMcpError, normalizeMcpResult } from "../src/results.mjs";

assert.equal(interpolateEnv("token=${TOKEN}; missing=${MISSING}", { TOKEN: "abc" }), "token=abc; missing=");
assert.equal(sanitizeName("GitHub Server!"), "github_server");
assert.equal(sanitizeName("123"), "x_123");
assert.equal(piToolName("github", "search_issues"), "mcp_github_search_issues");
assert.equal(piToolName("git hub", "search/issues"), "mcp_git_hub_search_issues");

const dir = await mkdtemp(join(tmpdir(), "mcp-bridge-test-"));
try {
  let config = await loadConfig(dir, {});
  assert.equal(config.found, false);
  assert.deepEqual(config.servers, []);

  await writeFile(join(dir, "servers.json"), JSON.stringify({
    servers: {
      disabled: { enabled: false, command: "ignored" },
      enabled: { command: "cmd", args: ["--x"], env: { TOKEN: "${TOKEN}" }, allowTools: ["a", "b"], denyTools: ["b"] }
    }
  }));
  config = await loadConfig(dir, { TOKEN: "secret" });
  assert.equal(config.errors.length, 0);
  assert.equal(config.servers[0].enabled, false);
  assert.equal(config.servers[1].enabled, true);
  assert.equal(config.servers[1].env.TOKEN, "secret");
  assert.equal(toolAllowed(config.servers[1], "a"), true);
  assert.equal(toolAllowed(config.servers[1], "b"), false);
  assert.equal(toolAllowed(config.servers[1], "c"), false);
} finally {
  await rm(dir, { recursive: true, force: true });
}

const converted = convertMcpInputSchema({
  type: "object",
  properties: { q: { type: "string", description: "query" }, limit: { type: "integer" }, tags: { type: "array", items: { type: "string" } } },
  required: ["q"],
});
assert.equal(converted.fallback, false);
assert.equal(converted.schema.properties.q.description, "query");
assert.deepEqual(converted.schema.required, ["q"]);
const fallback = convertMcpInputSchema({ type: "object", oneOf: [{ type: "string" }] });
assert.equal(fallback.fallback, true);
assert.equal(fallback.schema.type, "object");

const textResult = normalizeMcpResult({ content: [{ type: "text", text: "hello" }] });
assert.equal(textResult.content[0].text, "hello");
assert.deepEqual(textResult.details.rawMcpResponse.content[0].text, "hello");
const nonTextResult = normalizeMcpResult({ content: [{ type: "image", data: "abc" }] });
assert.match(nonTextResult.content[0].text, /"image"/);
const errorResult = normalizeMcpError(new Error("boom"));
assert.equal(errorResult.isError, true);
assert.match(errorResult.content[0].text, /boom/);

console.log("mcp-bridge validation fixtures passed");
