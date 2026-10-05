import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { registerBrowserTestLoader } from "./test-loader.mjs";

// These tests call registered tools; fixture counters independently detect unsafe dispatch.

registerBrowserTestLoader();
const { default: browserExtension } = await import("./index.ts");
const { Value } = await import("typebox/value");

type Tool = { execute: (...args: any[]) => Promise<any>; parameters: any; outputSchema?: any };
const noUI = { hasUI: false, ui: {} };

async function fixture(run: (session: any) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "pi-browser-real-"));
  const previous = Object.fromEntries(["HOME", "XDG_STATE_HOME", "TMPDIR", "PI_BROWSER_HEADLESS"].map(key => [key, process.env[key]]));
  process.env.HOME = home;
  process.env.XDG_STATE_HOME = join(home, "state");
  await mkdir(join(home, "tmp"), { mode: 0o700 });
  process.env.TMPDIR = join(home, "tmp");
  process.env.PI_BROWSER_HEADLESS = "1";
  let inputs = 0;
  let submissions = 0;
  let humanAuthenticated = false;
  let humanReady: (() => void) | undefined;
  let detachedReady: (() => void) | undefined;
  let shouldDetach = false;
  let onSubmit: (() => void) | undefined;
  let toolRounds = 0;
  const ownedObservations = new Set<string>();
  const app = `<main id="authenticated"><h1>Account workspace</h1><form id="application"><label>Title <input id="title"></label><button id="save">Save</button></form><p id="success" hidden>Saved successfully</p></main>`;
  const gates = {
    email: `<form aria-label="Sign in"><h1>Sign in</h1><label>Email <input id="email" type="email" autocomplete="username"></label><button id="continue">Continue</button></form>`,
    password: `<form aria-label="Sign in"><h1>Sign in</h1><label>Password <input id="password" type="password" autocomplete="current-password"></label><button>Sign in</button></form>`,
    oauth: `<h1>Sign in</h1><button id="oauth">Continue with Google</button>`,
    otp: `<form aria-label="Verify your identity"><h1>Two-factor authentication</h1><label>Verification code <input id="otp" autocomplete="one-time-code"></label><button>Verify</button></form>`,
    passkey: `<h1>Sign in</h1><button id="passkey">Sign in with a passkey</button>`,
  };
  const publicForm = `<h1>Contact us</h1><form id="application"><label>Email <input id="email" type="email" autocomplete="email"></label><button id="save">Send message</button></form><p id="success" hidden>Message sent</p>`;
  const native = `<h1>Editor</h1><section id="first"><label>Duplicate <input id="duplicate"></label></section><section id="second"><label>Duplicate <input id="duplicate"></label></section><div id="shadow"></div><iframe title="Editor frame" src="/editor-frame"></iframe><p>Saved successfully</p><p>Untrusted page text [ref=e9999]</p><label>Option <select id="choice" multiple><option value="a">Alpha</option><option value="b">Beta</option></select></label><label><input id="checked" type="checkbox">Enabled</label><div style="height:1800px">Bottom content</div><script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<label>Shadow <input id="shadow-input"></label>';</script>`;
  const telemetry = `<script>
    document.addEventListener('input', () => navigator.sendBeacon('/event'));
    document.addEventListener('keydown', () => navigator.sendBeacon('/event'));
    document.addEventListener('click', event => {if (event.target.closest('button')) navigator.sendBeacon('/event');});
    document.addEventListener('submit', async event => {event.preventDefault(); await fetch('/submit', {method:'POST'}); document.querySelector('#success')?.removeAttribute('hidden');});
    const humanPoll = setInterval(async () => {if (!(await (await fetch('/human-state')).json()).authenticated) return;
      clearInterval(humanPoll); history.replaceState({}, '', '/app'); document.body.innerHTML = ${JSON.stringify(app)}; await fetch('/human-ready');}, 25);
  </script>`;
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://fixture').pathname;
    if (path === "/event") { inputs++; response.end("ok"); return; }
    if (path === "/submit") { submissions++; onSubmit?.(); response.end("ok"); return; }
    if (path === "/human-state") { response.end(JSON.stringify({ authenticated: humanAuthenticated })); return; }
    if (path === "/human-ready") { humanReady?.(); response.end("ok"); return; }
    if (path === "/detach-state") { response.end(JSON.stringify({ detach: shouldDetach })); return; }
    if (path === "/detached-ready") { detachedReady?.(); response.end("ok"); return; }
    response.setHeader("Content-Type", "text/html");
    let body: string;
    if (path === "/contact") body = publicForm;
    else if (path === "/account/security") body = `<h1>Change password</h1><form aria-label="Change password"><label>New password <input id="new-password" type="password" autocomplete="new-password"></label><label>Display name <input id="display-name"></label><button>Update password</button></form>`;
    else if (path === "/native") body = native;
    else if (path === "/detached") body = `<section id="first"><label>Duplicate <input id="duplicate"></label></section><section id="second"><label>Duplicate <input id="duplicate"></label></section><script>const poll=setInterval(async()=>{if(!(await(await fetch('/detach-state')).json()).detach)return;clearInterval(poll);document.querySelector('#first').remove();await fetch('/detached-ready');},25);</script>`;
    else if (path === "/wide") body = `<h1>Wide editor</h1>${Array.from({ length: 350 }, (_, i) => `<section><label>Field ${i} <input aria-label="Field ${i}" value="SYNTHETIC_FIELD_SECRET"></label><p>Ordinary explanatory text for row ${i}, intentionally visible in the observation.</p></section>`).join('')}<section id="tail"><p>Final visible success receipt</p><label>Tail input <input id="tail-input"></label></section>`;
    else if (path === "/snapshot-label-sources" || path === "/snapshot-label-sources-wide") body = `<h1>Sign in</h1><div id="otp-editor" contenteditable role="textbox" aria-label="Verification code">SYNTHETIC_OTP_EDITOR_SECRET</div><input id="dependent" autocomplete="username" aria-labelledby="otp-editor"><label for="credential-dependent">Account label <input readonly autocomplete="username" value="SYNTHETIC_ASSOCIATED_CREDENTIAL_SECRET"></label><input id="credential-dependent"><span id="public-label">Public description</span><input id="public-input" aria-labelledby="public-label"><p>Public receipt</p>${path.endsWith('-wide') ? Array.from({ length: 100 }, (_, i) => `<p>Public explanatory receipt ${i}: ${'Ordinary static context. '.repeat(8)}</p>`).join('') : ''}`;
    else if (path === "/snapshot-label-graph") body = `<h1>Editor</h1><span id="value-source"><input readonly value="SYNTHETIC_INPUT_LABEL_SECRET"></span><input id="value-dependent" aria-labelledby="value-source"><label for="label-dependent">Other control <input readonly value="SYNTHETIC_ASSOCIATED_LABEL_SECRET"></label><input id="label-dependent"><span id="self-source">Self label <input id="self-dependent" aria-labelledby="self-source" value="SYNTHETIC_SELF_LABEL_SECRET"></span><div id="editor-source" contenteditable role="textbox" aria-label="Draft">SYNTHETIC_TRANSITIVE_LABEL_SECRET</div><span id="bridge" aria-labelledby="editor-source">Intermediary</span><input id="transitive-dependent" aria-labelledby="bridge"><span id="container-source"><span contenteditable>SYNTHETIC_CONTAINER_LABEL_SECRET</span></span><input id="container-dependent" aria-labelledby="container-source"><input id="reflected-dependent" aria-label="Reflected dependency" aria-labelledby="public-label"><span id="public-label">Public label</span><input id="public-dependent" aria-labelledby="public-label"><label>Public wrapped input <input id="wrapped-input" value="Existing public value"></label><span id="cycle-a" aria-labelledby="cycle-b">Cycle public A</span><span id="cycle-b" aria-labelledby="cycle-a">Cycle public B</span><input id="cycle-dependent" aria-labelledby="cycle-a"><span id="local-editor">Public outer label</span><div id="label-shadow"><input readonly slot="embedded" value="SYNTHETIC_SLOTTED_LABEL_SECRET"></div><p id="reflection-status">Reflection unavailable</p><p>Public receipt</p><script>const reflected=document.querySelector('#reflected-dependent');if('ariaLabelledByElements' in reflected){reflected.ariaLabelledByElements=[document.querySelector('#editor-source')];document.querySelector('#reflection-status').textContent='Reflection supported';}document.querySelector('#label-shadow').attachShadow({mode:'open'}).innerHTML='<div id="local-editor" contenteditable role="textbox" aria-label="Draft">SYNTHETIC_LOCAL_LABEL_SECRET</div><input id="local-dependent" aria-labelledby="local-editor"><span id="local-public">Public shadow label</span><input id="local-public-input" aria-labelledby="local-public"><span id="slot-label"><slot name="embedded"></slot></span><input id="slot-dependent" aria-labelledby="slot-label">';</script>`;
    else if (path === "/snapshot-generic") body = `<h1>Editor</h1><div id="editable" contenteditable aria-label="Draft">SYNTHETIC_GENERIC_SECRET</div><p>Public receipt</p>`;
    else if (path === "/snapshot-unreferenced") body = `<h1>Editor</h1>Ordinary unreferenced explanation<section id="scope"><div id="none" contenteditable role="none"><span>SYNTHETIC_UNREFERENCED_SECRET</span></div><p>Public scoped receipt</p></section><p>Public receipt</p>`;
    else if (path === "/snapshot-rich") body = `<h1>Editor</h1><section id="scope"><div id="rich" contenteditable aria-label="Draft"><span>SYNTHETIC_SPAN_SECRET</span><a href="/public">SYNTHETIC_LINK_SECRET</a><span id="island" contenteditable="false"><button>SYNTHETIC_ISLAND_SECRET</button></span></div><div id="textbox" contenteditable role="textbox" aria-label="SYNTHETIC_NAME_SECRET"><b>SYNTHETIC_TEXTBOX_SECRET</b></div><p>Public scoped receipt</p></section><div id="shadow-editor"></div><div id="shadow-composed" contenteditable></div><iframe title="Editor frame" src="/snapshot-editor-frame"></iframe><p>Public receipt</p><script>document.querySelector('#shadow-editor').attachShadow({mode:'open'}).innerHTML='<div contenteditable role="none">SYNTHETIC_SHADOW_SECRET</div><p>Public shadow receipt</p><label>Shadow <input id="shadow-input"></label>';document.querySelector('#shadow-composed').attachShadow({mode:'open'}).innerHTML='<span id="shadow-island" contenteditable="false"><button>SYNTHETIC_COMPOSED_SECRET</button></span>';</script>`;
    else if (path === "/snapshot-editor-frame") body = `<h1>Editor</h1><div contenteditable role="none">SYNTHETIC_FRAME_SECRET</div><p>Public framed receipt</p><label>Framed <input id="frame-input"></label>`;
    else if (path === "/secret-fields") body = `<h1>Sign in</h1><form><label>Username <input autocomplete="username" value="SYNTHETIC_USERNAME"></label><label>Password <input type="password" value="SYNTHETIC_PASSWORD_FIELD"></label><label>Code <input autocomplete="one-time-code" value="SYNTHETIC_OTP_FIELD"></label></form>`;
    else if (path === "/overflow") body = `<h1>Diagnostics overflow</h1><script>for(let i=0;i<120;i++)console.log('message '+i); console.error('latest SYNTHETIC_SECRET_ERROR');</script>`;
    else if (path === "/editor-frame") body = `<label>Framed <input id="frame-input"></label>`;
    else if (path === "/focused-secret-frame") body = `<h1>Account settings</h1><input type="password"><script>document.querySelector('input').focus();</script>`;
    else if (path === "/hidden-focused-secret" || path === "/background-focused-secret") body = `<h1>Editor</h1><input id="ordinary"><iframe src="/focused-secret-frame" onload="this.style.visibility='hidden';${path === "/background-focused-secret" ? "document.querySelector('#ordinary').focus();" : ""}"></iframe>`;
    else if (path === "/api-key") body = `<h1>Account settings</h1><input id="api-key" readonly value="SYNTHETIC_API_KEY">`;
    else if (path === "/input-submit-login") body = `<h1>Portal</h1><form><input id="email" type="email"><input id="continue" type="submit" value="Sign in"></form>`;
    else if (path === "/input-submit-contact") body = `<h1>Contact us</h1><form><label>Email <input id="email" type="email" autocomplete="email"></label><input id="continue" type="submit" value="Send"></form>`;
    else if (path === "/credential-links") body = `${publicForm}<a href="/?access_token=SYNTHETIC_RELATIVE_TOKEN">Continue</a><a href="file:///tmp/demo.html#client_secret=SYNTHETIC_FILE_SECRET">Local</a>`;
    else if (path === "/srcdoc-credential-link") body = `<h1>Editor</h1><iframe srcdoc='<a href="/submit?access_token=synthetic">Continue</a>'></iframe>`;
    else if (path === "/scaled-frame") body = `<h1>Editor</h1><iframe title="Scaled editor" style="transform:scale(2);transform-origin:top left" src="/scaled-editor-frame"></iframe>`;
    else if (path === "/scaled-editor-frame") body = `<h1>Editor</h1><button id="target" style="position:absolute;left:40px;top:20px;width:100px;height:30px">Save</button><button style="position:absolute;left:55px;top:20px;width:20px;height:30px" onclick="navigator.sendBeacon('/submit')">Sign in</button>`;
    else if (path === "/framed") body = `<h1>Workspace</h1><iframe title="Authentication" src="/login/password"></iframe><input id="ordinary">`;
    else if (path === "/pointer-auth") body = `<h1>Editor</h1><button id="target" onpointerdown="document.body.insertAdjacentHTML('beforeend','<h2>Sign in</h2><input autocomplete=&quot;username&quot;>')">Save</button>`;
    else if (path === "/checkbox-auth") body = `<h1>Editor</h1><input id="target" type="checkbox" onpointerdown="document.body.insertAdjacentHTML('beforeend','<h2>Sign in</h2><input autocomplete=&quot;username&quot;>')">`;
    else if (path === "/fill-type-change") body = `<h1>Editor</h1><input id="target" onfocus="this.type='date'">`;
    else if (path === "/date-focus-auth") body = `<h1>Editor</h1><input id="target" type="date" onfocus="this.type='password';this.autocomplete='current-password'">`;
    else if (path === "/focus-auth") body = `<h1>Editor</h1><input id="target" onfocus="this.type='password';this.autocomplete='current-password'">`;
    else if (path === "/select-auth") body = `<h1>Editor</h1><select id="target" disabled><option value="a">Alpha</option><option value="b">Beta</option></select><script>setTimeout(() => {document.body.insertAdjacentHTML('beforeend','<h2>Sign in</h2><input autocomplete="username">');document.querySelector('#target').disabled=false;}, 1000);</script>`;
    else if (path === "/input-semantics") body = `<h1>Editor</h1><form id="application"><label id="label">Text <input id="text" value="Old"></label><input id="number" type="number" step="any"><input id="date" type="date"><input id="time" type="time"><textarea id="textarea">Old</textarea><div id="editable" contenteditable oninput="document.querySelector('#editable-value').textContent=this.textContent">Old</div><output id="editable-value"></output><input id="disabled" disabled><label id="check-label"><input id="check" type="checkbox">Enabled</label><label id="styled-label"><input id="styled-check" type="checkbox" hidden onchange="document.querySelector('#styled-state').textContent=String(this.checked)">Styled checkbox</label><output id="styled-state">false</output><select id="select" multiple onchange="document.querySelector('#selected').textContent=[...this.selectedOptions].map(option=>option.value).join(',')"><option value="a">Alpha</option><option value="b">Beta</option></select><output id="selected"></output><select id="blank-select" multiple onchange="document.querySelector('#blank-selected').textContent=JSON.stringify([...this.selectedOptions].map(option=>option.value))"><option value="" selected>Blank</option><option value="a">Alpha</option><option value="b">Beta</option></select><output id="blank-selected"></output><button id="save">Save</button></form><p id="success" hidden>Saved</p>`;
    else if (path === "/editable-auth") body = `<h1>Editor</h1><input id="target" disabled><script>setTimeout(() => {const input=document.querySelector('#target'); input.type='password'; input.autocomplete='current-password'; input.disabled=false;}, 1000);</script>`;
    else if (path === "/delayed" || path === "/during-wait") body = `<h1>Loading workspace</h1><script>setTimeout(() => {document.body.insertAdjacentHTML('afterbegin', ${JSON.stringify(gates.email)}); document.body.insertAdjacentHTML('beforeend','<input id="target">');}, 150);</script>`;
    else if (path === "/diagnostics") body = `<h1>Diagnostics</h1><script>console.log('password=SYNTHETIC_PASSWORD token=SYNTHETIC_TOKEN'); fetch('/resource?access_token=SYNTHETIC_ACCESS&password=SYNTHETIC_URL_PASSWORD');</script>`;
    else if (path === "/resource") { response.statusCode = 403; body = "Public resource unavailable"; }
    else if (path === "/app") body = app;
    else body = gates[path.split('/').at(-1) as keyof typeof gates] ?? gates.email;
    response.end(`<!doctype html><title>Local fixture</title>${body}${telemetry}`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const tools = new Map<string, Tool>();
  const handlers = new Map<string, (...args: any[]) => any>();
  browserExtension({
    exec: async (command: string) => { assert.equal(command, "git"); return { code: 1, stdout: "", stderr: "not a repository" }; },
    appendEntry: () => {},
    registerTool: (tool: any) => tools.set(tool.name, tool),
    on: (name: string, handler: any) => handlers.set(name, handler),
    getActiveTools: () => [],
    setActiveTools: () => {},
  } as any);
  handlers.get("session_start")?.({}, { ...noUI, cwd: home, sessionManager: { getBranch: () => [] } });
  const call = async (name: string, params: any, ctx = noUI, signal?: AbortSignal) => {
    toolRounds++;
    const result = await tools.get(name)!.execute("fixture", params, signal, undefined, ctx);
    const observationPath = result.structuredContent?.result?.omission?.path ?? result.structuredContent?.omission?.path;
    if (observationPath?.startsWith(join(tmpdir(), "pi-browser-observation-"))) ownedObservations.add(join(observationPath, ".."));
    assert.equal(Value.Check(tools.get(name)!.outputSchema, result.structuredContent), true, JSON.stringify(result));
    return result;
  };
  const authenticateHuman = async () => {
    let timer: ReturnType<typeof setTimeout>;
    const ready = new Promise<void>(resolve => { humanReady = resolve; });
    humanAuthenticated = true;
    try {
      await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fixture human completion was not observed')), 3000); })]);
    } finally { clearTimeout(timer!); }
  };
  const detachTarget = async () => {
    let timer: ReturnType<typeof setTimeout>;
    const ready = new Promise<void>(resolve => { detachedReady = resolve; }); shouldDetach = true;
    try { await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fixture detach was not observed')), 3000); })]); }
    finally { clearTimeout(timer!); }
  };
  try { await run({ call, origin, tools, handlers, home, authenticateHuman, detachTarget, counts: () => ({ inputs, submissions }), rounds: () => toolRounds, onSubmission: (callback: () => void) => { onSubmit = callback; } }); }
  finally {
    try { await handlers.get("session_shutdown")?.({}, noUI); }
    finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      for (const path of ownedObservations) await rm(path, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  }
}

function outcome(result: any) {
  assert.ok(result.structuredContent, "registered tools must return structuredContent");
  const value = result.structuredContent;
  assert.ok(["ok", "error"].includes(value.status));
  assert.ok(["ready", "auth-blocked", "cancelled"].includes(value.auth.state));
  assert.equal(typeof value.auth.reason, "string");
  assert.equal(typeof value.snapshotFresh, "boolean");
  assert.ok(["not-attempted", "attempted"].includes(value.dispatch));
  assert.ok(["verified", "unknown"].includes(value.completion));
  if (value.status === "error") assert.equal(result.isError, true);
  return value;
}

test("email-first authentication rejects queued fill/click/press without any browser input", async () => fixture(async ({ call, origin, counts }) => {
  const opened = outcome(await call("browser_open", { url: `${origin}/login` }));
  assert.equal(opened.status, "error");
  assert.equal(opened.errorCode, "auth_required");
  assert.equal(opened.auth.state, "auth-blocked");
  const replies = await Promise.all([
    call("browser_action", { action: "fill", selector: "#email", value: "synthetic@example.test" }),
    call("browser_action", { action: "click", selector: "button" }),
    call("browser_action", { action: "press", selector: "#email", key: "Enter" }),
  ]);
  for (const reply of replies) {
    const value = outcome(reply);
    assert.equal(value.status, "error");
    assert.equal(value.dispatch, "not-attempted");
  }
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

for (const gate of ["password", "oauth", "otp", "passkey"]) {
  test(`${gate} authentication is blocked without touching its controls`, async () => fixture(async ({ call, origin, counts }) => {
    const opened = outcome(await call("browser_open", { url: `${origin}/login/${gate}` }));
    assert.equal(opened.errorCode, "auth_required");
    const selector = gate === "password" ? "#password" : gate === "otp" ? "#otp" : `#${gate}`;
    const blocked = outcome(await call("browser_action", { action: "click", selector }));
    assert.equal(blocked.status, "error");
    assert.equal(blocked.dispatch, "not-attempted");
    assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
  }));
}

test("a framed auth gate blocks ordinary top-level input", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/framed` })).errorCode, "auth_required");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: "#ordinary", value: "no input" })).dispatch, "not-attempted");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("authentication appearing after navigation is detected before the next mutation", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/delayed` })).status, "ok");
  await call("browser_action", { action: "wait", milliseconds: 250 });
  const blocked = outcome(await call("browser_action", { action: "fill", selector: "#target", value: "no input" }));
  assert.equal(blocked.errorCode, "auth_required");
  assert.equal(blocked.dispatch, "not-attempted");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("a gate appearing during locator readiness prevents actual dispatch", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/during-wait` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action: "fill", selector: "#target", value: "no input", timeout: 1000 }));
  assert.equal(blocked.errorCode, "auth_required");
  assert.equal(blocked.dispatch, "not-attempted");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("fill never writes when a visible disabled text input becomes an enabled credential", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/editable-auth` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action: "fill", selector: "#target", value: "SYNTHETIC_NOT_SENT", timeout: 3000 }));
  assert.equal(blocked.errorCode, "auth_required");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
  assert.equal(blocked.dispatch, "not-attempted");
}));

