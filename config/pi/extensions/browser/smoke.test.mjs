import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);

test('headless Cutaway renders a playable journey with cursor movement and zoom', { timeout: 180_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-browser-smoke-'));
  try {
    await writeFile(join(dir, 'page.html'), `<!doctype html><title>Recording test</title>
      <style>body{font:20px sans-serif;padding:30px}button{margin:120px 0 0 380px;padding:20px}</style>
      <input id="name" aria-label="Name"><button id="submit" onclick="document.querySelector('#success').hidden=false">Submit</button>
      <p id="success" hidden>Saved</p>`);
    const plan = join(dir, 'plan.json');
    await writeFile(plan, JSON.stringify({ url: 'file:./page.html', viewport: { width: 1440, height: 810 },
      steps: [{ action: 'type', selector: '#name', text: 'Demo' },
        { action: 'click', selector: '#submit', expect: '#success' }] }));
    const output = join(dir, 'recording');
    await run(process.env.CUTAWAY_BIN || 'cutaway', ['record', plan, '--out', output, '--width', '640', '--height', '360', '--quality', 'standard'], { timeout: 160_000 });
    const timeline = JSON.parse(await readFile(join(output, 'timeline.json'), 'utf8'));
    const render = JSON.parse(await readFile(join(output, 'render.json'), 'utf8'));
    assert.equal(timeline.status, 'complete');
    assert(timeline.frames.length > 3, 'the screencast must contain moving frames');
    for (const frame of [timeline.frames[0], timeline.frames.at(-1)]) {
      const png = await readFile(join(output, frame.file));
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [2880, 1620]);
    }
    assert(timeline.points.length > 1, 'the pointer must move between actions');
    assert(render.motion.zoomEpisodes > 0, 'the camera must zoom into an interaction');
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', render.output]);
    assert(Number(stdout) > 0, 'the exported video must be playable');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('second form journey clicks custom radios and confirms its own success', { timeout: 180_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pi-browser-form-'));
  try {
    await writeFile(join(dir, 'page.html'), `<!doctype html><title>Local form fixture</title>
      <a href="#DRF-2">Demo Request Form 2</a>
      ${[1, 2, 3, 4, 5].map(i => `<form id="demo_request_form_${i}">
        ${i === 2 ? `<input name="Full-Name"><input name="Email"><input name="Company-Name">
          <select name="Industry"><option value="">Choose</option><option value="Technology">Technology</option></select>
          <select name="Product-Name"><option value="">Choose</option><option value="CRM Software">CRM Software</option></select>
          <label><span>Innovation</span><input name="Intended-Use" type="radio" value="Innovation" style="position:absolute;opacity:0;z-index:-1"></label>
          <textarea name="Comments"></textarea>
          <label><span>Online Search</span><input name="Hear-About-Us" type="radio" value="Online Search" style="position:absolute;opacity:0;z-index:-1"></label>
          <button type="submit">Submit</button>` : ''}
        </form><div class="sf-success-message w-form-done" hidden>Thank you!</div>`).join('')}
      <script>document.querySelector('#demo_request_form_2').addEventListener('submit', e => {
        e.preventDefault();
        if (e.target.querySelector('[name="Intended-Use"]:checked')?.value !== 'Innovation'
          || e.target.querySelector('[name="Hear-About-Us"]:checked')?.value !== 'Online Search'
          || e.target.querySelector('[name="Industry"]').value !== 'Technology'
          || e.target.querySelector('[name="Product-Name"]').value !== 'CRM Software') return;
        e.target.nextElementSibling.hidden = false;
      });</script>`);
    const plan = JSON.parse(await readFile(new URL('./demo-request-form-2.json', import.meta.url), 'utf8'));
    plan.url = 'file:./page.html';
    const path = join(dir, 'plan.json');
    await writeFile(path, JSON.stringify(plan));
    const output = join(dir, 'recording');
    await run(process.env.CUTAWAY_BIN || 'cutaway', ['record', path, '--out', output, '--capture-only'], { timeout: 160_000 });
    assert.equal(JSON.parse(await readFile(join(output, 'timeline.json'), 'utf8')).status, 'complete');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
