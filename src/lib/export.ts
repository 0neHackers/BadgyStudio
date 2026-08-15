import { COLORS } from "@/lib/brand";
import { EXPORT_FONTS } from "@/lib/fonts";
import { yieldToBrowser } from "@/lib/schedule";
import { recordTiming } from "@/lib/perf";

/**
 * Turning the on-screen stage into a real PNG.
 *
 * The preview is the render target, so what gets downloaded is exactly what
 * was previewed. Three things have to be true before the snapshot is taken:
 * both webfonts are resolved, every photo has decoded, and every code SVG has
 * finished encoding. Skipping any of them produces a card in fallback type or
 * with empty code boxes.
 */

const SETTLE_TIMEOUT = 5000;

/* -------------------------------------------------------------------------
   Font embedding.

   html-to-image will, by default, walk document.styleSheets looking for
   webfonts to inline. Reading .cssRules on a cross-origin sheet throws a
   SecurityError, and plenty of real machines have one: antivirus products that
   inject CSS, corporate proxies, some extensions. When that happens the font
   collection comes back incomplete and the exported card silently falls back
   to a system font.

   We know exactly which faces the artboards use, so we build the embed
   stylesheet ourselves and hand it over. html-to-image then skips the walk
   entirely, and the export becomes immune to whatever else is on the page.
------------------------------------------------------------------------- */

let fontCssPromise: Promise<string> | null = null;

