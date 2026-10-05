import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { fixture, login, contact } from './capture-auth-fixtures.mjs';

const run = promisify(execFile);
const source = process.env.CUTAWAY_SOURCE ?? join(dirname(dirname(await realpath(
  (await run('which', [process.env.CUTAWAY_BIN ?? 'cutaway'])).stdout.trim()))), 'lib/cutaway');

async function capture(t, site, steps, { verifier, state, device, captureOnly = true, hide, onRecording, files = {}, url } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cutaway-auth-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'home'), { mode: 0o700 });
  await mkdir(join(dir, 'state'), { mode: 0o700 });
  for (const [name, contents] of Object.entries(files)) await writeFile(join(dir, name), contents);
  const plan = join(dir, 'plan.json');
  await writeFile(plan, JSON.stringify({ url: url ?? site.origin, timeout: 2000, captureScale: 1,
    ...(device ? { device } : { viewport: { width: 640, height: 480 } }), steps, hide }));
  const args = [join(source, 'src/cli.mjs'), 'record', plan, '--out', join(dir, 'capture')];
  if (captureOnly) args.push('--capture-only');
  else args.push('--width', '640', '--height', '360', '--quality', 'standard');
  if (verifier !== undefined) args.push('--auth-verifier', JSON.stringify(verifier));
  if (state) {
    await writeFile(join(dir, 'auth.json'), JSON.stringify(state), { mode: 0o600 });
    args.push('--storage-state', join(dir, 'auth.json'));
  }
  let error;
  let output;
  try {
    const pending = run(process.execPath, args, { timeout: 45_000,
      env: { ...process.env, HOME: join(dir, 'home'), XDG_STATE_HOME: join(dir, 'state') } });
    let triggered = false;
    pending.child.stderr.on('data', chunk => {
      if (!triggered && chunk.toString().includes('Recording 1/')) {
        triggered = true;
        onRecording?.();
      }
    });
    output = await pending;
  } catch (e) { error = e; }
  const timeline = JSON.parse(await readFile(join(dir, 'capture/timeline.json'), 'utf8'));
  return { error, output, timeline, directory: join(dir, 'capture') };
}

function blocked(result) {
  assert(result.error, 'capture must fail');
  assert.equal(result.timeline.status, 'failed');
  assert.equal(result.timeline.errorCode, 'auth_required');
  assert.match(result.timeline.error, /Authentication required/);
  assert.equal(typeof result.timeline.reason, 'string');
  assert(result.timeline.reason.length > 0);
  assert(!result.error.stderr.includes('Exporting video'), 'auth failure must not render');
}

const save = { action: 'click', selector: '#save', expect: '#receipt', pause: 0 };

async function withPage(t, site) {
  const { chromium } = await import(join(source, 'node_modules/playwright/index.mjs'));
  const dir = await mkdtemp(join(tmpdir(), 'shared-auth-test-'));
  await mkdir(join(dir, 'state'), { mode: 0o700 });
  const browser = await chromium.launch({ env: { ...process.env, HOME: dir, XDG_STATE_HOME: join(dir, 'state') } });
  t.after(async () => { await browser.close(); await rm(dir, { recursive: true, force: true }); });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(site.origin);
  return { page, context, auth: await import(join(source, 'src/capture/auth.mjs')) };
}

test('fresh CLI capture refuses email-first authentication without entering or submitting it', { timeout: 60_000 }, async t => {
  const site = await fixture(login);
  t.after(site.close);
  const result = await capture(t, site, [
    { action: 'type', selector: '#username', text: 'synthetic', pause: 0 },
    { action: 'click', selector: '#signin', pause: 0 },
  ]);
  blocked(result);
  assert.deepEqual(site.counts, { submit: 0, authInput: 0, authSubmit: 0, credentialRead: 0 });
  assert.equal(result.timeline.frames.length, 0, 'initial gate must not be filmed');
});

test('fresh CLI refuses email-first authentication named only by a native submit input', { timeout: 60_000 }, async t => {
  const html = contact.replace('<h1>Contact us</h1>', '<h1>Portal</h1>')
    .replace('<button id="save">Send</button>', '<input id="save" type="submit" value="Sign in">')
    .replace("fetch('/submit'", "fetch('/auth-submit'");
  const site = await fixture(html);
  t.after(site.close);
  const result = await capture(t, site, [save], { url: `${site.origin}/portal` });
  assert.equal(site.counts.authSubmit, 0, 'native Sign in submit must never activate');
  blocked(result);
  assert.equal(result.timeline.frames.length, 0);
  assert.equal(site.counts.credentialRead, 0);
});

