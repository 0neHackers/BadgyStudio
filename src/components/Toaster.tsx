"use client";

import { useSyncExternalStore } from "react";
import {
  NO_TOASTS,
  dismissToast,
  subscribeToasts,
  toastSnapshot,
  type Toast,
  type ToastKind,
} from "@/lib/toast";

/**
 * Where notifications appear.
 *
 * Mounted in the root layout beside the boot screen and the batch status
 * strip, and for the same reason: it has to outlive any route, because a bulk
 * run started on /bulk can finish while somebody is on /passes.
 *
 * Bottom left, because the batch strip already owns bottom right and two
 * stacks fighting over the same corner is worse than either. Above the strip's
 * z-index so a toast is never half-covered by it.
 */

const TONE: Record<ToastKind, { bg: string; text: string; label: string }> = {
  success: { bg: "var(--color-palm)", text: "var(--color-paper)", label: "Done" },
  info: { bg: "var(--color-paper)", text: "var(--color-ink)", label: "Note" },
  warning: { bg: "var(--color-sun)", text: "var(--color-ink)", label: "Careful" },
  error: { bg: "var(--color-flag)", text: "var(--color-paper)", label: "Failed" },
  progress: { bg: "var(--color-ink)", text: "var(--color-paper)", label: "Working" },
};

function Glyph({ kind }: { kind: ToastKind }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": true as const,
    style: { display: "block", flexShrink: 0 },
  };
  const stroke = { stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "square" as const };

  if (kind === "success") {
    return (
      <svg {...common}>
        <path d="M3 8.5l3.5 3.5L13 4.5" {...stroke} />
      </svg>
    );
  }
  if (kind === "error") {
    return (
      <svg {...common}>
        <path d="M4 4l8 8M12 4l-8 8" {...stroke} />
      </svg>
    );
  }
  if (kind === "warning") {
    return (
      <svg {...common}>
        <path d="M8 3v6M8 12.2v.6" {...stroke} />
      </svg>
    );
  }
  if (kind === "progress") {
    // Two arcs turning. The only spinner in the app, and it is 14px.
    return (
      <svg {...common} className="toast-spin">
        <path d="M8 1.6a6.4 6.4 0 0 1 6.4 6.4" {...stroke} />
        <path d="M8 14.4A6.4 6.4 0 0 1 1.6 8" {...stroke} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 7v5M8 4.2v.6" {...stroke} />
    </svg>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const tone = TONE[toast.kind];
  const showBar =
    toast.kind === "progress" &&
    typeof toast.progress === "number" &&
    Number.isFinite(toast.progress);

  return (
    <li
      className="toast-card"
      style={{ backgroundColor: tone.bg, color: tone.text }}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <span className="toast-glyph" aria-hidden="true">
        <Glyph kind={toast.kind} />
      </span>

      <span className="toast-body">
        <span className="toast-kind">{tone.label}</span>
        <span className="toast-title">{toast.title}</span>
        {toast.detail ? <span className="toast-detail">{toast.detail}</span> : null}
        {showBar ? (
          <span className="toast-bar" aria-hidden="true">
            <span
              className="toast-bar-fill"
              style={{ width: `${Math.round((toast.progress ?? 0) * 100)}%` }}
            />
          </span>
        ) : null}
      </span>

      <button
        type="button"
        className="toast-close"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
        </svg>
      </button>
    </li>
  );
}

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, toastSnapshot, () => NO_TOASTS);

  if (toasts.length === 0) return null;

  return (
    <ul className="toast-stack" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </ul>
  );
}
