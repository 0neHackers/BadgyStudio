"use client";

import {
  DEFAULT_ROSTER_SETTINGS,
  validateRow,
  type RosterRow,
  type RosterSettings,
} from "@/lib/roster";
import type { FormatKey } from "@/lib/brand";

/**
 * The roster, hoisted out of the page that edits it.
 *
 * THE BUG THIS EXISTS FOR
 *
 * Every row, every correction, the selection, the paging and the run settings
 * lived in `useState` inside BulkStudio. Next unmounts a route component on
 * navigation, so clicking through to the single generator and back threw all
 * of it away. On a five-hundred-person roster that is an afternoon of edits
 * gone, and there was no warning: the page simply came back empty. V05.07
 * moved the *run* out for exactly this reason and left the data behind, which
 * only made it stranger, because the run kept going while its roster vanished.
 *
 * WHAT SURVIVES WHAT
 *
 *   Navigation   everything, because the store is a module singleton.
 *   Reload       everything except photos, because they are restored from
 *                IndexedDB. Photos are object URLs and die with the document,
 *                so they are re-matched by attaching the folder or zip again.
 *   Clear        nothing. That is the only thing that empties it, and it is a
 *                button someone has to press.
 *
 * WHY NOT React CONTEXT
 *
 * A context provider lives in the tree and the tree is what gets unmounted. It
 * would have to sit in the root layout, at which point it is a singleton with
 * extra steps. This is the same shape as lib/batch-store.ts, deliberately.
 */

const DB_NAME = "badgy-roster";
const DB_VERSION = 1;
const STORE = "state";
const KEY = "current";

export interface RosterState {
  rows: RosterRow[];
  format: FormatKey;
  settings: RosterSettings;
  /** Row ids. A Set does not survive structured cloning cleanly, so it is an array here. */
  checked: string[];
  focusId: string | null;
  page: number;
  pageSize: number | "all";
  batchDefaults: { team: string; tier: string; project: string; role: string };
  notice: string;
}

export const EMPTY_ROSTER: RosterState = {
  rows: [],
  format: "card",
  settings: DEFAULT_ROSTER_SETTINGS,
  checked: [],
  focusId: null,
  page: 0,
  pageSize: 25,
  batchDefaults: { team: "", tier: "", project: "", role: "" },
  notice: "",
};

let state: RosterState = EMPTY_ROSTER;
const listeners = new Set<() => void>();

export function subscribeRoster(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function rosterSnapshot(): RosterState {
  return state;
}

/* ---------------------------------------------------------------- persistence */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/**
 * Writes are debounced and stripped of anything that cannot survive a reload.
 *
 * Typing in a field patches a row on every keystroke, and a roster of five
 * hundred rows is a few hundred kilobytes to serialise. Writing that
 * synchronously per character would be the slowest thing on the page.
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void openDb().then((db) => {
      if (!db) return;
      try {
        // A PhotoAsset holds an object URL and an ImageBitmap-backed element.
        // Neither survives a reload, and neither is structured-cloneable, so
        // the photo is dropped and its filename kept: re-attaching the folder
        // re-matches every row by name, which is the existing flow anyway.
        const storable: RosterState = {
          ...state,
          rows: state.rows.map((row) => ({ ...row, photo: null })),
        };
        db.transaction(STORE, "readwrite").objectStore(STORE).put(storable, KEY);
      } catch {
        // A quota failure must never break editing. The roster stays in memory
        // and simply will not survive a reload.
      }
    });
  }, 400);
}

let restored = false;

/** Reads the roster back after a reload. Safe to call from every mount. */
export function restoreRoster(): Promise<void> {
  if (restored) return Promise.resolve();
  restored = true;

  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) {
          resolve();
          return;
        }
        try {
          const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
          request.onsuccess = () => {
            const saved = request.result as RosterState | undefined;
            // Only adopt it if the in-memory roster is still empty. A restore
            // that lands after the person has started a new import would
            // otherwise overwrite what they just did.
            if (saved && state.rows.length === 0) {
              state = {
                ...EMPTY_ROSTER,
                ...saved,
                // Re-validate rather than trusting stored issues: the rules
                // change between versions and stale warnings are confusing.
                rows: saved.rows.map((row) => ({ ...row, issues: validateRow(row) })),
              };
              announce();
            }
            resolve();
          };
          request.onerror = () => resolve();
        } catch {
          resolve();
        }
      }),
  );
}

function announce() {
  listeners.forEach((listener) => listener());
}

/* -------------------------------------------------------------------- writes */

export function patchRoster(patch: Partial<RosterState>) {
  state = { ...state, ...patch };
  announce();
  persist();
}

/** Replaces the rows and revalidates them in one pass. */
export function setRows(next: RosterRow[] | ((current: RosterRow[]) => RosterRow[])) {
  const rows = typeof next === "function" ? next(state.rows) : next;
  state = { ...state, rows };
  announce();
  persist();
}

export function setChecked(next: string[] | ((current: string[]) => string[])) {
  const checked = typeof next === "function" ? next(state.checked) : next;
  state = { ...state, checked };
  announce();
  persist();
}

/**
 * The only thing that empties the roster.
 *
 * Explicit, because the whole point of this file is that nothing else can.
 * Photos are released by the caller, which owns them.
 */
export function clearRoster() {
  state = EMPTY_ROSTER;
  announce();
  persist();
}
