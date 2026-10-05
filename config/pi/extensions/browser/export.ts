import { chmod, link, lstat, mkdtemp, open, readFile, realpath, rmdir, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { crc32, inflateSync } from "node:zlib";

export type PiExec = (command: string, args: string[], options?: { signal?: AbortSignal; timeout?: number }) => Promise<{ code: number; stdout: string; stderr: string }>;
export type Phase = "validate" | "capture" | "render" | "convert" | "publish";
export type Artifacts = { workDirectory?: string; timeline?: string; frames?: string; render?: string; workflow?: string; mp4?: string; temporary?: string; destination?: string };
export type Timings = { saveAsSeconds?: number; browserSetupSeconds?: number; captureSeconds?: number; renderSeconds?: number; renderAttemptSeconds?: number; conversionSeconds?: number; publicationSeconds?: number; cli?: Record<string, number>; renderCli?: Record<string, number>; note: string };
export type Motion = { cursorPoints?: number; zoomEpisodes?: number; shots?: number; zoomedShare?: number; shortestZoomSeconds?: number | null; shortestOverviewGapSeconds?: number | null; skippedFocuses?: number; droppedShots?: number; sourceFpsDuringScroll?: number | null };
export type Evidence = {
  artifacts: Artifacts; captureStatus: string; businessOutcome: "unknown";
  businessEvidence: { completedSteps?: number; note: string };
  motion: Motion; renderMetrics?: Record<string, number>; timings: Timings;
};
export class ExportFailure extends Error {
  status = "failed" as const;
  code: "export_failed" | "cancelled";
  phase: Phase;
  artifacts: Artifacts;
  captureStatus: string;
  businessOutcome: "unknown";
  businessEvidence: Evidence["businessEvidence"];
  motion: Evidence["motion"];
  renderMetrics?: Record<string, number>;
  timings: Timings;
  constructor(error: unknown, phase: Phase, evidence: Evidence) {
    super(error instanceof SafeExportError ? error.message : `Export ${phase} failed; inspect retained artifacts without replaying capture`);
    this.name = "ExportFailure";
    this.code = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError") ? "cancelled" : "export_failed";
    this.phase = phase;
    this.artifacts = { ...evidence.artifacts };
    this.captureStatus = evidence.captureStatus;
    this.businessOutcome = evidence.businessOutcome;
    this.businessEvidence = evidence.businessEvidence;
    this.motion = evidence.motion;
    this.renderMetrics = evidence.renderMetrics;
    this.timings = evidence.timings;
  }
}
function evidence(workDirectory?: string): Evidence {
  return {
    artifacts: typeof workDirectory === "string" && isAbsolute(workDirectory) ? { workDirectory, timeline: join(workDirectory, "timeline.json"), frames: join(workDirectory, "frames"), render: join(workDirectory, "render.json"), workflow: join(workDirectory, "workflow.json") } : {},
    captureStatus: "unknown", businessOutcome: "unknown",
    businessEvidence: { note: "Cutaway 0.2 does not persist success expectations or business receipts; export cannot verify application outcome." },
    motion: {}, timings: { note: "CLI timings exclude model planning; conversion/publication measured separately." },
  };
}
class SafeExportError extends Error {}
function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}
async function realPath(path: string, directory = false) {
  requireValid(typeof path === "string" && isAbsolute(path) && resolve(path) === path, "Expected an absolute real path without symlinks");
  let info;
  try { info = await lstat(path); }
  catch (error: any) {
    // Check ancestors even for a missing leaf: a dangling alias is not a missing artifact.
    if (error.code === "ENOENT" && dirname(path) !== path) await realPath(dirname(path), true);
    throw error;
  }
  requireValid(!info.isSymbolicLink() && await realpath(path) === path, "Expected an absolute real path without symlinks");
  requireValid(directory ? info.isDirectory() : info.isFile(), "Invalid artifact shape");
  return path;
}
function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SafeExportError(message);
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function parseJson(text: string) {
  try { return JSON.parse(text); } catch { throw new SafeExportError("Malformed artifact JSON"); }
}
function contained(directory: string, path: string) {
  const part = relative(directory, path);
  requireValid(part !== "" && !part.startsWith("../") && part !== ".." && !isAbsolute(part), "Artifact path escapes capture directory");
  return path;
}
async function optionalJson(path: string) {
  try {
    await realPath(path);
    const value = parseJson(await readFile(path, "utf8"));
    requireValid(value && typeof value === "object" && !Array.isArray(value), "Malformed artifact metadata");
    return value;
  } catch (error: any) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}
