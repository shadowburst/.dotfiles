import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);

test('headed Cutaway renders a playable journey with cursor movement and zoom', { timeout: 180_000 }, async () => {
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
    await run(process.env.CUTAWAY_BIN || 'cutaway', ['record', plan, '--out', output, '--headed', '--width', '640', '--height', '360', '--quality', 'standard'], { timeout: 160_000 });
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
