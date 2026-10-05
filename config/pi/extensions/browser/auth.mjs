// Shared by exploration and Cutaway. Classification reads semantics, never field values.
const ready = { state: 'ready', reason: 'No authentication gate observed.' };
const blocked = reason => ({ state: 'auth-blocked', reason });
const credentialQueryKeys = ['password', 'pwd', 'passwd', 'access_token', 'id_token', 'refresh_token', 'auth_token', 'token', 'code', 'api_key', 'apikey', 'api-key', 'client_secret'];

export function assertSafeUrl(rawURL) {
  const url = new URL(rawURL);
  if (!['http:', 'https:', 'file:'].includes(url.protocol)) return;
  const fragment = url.hash.slice(1).replace(/^\?/, '');
  const fragmentParams = new URLSearchParams(fragment.includes('=') ? (fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment) : '');
  if (url.username || url.password || [...url.searchParams.keys(), ...fragmentParams.keys()].some(key => credentialQueryKeys.includes(key.toLowerCase()))) {
    const reason = 'Credential-bearing navigation URLs require human authentication.';
    throw Object.assign(new Error(`Authentication required: ${reason}`), { code: 'auth_required', reason });
  }
}

// Runs in each document, or on a Locator's element. Keep this function self-contained.
function evidence(input, options) {
  let target = input instanceof Element ? input : null;
  options = target ? options : input;
  const keys = options?.credentialQueryKeys ?? [];
  // Cutaway's presentation CSS must not hide authentication from the guard.
  const sheets = [...document.querySelectorAll('style[data-cutaway-hide]')].map(style => style.sheet).filter(Boolean);
  const disabled = sheets.map(sheet => sheet.disabled);
  sheets.forEach(sheet => { sheet.disabled = true; });
  try {
  const focused = options?.focused === true;
  if (focused) {
    target = document.activeElement;
    while (target?.shadowRoot?.activeElement) target = target.shadowRoot.activeElement;
  }
  const visible = element => element.checkVisibility({ visibilityProperty: true })
    && [...element.getClientRects()].some(box => box.width > 0 && box.height > 0);
  const elements = [];
  function visit(root) {
    for (const element of root.querySelectorAll('*')) {
      elements.push(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  }
  visit(document);
  // Do not use textContent/innerText on a form: contenteditable credentials could be inside it.
  function text(element) {
    if (!element) return '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let result = '';
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (parent?.closest('input, textarea, [contenteditable]') || !parent || !visible(parent)) continue;
      result += ` ${walker.currentNode.textContent}`;
    }
    return result;
  }
  function name(element) {
    return [element.getAttribute('aria-label'),
      // Native button names are attributes, not editable credential values.
      element.matches('input[type=submit],input[type=button],input[type=reset]') ? element.getAttribute('value') : null,
      ...(element.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => text(document.getElementById(id))),
      ...[...(element.labels ?? [])].map(text), text(element)].filter(Boolean).join(' ');
  }
  const auth = /\b(log\s*in|sign\s*in|authenticate|authentication|verify (?:your )?(?:identity|email)|confirm (?:your )?password|enter (?:your )?(?:password|code)|create (?:an )?account|two[- ]factor|multi[- ]factor|(?:verification|security) code|one[- ]time (?:code|password)|passkey|security key|continue with (?:google|apple|microsoft|github)|sign (?:in|up) with)\b/i;
  const change = /\b(change|update|reset|new|forgot) (?:your )?password\b|\baccount settings\b/i;
  const headings = elements.filter(e => visible(e) && e.matches('h1,h2,h3,[role=heading],legend'));
  const heading = [document.title, ...headings.map(name)].join(' ');
  const route = /\/(?:login|log-in|signin|sign-in|auth|oauth|authorize|sso|mfa|2fa)(?:\/|$)/i.test(location.pathname);
  const controls = elements.filter(e => e.matches('input,textarea,button,a,select,[role=button],[role=link],[contenteditable]'));
  const shown = controls.filter(visible);
  const credential = e => e.matches('input[type=password]')
    || /(?:^|\s)(username|current-password|new-password|one-time-code|webauthn)(?:\s|$)/i.test(e.getAttribute('autocomplete') ?? '')
    || (e.matches('input,textarea,[contenteditable]') && /\b(password|username|user name|otp|totp|passcode|one[- ]time code|(?:verification|security)[-_ ]?code|api[-_ ]?key|token|(?:access|id|refresh|auth)[-_ ]?token|client[-_ ]?secret)\b/i
      .test([e.id, e.getAttribute('name'), e.getAttribute('placeholder'), name(e)].join(' ').replace(/[_-]/g, ' ')));
  const authControl = e => {
    if (e.matches('input,button,a,label,[role=button],[role=link]') && auth.test(name(e))) return true;
    if (!e.matches('a[href]')) return false;
    try {
      const url = new URL(e.getAttribute('href'), document.baseURI);
      const fragment = url.hash.slice(1).replace(/^\?/, '');
      const fragmentParams = new URLSearchParams(fragment.includes('=') ? (fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment) : '');
      return /\/(?:login|log-in|signin|sign-in|auth|oauth|authorize|sso|mfa)(?:\/|$)/i.test(url.pathname)
        || (['http:', 'https:', 'file:'].includes(url.protocol) && (url.username || url.password
          || [...url.searchParams.keys(), ...fragmentParams.keys()].some(key => keys.includes(key.toLowerCase()))));
    } catch { return false; }
  };
  const signalled = auth.test(heading) || route;
  const changingPassword = change.test(heading) && !auth.test(heading) && !route;
  const formAuth = e => {
    const form = e.closest('form,[role=dialog],dialog,[role=form]');
    return form && (auth.test(name(form)) || [...form.querySelectorAll('button,input[type=submit],input[type=button],input[type=reset],a,[role=button],legend,h1,h2,h3')].filter(visible).some(authControl));
  };
  const hasGate = shown.some(e => credential(e) && (!changingPassword || /one-time-code|webauthn/.test(e.autocomplete)))
    || shown.some(e => formAuth(e)) || (signalled && shown.length > 0)
    // A standalone navigation login button/link is forbidden as a target, not proof of a gate.
    || shown.some(e => e.matches('button,a,[role=button],[role=link]')
      && /\b(?:continue with|sign (?:in|up) with|passkey|security key|verify (?:your )?identity|two[- ]factor|multi[- ]factor|(?:verification|security) code)\b/i.test(name(e)));
  if (target) {
    const owner = target.closest('button,a,label,[role=button],[role=link]');
    const selector = 'input,textarea,button,a,iframe,frame,[role=button],[role=link],[contenteditable]';
    const descendants = focused || target.matches('html,body') ? [] : [...target.querySelectorAll(selector)];
    const candidates = [target, owner, owner?.control,
      ...[...descendants, ...(target.shadowRoot?.querySelectorAll(selector) ?? [])].filter(visible)].filter(Boolean);
    const credentialControl = e => e.matches('button,input[type=submit],[role=button],a')
      && (change.test(name(e)) || [...(e.closest('form,[role=form]')?.querySelectorAll('input') ?? [])]
        .some(field => visible(field) && credential(field)));
    return { visible: visible(target), unsafe: candidates.some(e => (!focused && e.matches('iframe,frame'))
      || credential(e) || credentialControl(e) || authControl(e) || formAuth(e)) };
  }
  return { gate: hasGate };
  } finally { sheets.forEach((sheet, index) => { sheet.disabled = disabled[index]; }); }
}

async function relevantFrame(frame) {
  for (let child = frame; child.parentFrame(); child = child.parentFrame()) {
    const owner = await child.frameElement();
    try {
      const displayed = await owner.isVisible();
      if (!(await owner.evaluate(evidence, { credentialQueryKeys })).visible) return false;
      // A masked embedding prevents reliable child inspection; never reveal it across async awaits.
      if (!displayed) throw new Error('Cannot inspect a presentation-masked frame.');
    } finally { await owner.dispose(); }
  }
  return true;
}

async function focusedFrame(frame) {
  for (let child = frame; child.parentFrame(); child = child.parentFrame()) {
    const owner = await child.frameElement();
    try {
      if (!await owner.evaluate(element => element === element.getRootNode().activeElement)) return false;
    } finally { await owner.dispose(); }
  }
  return true;
}

function validVerifier(verifier) {
  try {
    const url = new URL(verifier.origin);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === verifier.origin
      && typeof verifier.selector === 'string' && verifier.selector.trim().length > 0;
  } catch { return false; }
}

export async function verifyAuthenticated(page, verifier) {
  if (!validVerifier(verifier) || (await observeAuth(page)).state !== 'ready') return false;
  try {
    if (new URL(page.url()).origin !== verifier.origin) return false;
    let matches = 0;
    let visible = false;
    for (const frame of page.frames()) {
      if (new URL(frame.url()).origin !== verifier.origin || !await relevantFrame(frame)) continue;
      const marker = frame.locator(verifier.selector);
      const count = await marker.count();
      matches += count;
      if (count === 1 && await marker.isVisible()) visible = true;
    }
    return matches === 1 && visible;
  } catch { return false; }
}

export async function observeAuth(page, { verifier, protectedFailure } = {}) {
  if (protectedFailure === true || (protectedFailure?.protected === true && [401, 403].includes(protectedFailure.status))) {
    return blocked('Protected resource rejected authentication.');
  }
  try {
    const pages = page.context().pages();
    if (!pages.includes(page) || page.isClosed()) return blocked('Cannot inspect the active page.');
    const frames = pages.flatMap(p => p.frames());
    for (const frame of frames) {
      if (await relevantFrame(frame) && (await frame.evaluate(evidence, { credentialQueryKeys })).gate) {
        return blocked('Visible or plausible authentication gate.');
      }
    }
    const current = page.context().pages().flatMap(p => p.frames());
    if (current.length !== frames.length || current.some(f => !frames.includes(f))) {
      return blocked('Page or frame changed during authentication inspection.');
    }
    if (verifier !== undefined && !await verifyAuthenticated(page, verifier)) {
      return blocked('Authenticated application marker is missing, ambiguous or on the wrong origin.');
    }
    return { ...ready };
  } catch {
    return blocked('Cannot inspect a page or frame for authentication.');
  }
}

export async function assertSafeInput(page, target, options = {}) {
  let observation;
  try {
    // Inspect the target first: Locator readiness may wait while a new gate appears.
    const unsafe = target ? (await target.evaluate(evidence, { credentialQueryKeys })).unsafe : (await Promise.all(
      page.frames().map(async frame => await focusedFrame(frame)
        ? frame.evaluate(evidence, { focused: true, credentialQueryKeys }) : { unsafe: false }),
    )).some(result => result.unsafe);
    observation = unsafe ? blocked('Authentication and credential controls require human input.')
      : await observeAuth(page, options);
  } catch { observation = blocked('Cannot inspect the input target.'); }
  if (observation.state !== 'ready') {
    const error = new Error(`Authentication required: ${observation.reason}`);
    error.code = 'auth_required';
    error.reason = observation.reason;
    throw error;
  }
}
