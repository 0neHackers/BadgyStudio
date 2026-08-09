"use client";

import { runBatch, BatchCancelled, type BatchProgress } from "@/lib/batch";
import { downloadBlob } from "@/lib/export";
import { warmBrandAssets } from "@/lib/brand-assets";
import { folderSink, zipSink, type BatchSink } from "@/lib/sink";
import {
  notifyInfo,
  notifyProgress,
  notifyWarning,
  type ProgressHandle,
} from "@/lib/toast";
import type { FormatKey } from "@/lib/brand";
import type { CodeKind } from "@/lib/codes";
import type { RosterRow, RosterSettings } from "@/lib/roster";

/**
 * The bulk run, hoisted out of the page that starts it.
 *
 * WHY IT LIVES HERE AND NOT IN A COMPONENT
 *
 * Until V05.06 the run lived inside BulkStudio, which meant it also lived
 * inside that route. Navigating to the single generator unmounted the
 * component, and with it the artboard the run was rasterising and the loop
 * itself. On a five-hundred-person roster that is a long time to be told not
 * to touch anything, and there was nothing stopping someone from clicking a
 * header link and losing forty minutes of work.
 *
 * So the run is a module singleton. It survives navigation, it keeps rendering
 * while the tab is in the background, and the page that started it is just one
 * subscriber to its progress. The artboard it draws onto is mounted by
 * BatchHost from the root layout, so it outlives the route too.
 *
 * This is deliberately not React state. A run has exactly one instance per
 * document by nature, and modelling that as component state is what made it
 * possible to lose one.
 */

export type BatchPhase =
  | { kind: "idle" }
  | { kind: "running"; progress: BatchProgress; format: FormatKey }
  | {
      kind: "done";
      rendered: number;
      format: FormatKey;
      /** Folder name, or "downloads" when the output was zipped. */
      destination: string;
      sinkKind: "folder" | "zip";
      parts: number;
      peakHeldBytes: number;
      failed: { name: string; reason: string }[];
    }
  | { kind: "error"; message: string };

export interface BatchRequest {
  rows: RosterRow[];
  format: FormatKey;
  settings: RosterSettings;
  codeKind: CodeKind;
  origin: string;
  /**
   * Chosen in the click handler, because `showDirectoryPicker` needs transient
   * activation and throws if it is reached after an await. Null means the
   * person declined it or the browser has no File System Access, and the run
   * falls back to byte-budgeted zips.
   */
  folder: Parameters<typeof folderSink>[0] | null;
}

/** What BatchHost needs in order to draw a row. Null when nothing is running. */
export interface HostState {
  row: RosterRow | null;
  request: BatchRequest | null;
}

type Listener = () => void;

let phase: BatchPhase = { kind: "idle" };
let host: HostState = { row: null, request: null };
let cancelSignal = { cancelled: false };
let running = false;

/** Set by BatchHost. Puts a row on the shared artboard and returns the node. */
let mounter: ((row: RosterRow) => Promise<HTMLElement>) | null = null;

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPhase(): BatchPhase {
  return phase;
}

export function getHostState(): HostState {
  return host;
}

export function isRunning(): boolean {
  return running;
}

/**
 * BatchHost registers the function that commits a row and hands back the node.
 * Kept as a registration rather than an import so the store stays free of any
 * dependency on React.
 */
export function registerMounter(next: ((row: RosterRow) => Promise<HTMLElement>) | null) {
  mounter = next;
}

function setPhase(next: BatchPhase) {
  phase = next;
  emit();
}

function setHost(next: HostState) {
  host = next;
  emit();
}

/**
 * Puts a row on the artboard.
 *
 * Called by BatchHost from inside flushSync, which is the whole reason it is
 * separate from `mounter`: the store cannot commit React synchronously and the
 * host cannot own the state, so the host drives the commit and the store owns
 * the value.
 */
export function setHostRow(row: RosterRow) {
  host = { ...host, row };
  emit();
}

