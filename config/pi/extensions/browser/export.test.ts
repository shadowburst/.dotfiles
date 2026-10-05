import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { validateCapture, finishExport, publishLive } from "./export.ts";

const noExec = async () => { throw new Error("No command is permitted for invalid capture evidence"); };

const exec = promisify(execFile);
const piExec = async (command: string, args: string[], options: { signal?: AbortSignal } = {}) => {
  try {
    const { stdout, stderr } = await exec(command, args, { signal: options.signal, maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (error: any) {
    if (error.name === "AbortError") throw error;
    return { code: Number(error.code) || 1, stdout: error.stdout ?? "", stderr: error.stderr ?? error.message };
  }
};
async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), "pi-export-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const work = join(root, "capture");
  await mkdir(join(work, "frames"), { recursive: true });
  await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x320", "-frames:v", "1", join(work, "frames/000000.png")]);
  const capture = {
    version: 1, status: "complete", viewport: { width: 320, height: 320 }, capture: { scale: 1, format: "png" },
    duration: 1, setupSeconds: 0.125, frames: [{ t: 0, file: "frames/000000.png" }],
    points: [], clicks: [], focuses: [], steps: [], scrolls: [], cursors: [], keys: [],
  };
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  return { root, work, capture, destination: join(root, "take.webm") };
}

async function playable(work: string) {
  const output = join(work, "video.mp4");
  await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=1280x720:r=24:d=1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", output]);
  await writeFile(join(work, "render.json"), JSON.stringify({
    output, duration: 1, capturedDuration: 1, width: 1280, height: 720, fps: 24,
    capturedFrames: 1, outputFrames: 24, renderSeconds: 0.75,
    settings: { quality: "standard" }, motion: { zoomEpisodes: 0 },
  }));
  await writeFile(join(work, "workflow.json"), JSON.stringify({ command: "record", timings: { preflightSeconds: 0.25, recordSeconds: 1.125, exportSeconds: 0.75 } }));
  return output;
}

test("validateCapture returns capture evidence, not an invented business receipt", async t => {
  const { work } = await fixture(t);
  const result = await validateCapture(work);
  assert.equal("capture" in result, false);
  assert.equal("render" in result, false);
  assert.equal("workflow" in result, false);
  assert.equal(result.captureStatus, "complete");
  assert.equal(result.businessOutcome, "unknown");
  assert.equal(result.timings.browserSetupSeconds, 0.125);
  assert.equal(result.artifacts.timeline, join(work, "timeline.json"));
});

test("failed capture retains its failure and never becomes evidence of an uncommitted write", async t => {
  const { work, capture } = await fixture(t);
  capture.status = "failed";
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  await assert.rejects(validateCapture(work), (error: any) => {
    assert.equal(error.phase, "validate");
    assert.equal(error.captureStatus, "failed");
    assert.equal(error.businessOutcome, "unknown");
    assert.equal(error.artifacts.timeline, join(work, "timeline.json"));
    return true;
  });
  assert.equal(JSON.parse(await readFile(join(work, "timeline.json"), "utf8")).status, "failed");
});

test("recovery rejects missing, inconsistent and escaping capture artifacts before executing anything", async t => {
  const { work, capture, root, destination } = await fixture(t);
  for (const change of [
    { frames: [] }, { duration: -1 }, { frames: [{ t: 2, file: "frames/000000.png" }] },
    { frames: [{ t: 0, file: "../outside.png" }] },
    { frames: [{ t: 0, file: join(work, "frames/000000.png") }] },
    { frames: [{ t: 0, file: "frames/missing.png" }] },
    { frames: [{ t: 0.2, file: "frames/000000.png" }, { t: 0, file: "frames/000000.png" }] },
    { points: [{ t: 0.2, x: "bad", y: 1 }] },
    { steps: [{ action: "click", start: 0.5 }] },
    { viewport: { width: 640, height: 320 } },
  ]) {
    await writeFile(join(work, "timeline.json"), JSON.stringify({ ...capture, ...change }));
    await assert.rejects(finishExport(noExec, work, destination), (error: any) => error.phase === "validate");
  }
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  const outside = join(root, "outside.png");
  await copyFile(join(work, "frames/000000.png"), outside);
  await rm(join(work, "frames/000000.png"));
  await symlink(outside, join(work, "frames/000000.png"));
  await assert.rejects(validateCapture(work), /symlink|real path/);
  await assert.rejects(validateCapture("relative"), /absolute/);
  const alias = join(root, "alias");
  await symlink(work, alias);
  await assert.rejects(validateCapture(alias), /symlink|real path/);
});

test("completed capture with verified MP4 converts without recapture or rendering and preserves timings", async t => {
  const { work, destination } = await fixture(t);
  const mp4 = await playable(work);
  const exportOnly: typeof piExec = (command, args, options) => {
    assert.ok(["ffprobe", "ffmpeg"].includes(command), `Recovery must not run ${command}`);
    return piExec(command, args, options);
  };
  const result = await finishExport(exportOnly, work, destination);
  assert.equal(result.status, "published");
  assert.equal(result.path, destination);
  assert.equal(result.businessOutcome, "unknown");
  assert.equal(result.timings.cli?.recordSeconds, 1.125);
  assert.equal(result.timings.renderSeconds, 0.75);
  assert.ok(result.timings.conversionSeconds! > 0);
  assert.ok(result.timings.publicationSeconds! >= 0);
  const probe = JSON.parse((await exec("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", destination])).stdout);
  assert.equal(probe.streams[0].codec_name, "vp9");
  assert.equal(probe.streams[0].width, 1280);
  assert.equal(probe.streams[0].height, 720);
  assert.equal((await readFile(destination)).subarray(0, 4).toString("hex"), "1a45dfa3");
  assert.ok((await readFile(mp4)).length);
  assert.equal((await readdir(join(work, ".."))).some(name => name.startsWith(".pi-export-")), false);
});