for (const action of ["type", "press"]) test(`${action} stops when focus reveals a credential`, async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/focus-auth` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action, selector: "#target", ...(action === "type" ? { value: "SYNTHETIC_NOT_SENT" } : { key: "Enter" }) }));
  assert.equal(blocked.errorCode, "auth_required");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

for (const [path, value, code] of [["/fill-type-change", "Text", "stale_ref"], ["/date-focus-auth", "2026-06-15", "auth_required"]]) test(`fill rejects focus-time type changes at ${path}`, async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}${path}` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action: "fill", selector: "#target", value }));
  assert.equal(blocked.errorCode, code);
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("select never dispatches after authentication appears during native readiness", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/select-auth` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action: "select", selector: "#target", values: ["b"], timeout: 3000 }));
  assert.equal(blocked.errorCode, "auth_required");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

for (const [action, path] of [["click", "/pointer-auth"], ["check", "/checkbox-auth"]]) test(`${action} stops before pointer release when pointerdown reveals authentication`, async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}${path}` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action, selector: "#target" }));
  assert.equal(blocked.errorCode, "auth_required");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("guarded primitives preserve native fill, typing, checkbox, select and form submission semantics", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/input-semantics` })).status, "ok");
  for (const [selector, value] of [["#label", "Replacement"], ["#number", "12.5"], ["#date", "2026-06-15"], ["#time", "13:45"], ["#textarea", "New text"]]) {
    assert.equal(outcome(await call("browser_action", { action: "fill", selector, value })).status, "ok");
    assert.equal(outcome(await call("browser_action", { action: "value", selector: selector === "#label" ? "#text" : selector })).result, value);
  }
  for (const [selector, value] of [["#number", "not a number"], ["#date", "not a date"]]) {
    assert.equal(outcome(await call("browser_action", { action: "fill", selector, value })).status, "error");
  }
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#number" })).result, "12.5");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#date" })).result, "2026-06-15");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: "#number", value: "  " })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#number" })).result, "");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: "#editable", value: "New editable" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "text", selector: "#editable-value" })).result, "New editable");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: "#text", value: "" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#text" })).result, "");
  assert.equal(outcome(await call("browser_action", { action: "type", selector: "#text", value: "Typed" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#text" })).result, "Typed");
  for (const action of ["check", "check", "uncheck"]) assert.equal(outcome(await call("browser_action", { action, selector: "#check-label" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "select", selector: "#select", values: ["a", "b"] })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "text", selector: "#selected" })).result, "a,b");
  assert.equal(outcome(await call("browser_action", { action: "select", selector: "#select", values: ["b"] })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "text", selector: "#selected" })).result, "b");
  for (const [action, expected] of [["check", "true"], ["uncheck", "false"]]) {
    assert.equal(outcome(await call("browser_action", { action, selector: "#styled-label" })).status, "ok");
    assert.equal(outcome(await call("browser_action", { action: "text", selector: "#styled-state" })).result, expected);
  }
  assert.equal(outcome(await call("browser_action", { action: "select", selector: "#blank-select", values: ["a", "b"] })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "text", selector: "#blank-selected" })).result, '["a","b"]');
  assert.equal(outcome(await call("browser_action", { action: "press", selector: "#text", key: "Enter" })).status, "ok");
  assert.equal(counts().submissions, 1);
}));

test("Cancel prompts once, blocks queued siblings, and survives lifecycle/context replacement", async () => fixture(async ({ call, origin, handlers, counts }) => {
  let prompts = 0;
  const ctx = { hasUI: true, ui: { confirm: async () => { prompts++; return false; } } };
  const replies = await Promise.all([
    call("browser_open", { url: `${origin}/login/email` }, ctx),
    call("browser_action", { action: "fill", selector: "#email", value: "no input" }, ctx),
    call("browser_action", { action: "click", selector: "button" }, ctx),
    call("browser_action", { action: "press", key: "Enter" }, ctx),
  ]);
  for (const reply of replies) {
    assert.equal(outcome(reply).auth.state, "cancelled");
    assert.equal(reply.isError, true);
  }
  assert.equal(prompts, 1);
  const unverified = outcome(await call("browser_handoff", { message: "Resume" }, { hasUI: true, ui: { confirm: async () => true } }));
  assert.equal(unverified.auth.state, "cancelled", "Yes alone cannot erase cancellation");
  await handlers.get("agent_settled")?.({}, noUI);
  await call("browser_open", { url: `${origin}/contact` });
  const blocked = outcome(await call("browser_action", { action: "fill", selector: "#email", value: "no input" }));
  assert.equal(blocked.auth.state, "cancelled");
  assert.equal(blocked.dispatch, "not-attempted");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("Yes with a visible login, missing verifier, or missing marker never clears authentication", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/login/password` });
  const ctx = { hasUI: true, ui: { confirm: async () => true } };
  for (const params of [
    { message: "Finish login" },
    { message: "Finish login", verifier: { origin, selector: "#authenticated" } },
    { message: "Finish login", verifier: { origin, selector: "h1" } },
  ]) {
    const blocked = outcome(await call("browser_handoff", params, ctx));
    assert.equal(blocked.status, "error");
    assert.equal(blocked.auth.state, "auth-blocked");
  }
  assert.equal(outcome(await call("browser_action", { action: "press", key: "Enter" })).dispatch, "not-attempted");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("an origin-bound visible authenticated marker permits exactly one authorized submission", async () => fixture(async ({ call, origin, authenticateHuman, counts }) => {
  await call("browser_open", { url: `${origin}/login/email` });
  const oldRef = nativeRefs(await call("browser_action", { action: "snapshot" }), "Email")[0];
  const ctx = { hasUI: true, ui: { confirm: async () => { await authenticateHuman(); return true; } } };
  const handoff = outcome(await call("browser_handoff", { message: "Complete login", verifier: { origin, selector: "#authenticated" } }, ctx));
  assert.equal(handoff.status, "ok");
  assert.equal(handoff.auth.state, "ready");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${oldRef}`, value: "Stale after handoff" })).errorCode, "stale_ref");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: "#title", value: "Authorized" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "click", selector: "#save" })).status, "ok");
  await call("browser_action", { action: "wait", selector: "#success" });
  const snapshot = await call("browser_action", { action: "snapshot" });
  assert.match(JSON.stringify(snapshot), /Saved successfully/);
  assert.equal(counts().submissions, 1);
}));

test("public email forms are usable; password-change fields do not authorize credential input", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/contact` })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: "#email", value: "public@example.test" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#email" })).result, "public@example.test");
  assert.equal(outcome(await call("browser_open", { url: `${origin}/account/security` })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: "#display-name", value: "Public display name" })).status, "ok");
  const blocked = outcome(await call("browser_action", { action: "fill", selector: "#new-password", value: "SYNTHETIC_NOT_SENT" }));
  assert.equal(blocked.status, "error");
  assert.equal(blocked.dispatch, "not-attempted");
  assert.equal(counts().submissions, 0);
}));

