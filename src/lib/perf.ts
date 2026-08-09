/**
 * Render timing.
 *
 * WHY THIS EXISTS
 *
 * Every previous attempt to make bulk rendering faster was a guess. Three
 * separate causes were identified and fixed across V05.04 and V05.05 without a
 * single before-and-after measurement, and at least one of those fixes
 * plausibly made throughput worse: resolving the brand marks to data URLs
 * removed three fetches per row but added ~160 KB of base64 to every
 * serialisation.
 *
 * So the render path now times itself. The cost is two `performance.now()`
 * calls per export, which is nothing next to a 2160x2700 rasterisation, and it
 * means any claim about speed can be checked instead of believed.
 *
 * The buffer is capped so a five-hundred-row run cannot grow it without bound,
 * and `takeTimings` drains it, so a harness reads each run exactly once.
 */

export interface RenderTiming {
  /** Waiting for fonts, images and codes to be ready. */
  settle: number;
  /** html-to-image plus PNG compression, end to end. */
  raster: number;
  /** Clone, inline styles, serialise to SVG, decode, draw to canvas. */
  serialise: number;
  /** canvas.toBlob. Pure PNG compression, and a function of pixel count. */
  encode: number;
  /** Bytes of PNG produced, so quality regressions show up as a size drop. */
  bytes: number;
  /** card | pfp | team */
  format: string;
  pixelRatio: number;
}

const MAX_SAMPLES = 2000;

const buffer: RenderTiming[] = [];

export function recordTiming(timing: RenderTiming): void {
  buffer.push(timing);
  if (buffer.length > MAX_SAMPLES) buffer.shift();
}

/** Drains the buffer. */
export function takeTimings(): RenderTiming[] {
  return buffer.splice(0, buffer.length);
}

export function summarise(samples: RenderTiming[]) {
  if (samples.length === 0) return null;

  const sorted = (pick: (t: RenderTiming) => number) =>
    samples.map(pick).sort((a, b) => a - b);
  const median = (values: number[]) => values[Math.floor(values.length / 2)];
  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  const settle = sorted((t) => t.settle);
  const raster = sorted((t) => t.raster);
  const total = sorted((t) => t.settle + t.raster);

  return {
    rows: samples.length,
    settleMedian: Math.round(median(settle)),
    rasterMedian: Math.round(median(raster)),
    serialiseMedian: Math.round(median(sorted((t) => t.serialise))),
    encodeMedian: Math.round(median(sorted((t) => t.encode))),
    totalMedian: Math.round(median(total)),
    totalMean: Math.round(mean(total)),
    totalP95: Math.round(total[Math.floor(total.length * 0.95)]),
    bytesMedian: Math.round(median(sorted((t) => t.bytes))),
  };
}

/* -------------------------------------------------------------------------
   Coarse stage timing.

   The first measurement of V05.06 showed 762 ms inside renderBlob against
   1703 ms of wall clock per row, so more than half the cost was somewhere the
   render path could not see. This exists to name that somewhere rather than
   guess at it again.
------------------------------------------------------------------------- */

export interface StageSample {
  name: string;
  ms: number;
}

const stages: StageSample[] = [];

export function recordStage(name: string, ms: number): void {
  stages.push({ name, ms });
  if (stages.length > MAX_SAMPLES * 4) stages.shift();
}

/** Times an async step and files it under `name`. Returns whatever it returns. */
export async function timed<T>(name: string, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    recordStage(name, performance.now() - started);
  }
}

export function takeStages(): StageSample[] {
  return stages.splice(0, stages.length);
}

/**
 * The largest number of bytes a run ever held at once.
 *
 * This is the number that mattered and nobody was looking at it. V05.06 spent
 * its whole budget on throughput while the run was dying of a ~760 MB spike at
 * every archive boundary. Recording it means the claim "nothing accumulates"
 * is checkable rather than asserted.
 */
let peakHeldBytes = 0;

export function recordPeak(bytes: number): void {
  peakHeldBytes = bytes;
}

export function lastPeak(): number {
  return peakHeldBytes;
}

/**
 * Debug surface. A harness driving a real browser cannot import a module, so
 * the drain has to hang off the window. Read-only, no behaviour attached.
 */
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__badgyPerf = {
    take: takeTimings,
    takeStages,
    lastPeak,
    summarise,
  };
}
