// Run: node --experimental-vm-modules config/herdr-app/tests/usage.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Evaluate the real key map without building a full Home Manager configuration.
const keys = JSON.parse(execFileSync("nix", ["eval", "--impure", "--offline", "--json", "--expr", `
  let
    module = (import ./modules/herdr.nix).flake.homeModules.gui;
    lib = builtins // {
      nameValuePair = name: value: { inherit name value; };
      imap1 = f: xs: builtins.genList (i: f (i + 1) (builtins.elemAt xs i)) (builtins.length xs);
    };
    result = module {
      inherit lib;
      config = {};
      pkgs.formats.json = _: { generate = _: value: value; };
    };
  in result.home.file.".dotfiles/config/herdr-app/keys.json".source
`], { cwd: new URL("../../../", import.meta.url), encoding: "utf8" }));
assert.equal(keys.global["alt-u"], "mod.open:usage", "Alt+U must use Herdr's native mod toggle");
for (const [section, bindings] of Object.entries(keys)) {
  if (section !== "global" && bindings["alt-u"]) assert.equal(bindings["alt-u"], "mod.open:usage");
}
const manifest = JSON.parse(await readFile(new URL("../mods/usage/mod.json", import.meta.url), "utf8"));
assert.deepEqual(manifest.overlay, { kind: "dialog", width: 0.8, height: 0.85 });

const context = vm.createContext({ console });
const module = (values) => new vm.SyntheticModule(Object.keys(values), function () {
  for (const [key, value] of Object.entries(values)) this.setExport(key, value);
}, { context });
const elements = [], icons = [], calls = [];
const closed = [];
const element = () => {
  const calls = {};
  const el = new Proxy({}, { get: (_target, method) => (...args) => {
    calls[method] = args;
    if (method === "when" && args[0]) args[1](el);
    return el;
  } });
  elements.push(calls);
  return el;
};
let testProps = {};
let testMachines = [];
const ioCalls = [];
const accountId = "shared-account";
const files = new Map([
  ["local:/local/.codex/auth.json", JSON.stringify({ tokens: { account_id: accountId } })],
  ["server:/remote/.codex/auth.json", JSON.stringify({ tokens: { account_id: accountId } })],
  ["server:/remote/.claude/.credentials.json", JSON.stringify({ claudeAiOauth: {} })],
  ["server:/remote/.claude.json", JSON.stringify({ oauthAccount: { accountUuid: "remote-claude", emailAddress: "r@example.invalid" } })],
]);
const herdr = module({
  appHome() { return "/app"; }, home() { return "/local"; }, machines() { return testMachines; }, writeTextFile() {},
  async readTextFile(path, { on } = {}) {
    ioCalls.push({ path, on });
    if (path === "/app/mods/usage/probe.py") return "# probe fixture";
    return files.get(`${on ?? "local"}:${path}`) ?? null;
  },
  async exec(command, args, { on } = {}) {
    ioCalls.push({ command, args: Array.from(args), on });
    if (on === "offline") throw new Error("Machine is offline");
    if (args[2]?.includes('expanduser("~")')) return { code: 0, stdout: "/remote\n" };
    if (args[2]?.includes("sqlite3")) return { code: 0, stdout: "{}" };
    if (!on) throw new Error("Local login expired");
    if (args.at(-1) === "codex") return { code: 0, stdout: JSON.stringify({ account: { account: { email: "remote@example.invalid" } }, limits: {} }) };
    return { code: 0, stdout: JSON.stringify({ usage: { rate_limits: { five_hour: { utilization: 25 } } } }) };
  },
  closeOverlay(id) { closed.push(id); }, layout() {}, props: () => testProps, setShared() {}, shared() {}, theme: () => ({ accent: "#aabbcc" }),
  run(command, args) { calls.push({ command, args }); },
});
const sources = new vm.SourceTextModule(await readFile(new URL("../mods/usage/sources.js", import.meta.url), "utf8"), { context });
await sources.link(() => herdr);
const kit = module({ View: class {}, div: element, image: element, svg(path) { icons.push(path); return element(); } });
const base = module({ h_flex: element, v_flex: element });
const main = new vm.SourceTextModule(await readFile(new URL("../mods/usage/main.js", import.meta.url), "utf8"), { context });
await main.link((name) => ({ "gpui-kit": kit, "gpui-base": base, herdr, "./sources.js": sources })[name]);
await main.evaluate();
const view = new main.namespace.default();
const bindings = [];
let focused = false;
const cx = {
  notify() {}, spawn() {}, timer: { every() {} },
  focus_handle: () => ({ focus() { focused = true; } }),
  bind_keys(keys) { bindings.push(...keys); },
};
view.init({}, cx);
assert.equal(bindings.length, 0, "The sidebar must not capture Ctrl+R");
view.render();
elements.find((el) => el.id?.[0] === "usage-open").on_click[0]();
assert.equal(calls[0].command, "mod.open", "The sidebar button must use the same native toggle");
assert.equal(calls[0].args.name, "usage");
testProps = { overlay: "usage-dialog" };
view.init({}, cx);
assert(focused, "The dialog must take keyboard focus");
assert.equal(bindings[0].keystroke, "ctrl-r");
assert.equal(bindings[0].context, "Usage", "Ctrl+R must apply only inside the Usage dialog");
assert.equal(view.rows, null, "An overlay must initialize the usage dialog, not the sidebar row");
elements.length = 0;
view.render();
assert(elements.some((el) => el.id?.[0] === "usage-view"), "The native toggle must render the usage dialog");
assert(elements.some((el) => el.child?.[0] === "Esc"), "Dialogs use the same Esc close indicator");
assert(!icons.includes("mods/usage/x.svg"));
assert(elements.some((el) => el.h?.[0] === 60 && el.px?.[0] === 20), "Match the Worktrees header height and padding");
assert(elements.some((el) => el.size?.[0] === 34 && el.rounded?.[0] === 9 && el.bg?.[0] === "#aabbcc29"), "Match the Worktrees accent icon tile");
assert(elements.some((el) => el.child?.[0] === "Subscription limits across your accounts"), "Keep a subtitle below the title");
const dialog = elements.find((el) => el.id?.[0] === "usage-view");
assert.equal(dialog.key_context[0], "Usage");
assert.equal(dialog.track_focus[0], view.handle);
assert.equal(dialog.on_action[0], bindings[0].action);
const refreshButton = elements.find((el) => el.id?.[0] === "usage-refresh");
assert.match(refreshButton.tooltip[0], /Ctrl\+R/);
elements.find((el) => el.id?.[0] === "usage-close").on_click[0]();
assert.equal(closed.at(-1), "usage-dialog", "The Esc indicator remains clickable");