test('shared native guards recognize buttonlike input names without reading field values', async t => {
  const site = await fixture('<h1>Portal</h1><form><input id="email" type="email"><input id="signin" type="submit" value="Sign in"></form>');
  t.after(site.close);
  const { page, auth } = await withPage(t, site);
  await page.goto(`${site.origin}/portal`);
  await page.locator('input').evaluateAll(inputs => {
    for (const input of inputs) Object.defineProperty(input, 'value', {
      get() { fetch('/credential-read', { method: 'POST' }); throw Error('field value read'); },
    });
  });
  assert.equal((await auth.observeAuth(page)).state, 'auth-blocked');
  for (const selector of ['#email', '#signin', 'form']) {
    await assert.rejects(auth.assertSafeInput(page, page.locator(selector)), { code: 'auth_required' });
  }
  await page.locator('#email').focus(); // Simulated human focus.
  await assert.rejects(auth.assertSafeInput(page), { code: 'auth_required' });
  for (const type of ['button', 'reset']) {
    await page.locator('#signin').evaluate((input, type) => { input.type = type; }, type);
    await assert.rejects(auth.assertSafeInput(page, page.locator('#signin')), { code: 'auth_required' });
  }
  assert.equal(site.counts.credentialRead, 0);
});

test('public native Send submit remains ready and CLI submits exactly once', { timeout: 60_000 }, async t => {
  const html = contact.replace('<button id="save">Send</button>', '<input id="save" type="submit" value="Send">');
  const site = await fixture(html);
  t.after(site.close);
  const { page, auth } = await withPage(t, site);
  await page.goto(`${site.origin}/portal`);
  await page.evaluate(() => {
    document.querySelector('#name').setAttribute('value', 'Sign in');
    const textarea = document.createElement('textarea'); textarea.textContent = 'Sign in';
    const editable = document.createElement('div'); editable.contentEditable = 'true'; editable.textContent = 'Sign in';
    document.querySelector('form').append(textarea, editable);
    for (const field of document.querySelectorAll('input,textarea,[contenteditable]')) {
      Object.defineProperty(field, 'value', {
        get() { fetch('/credential-read', { method: 'POST' }); throw Error('field value read'); },
      });
    }
  });
  assert.equal((await auth.observeAuth(page)).state, 'ready');
  for (const selector of ['#email', '#save', 'form']) await auth.assertSafeInput(page, page.locator(selector));
  assert.equal(site.counts.credentialRead, 0);
  const result = await capture(t, site, [save], { url: `${site.origin}/portal` });
  assert.ifError(result.error);
  assert.equal(result.timeline.status, 'complete');
  assert.equal(site.counts.submit, 1);
  assert.equal(site.counts.authSubmit, 0);
});