export const IDLE: BatchPhase = { kind: "idle" };
export const EMPTY_HOST: HostState = { row: null, request: null };

export async function start(request: BatchRequest): Promise<void> {
  if (running || request.rows.length === 0) return;

  running = true;
  cancelSignal = { cancelled: false };
  // The artboard has to exist and be configured before the first mount call,
  // so the request goes to the host before the loop starts.
  setHost({ row: null, request });
  setPhase({
    kind: "running",
    format: request.format,
    progress: { done: 0, total: request.rows.length, current: "" },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  let parts = 0;

  /**
   * A folder if one was picked, zips otherwise.
   *
   * The zip path hands each part straight to the browser's downloader and does
   * not keep it. V05.06 pushed every archive onto an array that lived for the
   * whole run, so a five-hundred-person run was carrying gigabytes of finished
   * zips it had already given away.
   */
  const sink: BatchSink = request.folder
    ? folderSink(request.folder)
    : zipSink({
        baseName: `badgy-${request.format}-badges-${stamp}`,
        onArchive: (archive) => {
          parts += 1;
          downloadBlob(archive.blob, archive.fileName);
        },
      });

  /**
   * One toast for the whole run.
   *
   * The status strip in the corner already carries the count; this is the
   * thing that tells you it started and, more usefully, tells you it finished
   * when you are three pages away and have stopped watching.
   */
  const job: ProgressHandle = notifyProgress(
    `Rendering ${request.rows.length} ${request.format === "pfp" ? "PFP frames" : "ID cards"}`,
    request.folder ? "Writing to the folder you chose" : "Packing zip files",
  );

  try {
    // Guarantee the marks are inlined before the first row renders. Without
    // this a hundred-row run made three hundred image requests.
    await warmBrandAssets();

    const result = await runBatch({
      rows: request.rows,
      format: request.format,
      settings: request.settings,
      pixelRatio: request.settings.pixelRatio,
      mount: async (row) => {
        if (!mounter) throw new Error("The render surface is not mounted.");
        return mounter(row);
      },
      onProgress: (progress) => {
        setPhase({ kind: "running", progress, format: request.format });
        job.update({
          detail: `${progress.done} of ${progress.total}`,
          progress: progress.total > 0 ? progress.done / progress.total : 0,
        });
      },
      signal: cancelSignal,
      sink,
    });

    setPhase({
      kind: "done",
      rendered: result.rendered,
      failed: result.failed,
      destination: result.destination,
      sinkKind: result.sinkKind,
      peakHeldBytes: result.peakHeldBytes,
      parts,
      format: request.format,
    });

    const where =
      result.sinkKind === "folder"
        ? `into ${result.destination}`
        : parts > 1
          ? `across ${parts} zip files`
          : "as a zip";

    if (result.failed.length > 0) {
      // A partial result is not a success and not a failure. Saying which is
      // more useful than picking one.
      job.done();
      notifyWarning(
        `${result.rendered} rendered, ${result.failed.length} failed`,
        `Written ${where}. ${result.failed[0].name} was the first to fail.`,
      );
    } else {
      job.succeed(
        `${result.rendered} badge${result.rendered === 1 ? "" : "s"} rendered`,
        `Written ${where}, with a manifest of the serials issued.`,
      );
    }
  } catch (cause) {
    if (cause instanceof BatchCancelled) {
      setPhase({ kind: "idle" });
      job.done();
      notifyInfo("Run cancelled", "Everything already written has been kept.");
    } else {
      const message = cause instanceof Error ? cause.message : "The run failed.";
      setPhase({ kind: "error", message });
      job.fail("The run failed", message);
    }
  } finally {
    running = false;
    // A cancelled or failed run still has to release whatever the sink holds.
    await sink.close().catch(() => {});
    setHost({ row: null, request: null });
  }
}

export function cancel() {
  cancelSignal.cancelled = true;
}

/** Clears a finished or failed run so the page returns to its resting state. */
export function acknowledge() {
  if (!running && phase.kind !== "idle") setPhase({ kind: "idle" });
}
