"use client";

import type { BuilderInput, FieldVisibility, PhotoAsset } from "@/types";
import type { AccentKey } from "@/lib/brand";
import type { SerialFormat } from "@/lib/identifier";
import { prefixedSerial } from "@/lib/identifier";

/**
 * The local vault: every pass this browser has issued.
 *
 * WHAT IS STORED, AND WHAT IS DELIBERATELY NOT
 *
 * The details a pass was built from, and the photo exactly as it was cropped,
 * so a recovered pass is the pass rather than an outline of it.
 *
 * What is NOT stored is the rendered PNG. One card at 3x is 9.5 MB and a
 * five-hundred-row run would be five gigabytes. The vault keeps the source
 * photo and the crop instead, roughly 200-400 KB a head, and re-draws on
 * demand. That is also what lets it export at whatever resolution is asked for
 * rather than at whatever resolution happened to be saved.
 *
 * The photo is stored as the blob `loadPhoto` already produced, with the crop,
 * zoom, rotation and flip alongside it as numbers. No re-encode: re-encoding
 * would lose quality to save space nobody asked to save, and re-running the
 * same transform reproduces the same render exactly.
 *
 * WHERE IT LIVES
 *
 * IndexedDB, in the visitor's own browser. Not a cookie: cookies are capped at
 * about 4 KB and are sent to the server on every request, which would quietly
 * turn "nothing leaves the browser" into a lie. Not localStorage either: it is
 * synchronous, so writing five hundred records would block the main thread
 * during a run.
 *
 * This works identically in production. There is no server side to it, which
 * is the point: the vault on a laptop and the vault on a phone are different
 * vaults, and neither is visible to anyone else.
 *
 * PRIVACY, SAID PLAINLY
 *
 * A vault holds names, handles, emails, phone numbers and dates of birth for
 * everyone whose badge was made on that machine. On a shared computer that is
 * a real exposure, which is why the vault page says so, why every record can
 * be deleted individually, and why Clear everything is one click away.
 */

const DB_NAME = "badgy-vault";
const DB_VERSION = 1;
const STORE = "passes";

/** A photo as stored: the bytes, plus the transform that was applied to them. */
export interface VaultPhoto {
  blob: Blob;
  width: number;
  height: number;
  focusX: number;
  focusY: number;
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
  flipped: boolean;
  fileName: string;
}

export interface VaultPass {
  /** The prefixed pass number. Unique per person per format, so it is the key. */
  id: string;
  /** Ten-character body, shared across a person's formats. */
  serial: string;
  format: SerialFormat;
  input: BuilderInput;
  visibility: FieldVisibility;
  accent: AccentKey;
  customTitle: string;
  titleOverrideIndex: number;
  fullDetailsInCode: boolean;
  /** Null when the pass was made without one. */
  photo: VaultPhoto | null;
  /** Where it came from, so a vault of 500 can be told apart from a personal one. */
  source: "single" | "bulk";
  createdAt: number;
  updatedAt: number;
}

export type NewVaultPass = Omit<VaultPass, "id" | "createdAt" | "updatedAt">;

/** Strips a live PhotoAsset down to what survives being stored. */
export function toVaultPhoto(photo: PhotoAsset | null): VaultPhoto | null {
  if (!photo) return null;
  return {
    blob: photo.blob,
    width: photo.width,
    height: photo.height,
    focusX: photo.focusX,
    focusY: photo.focusY,
    zoom: photo.zoom,
    rotation: photo.rotation,
    flipped: photo.flipped,
    fileName: photo.fileName,
  };
}

/**
 * Rebuilds a usable PhotoAsset from a stored one.
 *
 * The caller owns the object URL this creates and must revoke it, which is why
 * this is not done inside the render: a list of five hundred passes would leak
 * five hundred URLs if opening one allocated without an owner.
 */
export function fromVaultPhoto(photo: VaultPhoto | null): PhotoAsset | null {
  if (!photo) return null;
  return { ...photo, url: URL.createObjectURL(photo.blob) };
}