async function fileToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read ${url}`);
  const buffer = await response.arrayBuffer();

  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return `data:font/woff2;base64,${btoa(binary)}`;
}

export function buildFontEmbedCss(): Promise<string> {
  fontCssPromise ??= (async () => {
    const faces = await Promise.all(
      EXPORT_FONTS.map(async (font) => {
        const dataUrl = await fileToDataUrl(font.file);
        return [
          "@font-face{",
          `font-family:"${font.family}";`,
          `font-weight:${font.weight};`,
          "font-style:normal;font-display:block;",
          `src:url(${dataUrl}) format("woff2");`,
          "}",
        ].join("");
      }),
    );
    return faces.join("\n");
  })().catch((cause) => {
    // Reset so a transient network hiccup does not poison every later export.
    fontCssPromise = null;
    throw cause;
  });

  return fontCssPromise;
}

/* ------------------------------------------------------------------------- */

async function waitForFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.ready;
  } catch {
    // Font loading API is advisory. A failure here is not worth aborting for.
  }
}

async function waitForImages(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );
}

/**
 * Waits for every code to settle. "error" counts as settled: a failed encode
 * should not hold the export hostage for the full timeout.
 */
/**
 * Waits for every code to settle. "error" counts as settled: a failed encode
 * should not hold the export hostage for the full timeout.
 *
 * The fast path matters more than it looks. Measured over a batch run, this
 * usually has nothing to wait for, and the version that always paid one
 * `nextPaint` before checking was spending a whole frame per row on a
 * condition that was already true.
 */
async function waitForCodes(node: HTMLElement): Promise<void> {
  if (node.querySelectorAll('[data-code-ready="false"]').length === 0) return;

  const started = performance.now();
  while (performance.now() - started < SETTLE_TIMEOUT) {
    // yieldToBrowser, not rAF: a hidden tab never paints, and the old rAF here
    // parked a background run forever. A code element flipping its attribute
    // does not need a paint to become visible to querySelectorAll, so this
    // does not need to wait for one.
    await yieldToBrowser();
    if (node.querySelectorAll('[data-code-ready="false"]').length === 0) return;
  }
  console.warn("Export proceeded with codes still pending.");
}

export async function settle(node: HTMLElement): Promise<void> {
  await Promise.all([waitForFonts(), waitForImages(node), waitForCodes(node)]);
}

export interface RenderOptions {
  width: number;
  height: number;
  /** 2 keeps files small enough to attach, 3 is what the download button uses. */
  pixelRatio?: number;
  /** Tags the timing sample. Not used for anything else. */
  label?: string;
}

/**
 * Canvas dimension ceiling. Chrome refuses a canvas with either side past
 * this, and html-to-image clamps to the same number. A team frame at 3x is
 * 4800x2700, so nothing here reaches it; the clamp exists so that a future
 * format cannot fail silently.
 */
const MAX_CANVAS = 16384;

/**
 * Turns the serialised SVG into a canvas.
 *
 * WHY THIS IS NOT html-to-image's toCanvas
 *
 * `toCanvas` is `toSvg` followed by an image load and a `drawImage`, and its
 * image loader resolves inside `requestAnimationFrame`:
 *
 *     img.onload = () => img.decode().then(() =>
 *       requestAnimationFrame(() => resolve(img)))
 *
 * requestAnimationFrame does not fire while a tab is hidden. So a bulk run
 * parked on whichever row it was drawing the moment you switched tab or
 * application, and continued from the next one when you came back. It looked
 * like the run was still going, because the status strip was accurate: the row
 * really was in flight, waiting for a frame that would never come.
 *
 * Every yield this project owns was moved off rAF in V05.06 for exactly this
 * reason. This was the last one, and it was in a dependency, which is why it
 * survived three versions of looking for it in our own code.
 *
 * So the SVG step is still html-to-image's, and only the twenty lines after it
 * are ours: load the image, draw it, no frame required. `decode()` is
 * attempted because it keeps the paint off the main thread, but nothing waits
 * on it: `onload` already guarantees the image is drawable, and a decode that
 * a hidden tab deprioritises must not become the new place a run stops.
 */
async function drawToCanvas(
  svgUrl: string,
  width: number,
  height: number,
  pixelRatio: number,
): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The serialised artboard did not load."));
    image.src = svgUrl;
  });

  // Best effort. A rejection here means the browser will decode during
  // drawImage instead, which is slower and still correct.
  await image.decode().catch(() => {});

  const canvas = document.createElement("canvas");
  let pixelWidth = width * pixelRatio;
  let pixelHeight = height * pixelRatio;

  if (pixelWidth > MAX_CANVAS || pixelHeight > MAX_CANVAS) {
    const scale = Math.min(MAX_CANVAS / pixelWidth, MAX_CANVAS / pixelHeight);
    pixelWidth = Math.floor(pixelWidth * scale);
    pixelHeight = Math.floor(pixelHeight * scale);
  }

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser refused a 2D canvas.");

  // Painted before the artboard, because the badge does not fill every pixel
  // at every format and a transparent PNG on a dark timeline is not the thing
  // anyone previewed.
  context.fillStyle = COLORS.paper;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas;
}

/**
 * Everything up to but not including PNG compression.
 *
 * Split out from `renderBlob` so a batch run can start compressing one row
 * while it draws the next. Compression is roughly a third of the per-row
 * budget and Chrome performs it off the main thread, so overlapping it is free
 * throughput rather than a quality trade. See lib/batch.ts.
 */
export async function renderCanvas(
  node: HTMLElement,
  { width, height, pixelRatio = 3, label = "card" }: RenderOptions,
): Promise<{ canvas: HTMLCanvasElement; settleMs: number; serialiseMs: number; label: string; pixelRatio: number }> {
  const [{ toSvg }, fontEmbedCSS] = await Promise.all([
    import("html-to-image"),
    buildFontEmbedCss(),
  ]);

  const startedSettle = performance.now();
  await settle(node);
  const startedRaster = performance.now();

  const svgUrl = await toSvg(node, {
    width,
    height,
    cacheBust: false,
    backgroundColor: COLORS.paper,
    fontEmbedCSS,
    // Skip anything the artboard marks as decorative. html-to-image writes the
    // full computed style of every surviving node onto its clone, so element
    // count is close to a linear term in the per-row cost.
    filter: exportFilter,
    style: {
      // The stage is scaled down to fit the viewport. Undo that for the capture.
      transform: "none",
      transformOrigin: "top left",
      margin: "0",
      // The interface runs at 90% from V05.06 on. The artboard must not.
      zoom: "1",
      // Entry animations must not be mid-flight when the snapshot is taken.
      animation: "none",
    },
  });

  const canvas = await drawToCanvas(svgUrl, width, height, pixelRatio);

  return {
    canvas,
    settleMs: startedRaster - startedSettle,
    serialiseMs: performance.now() - startedRaster,
    label,
    pixelRatio,
  };
}

/**
 * Compresses a rendered canvas and releases its backing store.
 *
 * A 1080x1350 card at 3x is a 13.1 megapixel canvas, which is about 52 MB of
 * pixels. Two of those can be in flight during a pipelined run, so the canvas
 * is shrunk to nothing the moment its bytes are safe.
 */
export async function encodeCanvas(
  rendered: Awaited<ReturnType<typeof renderCanvas>>,
): Promise<Blob> {
  const { canvas, settleMs, serialiseMs, label, pixelRatio } = rendered;
  const startedEncode = performance.now();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );

  const encode = performance.now() - startedEncode;

  // Free the backing store rather than waiting for a collection that may not
  // come until after the next row has allocated its own.
  canvas.width = 0;
  canvas.height = 0;

  if (!blob) throw new Error("The browser returned an empty image.");

  recordTiming({
    settle: settleMs,
    raster: serialiseMs + encode,
    serialise: serialiseMs,
    encode,
    bytes: blob.size,
    format: label,
    pixelRatio,
  });

  return blob;
}

/** The single-badge path: draw and compress, no pipelining to be had. */
export async function renderBlob(node: HTMLElement, options: RenderOptions): Promise<Blob> {
  return encodeCanvas(await renderCanvas(node, options));
}

/**
 * Anything marked `data-export="skip"` is dropped from the capture.
 *
 * html-to-image clones every node that survives this filter and copies its
 * entire computed style onto the clone as inline text, so the element count of
 * the subtree is close to a linear term in the per-row cost. Dropping the
 * purely decorative furniture is free at the output and not free at all in a
 * five-hundred-row run.
 */
function exportFilter(node: Node): boolean {
  return !(node instanceof Element) || node.getAttribute("data-export") !== "skip";
}

/** Saves a string as a file. Used for the CSV templates. */
export function downloadText(text: string, fileName: string) {
  downloadBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give Safari a beat to start the download before the URL disappears.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Puts the PNG on the clipboard. Chrome and Edge take a PNG blob directly;
 * Safari needs the promise handed to the ClipboardItem rather than an awaited
 * blob, which is why the caller passes a thunk. Firefox has no image clipboard
 * write at all, so this reports false and the caller falls back to downloading.
 */
export async function copyBlobToClipboard(makeBlob: () => Promise<Blob>): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard || !window.ClipboardItem) {
    return false;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": makeBlob() }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** `hhgoa-2026-card-idx-1a01a0k6a1.png`. Takes the prefixed pass number. */
export function fileNameFor(format: string, passNumber: string): string {
  return `hhgoa-2026-${format}-${passNumber.toLowerCase()}.png`;
}