test('fresh CLI context requires an origin-bound marker, not just stored cookies', { timeout: 60_000 }, async t => {
  const site = await fixture(contact);
  t.after(site.close);
  const result = await capture(t, site, [save], {
    verifier: { origin: site.origin, selector: '#authenticated' },
    state: { cookies: [{ name: 'session', value: 'synthetic', domain: '127.0.0.1', path: '/',
      expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [] },
    captureOnly: false,
  });
  blocked(result);
  assert.equal(site.counts.submit, 0);
  assert.equal(result.timeline.frames.length, 0);
});

test('CLI stops before typing when a gate appears during the focus/homing pause', { timeout: 60_000 }, async t => {
  const site = await fixture(`${contact}<script>
    document.querySelector('#name').onfocus = () => setTimeout(() => {
      const gate = document.createElement('section'); gate.innerHTML = '<h2>Sign in</h2><input autocomplete="username">';
      document.body.append(gate);
    }, 50);
    document.querySelector('#name').oninput = () => fetch('/auth-input', {method:'POST'});
  </script>`);
  t.after(site.close);
  const result = await capture(t, site, [
    { action: 'type', selector: '#name', text: 'must not be typed', pause: 0 }, save,
  ]);
  blocked(result);
  assert.equal(site.counts.authInput, 0);
  assert.equal(site.counts.submit, 0);
  assert.equal(result.timeline.failedStep, 1);
});

test('touch capture cancels activation when a gate appears during the held tap', { timeout: 60_000 }, async t => {
  const site = await fixture(`${contact}<script>
    document.querySelector('#save').onpointerdown = () => {
      const gate = document.createElement('section'); gate.innerHTML = '<h2>Sign in</h2><input autocomplete="username">';
      document.body.append(gate);
    };
  </script>`);
  t.after(site.close);
  const result = await capture(t, site, [{ ...save, hold: 0.5 }], { device: 'Pixel 7' });
  blocked(result);
  assert.equal(site.counts.submit, 0, 'touchEnd must not submit after authentication is lost');
});

test('an already-visible success marker cannot verify a new input operation', { timeout: 60_000 }, async t => {
  const site = await fixture(contact.replace('id="receipt" hidden', 'id="receipt"'));
  t.after(site.close);
  const result = await capture(t, site, [save]);
  assert(result.error, 'stale success must not complete a capture');
  assert.equal(result.timeline.status, 'failed');
  assert.match(result.timeline.error, /fresh/);
  assert.equal(site.counts.submit, 0, 'reject a stale expectation before committing');
});

test('password-change pages are not gates, but credential fields and controls stay human-only', async t => {
  const site = await fixture(`<h1>Change password</h1><form>
    <input id="password" type="password" autocomplete="new-password"><button id="change">Change password</button>
    </form><button id="ordinary">Open preferences</button>
    <script>const input = document.querySelector('#password');
      Object.defineProperty(input, 'value', {get() { fetch('/credential-read', {method:'POST'}); throw Error('secret read'); }});
    </script>`);
  t.after(site.close);
  const { page, auth } = await withPage(t, site);
  assert.equal((await auth.observeAuth(page)).state, 'ready');
  await auth.assertSafeInput(page, page.locator('#ordinary'));
  for (const selector of ['#password', '#change']) {
    await assert.rejects(auth.assertSafeInput(page, page.locator(selector)), { code: 'auth_required' });
  }
  await page.locator('#password').focus(); // Simulated human focus, not an agent input.
  await assert.rejects(auth.assertSafeInput(page), { code: 'auth_required' });
  assert.equal(site.counts.credentialRead, 0);
});

test('cinematic hide selectors cannot conceal an authentication gate', { timeout: 60_000 }, async t => {
  const site = await fixture(`${login}${contact}`);
  t.after(site.close);
  const result = await capture(t, site, [save], { hide: ['#login', 'h1'] });
  blocked(result);
  assert.equal(site.counts.submit, 0);
  assert.equal(result.timeline.frames.length, 0);
});

test('an authenticated marker cannot override a gate in another frame or context page', async t => {
  const site = await fixture(`<div id="authenticated">Workspace</div>${contact}`, { '/login': login });
  t.after(site.close);
  const { page, context, auth } = await withPage(t, site);
  const verifier = { origin: site.origin, selector: '#authenticated' };
  assert.equal(await auth.verifyAuthenticated(page, verifier), true);
  await page.evaluate(() => {
    const frame = document.createElement('iframe'); frame.src = '/login'; document.body.append(frame);
  });
  await page.frameLocator('iframe').locator('#username').waitFor();
  assert.equal((await auth.observeAuth(page, { verifier })).state, 'auth-blocked');
  assert.equal(await auth.verifyAuthenticated(page, verifier), false);
  await page.locator('iframe').evaluate(frame => frame.remove());
  const popup = await context.newPage();
  await popup.goto(`${site.origin}/login`);
  await assert.rejects(auth.assertSafeInput(page, page.locator('#save'), { verifier }), { code: 'auth_required' });
  assert.equal(await auth.verifyAuthenticated(page, verifier), false);
  assert.equal(site.counts.submit, 0);
});

test('OAuth-only links and reauthentication dialogs are gates without a password login form', async t => {
  const site = await fixture(`<a href="/oauth/provider">Continue with Google</a>`);
  t.after(site.close);
  const { page, auth } = await withPage(t, site);
  assert.equal((await auth.observeAuth(page)).state, 'auth-blocked');
  await page.setContent(`<h1>Change password</h1><dialog open aria-label="Confirm your password">
    <input type="password" autocomplete="current-password"><button>Continue</button></dialog>`);
  assert.equal((await auth.observeAuth(page)).state, 'auth-blocked');
});

test('public password settings can record an unrelated control, not the autofocused password', { timeout: 60_000 }, async t => {
  const site = await fixture(`<h1>Change password</h1><input type="password" autocomplete="new-password" autofocus>
    <button id="preferences" onclick="document.querySelector('#receipt').hidden=false">Open preferences</button>
    <div id="receipt" hidden>Preferences opened</div>`);
  t.after(site.close);
  const result = await capture(t, site, [{ action: 'click', selector: '#preferences', expect: '#receipt', pause: 0 }]);
  assert.ifError(result.error);
  assert.equal(result.timeline.status, 'complete');
  assert.equal(site.counts.authInput, 0);
});

test('a clearly public journey ignores a standalone login link and a hidden login modal', { timeout: 60_000 }, async t => {
  const site = await fixture(`<a href="/login">Log in</a><button id="login-button">Sign in</button><section hidden id="login-modal">
    <h2>Sign in</h2><input autocomplete="username"><input type="password"><button>Sign in</button>
    <iframe src="/login"></iframe></section>${contact}`, { '/login': login });
  t.after(site.close);
  const result = await capture(t, site, [save]);
  assert.ifError(result.error);
  assert.equal(result.timeline.status, 'complete');
  assert.equal(site.counts.submit, 1);
  assert.equal(site.counts.authInput, 0);
  const { page, auth } = await withPage(t, site);
  assert.equal((await auth.observeAuth(page)).state, 'ready');
  await assert.rejects(auth.assertSafeInput(page, page.locator('#login-button')), { code: 'auth_required' });
});

test('CLI refuses blind iframe activation even on a nongate password-change page', { timeout: 60_000 }, async t => {
  const site = await fixture('<iframe id="frame" src="/password-settings"></iframe>', {
    '/password-settings': `<h1>Change password</h1><input type="password" autocomplete="new-password"
      style="position:fixed;inset:0;width:100%;height:100%" onfocus="fetch('/auth-input',{method:'POST'})">`,
  });
  t.after(site.close);
  const result = await capture(t, site, [{ action: 'click', selector: '#frame', pause: 0 }]);
  blocked(result);
  assert.equal(site.counts.authInput, 0);
  assert.equal(site.counts.submit, 0);
});

test('native SELECT keyboard Enter changes selection without requiring a submission receipt', { timeout: 60_000 }, async t => {
  const site = await fixture(`<select id="industry"><option>Choose</option><option>Technology</option></select>${contact}`);
  t.after(site.close);
  const result = await capture(t, site, [{ action: 'click', selector: '#industry', pause: 0 },
    { action: 'press', key: 'ArrowDown', pause: 0 }, { action: 'press', key: 'Enter', pause: 0 }, save]);
  assert.ifError(result.error);
  assert.equal(result.timeline.status, 'complete');
  assert.equal(site.counts.submit, 1);
});

test('CLI retained and rendered metadata strip URL query and fragment', { timeout: 60_000 }, async t => {
  const site = await fixture('<div id="marker">Public content</div>');
  t.after(site.close);
  const url = `${site.origin}/?view=synthetic-query#synthetic-fragment`;
  const result = await capture(t, site, [{ action: 'wait', duration: 0, expect: '#marker', pause: 0 }], { url, captureOnly: false });
  assert.ifError(result.error);
  assert.equal(result.timeline.url, `${site.origin}/`);
  for (const output of [JSON.stringify(result.timeline), result.output.stdout, result.output.stderr,
    await readFile(join(result.directory, 'render.json'), 'utf8')]) {
    assert(!/synthetic-(user|password|query|fragment)/.test(output));
  }
});

test('CLI navigation failures never echo URL credentials or plan values in retained errors', { timeout: 60_000 }, async t => {
  const site = await fixture('', { '/broken': (_req, res) => res.destroy() });
  t.after(site.close);
  const url = `${site.origin}/broken?view=synthetic-query#synthetic-fragment`;
  const result = await capture(t, site, [{ action: 'type', selector: '#synthetic-selector', text: 'synthetic-value', pause: 0 }], { url });
  assert(result.error);
  assert.equal(result.timeline.status, 'failed');
  assert(!/synthetic-(user|password|query|fragment|selector|value)/.test(result.error.stderr));
  assert(!/synthetic-(user|password|query|fragment|selector|value)/.test(JSON.stringify(result.timeline)));
});

test('shared target guards reject visible credential descendants through div and label wrappers', async t => {
  const site = await fixture(`<h1>Change password</h1>
    <div id="wrapper"><label id="label"><input type="password" autocomplete="new-password"></label></div>
    <button id="ordinary">Open preferences</button>`);
  t.after(site.close);
  const { page, auth } = await withPage(t, site);
  assert.equal((await auth.observeAuth(page)).state, 'ready');
  await auth.assertSafeInput(page, page.locator('#ordinary'));
  for (const selector of ['#wrapper', '#label']) {
    await assert.rejects(auth.assertSafeInput(page, page.locator(selector)), { code: 'auth_required' });
  }
  assert.equal(site.counts.authInput, 0);
});

test('hidden authentication frames do not block public focused keyboard input', async t => {
  const site = await fixture(`${contact}<iframe src="/frame-login"></iframe>`, {
    '/frame-login': '<h1>Sign in</h1><input id="password" type="password">',
  });
  t.after(site.close);
  const { page, auth } = await withPage(t, site);
  await page.frameLocator('iframe').locator('#password').focus(); // Simulated human focus.
  await page.locator('iframe').evaluate(el => el.hidden = true);
  await page.locator('#email').focus();
  assert.equal((await auth.observeAuth(page)).state, 'ready');
  await auth.assertSafeInput(page);
  assert.equal(site.counts.authInput, 0);
});

test('CLI refuses credential-bearing userinfo and token URLs before navigation or submission', { timeout: 60_000 }, async t => {
  let navigations = 0;
  const site = await fixture(contact, { '/': (_req, res) => { navigations++; res.end(contact); } });
  t.after(site.close);
  for (const url of [site.origin.replace('http://', 'http://synthetic-user:synthetic-password@'),
    `${site.origin}/?token=synthetic-token`, `${site.origin}/#access_token=synthetic-token`, `${site.origin}/#route?code=synthetic-token`, `${site.origin}/?api_key=synthetic-token`]) {
    const result = await capture(t, site, [save], { url, captureOnly: false });
    blocked(result);
    assert.equal(result.timeline.failedStep, null);
    assert.equal(result.timeline.frames.length, 0);
    assert.equal(result.timeline.url, `${site.origin}/`);
    assert(!/synthetic-/.test(JSON.stringify(result.timeline)));
    assert.equal(navigations, 0);
    assert.equal(site.counts.submit, 0);
  }
});

test('shared URL guard rejects credential keys and credential-bearing href targets, not ordinary queries', async t => {
  const site = await fixture(`${contact}<a id="credential-link" href="/?token=synthetic">Continue</a><a id="fragment-link" href="/#access_token=synthetic">Continue</a>`);
  t.after(site.close);
  const { page, auth } = await withPage(t, site);
  assert.doesNotThrow(() => auth.assertSafeUrl(`${site.origin}/?view=public&search=code`));
  assert.doesNotThrow(() => auth.assertSafeUrl(`${site.origin}/#password`));
  for (const key of ['password', 'pwd', 'passwd', 'access_token', 'id_token', 'refresh_token', 'auth_token', 'token', 'code', 'api_key', 'apikey', 'client_secret', 'TOKEN']) {
    assert.throws(() => auth.assertSafeUrl(`${site.origin}/?${key}=synthetic`), { code: 'auth_required' });
    assert.throws(() => auth.assertSafeUrl(`${site.origin}/#${key}=synthetic`), { code: 'auth_required' });
    assert.throws(() => auth.assertSafeUrl(`file:///tmp/demo.html?${key}=synthetic`), { code: 'auth_required' });
  }
  assert.equal((await auth.observeAuth(page)).state, 'ready');
  await assert.rejects(auth.assertSafeInput(page, page.locator('#credential-link')), { code: 'auth_required' });
  await assert.rejects(auth.assertSafeInput(page, page.locator('#fragment-link')), { code: 'auth_required' });
});

test('cinematic hide cannot conceal a framed authentication gate', { timeout: 60_000 }, async t => {
  const site = await fixture(`${contact}<iframe src="/frame-login"></iframe>`, { '/frame-login': login });
  t.after(site.close);
  const result = await capture(t, site, [save], { hide: ['iframe'] });
  blocked(result);
  assert.equal(site.counts.submit, 0);
  assert.equal(result.timeline.frames.length, 0);
});

test('fresh CLI authorized contact journey submits exactly once', { timeout: 60_000 }, async t => {
  const site = await fixture(`<div id="authenticated">Signed-in workspace</div>${contact}`);
  t.after(site.close);
  const result = await capture(t, site, [
    { action: 'type', selector: '#email', text: 'public@example.test', pause: 0 }, save,
  ], { verifier: { origin: site.origin, selector: '#authenticated' } });
  assert.ifError(result.error);
  assert.equal(result.timeline.status, 'complete');
  assert.equal(site.counts.submit, 1);
  assert.equal(site.counts.authInput, 0);
});

test('CLI detects a gate created while the target is still waiting for readiness', { timeout: 60_000 }, async t => {
  let release;
  const site = await fixture(`${contact}<script>
    document.querySelector('#save').hidden = true;
    fetch('/release').then(() => {
      const gate = document.createElement('section'); gate.innerHTML = '<h2>Sign in</h2><input autocomplete="username">';
      document.body.append(gate); document.querySelector('#save').hidden = false;
    });
  </script>`, { '/release': (_req, res) => { release = () => res.end('ready'); } });
  t.after(site.close);
  const result = await capture(t, site, [save], { onRecording: () => release() });
  blocked(result);
  assert.equal(result.timeline.failedStep, 1);
  assert.equal(site.counts.submit, 0);
});

test('CLI stops remaining typing bursts when focus moves to an authentication field', { timeout: 60_000 }, async t => {
  const site = await fixture(`<h1>Change password</h1><input id="ordinary"><input id="secret" type="password" autocomplete="new-password">
    <script>document.querySelector('#ordinary').oninput = () => document.querySelector('#secret').focus();
    document.querySelector('#secret').oninput = () => fetch('/auth-input', {method:'POST'});
    Object.defineProperty(document.querySelector('#secret'), 'value', {
      get() { fetch('/credential-read', {method:'POST'}); throw Error('secret read'); }
    });</script>`);
  t.after(site.close);
  const result = await capture(t, site, [{ action: 'type', selector: '#ordinary', text: 'multiple bursts', pause: 0 }]);
  blocked(result);
  assert.equal(site.counts.authInput, 0);
  assert.equal(site.counts.credentialRead, 0);
});

test('CLI rejects keyboard input without a selector when human focus is on a credential', { timeout: 60_000 }, async t => {
  const site = await fixture(`<h1>Change password</h1><input type="password" autocomplete="new-password" autofocus
    oninput="fetch('/auth-input',{method:'POST'})"><div id="receipt" hidden>Updated</div>`);
  t.after(site.close);
  const result = await capture(t, site, [{ action: 'press', key: 'Enter', expect: '#receipt', pause: 0 }]);
  blocked(result);
  assert.equal(site.counts.authInput, 0);
  assert.equal(site.counts.submit, 0);
});

test('CLI rechecks authentication before answering a file chooser', { timeout: 60_000 }, async t => {
  const site = await fixture(`<button id="upload" onclick="openChooser()">Attach file</button>
    <input id="file" type="file" hidden onchange="fetch('/auth-input',{method:'POST'})">
    <script>function openChooser() {
      const gate = document.createElement('section'); gate.innerHTML = '<h2>Sign in</h2><input autocomplete="username">';
      document.body.append(gate); document.querySelector('#file').click();
    }</script>`);
  t.after(site.close);
  const result = await capture(t, site, [{ action: 'upload', selector: '#upload', file: 'attachment.txt', pause: 0 }],
    { files: { 'attachment.txt': 'synthetic attachment' } });
  blocked(result);
  assert.equal(site.counts.authInput, 0, 'setFiles must not write after a gate appears');
});

test('a newly duplicated success target cannot verify an operation that already submitted once', { timeout: 60_000 }, async t => {
  const site = await fixture(contact.replace("document.querySelector('#receipt').hidden = false;",
    "document.querySelector('#receipt').hidden = false; document.body.append(document.querySelector('#receipt').cloneNode(true));"));
  t.after(site.close);
  const result = await capture(t, site, [save]);
  assert(result.error);
  assert.equal(result.timeline.status, 'failed');
  assert.match(result.timeline.error, /strict mode|exactly one/);
  assert.equal(site.counts.submit, 1, 'failure is not permission to replay the write');
});

test('observation-only expectations may use an existing unique marker', { timeout: 60_000 }, async t => {
  const site = await fixture(`<div id="marker">Existing marker</div>`);
  t.after(site.close);
  const result = await capture(t, site, [{ action: 'wait', duration: 0, expect: '#marker', pause: 0 }]);
  assert.ifError(result.error);
  assert.equal(result.timeline.status, 'complete');
  assert.equal(site.counts.submit, 0);
});

test('authorized touch capture submits exactly once using the same fresh-context verifier', { timeout: 60_000 }, async t => {
  const site = await fixture(`<div id="authenticated">Workspace</div>${contact}`);
  t.after(site.close);
  const result = await capture(t, site, [save], { device: 'Pixel 7', verifier: { origin: site.origin, selector: '#authenticated' } });
  assert.ifError(result.error);
  assert.equal(result.timeline.status, 'complete');
  assert.equal(site.counts.submit, 1);
});

test('marker disappearance halfway through a CLI journey prevents later application submission', { timeout: 60_000 }, async t => {
  const site = await fixture(`<div id="authenticated">Workspace</div>${contact}<script>
    document.querySelector('#name').oninput = () => document.querySelector('#authenticated')?.remove();
  </script>`);
  t.after(site.close);
  const result = await capture(t, site, [{ action: 'type', selector: '#name', text: 'paced input', pause: 0 }, save],
    { verifier: { origin: site.origin, selector: '#authenticated' } });
  blocked(result);
  assert.equal(site.counts.submit, 0);
  assert.equal(result.timeline.failedStep, 1);
});

test('public contact email and isolated forbidden responses are not login gates', async t => {
  const site = await fixture(contact);
  t.after(site.close);
  const { page, auth } = await withPage(t, site);
  await auth.assertSafeInput(page, page.locator('#email'), { protectedFailure: { status: 403 } });
  assert.equal((await auth.observeAuth(page, { protectedFailure: { status: 403 } })).state, 'ready');
  await assert.rejects(auth.assertSafeInput(page, page.locator('#save'), { protectedFailure: true }), { code: 'auth_required' });
  assert.equal((await auth.observeAuth(page, { protectedFailure: { protected: true, status: 401 } })).state, 'auth-blocked');
});

test('verifiers require a unique visible marker on the exact origin and never accept an uninspectable page', async t => {
  const site = await fixture(`<div id="authenticated">Workspace</div>`);
  t.after(site.close);
  const { page, auth } = await withPage(t, site);
  const verifier = { origin: site.origin, selector: '#authenticated' };
  assert.equal(await auth.verifyAuthenticated(page, verifier), true);
  for (const bad of [{ ...verifier, origin: 'https://wrong.example' }, { ...verifier, origin: `${site.origin}/` },
    { ...verifier, selector: 'invalid[' }, { ...verifier, selector: '#missing' }]) {
    assert.equal(await auth.verifyAuthenticated(page, bad), false);
    assert.equal((await auth.observeAuth(page, { verifier: bad })).state, 'auth-blocked');
  }
  await page.locator('#authenticated').evaluate(el => el.hidden = true);
  assert.equal(await auth.verifyAuthenticated(page, verifier), false);
  await page.setContent('<div id="authenticated">One</div><div id="authenticated">Two</div>');
  assert.equal(await auth.verifyAuthenticated(page, verifier), false);
  await page.close();
  assert.equal((await auth.observeAuth(page)).state, 'auth-blocked');
  assert.equal(await auth.verifyAuthenticated(page, verifier), false);
});

for (const [name, html] of Object.entries({
  'email/password': '<h1>Sign in</h1><input type="email"><input type="password">',
  'OAuth-only': '<button>Continue with Google</button>',
  passkey: '<button>Use a passkey</button>',
  MFA: '<h1>Verify your identity</h1><input autocomplete="one-time-code">',
  framed: '<iframe src="/framed-login"></iframe>',
  shadow: '<div id="host"></div><script>document.querySelector("#host").attachShadow({mode:"open"}).innerHTML = \'<input autocomplete="one-time-code">\';</script>',
})) {
  test(`fresh CLI rejects ${name} authentication before capture starts`, { timeout: 60_000 }, async t => {
    const site = await fixture(`${html}${contact}`, { '/framed-login': login });
    t.after(site.close);
    const result = await capture(t, site, [save]);
    blocked(result);
    assert.equal(site.counts.submit, 0);
    assert.equal(site.counts.authInput, 0);
    assert.equal(site.counts.authSubmit, 0);
    assert.equal(result.timeline.frames.length, 0);
    assert.equal(result.timeline.failedStep, null);
  });
}


