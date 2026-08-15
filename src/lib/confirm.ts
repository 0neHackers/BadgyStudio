"use client";

/**
 * Asking before something irreversible, in the app's own voice.
 *
 * WHY NOT window.confirm
 *
 * Six call sites used it: clearing the roster, clearing the vault, deleting a
 * selection, deleting one pass, clearing the unlock sheet, and the share
 * upload consent. It works, and it is the one piece of this app that is not
 * this app: Chrome's own grey box, in Chrome's font, at the top of the window,
 * with buttons that say OK and Cancel whatever the question was.
 *
 * That matters beyond looks. `window.confirm` cannot say which of its two
 * answers is the dangerous one, so "OK" reads identically whether it clears one
 * record or five hundred. It also blocks the main thread, which on this app
 * means a bulk run pauses while a dialog nobody has read sits open.
 *
 * WHY A STORE AND NOT A COMPONENT
 *
 * Same reason as lib/toast.ts and lib/batch-store.ts: it has to outlive any
 * route, and the call sites are ordinary functions rather than components. A
 * promise-returning function drops straight into the shape the old code
 * already had:
 *
 *     if (window.confirm("...")) { ... }   ->   if (await ask({ ... })) { ... }
 *
 * One dialog at a time, by construction. A queue would let a second question
 * appear behind the first, and two modal questions stacked is how somebody
 * answers the wrong one.
 */

export interface ConfirmRequest {
  /** Short. It is the heading, not the explanation. */
  title: string;
  /** One or two sentences of consequence. */
  body?: string;
  /** Itemised detail, used by the share consent to list what it would send. */
  bullets?: string[];
  /** Defaults to "Confirm". Say what will happen, not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * `danger` paints the confirm button in the flag colour and focuses Cancel
   * instead, so the destructive answer is never one stray Return away.
   */
  tone?: "danger" | "normal";
}

interface OpenDialog extends ConfirmRequest {
  id: number;
  resolve: (answer: boolean) => void;
}

let open: OpenDialog | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function confirmSnapshot(): OpenDialog | null {
  return open;
}

/**
 * Asks, and resolves to what was pressed.
 *
 * Never rejects. A dismissed dialog is a "no", because that is what dismissing
 * a question means and a caller should not have to catch an exception to find
 * out somebody pressed Escape.
 */
export function ask(request: ConfirmRequest): Promise<boolean> {
  // A second question while one is open answers the first as "no" rather than
  // stacking. In practice this cannot happen, since the dialog is modal; it is
  // here so that a future caller cannot leave a promise unresolved forever.
  if (open) open.resolve(false);

  return new Promise<boolean>((resolve) => {
    open = { ...request, id: nextId++, resolve };
    emit();
  });
}

/** Answers the open dialog and closes it. Used by the viewport only. */
export function answerConfirm(answer: boolean): void {
  const current = open;
  if (!current) return;
  open = null;
  emit();
  current.resolve(answer);
}
