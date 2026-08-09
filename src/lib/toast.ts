"use client";

/**
 * Notifications, as a document-level store.
 *
 * WHY A STORE AND NOT COMPONENT STATE
 *
 * Before this, every surface reported outcomes its own way: BulkStudio had a
 * `notice` string, Studio had a `status` object with four tones, PassVault had
 * a `status` string, and the rest said nothing at all. Twenty-one call sites
 * across four components, three different shapes, none of them visible once
 * you scrolled past the panel that owned them.
 *
 * More to the point, some of the things worth reporting do not belong to a
 * component at all. A bulk run outlives the page that started it, so "your
 * five hundred badges finished" has nowhere to live in the tree. The same
 * reasoning that moved the run into lib/batch-store.ts applies here.
 *
 * So: one store, one viewport mounted beside the boot screen in the root
 * layout, and every surface pushes into it.
 *
 * WHAT IS DELIBERATELY NOT A TOAST
 *
 * Anything a person needs to read carefully or act on. Row-level validation
 * stays in the row, the identity gate's refusal stays under the form, and the
 * privacy note on the vault page stays on the page. A toast is for
 * confirmation and progress, and it disappears; putting anything load-bearing
 * in one is how people miss it.
 */

export type ToastKind = "success" | "info" | "warning" | "error" | "progress";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  /** One short line. Anything longer belongs on the page, not in a toast. */
  detail?: string;
  /** 0 to 1. Only read for `progress`, and only when it is a real fraction. */
  progress?: number;
  createdAt: number;
  /** Milliseconds. `progress` toasts pass Infinity and are closed by hand. */
  ttl: number;
}

/**
 * How long each kind stays.
 *
 * Errors last longest because they are the ones worth reading twice, and a
 * success that lingers is just clutter. Progress never expires on its own: it
 * is replaced or resolved by whatever raised it.
 */
const TTL: Record<ToastKind, number> = {
  success: 3200,
  info: 3600,
  warning: 5200,
  error: 7000,
  progress: Number.POSITIVE_INFINITY,
};

/**
 * Six is enough to read. Past that the oldest goes, because a stack that
 * scrolls is a log, and a log belongs somewhere you can scroll back through.
 */
const MAX_VISIBLE = 6;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const NO_TOASTS: Toast[] = [];

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function toastSnapshot(): Toast[] {
  return toasts;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function schedule(toast: Toast) {
  if (!Number.isFinite(toast.ttl)) return;
  timers.set(
    toast.id,
    setTimeout(() => dismissToast(toast.id), toast.ttl),
  );
}

export function dismissToast(id: number) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const before = toasts.length;
  toasts = toasts.filter((toast) => toast.id !== id);
  if (toasts.length !== before) emit();
}

export interface ToastInput {
  kind?: ToastKind;
  title: string;
  detail?: string;
  progress?: number;
  ttl?: number;
}

/** Raises a toast and returns its id, so a caller can update or close it. */
export function toast(input: ToastInput): number {
  const kind = input.kind ?? "info";
  const entry: Toast = {
    id: nextId++,
    kind,
    title: input.title,
    detail: input.detail,
    progress: input.progress,
    createdAt: Date.now(),
    ttl: input.ttl ?? TTL[kind],
  };

  toasts = [entry, ...toasts].slice(0, MAX_VISIBLE);
  // Anything pushed off the end has its timer cancelled, or it would fire
  // later against an id that is no longer on screen.
  for (const [id, timer] of timers) {
    if (!toasts.some((t) => t.id === id)) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  schedule(entry);
  emit();
  return entry.id;
}

export const notifySuccess = (title: string, detail?: string) =>
  toast({ kind: "success", title, detail });
export const notifyInfo = (title: string, detail?: string) =>
  toast({ kind: "info", title, detail });
export const notifyWarning = (title: string, detail?: string) =>
  toast({ kind: "warning", title, detail });
export const notifyError = (title: string, detail?: string) =>
  toast({ kind: "error", title, detail });

/**
 * A toast that stays until the work it describes finishes.
 *
 * Returns a handle rather than an id, because the useful operations on a
 * running job are "say more about it" and "it is done", and both should read
 * as one thing at the call site.
 */
export function notifyProgress(title: string, detail?: string) {
  const id = toast({ kind: "progress", title, detail });

  return {
    id,
    update(next: { title?: string; detail?: string; progress?: number }) {
      toasts = toasts.map((entry) =>
        entry.id === id ? { ...entry, ...next } : entry,
      );
      emit();
    },
    succeed(title: string, detail?: string) {
      dismissToast(id);
      return notifySuccess(title, detail);
    },
    fail(title: string, detail?: string) {
      dismissToast(id);
      return notifyError(title, detail);
    },
    done() {
      dismissToast(id);
    },
  };
}

export type ProgressHandle = ReturnType<typeof notifyProgress>;

/** Used by the tests, and by nothing else. */
export function clearToasts() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  toasts = [];
  emit();
}
