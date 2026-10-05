import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire, register, stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const hostSources = {
  "@earendil-works/pi-coding-agent": `
    export const DEFAULT_MAX_BYTES = 50000;
    export const DEFAULT_MAX_LINES = 2000;
    export const formatSize = String;
    export function truncateHead(content, options = {}) {
      const lines = content.split("\\n");
      let result = lines.slice(0, options.maxLines ?? 2000).join("\\n");
      const maxBytes = options.maxBytes ?? 50000;
      while (Buffer.byteLength(result) > maxBytes) result = result.slice(0, -1);
      return { content: result, truncated: result !== content, totalLines: lines.length,
        totalBytes: Buffer.byteLength(content), outputLines: result.split("\\n").length,
        outputBytes: Buffer.byteLength(result) };
    }
  `,
  "@earendil-works/pi-ai": `export const StringEnum = (values, options = {}) => ({ type: "string", enum: [...values], ...options });`,
};

export function registerBrowserTestLoader({ playwrightSource } = {}) {
  // Resolve before tests replace HOME; use real package exports, including typebox/value.
  const roots = [
    new URL("./package.json", import.meta.url),
    process.env.PI_BROWSER_TEST_PACKAGE_ROOT && pathToFileURL(join(process.env.PI_BROWSER_TEST_PACKAGE_ROOT, "package.json")),
    process.env.PI_BROWSER_TEST_HOST_ROOT && pathToFileURL(join(process.env.PI_BROWSER_TEST_HOST_ROOT, "package.json")),
    process.env.HOME && pathToFileURL(join(process.env.HOME, ".pi/agent/npm/package.json")),
    process.env.HOME && pathToFileURL(join(process.env.HOME, ".pi/agent/extensions/browser/package.json")),
    process.argv[0] && pathToFileURL(join(dirname(dirname(process.argv[0])), "lib/node_modules/pi-monorepo/package.json")),
    pathToFileURL("/nix/store/4124kgrxxngakwm8nw2gkvzz7f6ad6cq-pi-coding-agent-1.0.0/lib/node_modules/pi-monorepo/package.json"),
  ].filter(Boolean);
  const modules = {};
  for (const specifier of ["typebox", "typebox/value", ...(playwrightSource ? [] : ["playwright"])]) {
    for (const root of roots) {
      try {
        const resolved = createRequire(root).resolve(specifier);
        // Playwright's ESM entry explicitly exports chromium/devices; its CJS entry does not.
        modules[specifier] = pathToFileURL(specifier === "playwright" ? join(dirname(resolved), "index.mjs") : resolved).href;
        break;
      }
      catch { /* Try the next installed package source. */ }
    }
    if (!modules[specifier]) throw new Error(`Cannot resolve ${specifier}; set PI_BROWSER_TEST_PACKAGE_ROOT to an installed package root`);
  }
  for (const root of roots) {
    const codemode = join(dirname(fileURLToPath(root)), "dist/extensions/codemode/execute.js");
    if (existsSync(codemode)) { modules["pi-test/codemode"] = pathToFileURL(codemode).href; break; }
  }
  register(import.meta.url, { data: { modules, sources: { ...hostSources, ...(playwrightSource ? { playwright: playwrightSource } : {}) } } });
  return modules;
}

let modules = {};
let sources = {};
export function initialize(data) { ({ modules, sources } = data); }
export function resolve(specifier, context, nextResolve) {
  if (sources[specifier]) return { url: `data:text/javascript,${encodeURIComponent(sources[specifier])}`, shortCircuit: true };
  if (modules[specifier]) return { url: modules[specifier], shortCircuit: true };
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.startsWith(new URL("./", import.meta.url).href) && url.endsWith(".ts")) {
    return { format: "module", shortCircuit: true, source: stripTypeScriptTypes(await readFile(fileURLToPath(url), "utf8"), { mode: "transform" }) };
  }
  return nextLoad(url, context);
}
