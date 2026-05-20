import assert from "node:assert/strict";
import { loadConfig, interpolateEnv, toolAllowed } from "../src/config.mjs";
import { piToolName, sanitizeName } from "../src/names.mjs";
import { convertMcpInputSchema } from "../src/schema.mjs";
import { normalizeMcpError, normalizeMcpResult } from "../src/results.mjs";

assert.equal(interpolateEnv("token=${TOKEN}; missing=${MISSING}", { TOKEN: "abc" }), "token=abc; missing=");
assert.equal(sanitizeName("GitHub Server!"), "github_server");
assert.equal(sanitizeName("123"), "x_123");
assert.equal(piToolName("github", "search_issues"), "mcp_github_search_issues");
assert.equal(piToolName("git hub", "search/issues"), "mcp_git_hub_search_issues");

const config = await loadConfig("/unused-extension-dir", {}, {
  runCommand: async ({ command, args, timeoutMs }) => {
    assert.equal(command, "opencode");
    assert.deepEqual(args, ["debug", "config"]);
    assert.equal(timeoutMs, 3000);
    return {
      stdout: JSON.stringify({
        mcp: {
          disabled: { enabled: false, type: "local", command: ["ignored"] },
          enabled: { type: "local", command: ["cmd", "--x"], environment: { TOKEN: "secret" } },
        },
      }),
      statusCode: 0,
    };
  },
});
assert.equal(config.source, "opencode debug config");
assert.equal(config.status, "success");
assert.equal(config.timeoutMs, 3000);
assert.equal(config.errors.length, 0);
assert.deepEqual(config.servers.map((server) => server.name), ["disabled", "enabled"]);
assert.deepEqual(config.servers[1].raw.command, ["cmd", "--x"]);
assert.equal(config.servers[1].raw.environment.TOKEN, "secret");
assert.equal(toolAllowed(config.servers[1], "anything"), true);

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