// CDP and Playwright emit non-interlaced, 8-bit RGB/RGBA PNGs.
async function checkFrame(path: string, width: number, height: number) {
  await realPath(path);
  requireValid((await lstat(path)).size <= width * height * 4 + height + 1024 * 1024, "Oversized capture PNG");
  const data = await readFile(path);
  requireValid(data.length >= 45 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && data.toString("ascii", 12, 16) === "IHDR" && data.readUInt32BE(8) === 13
    && data.readUInt32BE(16) === width && data.readUInt32BE(20) === height
    && data[24] === 8 && [2, 6].includes(data[25]) && data[26] === 0 && data[27] === 0 && data[28] === 0,
  "Invalid capture PNG or inconsistent frame dimensions");
  const parts: Buffer[] = [];
  let offset = 8;
  let ended = false;
  while (offset + 12 <= data.length) {
    const size = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    requireValid(offset + size + 12 <= data.length, "Truncated capture PNG");
    requireValid(crc32(data.subarray(offset + 4, offset + size + 8)) === data.readUInt32BE(offset + size + 8), "Corrupt capture PNG checksum");
    if (type === "IDAT") parts.push(data.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
    if (type === "IEND") { ended = size === 0 && offset === data.length; break; }
  }
  requireValid(ended && parts.length, "Incomplete capture PNG");
  const stride = width * (data[25] === 6 ? 4 : 3) + 1;
  const pixels = inflateSync(Buffer.concat(parts), { maxOutputLength: stride * height });
  requireValid(pixels.length === stride * height, "Invalid capture PNG pixels");
  for (let row = 0; row < height; row++) requireValid(pixels[row * stride] <= 4, "Invalid PNG row filter");
}
async function metadata(result: Evidence) {
  const { artifacts } = result;
  const workflow = await optionalJson(artifacts.workflow!);
  const cli: Record<string, number> = {};
  const timingKeys = new Set(["preflightSeconds", "recordSeconds", "browserSetupSeconds", "videoSeconds", "exportSeconds", "totalSeconds"]);
  for (const [key, value] of Object.entries(workflow?.timings ?? {})) {
    if (finite(value) && value >= 0 && timingKeys.has(key)) cli[key] = value;
  }
  if (Object.keys(cli).length) result.timings.cli = cli;
  const render = await optionalJson(artifacts.render!);
  if (render) {
    requireValid(typeof render.output === "string" && isAbsolute(render.output), "Invalid rendered output path");
    artifacts.mp4 = contained(artifacts.workDirectory!, render.output);
    // Missing media may be recovered, but symlink escapes must never be followed.
    try { await realPath(artifacts.mp4); } catch (error: any) { if (error.code !== "ENOENT") throw error; }
    if (finite(render.renderSeconds) && render.renderSeconds >= 0) result.timings.renderSeconds = render.renderSeconds;
    const metrics: Record<string, number> = {};
    for (const key of ["width", "height", "fps", "duration", "capturedDuration", "contentDuration", "closingHoldSeconds", "capturedFrames", "outputFrames", "renderSeconds", "renderFps", "renderProcesses", "sampledPeakRssMB", "sourcePixelsPerOutputPixelAtMaxZoom"]) {
      if (finite(render[key]) && render[key] >= 0) metrics[key] = render[key];
    }
    if (Object.keys(metrics).length) result.renderMetrics = metrics;
    if (Number.isInteger(render.motion?.zoomEpisodes) && render.motion.zoomEpisodes >= 0) result.motion.zoomEpisodes = render.motion.zoomEpisodes;
    for (const key of ["shots", "zoomedShare", "shortestZoomSeconds", "shortestOverviewGapSeconds", "skippedFocuses", "droppedShots", "sourceFpsDuringScroll"] as const) {
      const value = render.motion?.[key];
      if (finite(value) && value >= 0) result.motion[key] = value;
    }
  }
  return render;
}
async function inspectCapture(workDirectory: string) {
  const result = evidence(workDirectory);
  let workValidated = false;
  try {
    await realPath(workDirectory, true);
    workValidated = true;
    await realPath(result.artifacts.timeline!);
    const capture = parseJson(await readFile(result.artifacts.timeline!, "utf8"));
    requireValid(capture && typeof capture === "object", "Malformed capture timeline");
    result.captureStatus = ["complete", "failed", "recording"].includes(capture.status) ? capture.status : "unknown";
    if (finite(capture.setupSeconds) && capture.setupSeconds >= 0) result.timings.browserSetupSeconds = capture.setupSeconds;
    if (finite(capture.duration) && capture.duration >= 0) result.timings.captureSeconds = capture.duration;
    if (Array.isArray(capture.steps)) {
      result.businessEvidence.completedSteps = 0;
      // Completed capture steps are facts, not proof of a business receipt.
      for (const step of capture.steps) {
        const times = [step?.start, step?.actionStart, step?.interactionEnd, step?.expectationEnd, step?.end];
        if (!times.every((value, index) => finite(value) && value >= 0 && value <= capture.duration + 0.25 && (index === 0 || value >= times[index - 1]))) break;
        result.businessEvidence.completedSteps++;
      }
    }
    const render = await metadata(result);
    requireValid(capture.status === "complete", "Cutaway capture is incomplete; verify application state separately");
    requireValid(capture.version === 1 && finite(capture.duration) && capture.duration > 0 && capture.duration <= 86400, "Invalid capture duration/version");
    const { width, height } = capture.viewport ?? {};
    requireValid([width, height].every(value => Number.isInteger(value) && value >= 320 && value <= 3840)
      && capture.capture?.format === "png" && finite(capture.capture.scale) && capture.capture.scale >= 1 && capture.capture.scale <= 3,
    "Invalid capture viewport/scale");
    const sourceWidth = Math.round(width * capture.capture.scale);
    const sourceHeight = Math.round(height * capture.capture.scale);
    requireValid(Math.max(sourceWidth, sourceHeight) <= 8192, "Invalid source dimensions");
    const time = (value: unknown) => finite(value) && value >= 0 && value <= capture.duration + 0.25;
    const series = (items: any[], key: string) => {
      requireValid(Array.isArray(items), `Missing capture ${key} series`);
      let previous = -1;
      for (const item of items) {
        requireValid(item && time(item[key]) && item[key] >= previous, `Inconsistent capture ${key} timing`);
        previous = item[key];
      }
    };
    series(capture.frames, "t");
    requireValid(capture.frames.length > 0 && capture.frames[0].t === 0, "Capture has no initial frame");
    await realPath(result.artifacts.frames!, true);
    const files = new Set<string>();
    for (const frame of capture.frames) {
      requireValid(typeof frame.file === "string" && !isAbsolute(frame.file) && frame.file.startsWith("frames/") && frame.file.endsWith(".png"), "Invalid relative capture frame path");
      const file = contained(result.artifacts.frames!, resolve(workDirectory, frame.file));
      requireValid(!files.has(file), "Duplicate capture frame");
      files.add(file);
      await checkFrame(file, sourceWidth, sourceHeight);
    }
    for (const key of ["points", "clicks", "focuses", "cursors", "keys"]) series(capture[key], "t");
    for (const point of [...capture.points, ...capture.clicks]) requireValid(finite(point.x) && finite(point.y), "Invalid cursor coordinates");
    for (const click of capture.clicks) requireValid(time(click.up) && click.up >= click.t, "Invalid click timing");
    for (const focus of capture.focuses) {
      requireValid([focus.x, focus.y, focus.width, focus.height].every(finite) && focus.width > 0 && focus.height > 0 && time(focus.end) && focus.end >= focus.t, "Invalid focus geometry/timing");
      for (const key of ["readyAt", "interactionEnd", "typingStart", "approachStart"]) if (focus[key] !== undefined) requireValid(time(focus[key]), "Invalid focus timing");
      if (focus.carets) { series(focus.carets, "t"); for (const caret of focus.carets) requireValid([caret.x, caret.y, caret.height].every(finite), "Invalid caret geometry"); }
      if (focus.result) requireValid(time(focus.result.t) && [focus.result.x, focus.result.y, focus.result.width, focus.result.height].every(finite), "Invalid result geometry");
    }
    for (const key of ["scrolls", "steps", "slowMotion"]) {
      if (key === "slowMotion" && capture[key] === undefined) continue;
      series(capture[key], "start");
      let previousEnd = 0;
      for (const span of capture[key]) {
        requireValid(time(span.end) && span.end >= span.start, "Incomplete capture step/span");
        if (key === "steps") requireValid(span.start >= previousEnd, "Overlapping capture steps");
        previousEnd = span.end;
        if (key === "steps") {
          requireValid(["click", "type", "press", "wait", "focus", "scroll", "upload"].includes(span.action), "Invalid capture action");
          let previous = span.start;
          for (const name of ["actionStart", "interactionEnd", "expectationEnd", "end"]) {
            requireValid(time(span[name]) && span[name] >= previous && span[name] <= span.end, "Incomplete capture step timing");
            previous = span[name];
          }
        }
        if (key === "slowMotion") requireValid(finite(span.factor) && span.factor > 0, "Invalid slow-motion factor");
      }
    }
    for (const cursor of capture.cursors) requireValid(["arrow", "text", "hand"].includes(cursor.type), "Invalid cursor type");
    for (const key of capture.keys) requireValid(typeof key.key === "string", "Invalid keyboard event");
    result.motion.cursorPoints = capture.points.length;
    result.businessEvidence.completedSteps = capture.steps.length;
    return { evidence: result, capture, render };
  } catch (error) {
    if (workValidated) try { await metadata(result); } catch { /* Preserve the primary validation failure. */ }
    throw new ExportFailure(error, "validate", result);
  }
}
export async function validateCapture(workDirectory: string): Promise<Evidence> {
  return (await inspectCapture(workDirectory)).evidence;
}
async function command(piExec: PiExec, executable: string, args: string[], signal?: AbortSignal) {
  aborted(signal);
  const result = await piExec(executable, args, { signal, timeout: 600_000 });
  aborted(signal);
  requireValid(result.code === 0, `${executable} failed`);
  return result.stdout;
}
function webmHeader(data: Buffer) {
  // FFprobe reports both Matroska and WebM as "matroska,webm"; verify EBML DocType too.
  const vint = (offset: number) => {
    let length = 1;
    let mask = 0x80;
    while (length <= 8 && !(data[offset] & mask)) { length++; mask >>= 1; }
    requireValid(length <= 8 && offset + length <= data.length, "Invalid EBML header");
    let value = data[offset] & (mask - 1);
    for (let i = 1; i < length; i++) value = value * 256 + data[offset + i];
    return { length, value };
  };
  requireValid(data.subarray(0, 4).toString("hex") === "1a45dfa3", "Invalid WebM container");
  const header = vint(4);
  const end = 4 + header.length + header.value;
  requireValid(end <= data.length, "Invalid WebM header length");
  for (let offset = 4 + header.length; offset < end;) {
    let idLength = 1;
    let mask = 0x80;
    while (!(data[offset] & mask) && idLength <= 4) { idLength++; mask >>= 1; }
    requireValid(idLength <= 4 && offset + idLength < end, "Invalid EBML element");
    const id = data.subarray(offset, offset + idLength).toString("hex");
    const size = vint(offset + idLength);
    const start = offset + idLength + size.length;
    requireValid(start + size.value <= end, "Invalid EBML element size");
    if (id === "4282") return data.toString("ascii", start, start + size.value) === "webm";
    offset = start + size.value;
  }
  return false;
}
async function playableVideo(piExec: PiExec, path: string, kind: "mp4" | "webm", signal?: AbortSignal, expectedDuration?: number, codecs = kind === "mp4" ? ["h264"] : ["vp9"]) {
  await realPath(path);
  // Read only the container header; never load a movie into memory.
  const file = await open(path, "r");
  let header: Buffer;
  try { const bytes = Buffer.alloc(4096); const read = await file.read(bytes, 0, bytes.length, 0); header = bytes.subarray(0, read.bytesRead); }
  finally { await file.close(); }
  if (kind === "webm") requireValid(webmHeader(header), "Expected WebM, not Matroska");
  else requireValid(header.length >= 16 && header.toString("ascii", 4, 8) === "ftyp"
    && /^(isom|iso[2-9]|mp4[12]|avc1)$/.test(header.toString("ascii", 8, 12)), "Expected MP4 container");
  const probe = parseJson(await command(piExec, "ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], signal));
  const videos = probe.streams?.filter((stream: any) => stream.codec_type === "video");
  requireValid(videos?.length === 1 && codecs.includes(videos[0].codec_name)
    && videos[0].width === 1280 && videos[0].height === 720, "Invalid video codec or dimensions");
  requireValid(typeof probe.format?.format_name === "string" && probe.format.format_name.split(",").includes(kind), "Invalid video container");
  const duration = Number(probe.format.duration ?? videos[0].duration);
  requireValid(finite(duration) && duration > 0 && duration <= 86400, "Invalid video duration");
  if (expectedDuration !== undefined) requireValid(Math.abs(duration - expectedDuration) <= 0.25, "Video duration disagrees with render evidence");
  const decoded = await command(piExec, "ffmpeg", ["-v", "error", "-xerror", "-i", path, "-map", "0:v:0", "-frames:v", "1", "-f", "framemd5", "-"], signal);
  requireValid(/^\s*0,\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*[a-f0-9]{32}\s*$/m.test(decoded), "Video contains no decodable frame");
  return { duration, codec: videos[0].codec_name as string };
}
function cinematic(result: Evidence, capture: any, report: any) {
  requireValid(report && report.width === 1280 && report.height === 720 && report.settings?.quality === "standard"
    && finite(report.duration) && report.duration > 0 && report.duration <= capture.duration + 10
    && finite(report.capturedDuration) && Math.abs(report.capturedDuration - capture.duration) <= 0.25
    // The report counts frames after pacing; it need not equal the source count.
    && Number.isInteger(report.capturedFrames) && report.capturedFrames > 0 && report.capturedFrames <= capture.frames.length
    && Number.isInteger(report.fps) && report.fps >= 24 && report.fps <= 60
    && report.outputFrames === Math.ceil(report.duration * report.fps)
    && Number.isInteger(result.motion.zoomEpisodes), "Invalid cinematic render evidence");
  if (capture.steps.some((step: any) => step.action === "click" || step.action === "type")) {
    requireValid((result.motion.cursorPoints ?? 0) >= 2 && result.motion.zoomEpisodes! >= 1, "Cinematic motion missing from interactive journey");
  }
}
async function destinationPath(destination: string) {
  requireValid(typeof destination === "string" && isAbsolute(destination) && resolve(destination) === destination && destination.endsWith(".webm"), "Expected absolute .webm destination path");
  await realPath(dirname(destination), true);
  try { await lstat(destination); throw new SafeExportError("Destination already exists; refusing overwrite"); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
}
async function cleanup(directory: string | undefined, files: string[]) {
  const warnings: string[] = [];
  for (const file of files) {
    try { await unlink(file); } catch (error: any) { if (error.code !== "ENOENT") warnings.push(`Retained owned temporary file: ${file}`); }
  }
  if (directory) try { await rmdir(directory); } catch (error: any) { if (error.code !== "ENOENT") warnings.push(`Retained temporary directory: ${directory}`); }
  return warnings;
}
async function convertWebm(piExec: PiExec, source: string, destination: string, result: Evidence, signal?: AbortSignal) {
  const start = performance.now();
  try {
    await realPath(source);
    await command(piExec, "ffmpeg", ["-v", "error", "-n", "-i", source, "-an", "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", destination], signal);
  } finally { result.timings.conversionSeconds = (performance.now() - start) / 1000; }
}
async function publish(result: Evidence, temporary: string, destination: string, signal?: AbortSignal) {
  const start = performance.now();
  try {
    aborted(signal);
    await realPath(temporary);
    await destinationPath(destination);
    await chmod(temporary, 0o600);
    aborted(signal);
    await link(temporary, destination); // Atomic no-clobber commit. Never remove destination in a catch path.
  } finally { result.timings.publicationSeconds = (performance.now() - start) / 1000; }
  return { ...result, status: "published" as const, path: destination, cleanupWarnings: [] as string[] };
}
export async function finishExport(piExec: PiExec, workDirectory: string, destination: string, { signal }: { signal?: AbortSignal } = {}) {
  let result = evidence(workDirectory);
  if (typeof destination === "string" && isAbsolute(destination)) result.artifacts.destination = destination;
  let phase: Phase = "validate";
  let temporaryDirectory: string | undefined;
  const owned: string[] = [];
  try {
    aborted(signal);
    const inspected = await inspectCapture(workDirectory);
    result = inspected.evidence;
    const { capture } = inspected;
    let render = inspected.render;
    if (typeof destination === "string" && isAbsolute(destination)) result.artifacts.destination = destination;
    await destinationPath(destination);
    let mp4 = result.artifacts.mp4 ?? contained(workDirectory, join(workDirectory, "video.mp4"));
    result.artifacts.mp4 = mp4;
    // Reject aliases even when probing fails: only missing/corrupt media permits rendering.
    try { await realPath(mp4); } catch (error: any) { if (error.code !== "ENOENT") throw error; }
    let verified = false;
    try { await playableVideo(piExec, mp4, "mp4", signal, render?.duration); verified = true; }
    catch (error) {
      aborted(signal);
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw error;
    }
    if (!verified) {
      phase = "render";
      await realPath(workDirectory, true);
      const renderDirectory = await mkdtemp(join(workDirectory, ".pi-render-"));
      mp4 = join(renderDirectory, "video.mp4");
      result.artifacts.mp4 = mp4;
      const start = performance.now();
      try {
        await command(piExec, "cutaway", ["render", workDirectory, "--output", mp4, "--width", "1280", "--height", "720", "--quality", "standard"], signal);
      } finally { result.timings.renderAttemptSeconds = (performance.now() - start) / 1000; }
      const refreshed = await inspectCapture(workDirectory);
      requireValid(JSON.stringify(refreshed.capture) === JSON.stringify(capture) && refreshed.evidence.artifacts.mp4 === mp4, "Capture/render evidence changed during export");
      render = refreshed.render;
      result.motion = refreshed.evidence.motion;
      result.renderMetrics = refreshed.evidence.renderMetrics;
      result.timings.renderSeconds = refreshed.evidence.timings.renderSeconds;
      if (refreshed.evidence.timings.cli) result.timings.renderCli = refreshed.evidence.timings.cli;
      await playableVideo(piExec, mp4, "mp4", signal, render?.duration);
    }
    phase = "convert";
    cinematic(result, capture, render);
    temporaryDirectory = await mkdtemp(join(dirname(destination), ".pi-export-"));
    const temporary = join(temporaryDirectory, "video.webm");
    result.artifacts.temporary = temporary;
    owned.push(temporary);
    await convertWebm(piExec, mp4, temporary, result, signal);
    await playableVideo(piExec, temporary, "webm", signal, render.duration);
    cinematic(result, capture, render);
    phase = "publish";
    const success = await publish(result, temporary, destination, signal);
    success.cleanupWarnings = await cleanup(temporaryDirectory, owned);
    return success;
  } catch (error) {
    await cleanup(temporaryDirectory, owned);
    if (error instanceof ExportFailure) {
      error.phase = phase;
      error.artifacts = { ...result.artifacts, ...error.artifacts };
      error.timings = { ...result.timings, ...error.timings };
      throw error;
    }
    // A renderer may have written metrics before its process was interrupted.
    if (phase === "render") {
      try {
        const retained = evidence(workDirectory);
        await metadata(retained);
        result.timings.renderSeconds = retained.timings.renderSeconds ?? result.timings.renderSeconds;
        if (retained.timings.cli) result.timings.renderCli = retained.timings.cli;
        result.motion = { ...result.motion, ...retained.motion, cursorPoints: result.motion.cursorPoints };
      } catch { /* Keep the primary failure; malformed metadata never grants recovery permission. */ }
    }
    throw new ExportFailure(error, phase, result);
  }
}
/** The caller closes the recording context first. saveAs has no native cancellation:
 * an abort prevents subsequent conversion/publication, but we await it before cleanup.
 */
export async function publishLive(piExec: PiExec, video: { saveAs(path: string): Promise<void> }, destination: string, { signal }: { signal?: AbortSignal } = {}) {
  const result = evidence();
  if (typeof destination === "string" && isAbsolute(destination)) result.artifacts.destination = destination;
  let phase: Phase = "validate";
  let temporaryDirectory: string | undefined;
  const owned: string[] = [];
  try {
    aborted(signal);
    await destinationPath(destination);
    temporaryDirectory = await mkdtemp(join(dirname(destination), ".pi-export-"));
    let temporary = join(temporaryDirectory, "live.webm");
    result.artifacts.temporary = temporary;
    owned.push(temporary);
    phase = "capture";
    const start = performance.now();
    try { aborted(signal); await video.saveAs(temporary); }
    finally { result.timings.saveAsSeconds = (performance.now() - start) / 1000; }
    aborted(signal);
    phase = "validate";
    const source = await playableVideo(piExec, temporary, "webm", signal, undefined, ["vp8", "vp9"]);
    result.captureStatus = "complete";
    result.timings.captureSeconds = source.duration;
    if (source.codec !== "vp9") {
      phase = "convert";
      const output = join(temporaryDirectory, "video.webm");
      owned.push(output);
      await convertWebm(piExec, temporary, output, result, signal);
      temporary = output;
      result.artifacts.temporary = temporary;
    }
    await playableVideo(piExec, temporary, "webm", signal, source.duration);
    phase = "publish";
    const success = await publish(result, temporary, destination, signal);
    success.cleanupWarnings = await cleanup(temporaryDirectory, owned);
    return success;
  } catch (error) {
    await cleanup(temporaryDirectory, owned);
    throw new ExportFailure(error, phase, result);
  }
}