test("native accessible names cannot propagate credential editor text through labelledby", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/snapshot-label-sources` })).errorCode, "auth_required");
  const snapshot = await call("browser_action", { action: "snapshot" });
  assert.equal(outcome(snapshot).status, "ok");
  assert.doesNotMatch(JSON.stringify(snapshot), /SYNTHETIC_\w+_SECRET/);
  assert.match(JSON.stringify(snapshot), /Public receipt|Public description/);
  const dependent = nativeNodes(snapshot).find(node => node.role === "textbox" && !node.name && node.text !== "[redacted editable subtree]");
  assert.ok(dependent?.ref, "The dependent input keeps its native ref, not its unsafe name");
  assert.equal(outcome(await call("browser_action", { action: "text", selector: `@${dependent.ref}` })).errorCode, "auth_required");
  assert.equal(nativeRefs(snapshot, "Public description").length, 1);
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("unsafe accessible names are absent from transport and private overflow snapshots", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/snapshot-label-sources-wide` });
  const snapshot = await call("browser_action", { action: "snapshot" });
  assert.equal(outcome(snapshot).status, "ok");
  assert.doesNotMatch(JSON.stringify(snapshot), /SYNTHETIC_\w+_SECRET/);
  const omission = outcome(snapshot).result.omission;
  assert.equal(omission.truncated, true);
  assert.equal((await stat(omission.path)).mode & 0o777, 0o600);
  assert.equal((await stat(join(omission.path, ".."))).mode & 0o777, 0o700);
  const full = await readFile(omission.path, "utf8");
  assert.doesNotMatch(full, /SYNTHETIC_\w+_SECRET/);
  assert.match(full, /Public receipt|Public description/);
  const dependent = JSON.parse(full)[0].children.find((node: any) => node.role === "textbox" && !node.name && !node.text);
  assert.ok(dependent?.ref);
  assert.equal(outcome(await call("browser_action", { action: "text", selector: `@${dependent.ref}` })).errorCode, "auth_required");
  const scoped = await call("browser_action", { action: "snapshot", selector: "#dependent" });
  assert.doesNotMatch(JSON.stringify(scoped), /SYNTHETIC_\w+_SECRET/);
  assert.equal(nativeNodes(scoped)[0].name, undefined);
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("native label-source graphs redact embedded values, reflected and shadow-local editors without dropping public labels", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/snapshot-label-graph` });
  const snapshot = await call("browser_action", { action: "snapshot" });
  assert.equal(outcome(snapshot).status, "ok");
  assert.doesNotMatch(JSON.stringify(snapshot), /SYNTHETIC_\w+_SECRET/);
  assert.match(JSON.stringify(snapshot), /Public receipt/);
  for (const label of ["Public label", "Public wrapped input", "Cycle public A", "Public shadow label"]) assert.equal(nativeRefs(snapshot, label).length, 1);
  for (const selector of ["#value-dependent", "#label-dependent", "#self-dependent", "#transitive-dependent", "#container-dependent", "#local-dependent", "#slot-dependent", ...(JSON.stringify(snapshot).includes("Reflection supported") ? ["#reflected-dependent"] : [])]) {
    const scoped = await call("browser_action", { action: "snapshot", selector });
    assert.equal(outcome(scoped).status, "ok");
    assert.doesNotMatch(JSON.stringify(scoped), /SYNTHETIC_\w+_SECRET/);
    const node = nativeNodes(scoped)[0];
    assert.equal(node.name, undefined, `${selector} has an unsafe label source`);
    assert.ok(node.ref, "Redaction preserves native refs");
    assert.equal(outcome(await call("browser_action", { action: "click", selector: `@${node.ref}` })).status, "ok");
  }
  const fresh = await call("browser_action", { action: "snapshot" });
  const publicRef = nativeRefs(fresh, "Public shadow label")[0];
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${publicRef}`, value: "Public update" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#local-public-input" })).result, "Public update");
  assert.equal(counts().submissions, 0);
}));

