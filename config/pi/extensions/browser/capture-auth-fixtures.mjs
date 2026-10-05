import { createServer } from 'node:http';

export const contact = `<h1>Contact us</h1><form id="contact">
  <input id="name" aria-label="Name"><input id="email" type="email" autocomplete="email">
  <button id="save">Send</button></form><p id="receipt" hidden>Message sent</p>
  <script>document.querySelector('#contact').onsubmit = async e => {
    e.preventDefault(); await fetch('/submit', {method:'POST'});
    document.querySelector('#receipt').hidden = false;
  };</script>`;

export const login = `<h1>Sign in</h1><form id="login">
  <input id="username" autocomplete="username" aria-label="Email">
  <button id="signin">Continue</button></form>
  <script>document.querySelector('#username').oninput = () => fetch('/auth-input', {method:'POST'});
  document.querySelector('#login').onsubmit = e => {
    e.preventDefault(); fetch('/auth-submit', {method:'POST'});
  };</script>`;

export async function fixture(html = contact, routes = {}) {
  const counts = { submit: 0, authInput: 0, authSubmit: 0, credentialRead: 0 };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://local').pathname;
    const key = { '/submit': 'submit', '/auth-input': 'authInput', '/auth-submit': 'authSubmit',
      '/credential-read': 'credentialRead' }[path];
    if (req.method === 'POST' && key) { counts[key]++; res.end('ok'); return; }
    if (path === '/counts') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(counts)); return; }
    const route = routes[path];
    if (typeof route === 'function') return route(req, res);
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>Local fixture</title><style>body{font:18px sans-serif;padding:24px}input,button{margin:8px;padding:8px}</style>${route ?? html}`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, counts,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