const loads = [], tasks = [];
let release;
const pending = new Promise(resolve => { release = resolve; });
view.rows = ["claude", "chatgpt", "failed"].map(key => ({
  account: { key, async load() {
    loads.push(key);
    await pending;
    if (key === "failed") throw new Error("Provider unavailable");
    return { windows: [{ id: "session", usedPercent: 20 }] };
  } },
  entry: { snapshot: { windows: [] }, fetchedAt: Date.now() }, error: null, loading: false,
}));
const stale = view.rows[2].entry;
await view.refresh(cx, 300_000);
assert.equal(loads.length, 0, "Opening keeps fresh cached limits");
const refreshCx = { ...cx, spawn(fn) { tasks.push(fn(refreshCx)); } };
dialog.on_action[1]({}, refreshCx);
assert.deepEqual(loads, ["claude", "chatgpt", "failed"], "Ctrl+R must bypass the cache for every provider");
refreshButton.on_click[0]({}, refreshCx);
assert.equal(loads.length, 3, "Repeated refreshes must not duplicate in-flight requests");
release();
await Promise.all(tasks);
assert.equal(view.rows[0].entry.snapshot.windows[0].usedPercent, 20);
assert.equal(view.rows[1].entry.snapshot.windows[0].usedPercent, 20);
assert.equal(view.rows[2].entry, stale, "Keep previous limits when a provider fails");
assert.match(view.rows[2].error, /Provider unavailable/);
assert(view.rows.every(row => !row.loading));

view.now = 1_000_000;
for (const usedPercent of [10, 50, 90]) {
  elements.length = icons.length = 0;
  view.card({ account: { key: "test" } }, { id: "session", label: "Session", usedPercent, minutes: 60, resetsAt: view.now + 30 * 60_000 }, "base", { foreground: "tick" });
  assert.equal(icons.length, 0, "Do not add a pace icon beside the percentage");
  assert(elements.some((el) => el.child?.[0] === `${100 - usedPercent}%`));
  assert(elements.some((el) => el.bg?.[0] === "tick" && el.left?.[0] === "50%"), "Keep the pacing mark on the progress bar");
}
testMachines = [{ name: null, layout: "ready" }, { name: "server", layout: "ready" }, { name: "offline", layout: "unavailable" }, { name: "sandbox", temporary: true }];
const discovered = await sources.namespace.discoverAccounts();
assert.equal(discovered.accounts.length, 2, "Keep distinct remote accounts and deduplicate shared accounts across machines");
assert.equal(discovered.errors.length, 0, "Skip unreachable machines without any error");
assert(!ioCalls.some((c) => c.on === "offline"), "Never run a program on an unreachable machine");
const codex = discovered.accounts.find((a) => a.provider === "chatgpt");
assert.deepEqual(Array.from(codex.sources), ["Codex (local)", "Codex (server)"]);
assert.equal((await codex.load()).email, "remote@example.invalid", "Try the other machine when a shared account's first login fails");
const claude = discovered.accounts.find((a) => a.provider === "claude");
assert.equal((await claude.load()).windows[0].usedPercent, 25);
assert(ioCalls.some((c) => c.path === "/remote/.codex/auth.json" && c.on === "server"));
assert(ioCalls.some((c) => c.command === "python3" && c.on === "server" && c.args.includes("# probe fixture")), "Send the local probe source to the remote machine");
assert(!ioCalls.some((c) => c.on === "sandbox"), "Skip temporary machines");
console.log("Usage: native toggle, header, scoped Ctrl+R, cache bypass, concurrent refreshes, provider errors, pacing and remote accounts pass.");