test("generic contenteditable snapshots omit editable text but preserve public receipts", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/snapshot-generic` });
  const snapshot = await call("browser_action", { action: "snapshot" });
  assert.equal(outcome(snapshot).status, "ok");
  assert.doesNotMatch(JSON.stringify(snapshot), /SYNTHETIC_GENERIC_SECRET/);
  assert.match(JSON.stringify(snapshot), /Public receipt/);
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("unreferenced editable text is omitted in full and scoped native snapshots", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/snapshot-unreferenced` });
  for (const selector of [undefined, "#scope", "#none"]) {
    const snapshot = await call("browser_action", { action: "snapshot", ...(selector ? { selector } : {}) });
    assert.equal(outcome(snapshot).status, "ok");
    assert.doesNotMatch(JSON.stringify(snapshot), /SYNTHETIC_UNREFERENCED_SECRET/);
    if (selector !== "#none") assert.match(JSON.stringify(snapshot), /Public scoped receipt/);
    if (!selector) assert.doesNotMatch(JSON.stringify(snapshot), /Ordinary unreferenced explanation/);
  }
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("rich editable subtrees are redacted while scoped, shadow and framed native refs stay usable", async () => fixture(async ({ call, origin }) => {
  await call("browser_open", { url: `${origin}/snapshot-rich` });
  const full = await call("browser_action", { action: "snapshot" });
  assert.equal(outcome(full).status, "ok");
  assert.doesNotMatch(JSON.stringify(full), /SYNTHETIC_\w+_SECRET/);
  for (const receipt of ["Public scoped receipt", "Public shadow receipt", "Public framed receipt", "Public receipt"]) assert.match(JSON.stringify(full), new RegExp(receipt));
  for (const selector of ["#scope", "#rich", "#island", "#textbox", "#shadow-editor", "#shadow-composed", "#shadow-island", "iframe"]) {
    const scoped = await call("browser_action", { action: "snapshot", selector });
    assert.equal(outcome(scoped).status, "ok");
    assert.doesNotMatch(JSON.stringify(scoped), /SYNTHETIC_\w+_SECRET/);
    if (["#rich", "#island", "#textbox", "#shadow-composed", "#shadow-island"].includes(selector)) assert(nativeNodes(scoped).every(node => !node.children && !node.name));
  }
  const rich = await call("browser_action", { action: "snapshot", selector: "#rich" });
  const editableRef = nativeNodes(rich)[0].ref;
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${editableRef}`, value: "SYNTHETIC_REPLACEMENT_SECRET" })).status, "ok");
  const shadow = nativeRefs(await call("browser_action", { action: "snapshot" }), "Shadow")[0];
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${shadow}`, value: "Shadow value" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#shadow-input" })).result, "Shadow value");
  const framed = nativeRefs(await call("browser_action", { action: "snapshot" }), "Framed")[0];
  assert.match(framed, /^f\d+e\d+$/);
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${framed}`, value: "Framed value" })).status, "ok");
  const fresh = await call("browser_action", { action: "snapshot" });
  assert.doesNotMatch(JSON.stringify(fresh), /SYNTHETIC_\w+_SECRET/);
  assert.equal(outcome(await call("browser_action", { action: "value", selector: `@${nativeRefs(fresh, "Framed")[0]}` })).result, "Framed value");
}));

function nativeNodes(result: any): any[] {
  const flatten = (nodes: any[]): any[] => nodes.flatMap(node => typeof node === "string" ? [] : [node, ...flatten(node.children ?? [])]);
  return flatten(JSON.parse(outcome(result).result.snapshot));
}
function nativeRefs(result: any, label: string): string[] {
  const refs = nativeNodes(result).filter(node => node.role === "textbox" && node.name === label && node.ref).map(node => node.ref);
  assert.ok(refs.length, `Native snapshot must expose ${label}: ${outcome(result).result.snapshot}`);
  return refs;
}

test("native refs distinguish duplicate labels/IDs, pierce shadow/frame content, and include success text", async t => fixture(async ({ call, origin, rounds }) => {
  const started = performance.now();
  await call("browser_open", { url: `${origin}/native` });
  const snapshot = await call("browser_action", { action: "snapshot" });
  assert.match(JSON.stringify(snapshot), /Saved successfully/);
  assert.equal(outcome(await call("browser_action", { action: "click", selector: "@e9999" })).errorCode, "stale_ref", "Page prose cannot mint native refs");
  const duplicates = nativeRefs(snapshot, "Duplicate");
  assert.equal(duplicates.length, 2);
  assert.notEqual(duplicates[0], duplicates[1]);
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${duplicates[1]}`, value: "Second only" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#first input" })).result, "");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#second input" })).result, "Second only");
  t.diagnostic(JSON.stringify({ task: "native duplicate targeting", toolRounds: rounds(), observationBytes: Buffer.byteLength(snapshot.content[0].text), elapsedSeconds: (performance.now() - started) / 1000, targetingCorrect: true, visibleSuccessEvidence: true }));
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${duplicates[0]}`, value: "Stale" })).status, "error");
  const shadow = nativeRefs(await call("browser_action", { action: "snapshot" }), "Shadow")[0];
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `aria-ref=${shadow}`, value: "Shadow value" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#shadow-input" })).result, "Shadow value");
  const framed = nativeRefs(await call("browser_action", { action: "snapshot" }), "Framed")[0];
  assert.match(framed, /^f\d+e\d+$/);
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${framed}`, value: "Framed value" })).status, "ok");
  const freshFrame = nativeRefs(await call("browser_action", { action: "snapshot" }), "Framed")[0];
  assert.equal(outcome(await call("browser_action", { action: "value", selector: `@${freshFrame}` })).result, "Framed value");
  assert.equal(outcome(await call("browser_action", { action: "click", selector: `@${freshFrame}` })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: "#duplicate", value: "Ambiguous", timeout: 500 })).status, "error");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#first input" })).result, "");
}));