/* ------------------------------------------------------------------- store */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Private browsing in some engines refuses to open a database at all.
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("serial", "serial", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // A vault that cannot open must never stop someone making a badge, so
    // every failure here degrades to "no vault" rather than throwing.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let request: IDBRequest<T>;
        try {
          request = work(db.transaction(STORE, mode).objectStore(STORE));
        } catch {
          resolve(null);
          return;
        }
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      }),
  );
}

/* ------------------------------------------------------------------- quota */

/**
 * Whether the browser has refused to store photos.
 *
 * Storing the photo takes a pass from about a kilobyte to a few hundred, so a
 * five-hundred-row run is a couple of hundred megabytes. That fits on a laptop
 * and may not on a phone. When it does not, the record is kept without its
 * photo and this is set, so the vault page can say what happened rather than
 * quietly showing faceless passes.
 */
let quotaPressure = false;

function noteQuotaPressure() {
  if (quotaPressure) return;
  quotaPressure = true;
  announce();
}

export function vaultQuotaPressure(): boolean {
  return quotaPressure;
}

/** Bytes used and available, when the browser will say. */
export async function vaultUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- listeners */

const listeners = new Set<() => void>();

export function subscribeVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce() {
  listeners.forEach((listener) => listener());
}

/* ------------------------------------------------------------------- cache */

/**
 * A synchronous mirror of the store.
 *
 * `useSyncExternalStore` needs a snapshot it can read during render, and
 * IndexedDB is asynchronous. The mirror is loaded once and kept in step by
 * every write going through this file. It also makes the header's search
 * suggestions instant, which they have to be to be worth having.
 */
let cache: VaultPass[] = [];
let loaded = false;
let loading: Promise<void> | null = null;

export function vaultSnapshot(): VaultPass[] {
  return cache;
}

export function vaultLoaded(): boolean {
  return loaded;
}

export function loadVault(): Promise<void> {
  loading ??= run<VaultPass[]>("readonly", (store) => store.getAll() as IDBRequest<VaultPass[]>).then(
    (rows) => {
      cache = (rows ?? []).sort((a, b) => b.createdAt - a.createdAt);
      loaded = true;
      announce();
    },
  );
  return loading;
}

/* ------------------------------------------------------------------ writes */

/**
 * Writes a pass, or refreshes one that already exists.
 *
 * Keyed on the pass number, so making the same card twice updates the record
 * rather than filling the vault with duplicates. `createdAt` is preserved on
 * an update: it is when that pass was first issued, which is the interesting
 * date.
 */