test("capture-only recovery renders with real Cutaway and remains retryable after conversion failure", async t => {
  const { work, destination } = await fixture(t);
  await writeFile(join(work, "video.mp4"), "interrupted MP4");
  let renders = 0;
  const renderThenFail: typeof piExec = async (command, args, options) => {
    if (command === "cutaway") { assert.equal(args[0], "render"); renders++; }
    else assert.ok(["ffmpeg", "ffprobe"].includes(command));
    if (command === "ffmpeg" && args.includes("libvpx-vp9")) return { code: 1, stdout: "", stderr: "synthetic-secret" };
    return piExec(command, args, options);
  };
  await assert.rejects(finishExport(renderThenFail, work, destination), (error: any) => {
    assert.equal(error.phase, "convert");
    assert.equal(error.captureStatus, "complete");
    assert.ok(error.timings.renderSeconds > 0);
    assert.ok(error.timings.conversionSeconds >= 0);
    assert.equal(JSON.stringify(error).includes("synthetic-secret"), false);
    assert.ok(error.artifacts.mp4.startsWith(work + "/"));
    return true;
  });
  assert.equal(renders, 1);
  const convertOnly: typeof piExec = (command, args, options) => {
    assert.notEqual(command, "cutaway");
    return piExec(command, args, options);
  };
  assert.equal((await finishExport(convertOnly, work, destination)).status, "published");
});

test("live saveAs uses an owned destination-side file and publishes validated VP9", async t => {
  const { root, destination } = await fixture(t);
  const original = join(root, "playwright.webm");
  await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=1280x720:r=24:d=1", "-c:v", "libvpx", original]);
  const video = { async saveAs(path: string) {
    assert.notEqual(path, destination);
    assert.ok(path.startsWith(join(root, ".pi-export-")));
    await copyFile(original, path);
  } };
  const exportOnly: typeof piExec = (command, args, options) => {
    assert.ok(["ffprobe", "ffmpeg"].includes(command));
    return piExec(command, args, options);
  };
  const result = await publishLive(exportOnly, video, destination);
  assert.equal(result.status, "published");
  assert.equal(result.captureStatus, "complete");
  assert.equal(result.businessOutcome, "unknown");
  assert.ok(result.timings.saveAsSeconds! >= 0);
  assert.equal(JSON.parse((await exec("ffprobe", ["-v", "error", "-show_streams", "-of", "json", destination])).stdout).streams[0].codec_name, "vp9");
  assert.ok((await readFile(original)).length);
});