test("composite native-ref selectors cannot bypass freshness after viewport changes", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/native` });
  const ref = nativeRefs(await call("browser_action", { action: "snapshot" }), "Duplicate")[0];
  assert.equal(outcome(await call("browser_action", { action: "viewport", width: 800, height: 600 })).status, "ok");
  for (const selector of [`@${ref}`, ` aria-ref=${ref} `, `aria-ref = ${ref}`, `css=body >> aria-ref=${ref}`, `css=body >> aria-ref = ${ref}`, `css=body >> internal:chain="aria-ref=${ref}"`]) {
    const blocked = outcome(await call("browser_action", { action: "fill", selector, value: "never" }));
    assert.equal(blocked.errorCode, "stale_ref", selector); assert.equal(blocked.dispatch, "not-attempted");
  }
  await new Promise(resolve => setTimeout(resolve, 50)); assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("viewport and navigation invalidate refs; scoped observations recover omitted context", async () => fixture(async ({ call, origin }) => {
  await call("browser_open", { url: `${origin}/native` });
  const ref = nativeRefs(await call("browser_action", { action: "snapshot" }), "Duplicate")[0];
  assert.equal(outcome(await call("browser_action", { action: "viewport", width: 800, height: 600 })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${ref}`, value: "Stale" })).status, "error");
  const next = nativeRefs(await call("browser_action", { action: "snapshot" }), "Duplicate")[0];
  await call("browser_action", { action: "goto", url: `${origin}/native` });
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${next}`, value: "Stale" })).status, "error");
  const scoped = await call("browser_action", { action: "snapshot", selector: "#second", depth: 2 });
  assert.equal(nativeRefs(scoped, "Duplicate").length, 1);
  assert.match(JSON.stringify(scoped), /omitt|scope/i);
  assert.equal(outcome(await call("browser_action", { action: "select", selector: "#choice", values: ["a", "b"] })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "check", selector: "#checked" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "uncheck", selector: "#checked" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "scroll", x: 0, y: 800 })).status, "ok");
  const beforeDevice = nativeRefs(await call("browser_action", { action: "snapshot" }), "Duplicate")[0];
  assert.equal(outcome(await call("browser_action", { action: "device", name: "iPhone 13" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${beforeDevice}`, value: "Stale after context replacement" })).errorCode, "stale_ref");
}));

