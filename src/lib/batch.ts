import { CANVAS, type FormatKey } from "@/lib/brand";
import { buildFontEmbedCss, encodeCanvas, renderCanvas } from "@/lib/export";
import { manifestCsv, rowFileName, type RosterRow, type RosterSettings } from "@/lib/roster";
import { withRetry, yieldToBrowser } from "@/lib/schedule";
import { recordStage, recordPeak, timed } from "@/lib/perf";
import { warmBrandAssets } from "@/lib/brand-assets";
import type { BatchSink } from "@/lib/sink";
import { parseSerial, type SerialFormat } from "@/lib/identifier";
import { savePasses, toVaultPhoto, type NewVaultPass } from "@/lib/vault";
import { rowAccent } from "@/lib/roster";

/** How many vault records to accumulate before one transaction writes them. */
const VAULT_FLUSH = 50;

/**
 * Batch rendering.
 *
 * One artboard is reused for the whole run. The page commits a row onto it,
 * rasterises it, hands the PNG to the sink and moves on. Rendering every row
 * into its own mounted artboard would be faster in wall-clock terms and would
 * also try to hold five hundred decoded photos in memory at once, which is how
 * you get a tab killed on a phone.
 *
 * WHAT V05.07 CHANGED, AND WHY IT MATTERED MORE THAN THE SPEED WORK
 *
 * V05.06 made the run about 30% faster and it still could not finish five
 * hundred people, because throughput was never the thing that killed it.
 * Memory was. The loop accumulated forty finished PNGs, built a zip of the
 * same size on top of them, and then kept that zip alive in an `archives`
 * array for the rest of the run. At 3x that is a ~760 MB spike at row forty
 * against a floor that rose with every part.
 *
 * The failure surfaced as `TypeError: Failed to fetch`, which is misleading:
 * it is what `Response.blob()` rejects with when client-zip's stream cannot
 * read its inputs, and it cannot read them when the renderer is out of memory.
 * It also explains why the run was so easy to tip over by scrolling or
 * switching app. Those want memory too, and there was none spare.
 *
 * So nothing accumulates here now. A badge is rendered, handed to the sink and
 * forgotten. Peak memory is one canvas plus one PNG whether the roster has
 * fifty people or five hundred. See lib/sink.ts for where they go.
 */

export interface BatchProgress {
  done: number;
  total: number;
  current: string;
}

export interface BatchResult {
  rendered: number;
  failed: { name: string; reason: string }[];
  /** Where the badges ended up, for the summary. */
  destination: string;
  sinkKind: "folder" | "zip";
  /** Largest number of bytes the run ever held at once. Reported, not guessed. */
  peakHeldBytes: number;
}

export class BatchCancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "BatchCancelled";
  }
}

export interface RunBatchOptions {
  rows: RosterRow[];
  format: FormatKey;
  /** Carried through so a vault record matches what was actually printed. */
  settings: RosterSettings;
  pixelRatio: 2 | 3;
  /** Mounts a row on the shared artboard and resolves once React has committed. */
  mount: (row: RosterRow) => Promise<HTMLElement>;
  onProgress: (progress: BatchProgress) => void;
  signal: { cancelled: boolean };
  /** Where finished badges go. Opened by the caller, closed here. */
  sink: BatchSink;
}

