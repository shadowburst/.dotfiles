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
const herdr = module({
  appHome() {}, exec() {}, home() {}, readTextFile() {}, writeTextFile() {},
  closeOverlay() {}, layout() {}, props: () => testProps, setShared() {}, shared() {}, theme: () => ({}),
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
const cx = { notify() {}, spawn() {}, timer: { every() {} } };
view.init({}, cx);
view.render();
elements.find((el) => el.id?.[0] === "usage-open").on_click[0]();
assert.equal(calls[0].command, "mod.open", "The sidebar button must use the same native toggle");
assert.equal(calls[0].args.name, "usage");
testProps = { overlay: "usage-dialog" };
view.init({}, cx);
assert.equal(view.rows, null, "An overlay must initialize the usage dialog, not the sidebar row");
elements.length = 0;
view.render();
assert(elements.some((el) => el.id?.[0] === "usage-view"), "The native toggle must render the usage dialog");

view.now = 1_000_000;
for (const usedPercent of [10, 50, 90]) {
  elements.length = icons.length = 0;
  view.card({ account: { key: "test" } }, { id: "session", label: "Session", usedPercent, minutes: 60, resetsAt: view.now + 30 * 60_000 }, "base", { foreground: "tick" });
  assert.equal(icons.length, 0, "Do not add a pace icon beside the percentage");
  assert(elements.some((el) => el.child?.[0] === `${100 - usedPercent}%`));
  assert(elements.some((el) => el.bg?.[0] === "tick" && el.left?.[0] === "50%"), "Keep the pacing mark on the progress bar");
}
console.log("Usage: key and sidebar use the native toggle; dialog, percentages and pacing marks pass.");