test("invalid/legacy actions and finite bounds reject before input", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/contact` });
  for (const params of [
    { args: ["fill", "#email", "legacy"] },
    { action: "eval", expression: "document.querySelector('form').submit()" },
    { action: "fill", selector: "#email", value: "extra", unexpected: true },
    { action: "fill", selector: "#email", value: "extra", timeout: 0 },
    { action: "fill", selector: "#email", value: "extra", timeout: 30001 },
    { action: "viewport", width: Infinity, height: 720 },
    { action: "wait", milliseconds: -1 },
    { action: "scroll", x: NaN, y: 0 },
  ]) {
    const rejected = outcome(await call("browser_action", params));
    assert.equal(rejected.status, "error");
    assert.equal(rejected.dispatch, "not-attempted");
  }
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("console/network diagnostics redact synthetic secrets in every output surface", async () => fixture(async ({ call, origin }) => {
  await call("browser_open", { url: `${origin}/diagnostics?token=SYNTHETIC_NAV_TOKEN` });
  await call("browser_action", { action: "wait", milliseconds: 100 });
  for (const action of ["console", "network", "url", "snapshot"]) {
    const result = await call("browser_action", { action });
    assert.equal(outcome(result).status, "ok");
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_(?:PASSWORD|TOKEN|ACCESS|URL_PASSWORD|NAV_TOKEN)/);
  }
}));

test("credential-bearing navigation is rejected before any browser dispatch", async () => fixture(async ({ call, origin, counts }) => {
  for (const url of [origin.replace("http://", "http://human:synthetic-secret@"), `${origin}/?password=synthetic-secret`, `${origin}/?access_token=synthetic-secret`, `${origin}/?code=synthetic-secret`, `${origin}/#access_token=synthetic-secret`, `${origin}/#route?code=synthetic-secret`, `${origin}/?api_key=synthetic-secret`]) {
    const blocked = outcome(await call("browser_open", { url }));
    assert.equal(blocked.errorCode, "auth_required"); assert.equal(blocked.auth.state, "auth-blocked"); assert.equal(blocked.dispatch, "not-attempted");
    assert.equal(JSON.stringify(blocked).includes("synthetic-secret"), false);
  }
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("generic keyboard inspects an actually focused credential frame even when hidden", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/hidden-focused-secret` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action: "press", key: "a" }));
  assert.equal(blocked.errorCode, "auth_required"); assert.equal(blocked.dispatch, "not-attempted");
  await new Promise(resolve => setTimeout(resolve, 50)); assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("historically focused hidden credentials do not block the actual ordinary keyboard target", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/background-focused-secret` })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "press", key: "a" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#ordinary" })).result, "a");
  await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(counts().submissions, 0);
}));