test("capture validation rejects dangling symlink escapes and PNG corruption", async t => {
  const { work, root } = await fixture(t);
  const frame = join(work, "frames/000000.png");
  const png = await readFile(frame);
  png[png.length - 1] ^= 1; // Broken IEND CRC, even though compressed pixels remain valid.
  await writeFile(frame, png);
  await assert.rejects(validateCapture(work));
  await symlink(join(root, "not-yet-existing"), join(work, "escape"));
  await writeFile(join(work, "render.json"), JSON.stringify({ output: join(work, "escape", "missing.mp4") }));
  await assert.rejects(validateCapture(work), /symlink|real path/);
});

test("publication is no-clobber under competing exports and never deletes existing output", async t => {
  const { work, destination, root } = await fixture(t);
  await playable(work);
  const attempts = await Promise.allSettled([
    finishExport(piExec, work, destination), finishExport(piExec, work, destination),
  ]);
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  const failure = attempts.find(result => result.status === "rejected") as PromiseRejectedResult;
  assert.equal(failure.reason.phase, "publish");
  assert.ok(failure.reason.timings.publicationSeconds >= 0);
  const original = await readFile(destination);
  await assert.rejects(finishExport(noExec, work, destination));
  assert.deepEqual(await readFile(destination), original);
  assert.equal((await readdir(root)).some(name => name.startsWith(".pi-export-")), false);
});

test("successful publication survives cleanup failure and removes only owned files", async t => {
  const { work, destination } = await fixture(t);
  await playable(work);
  let unowned = "";
  const leaveUnowned: typeof piExec = async (command, args, options) => {
    const result = await piExec(command, args, options);
    if (command === "ffmpeg" && args.includes("libvpx-vp9")) {
      unowned = join(args.at(-1)!, "..", "unowned.txt");
      await writeFile(unowned, "Do not remove me");
    }
    return result;
  };
  const success = await finishExport(leaveUnowned, work, destination);
  assert.equal(success.status, "published");
  assert.ok(success.cleanupWarnings.length);
  assert.equal(await readFile(unowned, "utf8"), "Do not remove me");
  assert.ok((await readFile(destination)).length);
});

test("render failure retains complete capture, known metrics and never returns secrets", async t => {
  const { work, destination, capture } = await fixture(t);
  await writeFile(join(work, "workflow.json"), JSON.stringify({ plan: "secret-plan", timings: { recordSeconds: 1.125, secretSeconds: 100 } }));
  const failRender: typeof piExec = async (command, args) => {
    assert.equal(command, "cutaway"); assert.equal(args[0], "render");
    return { code: 1, stdout: "secret-stdout", stderr: "secret-stderr" };
  };
  await assert.rejects(finishExport(failRender, work, destination), (error: any) => {
    assert.equal(error.phase, "render");
    assert.equal(error.captureStatus, "complete");
    assert.equal(error.timings.cli.recordSeconds, 1.125);
    assert.ok(error.timings.renderAttemptSeconds >= 0);
    assert.equal(JSON.stringify(error).includes("secret"), false);
    assert.equal(error.message.includes("secret"), false);
    return true;
  });
  assert.deepEqual(JSON.parse(await readFile(join(work, "timeline.json"), "utf8")), capture);
});

