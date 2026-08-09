"use client";

/**
 * Where a bulk run puts its badges.
 *
 * THE BUG THIS EXISTS FOR
 *
 * Up to V05.06 a run accumulated forty finished PNGs in an array and then
 * asked client-zip to build an archive out of them. At 3x an ID card is about
 * 9.5 MB, so at the moment of packing the tab held roughly 380 MB of badges
 * and was allocating a second 380 MB for the zip on top. Then it pushed the
 * finished archive onto a `archives` array that was never released, so the
 * next part started from a higher floor than the last.
 *
 * That is the "Failed to fetch" at around fifty rows. It is not a network
 * error despite the wording: `Response.blob()` on client-zip's stream rejects
 * with `TypeError: Failed to fetch` when the underlying blob reads fail, and
 * blob reads fail when the renderer cannot allocate. It also explains why the
 * run was so easy to tip over. Scrolling, switching tab and switching app all
 * ask the compositor for memory, and there was none spare.
 *
 * THE FIX
 *
 * A sink takes one badge at a time and is done with it. Nothing accumulates,
 * so peak memory is one canvas plus one PNG regardless of whether the roster
 * has fifty people or five hundred.
 *
 * Two implementations:
 *
 *   FolderSink   File System Access. The person picks a folder once and every
 *                badge is written straight to disk as it is made. Flat memory,
 *                no archive step at all, and the files are simply there when
 *                the run ends. Chrome and Edge.
 *
 *   ZipSink      Everything else. Still chunked, but budgeted in bytes rather
 *                than rows, so the peak is a number this file chose rather
 *                than a consequence of the pixel ratio. Archives are handed
 *                to the caller and dropped immediately.
 *
 * The folder picker must be called from the click that starts the run.
 * `showDirectoryPicker` requires transient activation and will throw
 * `SecurityError` if it is reached after an await.
 */

export interface BadgeFile {
  name: string;
  blob: Blob;
}

export interface BatchSink {
  /** Human-readable, shown in the run summary. */
  readonly kind: "folder" | "zip";
  readonly label: string;
  /** Takes one finished badge. Must not retain it. */
  write(file: BadgeFile): Promise<void>;
  /** Writes a plain text or CSV companion file. */
  writeText(name: string, text: string): Promise<void>;
  /** Flushes anything outstanding and releases everything. */
  close(): Promise<void>;
  /** Bytes currently held in memory by this sink. Reported by the harness. */
  held(): number;
}

/* ------------------------------------------------------------------ folder */

type DirectoryHandle = {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<WritableStream & { write(data: unknown): Promise<void>; close(): Promise<void> }>;
  }>;
};

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: string; id?: string }) => Promise<DirectoryHandle>;
};

export function canPickFolder(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

/**
 * The three things that can come back from offering a folder.
 *
 * V05.07 collapsed "the person pressed Cancel" and "this browser has no File
 * System Access" into the same `null`, and the caller treated both as "go
 * ahead with zips". So cancelling the dialog started a five-hundred-badge run
 * anyway, which is the opposite of what pressing Cancel means.
 *
 * `cancelled` is a decision and has to stop the run. `unsupported` is a fact
 * about the browser and has to fall through to zips.
 */
export type FolderChoice =
  | { kind: "folder"; handle: DirectoryHandle }
  | { kind: "cancelled" }
  | { kind: "unsupported" };

/**
 * Opens the folder picker. Call this synchronously from the click handler:
 * `showDirectoryPicker` needs transient activation and throws SecurityError if
 * it is reached after an await.
 */
export async function pickFolder(): Promise<FolderChoice> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return { kind: "unsupported" };

  try {
    return { kind: "folder", handle: await picker({ mode: "readwrite", id: "badgy-badges" }) };
  } catch (cause) {
    // AbortError is the dismissal. SecurityError means the gesture was lost,
    // which is a bug rather than a choice, so it is reported as unsupported
    // and the run still produces something.
    if (cause instanceof DOMException && cause.name === "AbortError") {
      return { kind: "cancelled" };
    }
    return { kind: "unsupported" };
  }
}

export function folderSink(handle: DirectoryHandle): BatchSink {
  const write = async (name: string, data: Blob | string) => {
    const file = await handle.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(data);
    await writable.close();
  };

  return {
    kind: "folder",
    label: handle.name,
    async write(file) {
      await write(file.name, file.blob);
    },
    async writeText(name, text) {
      await write(name, text);
    },
    async close() {
      // Each file was closed as it was written. Nothing is outstanding.
    },
    held() {
      return 0;
    },
  };
}

/* --------------------------------------------------------------------- zip */

/**
 * How much finished PNG a zip part is allowed to hold before it is packed.
 *
 * The old rule was forty rows, which meant the peak scaled with the pixel
 * ratio and with the format: forty cards at 3x is 380 MB and forty at 2x is
 * 184 MB, from the same constant. A byte budget means the peak is the same
 * number in both cases, and doubling the raster costs more parts rather than
 * more memory.
 *
 * 96 MB of badges produces a zip of about the same size, so the spike while
 * packing is roughly 190 MB. That is comfortable on a phone and unnoticeable
 * on a laptop. At 3x it is about ten cards per part, which is a lot of
 * downloads for five hundred people; that is exactly why the folder sink is
 * offered first.
 */
const ZIP_BUDGET_BYTES = 96 * 1024 * 1024;

export interface ZipArchive {
  blob: Blob;
  fileName: string;
  files: number;
}

export function zipSink({
  baseName,
  onArchive,
  budget = ZIP_BUDGET_BYTES,
}: {
  baseName: string;
  /** Called with each finished part. The blob is dropped as soon as this returns. */
  onArchive: (archive: ZipArchive) => void;
  budget?: number;
}): BatchSink {
  let pending: { name: string; input: Blob | string }[] = [];
  let bytes = 0;
  let part = 0;

  const pack = async () => {
    if (pending.length === 0) return;
    const { downloadZip } = await import("client-zip");
    part += 1;

    const entries = pending;
    const count = entries.filter((entry) => entry.name.endsWith(".png")).length;
    // Released before the archive is built, so the only strong references are
    // the ones inside client-zip's iterator.
    pending = [];
    bytes = 0;

    const blob = await downloadZip(entries).blob();
    onArchive({ blob, fileName: `${baseName}-part${String(part).padStart(2, "0")}.zip`, files: count });
  };

  return {
    kind: "zip",
    label: "downloads",
    async write(file) {
      pending.push({ name: file.name, input: file.blob });
      bytes += file.blob.size;
      if (bytes >= budget) await pack();
    },
    async writeText(name, text) {
      pending.push({ name, input: text });
    },
    async close() {
      await pack();
    },
    held() {
      return bytes;
    },
  };
}