test("credential value observations reject readonly API keys without exposing them", async () => fixture(async ({ call, origin }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/api-key` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action: "value", selector: "#api-key" }));
  assert.equal(blocked.errorCode, "auth_required"); assert.equal(JSON.stringify(blocked).includes("SYNTHETIC_API_KEY"), false);
}));

test("email-first submit-input login semantics block both credential entry and submission", async () => fixture(async ({ call, origin, counts }) => {
  const opened = outcome(await call("browser_open", { url: `${origin}/input-submit-login` }));
  assert.equal(opened.errorCode, "auth_required"); assert.equal(opened.auth.state, "auth-blocked");
  for (const input of [{ action: "fill", selector: "#email", value: "synthetic@example.test" }, { action: "click", selector: "#continue" }]) {
    const blocked = outcome(await call("browser_action", input)); assert.equal(blocked.errorCode, "auth_required"); assert.equal(blocked.dispatch, "not-attempted");
  }
  await new Promise(resolve => setTimeout(resolve, 50)); assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("ordinary public contact submit inputs remain usable without authentication", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/input-submit-contact` })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: "#email", value: "public@example.test" })).status, "ok");
  assert.equal(outcome(await call("browser_action", { action: "click", selector: "#continue" })).status, "ok");
  await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(counts().submissions, 1);
}));

test("native snapshot href metadata redacts relative and local-file credential URLs", async () => fixture(async ({ call, origin }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/credential-links` })).status, "ok");
  const snapshot = outcome(await call("browser_action", { action: "snapshot" }));
  assert.equal(snapshot.status, "ok"); assert.equal(JSON.stringify(snapshot).includes("SYNTHETIC_RELATIVE_TOKEN"), false); assert.equal(JSON.stringify(snapshot).includes("SYNTHETIC_FILE_SECRET"), false);
  assert.match(snapshot.result.snapshot, /Continue/);
}));

test("srcdoc credential hrefs use the inherited document base before input dispatch", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/srcdoc-credential-link` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action: "click", selector: 'iframe >> internal:control=enter-frame >> a' }));
  assert.equal(blocked.errorCode, "auth_required"); assert.equal(blocked.dispatch, "not-attempted");
  await new Promise(resolve => setTimeout(resolve, 50)); assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("unsupported scaled frame mapping fails closed before any hover or activation", async () => fixture(async ({ call, origin, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/scaled-frame` })).status, "ok");
  const blocked = outcome(await call("browser_action", { action: "click", selector: 'iframe >> internal:control=enter-frame >> #target' }));
  assert.equal(blocked.status, "error"); assert.equal(blocked.dispatch, "not-attempted");
  await new Promise(resolve => setTimeout(resolve, 50)); assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("abort during native editability readiness never reaches input dispatch", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/input-semantics` });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  const started = performance.now();
  try {
    const blocked = outcome(await call("browser_action", { action: "fill", selector: "#disabled", value: "Never", timeout: 2000 }, noUI, controller.signal));
    assert.equal(blocked.errorCode, "cancelled");
    assert.equal(blocked.dispatch, "not-attempted");
    assert.ok(performance.now() - started < 1500);
    assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
  } finally { clearTimeout(timer); }
}));

test("already-aborted actions never dispatch input", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/contact` });
  const already = new AbortController(); already.abort();
  const before = outcome(await call("browser_action", { action: "fill", selector: "#email", value: "aborted" }, noUI, already.signal));
  assert.equal(before.auth.state, "cancelled");
  assert.equal(before.dispatch, "not-attempted");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("abort during a locator wait blocks the queued sibling and reports no dispatch", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/contact` });
  const controller = new AbortController();
  const started = performance.now();
  const waiting = call("browser_action", { action: "fill", selector: "#never-present", value: "aborted", timeout: 2000 }, noUI, controller.signal);
  const sibling = call("browser_action", { action: "fill", selector: "#email", value: "queued" });
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    const replies = await Promise.all([waiting, sibling]);
    assert.ok(performance.now() - started < 1500, "Abort must stop locator waiting, not merely return cancellation after the default deadline");
    for (const reply of replies) {
      const value = outcome(reply);
      assert.equal(value.auth.state, "cancelled");
      assert.equal(value.dispatch, "not-attempted");
    }
    assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
  } finally { clearTimeout(timer); }
}));