test("metadata returned on success and malformed-artifact failures contains no source field values", async t => {
  const { work, destination, capture } = await fixture(t);
  Object.assign(capture, { url: "https://example.test/?token=synthetic-secret", error: "synthetic-secret", console: "synthetic-secret" });
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  await playable(work);
  assert.equal(JSON.stringify(await finishExport(piExec, work, destination)).includes("synthetic-secret"), false);
  await writeFile(join(work, "timeline.json"), '{"status":"synthetic-secret",bad');
  await assert.rejects(validateCapture(work), (error: any) => {
    assert.equal(`${error.message}${JSON.stringify(error)}`.includes("synthetic-secret"), false);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test("aborts cannot publish, leak custom reasons or continue into rendering", async t => {
  const { work, destination, root } = await fixture(t);
  await playable(work);
  const before = new AbortController(); before.abort(new Error("synthetic-secret"));
  await assert.rejects(finishExport(noExec, work, destination, { signal: before.signal }), (error: any) => error.code === "cancelled" && !error.message.includes("synthetic-secret"));
  const during = new AbortController();
  const abortConversion: typeof piExec = async (command, args, options) => {
    assert.notEqual(command, "cutaway");
    const result = await piExec(command, args, options);
    if (command === "ffmpeg" && args.includes("libvpx-vp9")) during.abort(new Error("synthetic-secret"));
    return result;
  };
  await assert.rejects(finishExport(abortConversion, work, destination, { signal: during.signal }), (error: any) => {
    assert.equal(error.code, "cancelled"); assert.equal(error.phase, "convert");
    assert.equal(error.captureStatus, "complete"); assert.ok(error.timings.conversionSeconds >= 0);
    return true;
  });
  await assert.rejects(readFile(destination), { code: "ENOENT" });
  assert.equal((await readdir(root)).some(name => name.startsWith(".pi-export-")), false);
});

test("live abort waits for saveAs before cleanup and leaves the Video retryable", async t => {
  const { destination, root } = await fixture(t);
  const abort = new AbortController();
  let savedPath = "";
  const video = { async saveAs(path: string) { savedPath = path; abort.abort(); await new Promise(resolve => setTimeout(resolve, 10)); await writeFile(path, "still pending until this write"); } };
  await assert.rejects(publishLive(noExec, video, destination, { signal: abort.signal }), (error: any) => {
    assert.equal(error.code, "cancelled"); assert.equal(error.phase, "capture");
    assert.ok(error.timings.saveAsSeconds >= 0); return true;
  });
  await assert.rejects(readFile(savedPath), { code: "ENOENT" });
  await assert.rejects(readFile(destination), { code: "ENOENT" });
  assert.equal((await readdir(root)).some(name => name.startsWith(".pi-export-")), false);
});

test("codec, dimensions, duration and WebM DocType are checked before publication", async t => {
  const { work, destination, root } = await fixture(t);
  await playable(work);
  for (const [codec, size, duration, container] of [
    ["libvpx", "1280x720", "1", "webm"],
    ["libvpx-vp9", "320x320", "1", "webm"],
    ["libvpx-vp9", "1280x720", "0.2", "webm"],
    ["libvpx-vp9", "1280x720", "1", "matroska"],
  ]) {
    const corruptConversion: typeof piExec = async (command, args, options) => {
      assert.notEqual(command, "cutaway");
      if (command === "ffmpeg" && args.includes("libvpx-vp9")) {
        return piExec(command, ["-v", "error", "-f", "lavfi", "-i", `color=c=blue:s=${size}:r=24:d=${duration}`, "-c:v", codec, "-f", container, args.at(-1)!], options);
      }
      return piExec(command, args, options);
    };
    await assert.rejects(finishExport(corruptConversion, work, destination), (error: any) => error.phase === "convert" && error.captureStatus === "complete");
    await assert.rejects(readFile(destination), { code: "ENOENT" });
  }
  assert.equal((await readdir(root)).some(name => name.startsWith(".pi-export-")), false);
});

test("interactive capture requires cinematic cursor and zoom evidence", async t => {
  const { work, capture, destination } = await fixture(t);
  await playable(work);
  Object.assign(capture, {
    points: [{ t: 0, x: 100, y: 100 }, { t: 0.1, x: 120, y: 120 }],
    steps: [{ action: "click", start: 0, actionStart: 0.1, interactionEnd: 0.2, expectationEnd: 0.3, end: 0.4 }],
  });
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  await assert.rejects(finishExport(piExec, work, destination), /Cinematic motion/);
  const report = JSON.parse(await readFile(join(work, "render.json"), "utf8"));
  report.motion.zoomEpisodes = 1;
  await writeFile(join(work, "render.json"), JSON.stringify(report));
  const success = await finishExport(piExec, work, destination);
  assert.equal(success.motion.zoomEpisodes, 1);
  assert.equal(success.businessEvidence.completedSteps, 1);
  assert.equal(success.businessOutcome, "unknown");
});

test("failed capture preserves completed-step metadata and interrupted render timings", async t => {
  const { work, capture } = await fixture(t);
  await playable(work);
  Object.assign(capture, { status: "failed", steps: [
    { action: "click", start: 0, actionStart: 0.1, interactionEnd: 0.2, expectationEnd: 0.3, end: 0.4 },
    { action: "click", start: 0.5 },
  ] });
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  await assert.rejects(validateCapture(work), (error: any) => {
    assert.equal(error.captureStatus, "failed");
    assert.equal(error.businessOutcome, "unknown");
    assert.equal(error.businessEvidence.completedSteps, 1);
    assert.equal(error.timings.renderSeconds, 0.75);
    return true;
  });
});

test("a container/probe success without a decoded frame cannot be published", async t => {
  const { work, destination } = await fixture(t);
  await playable(work);
  const noDecodedFrame: typeof piExec = async (command, args, options) => {
    if (command === "ffmpeg" && args.includes("framemd5") && args.some(arg => arg.endsWith("video.webm"))) {
      return { code: 0, stdout: "#format: frame checksums\n", stderr: "" };
    }
    return piExec(command, args, options);
  };
  await assert.rejects(finishExport(noDecodedFrame, work, destination), /no decodable frame/);
  await assert.rejects(readFile(destination), { code: "ENOENT" });
});

test("paced renders may retain fewer frames than the original capture, but never zero or more", async t => {
  const { work, capture, destination } = await fixture(t);
  await playable(work);
  await copyFile(join(work, "frames/000000.png"), join(work, "frames/000001.png"));
  capture.frames.push({ t: 0.9, file: "frames/000001.png" });
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  const reportPath = join(work, "render.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  for (const capturedFrames of [0, 3, 1.5]) {
    await writeFile(reportPath, JSON.stringify({ ...report, capturedFrames }));
    await assert.rejects(finishExport(piExec, work, destination), /Invalid cinematic render evidence/);
  }
  await writeFile(reportPath, JSON.stringify(report)); // One paced frame, two valid source frames.
  assert.equal((await finishExport(piExec, work, destination)).status, "published");
});

test("real Cutaway renders interactive cursor/zoom evidence at standard 720p", async t => {
  const { work, capture, destination } = await fixture(t);
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=1280x720", "-frames:v", "1", join(work, "frames/000000.png")]);
  Object.assign(capture, {
    viewport: { width: 1280, height: 720 }, duration: 5.4,
    points: [{ t: 0, x: 640, y: 400 }, { t: 0.1, x: 640, y: 400 }, { t: 0.4, x: 240, y: 200 }],
    clicks: [{ t: 0.5, up: 0.6, x: 240, y: 200 }],
    focuses: [{ t: 0.4, readyAt: 0.1, end: 0.8, action: "click", x: 168, y: 168, width: 200, height: 72,
      result: { t: 0.8, x: 70, y: 400, width: 220, height: 32 } }],
    steps: [{ action: "click", start: 0, actionStart: 0.5, interactionEnd: 0.6, expectationEnd: 0.8, end: 1.4 }],
  });
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  const exportOnly: typeof piExec = (command, args, options) => {
    if (command === "cutaway") assert.equal(args[0], "render");
    else assert.ok(["ffmpeg", "ffprobe"].includes(command));
    return piExec(command, args, options);
  };
  const result = await finishExport(exportOnly, work, destination);
  assert.equal(result.status, "published");
  assert.ok(result.motion.zoomEpisodes! >= 1);
  assert.equal(result.motion.cursorPoints, 3);
  assert.equal(result.businessOutcome, "unknown");
});

test("export metadata exposes only whitelisted finite numeric renderMetrics and motion", async t => {
  const { work, capture } = await fixture(t);
  await playable(work);
  const reportPath = join(work, "render.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  Object.assign(report, {
    contentDuration: 0.9, closingHoldSeconds: 0.1, renderFps: 32, renderProcesses: 2, sampledPeakRssMB: 64,
    sourcePixelsPerOutputPixelAtMaxZoom: 1.5, privateNumericMetric: 123,
    note: "synthetic-secret", settings: { quality: "standard", privateValue: "synthetic-secret" },
    motion: { zoomEpisodes: 0, shots: 2, zoomedShare: 0.6, shortestZoomSeconds: 0.25,
      shortestOverviewGapSeconds: null, skippedFocuses: 1, droppedShots: 0, sourceFpsDuringScroll: 30,
      privateNumericMetric: 123, privateValue: "synthetic-secret" },
  });
  await writeFile(reportPath, JSON.stringify(report));
  const check = (result: any) => {
    assert.ok(result.renderMetrics, "Public evidence must include renderMetrics");
    for (const [key, value] of Object.entries({ width: 1280, height: 720, fps: 24, duration: 1, capturedDuration: 1,
      contentDuration: 0.9, closingHoldSeconds: 0.1, capturedFrames: 1, outputFrames: 24, renderFps: 32,
      renderProcesses: 2, sampledPeakRssMB: 64, sourcePixelsPerOutputPixelAtMaxZoom: 1.5 })) {
      assert.equal(result.renderMetrics[key], value, key);
    }
    const allowed = new Set(["width", "height", "fps", "duration", "capturedDuration", "contentDuration", "closingHoldSeconds",
      "capturedFrames", "outputFrames", "renderSeconds", "renderFps", "renderProcesses", "sampledPeakRssMB", "sourcePixelsPerOutputPixelAtMaxZoom"]);
    for (const [key, value] of Object.entries(result.renderMetrics)) {
      assert.ok(allowed.has(key), `Unwhitelisted render metric: ${key}`);
      assert.ok(typeof value === "number" && Number.isFinite(value) && value >= 0);
    }
    assert.equal(result.motion.shots, 2);
    assert.equal(result.motion.zoomedShare, 0.6);
    assert.equal(result.motion.shortestZoomSeconds, 0.25);
    assert.equal(result.motion.skippedFocuses, 1);
    assert.equal(result.motion.droppedShots, 0);
    assert.equal(result.motion.sourceFpsDuringScroll, 30);
    assert.equal("privateNumericMetric" in result.motion, false);
    assert.equal("privateValue" in result.motion, false);
    assert.equal(JSON.stringify(result).includes("synthetic-secret"), false);
  };
  check(await validateCapture(work));
  capture.status = "failed";
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  await assert.rejects(validateCapture(work), (error: any) => { check(error); return true; });
  capture.status = "complete";
  await writeFile(join(work, "timeline.json"), JSON.stringify(capture));
  Object.assign(report, { renderFps: "synthetic-secret", sampledPeakRssMB: -1, sourcePixelsPerOutputPixelAtMaxZoom: null });
  Object.assign(report.motion, { zoomedShare: "synthetic-secret", shortestZoomSeconds: -1, sourceFpsDuringScroll: null });
  await writeFile(reportPath, JSON.stringify(report));
  const filtered: any = await validateCapture(work);
  for (const key of ["renderFps", "sampledPeakRssMB", "sourcePixelsPerOutputPixelAtMaxZoom"]) assert.equal(key in filtered.renderMetrics, false);
  for (const key of ["zoomedShare", "shortestZoomSeconds", "sourceFpsDuringScroll"]) assert.equal(key in filtered.motion, false);
  assert.equal(JSON.stringify(filtered).includes("synthetic-secret"), false);
});

test("missing timeline still reports available safe workflow timings", async t => {
  const { work } = await fixture(t);
  await playable(work);
  await rm(join(work, "timeline.json"));
  await assert.rejects(validateCapture(work), (error: any) => {
    assert.equal(error.phase, "validate"); assert.equal(error.captureStatus, "unknown");
    assert.equal(error.timings.cli.recordSeconds, 1.125);
    return true;
  });
});