export async function savePass(pass: NewVaultPass): Promise<VaultPass | null> {
  const id = prefixedSerial(pass.serial, pass.format);
  const now = Date.now();
  const existing = cache.find((entry) => entry.id === id);

  const record: VaultPass = {
    ...pass,
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const written = await run("readwrite", (store) => store.put(record));
  if (written === null) {
    // Most likely the quota. Retry without the photo, because a pass recorded
    // without a face is worth far more than no record at all.
    if (record.photo) {
      const lean = { ...record, photo: null };
      const retried = await run("readwrite", (store) => store.put(lean));
      if (retried !== null) {
        noteQuotaPressure();
        cache = [lean, ...cache.filter((entry) => entry.id !== id)].sort(
          (a, b) => b.createdAt - a.createdAt,
        );
        announce();
        return lean;
      }
    }
    if (!(await openDb())) return null;
  }

  cache = [record, ...cache.filter((entry) => entry.id !== id)].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  announce();
  return record;
}

/** Writes many at once. A bulk run calls this rather than savePass per row. */
export async function savePasses(passes: NewVaultPass[]): Promise<number> {
  const db = await openDb();
  if (!db || passes.length === 0) return 0;

  const now = Date.now();
  const records = passes.map((pass) => {
    const id = prefixedSerial(pass.serial, pass.format);
    const existing = cache.find((entry) => entry.id === id);
    return { ...pass, id, createdAt: existing?.createdAt ?? now, updatedAt: now };
  });

  // One transaction for the lot. Five hundred separate ones is five hundred
  // round trips through the event loop in the middle of a render run.
  const ok = await new Promise<boolean>((resolve) => {
    try {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      for (const record of records) store.put(record);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });

  if (!ok) {
    // A batch that will not fit is almost always the photos. Drop them and try
    // once more so a long run still leaves a searchable record of every badge.
    const lean = records.map((record) => ({ ...record, photo: null }));
    const retried = await new Promise<boolean>((resolve) => {
      try {
        const transaction = db.transaction(STORE, "readwrite");
        const store = transaction.objectStore(STORE);
        for (const record of lean) store.put(record);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    if (!retried) return 0;

    noteQuotaPressure();
    const leanIds = new Set(lean.map((record) => record.id));
    cache = [...lean, ...cache.filter((entry) => !leanIds.has(entry.id))].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    announce();
    return lean.length;
  }

  const ids = new Set(records.map((record) => record.id));
  cache = [...records, ...cache.filter((entry) => !ids.has(entry.id))].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  announce();
  return records.length;
}

export async function deletePass(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
  cache = cache.filter((entry) => entry.id !== id);
  announce();
}

export async function clearVault(): Promise<void> {
  await run("readwrite", (store) => store.clear());
  cache = [];
  announce();
}

/**
 * Replaces the photo on an existing pass, or removes it when given null.
 *
 * Added in V06.04 so /v can update a photo. The record is the only thing that
 * changes; the details, the accent and the serial are untouched, because the
 * serial is a hash of the details and a photo has never been part of it.
 * Changing a face must not change a pass number.
 *
 * Returns false when there is nothing to update or the write is refused, so a
 * caller can say what happened rather than claiming success.
 */
export async function updatePassPhoto(id: string, photo: VaultPhoto | null): Promise<boolean> {
  const existing = cache.find((entry) => entry.id === id);
  if (!existing) return false;

  const record: VaultPass = { ...existing, photo, updatedAt: Date.now() };
  const written = await run("readwrite", (store) => store.put(record));
  if (written === null) {
    // A quota refusal on a photo update leaves the old photo in place, which is
    // the honest outcome: nothing was lost, and the caller is told.
    if (photo) noteQuotaPressure();
    return false;
  }

  cache = cache.map((entry) => (entry.id === id ? record : entry));
  announce();
  return true;
}

/* ------------------------------------------------------------------ lookup */

/** Exact match on the pass number, or on the bare body when no prefix is given. */
export function findPass(query: string): VaultPass | null {
  const cleaned = query.trim().toUpperCase().replace(/\s+/g, "");
  return (
    cache.find((entry) => entry.id === cleaned) ??
    cache.find((entry) => entry.serial === cleaned.replace(/^[A-Z]{3}-?/, "")) ??
    null
  );
}

/**
 * Ranked suggestions for the header search. Matches a pass number, a name or a
 * handle, because at a desk you are as likely to be handed a name as a number.
 */
export function searchPasses(query: string, limit = 6): VaultPass[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const bare = q.replace(/\s+/g, "");

  const scored = cache
    .map((entry) => {
      const id = entry.id;
      const name = entry.input.name.toUpperCase();
      const handle = entry.input.username.toUpperCase();

      if (id === bare || entry.serial === bare.replace(/^[A-Z]{3}-?/, "")) return { entry, score: 0 };
      if (id.startsWith(bare)) return { entry, score: 1 };
      if (name.startsWith(q)) return { entry, score: 2 };
      if (handle.replace("@", "").startsWith(q.replace("@", ""))) return { entry, score: 3 };
      if (id.includes(bare)) return { entry, score: 4 };
      if (name.includes(q)) return { entry, score: 5 };
      return null;
    })
    .filter((hit): hit is { entry: VaultPass; score: number } => hit !== null)
    .sort((a, b) => a.score - b.score || b.entry.createdAt - a.entry.createdAt);

  return scored.slice(0, limit).map((hit) => hit.entry);
}