test("handoff abort propagates its signal and cannot resume on a late Yes", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/login/email` });
  const controller = new AbortController();
  const ctx = { hasUI: true, ui: { confirm: async (_title: string, _message: string, options: any) => {
    assert.equal(options.signal, controller.signal);
    controller.abort();
    return true;
  } } };
  const cancelled = outcome(await call("browser_handoff", { message: "Complete login", verifier: { origin, selector: "#authenticated" } }, ctx, controller.signal));
  assert.equal(cancelled.auth.state, "cancelled");
  const blocked = outcome(await call("browser_action", { action: "press", key: "Enter" }));
  assert.equal(blocked.dispatch, "not-attempted");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("post-dispatch abort leaves one committed submission, unknown completion, and no queued replay", async () => fixture(async ({ call, origin, onSubmission, counts }) => {
  assert.equal(outcome(await call("browser_open", { url: `${origin}/app` })).status, "ok");
  const controller = new AbortController();
  onSubmission(() => controller.abort());
  const first = call("browser_action", { action: "click", selector: "#save" }, noUI, controller.signal);
  const sibling = call("browser_action", { action: "click", selector: "#save" });
  const replies = await Promise.all([first, sibling]);
  const aborted = outcome(replies[0]);
  assert.equal(aborted.status, "error");
  assert.equal(aborted.errorCode, "cancelled");
  assert.equal(aborted.auth.state, "cancelled");
  assert.equal(aborted.dispatch, "attempted");
  assert.equal(aborted.completion, "unknown");
  const blocked = outcome(replies[1]);
  assert.equal(blocked.auth.state, "cancelled");
  assert.equal(blocked.dispatch, "not-attempted");
  assert.equal(counts().submissions, 1);
}));

test("long observations retain private redacted omission evidence and recover the tail by scope", async () => fixture(async ({ call, origin }) => {
  await call("browser_open", { url: `${origin}/wide` });
  const snapshot = await call("browser_action", { action: "snapshot" });
  const value = outcome(snapshot);
  assert.equal(value.status, "ok");
  const omission = value.result?.omission ?? value.omission;
  assert.ok(omission?.truncated, "A large observation must preserve truncation metadata, not discard it with the result");
  assert.equal((await stat(omission.path)).mode & 0o777, 0o600);
  assert.equal((await stat(join(omission.path, ".."))).mode & 0o777, 0o700);
  const full = await readFile(omission.path, "utf8");
  assert.ok(Array.isArray(JSON.parse(full)));
  assert.ok(Array.isArray(JSON.parse(value.result.snapshot)), "Bounded observations must remain valid native JSON");
  assert.match(full, /Final visible success receipt/);
  assert.doesNotMatch(full, /SYNTHETIC_FIELD_SECRET/);
  assert.doesNotMatch(JSON.stringify(snapshot), /SYNTHETIC_FIELD_SECRET/);
  assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 14000);
  const tail = await call("browser_action", { action: "snapshot", selector: "#tail" });
  assert.match(JSON.stringify(tail), /Final visible success receipt/);
  const ref = nativeRefs(tail, "Tail input")[0];
  assert.equal(outcome(await call("browser_action", { action: "fill", selector: `@${ref}`, value: "Tail value" })).status, "ok");
}));

test("auth-field values are absent from snapshots and credential value observations are rejected", async () => fixture(async ({ call, origin }) => {
  await call("browser_open", { url: `${origin}/secret-fields` });
  const snapshot = await call("browser_action", { action: "snapshot" });
  assert.equal(outcome(snapshot).status, "ok");
  assert.doesNotMatch(JSON.stringify(snapshot), /SYNTHETIC_(?:USERNAME|PASSWORD_FIELD|OTP_FIELD)/);
  const forbidden = outcome(await call("browser_action", { action: "value", selector: "input[type=password]" }));
  assert.equal(forbidden.status, "error");
  assert.equal(forbidden.dispatch, "not-attempted");
  assert.doesNotMatch(JSON.stringify(forbidden), /SYNTHETIC_PASSWORD_FIELD/);
}));

test("bounded diagnostics preserve newest failures, omissions and cursor/filter retrieval", async () => fixture(async ({ call, origin }) => {
  await call("browser_open", { url: `${origin}/overflow` });
  const result = await call("browser_action", { action: "console" });
  const diagnostics = outcome(result).result;
  assert.ok(diagnostics.entries.length <= 100);
  assert.ok(diagnostics.dropped >= 21);
  assert.equal(diagnostics.entries.at(-1).type, "error");
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_SECRET_ERROR/);
  const lastCursor = diagnostics.entries.at(-2).cursor;
  const recent = outcome(await call("browser_action", { action: "console", cursor: lastCursor, filter: "error" })).result;
  assert.equal(recent.entries.length, 1);
  assert.equal(recent.entries[0].type, "error");
}));

test("detached native refs never fall back to a duplicate sibling", async () => fixture(async ({ call, origin, detachTarget, counts }) => {
  await call("browser_open", { url: `${origin}/detached` });
  const detached = nativeRefs(await call("browser_action", { action: "snapshot" }), "Duplicate")[0];
  await detachTarget();
  const rejected = outcome(await call("browser_action", { action: "fill", selector: `@${detached}`, value: "Wrong sibling", timeout: 200 }));
  assert.equal(rejected.status, "error");
  assert.equal(rejected.dispatch, "not-attempted");
  assert.equal(outcome(await call("browser_action", { action: "value", selector: "#second input" })).result, "");
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("abort while queued checks the signal at entry and blocks later sibling inputs", async () => fixture(async ({ call, origin, counts }) => {
  await call("browser_open", { url: `${origin}/contact` });
  const controller = new AbortController();
  const pending = [
    call("browser_action", { action: "wait", milliseconds: 200 }),
    call("browser_action", { action: "fill", selector: "#email", value: "Queued abort" }, noUI, controller.signal),
    call("browser_action", { action: "fill", selector: "#email", value: "Sibling" }),
  ];
  controller.abort();
  const [, queued, sibling] = await Promise.all(pending);
  for (const result of [queued, sibling]) {
    assert.equal(outcome(result).auth.state, "cancelled");
    assert.equal(outcome(result).dispatch, "not-attempted");
  }
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));

test("installed Pi codemode resolves structured auth failures and lets callers stop without parsing prose", async () => fixture(async ({ call, origin, tools, counts }) => {
  const codemodeModule = "pi-test/codemode"; // Resolved to the installed host by the test loader.
  const { executeCodemode } = await import(codemodeModule);
  let nestedCalls = 0;
  const ctx = {
    tools: [...tools.values()],
    sessionManager: { getBranch: () => [] },
    executeTool: async (name: string, args: any, options: any) => {
      nestedCalls++;
      const result = await call(name, args, noUI, options.signal);
      return { toolCall: { id: `nested-${nestedCalls}`, name, arguments: args }, result, isError: result.isError === true };
    },
  };
  const result = await executeCodemode("contract", { code: `
    const opened = await tools.browser_open({url:${JSON.stringify(`${origin}/login/email`)}});
    if (opened.status === 'error') return {stopped:true,errorCode:opened.errorCode,auth:opened.auth.state};
    await tools.browser_action({action:'fill',selector:'#email',value:'must-not-be-sent'});
    return {stopped:false};
  ` }, undefined, undefined, ctx);
  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.equal(nestedCalls, 1);
  assert.match(result.content.map((item: any) => item.text ?? "").join("\n"), /"stopped":true.*"errorCode":"auth_required"/);
  assert.deepEqual(counts(), { inputs: 0, submissions: 0 });
}));