export async function runBatch({
  rows,
  format,
  settings,
  pixelRatio,
  mount,
  onProgress,
  signal,
  sink,
}: RunBatchOptions): Promise<BatchResult> {
  const size = CANVAS[format];
  const failed: { name: string; reason: string }[] = [];
  const stamp = new Date().toISOString().slice(0, 10);
  let rendered = 0;
  let peakHeld = 0;

  // Resolve the embed stylesheet once, before the loop. If the fonts cannot be
  // read, that should fail immediately and loudly rather than a hundred times.
  await Promise.all([buildFontEmbedCss(), warmBrandAssets()]);

  /**
   * Progress, rate limited.
   *
   * Every call to this re-renders the bulk page, and the bulk page contains a
   * roster table of up to fifty rows. Reporting every row made React work
   * measurably comparable to the rasterisation itself. Six updates a second is
   * past the point anyone can read a changing name anyway, and milestones go
   * through immediately.
   */
  let lastReport = 0;
  const report = (progress: BatchProgress, force = false) => {
    const now = performance.now();
    if (!force && now - lastReport < 160) return;
    lastReport = now;
    onProgress(progress);
  };

  /**
   * The manifest is the one thing that has to survive the whole run, so it is
   * kept as text rather than as rows. Five hundred lines is about 60 KB, which
   * is the entire memory budget this run has beyond a single badge.
   */
  const manifestRows: string[] = [];

  /**
   * Passes waiting to be written to the local vault.
   *
   * Five hundred separate IndexedDB transactions in the middle of a render run
   * is five hundred trips through the event loop for no reason, so they go in
   * batches. The batch is small enough that a run cancelled halfway still
   * leaves almost everything it produced recorded.
   */
  const issued: NewVaultPass[] = [];
  const flushVault = async () => {
    if (issued.length === 0) return;
    const batch = issued.splice(0, issued.length);
    // Never allowed to fail the run. A refused database costs the vault entry,
    // not the badge, which is already on disk by this point.
    await savePasses(batch).catch(() => 0);
  };

  /** The row whose PNG is still compressing. See the note in lib/export.ts. */
  let inFlight: { row: RosterRow; index: number; serial: string; blob: Promise<Blob> } | null = null;

  const trackPeak = (extra: number) => {
    const held = sink.held() + extra;
    if (held > peakHeld) peakHeld = held;
  };

  /** Blocks on the pipelined row, writes it out, and lets go of it. */
  const collect = async () => {
    if (!inFlight) return;
    const pending = inFlight;
    inFlight = null;
    try {
      const blob = await timed("encode-wait", () => pending.blob);
      trackPeak(blob.size);
      const file = rowFileName(pending.row, pending.serial, pending.index);
      await timed("write", () => sink.write({ name: file, blob }));
      manifestRows.push(manifestCsv.line(pending.row, pending.serial, file));
      // Recorded so the header search and the vault can find this person
      // later. Batched rather than written per row: see the flush below.
      issued.push({
        serial: parseSerial(pending.serial).body,
        format: format as SerialFormat,
        input: pending.row.input,
        visibility: settings.visibility,
        accent: rowAccent(pending.row, settings),
        customTitle: "",
        titleOverrideIndex: 0,
        fullDetailsInCode: settings.fullDetailsInCode,
        photo: toVaultPhoto(pending.row.photo),
        source: "bulk",
      });
      if (issued.length >= VAULT_FLUSH) await flushVault();
      rendered += 1;
    } catch (cause) {
      failed.push({
        name: pending.row.input.name || `Row ${pending.index + 1}`,
        reason: cause instanceof Error ? cause.message : "Unknown render failure",
      });
    }
  };

  for (let index = 0; index < rows.length; index++) {
    if (signal.cancelled) throw new BatchCancelled();
    const rowStarted = performance.now();

    const row = rows[index];
    report({ done: index, total: rows.length, current: row.input.name || `Row ${index + 1}` });

    try {
      // One transient failure in a hundred should not cost the run.
      const { canvas, serial } = await withRetry(async () => {
        const node = await timed("mount", () => mount(row));
        const passNumber = node.dataset.serial ?? "";
        const drawn = await renderCanvas(node, {
          width: size.w,
          height: size.h,
          pixelRatio,
          label: format,
        });
        return { canvas: drawn, serial: passNumber };
      });

      // Start this row compressing, then bank the previous one. Depth is one:
      // two 13 megapixel canvases is already 100 MB, and memory is the thing
      // this version exists to stop wasting.
      const blob = encodeCanvas(canvas);
      blob.catch(() => {});
      await collect();
      inFlight = { row, index, serial, blob };
    } catch (cause) {
      await collect();
      failed.push({
        name: row.input.name || `Row ${index + 1}`,
        reason: cause instanceof Error ? cause.message : "Unknown render failure",
      });
    }

    await timed("yield", () => yieldToBrowser());
    recordStage("row", performance.now() - rowStarted);
  }

  await collect();
  await flushVault();

  if (signal.cancelled) throw new BatchCancelled();

  report({ done: rows.length, total: rows.length, current: "Writing the manifest" }, true);

  await sink.writeText("manifest.csv", manifestCsv.header() + manifestRows.join("\n") + "\n");
  await sink.writeText(
    "README.txt",
    [
      `Badgy Studio badge run, ${stamp}`,
      `Format: ${format}  (${size.w} x ${size.h} at ${pixelRatio}x)`,
      `Badges: ${rendered}`,
      failed.length ? `Failed: ${failed.length}` : "",
      "",
      "manifest.csv lists every badge with the serial it was issued. Serials are",
      "deterministic: the same details always produce the same serial, so",
      "re-running will not renumber anyone.",
      "",
      "The tenth character is a mod-36 check character, so a gate scanner can",
      "reject a mistyped serial without looking anything up.",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  await sink.close();
  recordPeak(peakHeld);

  return {
    rendered,
    failed,
    destination: sink.label,
    sinkKind: sink.kind,
    peakHeldBytes: peakHeld,
  };
}
