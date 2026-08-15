"use client";

import { EMPTY_ANSWER, type UnlockAnswer } from "@/lib/unlock";

/**
 * The half-filled unlock sheet, kept outside the component tree.
 *
 * Same reasoning as lib/roster-store.ts, and the same rule the bulk roster
 * follows: Next unmounts a route component on navigation, so typing forty
 * people's details into a table and then glancing at the generator would throw
 * the lot away. It only clears when somebody clears it.
 *
 * Persisted to localStorage rather than IndexedDB. The sheet is a few kilobytes
 * of short strings, there is no blob in it, and the synchronous write that made
 * localStorage wrong for a five-hundred-row roster mid-render is not a concern
 * for a form nobody types into during a batch.
 *
 * WHAT IS DELIBERATELY NOT PERSISTED
 *
 * Which passes verified. A pass is re-checked every time the button is pressed,
 * so a stored "this one is unlocked" would be a second source of truth that
 * could outlive the answer that earned it. The answers persist; the verdict
 * does not.
 */

const KEY = "badgy-unlock-draft";

export interface UnlockDraft {
  /** Answers by prefixed pass number. */
  answers: Record<string, Omit<UnlockAnswer, "serial">>;
  /** Serials the last CSV import recognised, so the selection can be restored. */
  imported: string[];
}

export const EMPTY_DRAFT: UnlockDraft = { answers: {}, imported: [] };

let draft: UnlockDraft = EMPTY_DRAFT;
let restored = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private browsing, or a full quota. The sheet still works for this
    // session; it just will not survive a reload, which is worth strictly
    // nothing compared to failing the thing the person is doing.
  }
}

export function subscribeUnlock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function unlockSnapshot(): UnlockDraft {
  return draft;
}

/** Reads the sheet back once per document. */
export function restoreUnlock(): void {
  if (restored || typeof window === "undefined") return;
  restored = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as UnlockDraft;
    if (parsed && typeof parsed === "object" && parsed.answers) {
      draft = { answers: parsed.answers, imported: parsed.imported ?? [] };
      emit();
    }
  } catch {
    // A corrupt draft is not worth a crash on page load.
  }
}

export function setAnswer(serial: string, patch: Partial<Omit<UnlockAnswer, "serial">>): void {
  const current = draft.answers[serial] ?? EMPTY_ANSWER;
  draft = {
    ...draft,
    answers: { ...draft.answers, [serial]: { ...current, ...patch } },
  };
  persist();
  emit();
}

/** Writes many at once, which is what a CSV import is. */
export function setAnswers(rows: UnlockAnswer[]): void {
  const answers = { ...draft.answers };
  for (const { serial, ...rest } of rows) {
    answers[serial] = { ...(answers[serial] ?? EMPTY_ANSWER), ...rest };
  }
  draft = { answers, imported: rows.map((row) => row.serial) };
  persist();
  emit();
}

export function clearUnlock(): void {
  draft = EMPTY_DRAFT;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do about a refused removal beyond not crashing.
  }
  emit();
}
