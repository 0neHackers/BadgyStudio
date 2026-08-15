"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { answerConfirm, confirmSnapshot, subscribeConfirm } from "@/lib/confirm";
import { Button } from "@/components/ui/controls";

/**
 * The confirmation dialog.
 *
 * Mounted in the root layout beside the boot screen, the batch strip and the
 * toasts, for the same reason all four are there: it has to outlive any route.
 *
 * Built from the app's own vocabulary rather than a new one: hard 4px border,
 * the offset slab shadow with no blur, paper on ink, the display face for the
 * heading and mono for the label above it. The entrance is `pop-in`, which is
 * the same curve the builder class and the toasts use, so it belongs to the
 * same app rather than merely sitting inside it.
 *
 * WHAT IT DOES THAT window.confirm CANNOT
 *
 *  - Says which answer is dangerous, in colour and in words. "Delete 25 passes"
 *    rather than "OK".
 *  - Focuses the safe answer on a destructive question, so Return does not
 *    delete anything.
 *  - Does not block the main thread, so a bulk run keeps going behind it.
 *  - Traps focus, closes on Escape, and closes on a backdrop click, all of
 *    which a native dialog gives you and a hand-rolled one usually forgets.
 */
export function ConfirmDialog() {
  const dialog = useSyncExternalStore(subscribeConfirm, confirmSnapshot, () => null);
  const panelRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);
  const dangerRef = useRef<HTMLButtonElement>(null);

  const danger = dialog?.tone === "danger";

  useEffect(() => {
    if (!dialog) return;

    // The safe answer takes focus on a destructive question. On an ordinary
    // one the confirm button does, because that is the answer being asked for.
    const target = danger ? safeRef.current : dangerRef.current;
    target?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        answerConfirm(false);
        return;
      }
      if (event.key !== "Tab") return;

      // Focus trap. Two buttons, so this is short, but leaving Tab to escape a
      // modal is how somebody ends up typing into the page behind it.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>("button");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // The page behind must not scroll under a modal.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [dialog, danger]);

  if (!dialog) return null;

  return (
    <div
      className="confirm-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        // Only a press on the backdrop itself, not one that started inside the
        // panel and drifted out while selecting text.
        if (event.target === event.currentTarget) answerConfirm(false);
      }}
    >
      <div
        ref={panelRef}
        className="confirm-panel pop-in"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={dialog.body ? "confirm-body" : undefined}
      >
        <p
          className="font-[family-name:var(--font-mono)] font-bold tracking-[0.2em]"
          style={{ fontSize: "0.77rem", color: danger ? "var(--color-flag)" : "var(--color-ink)", opacity: 0.75 }}
        >
          {danger ? "THIS CANNOT BE UNDONE" : "CONFIRM"}
        </p>

        <h2
          id="confirm-title"
          className="mt-1.5 font-[family-name:var(--font-display)] leading-tight"
          style={{ fontSize: "var(--step-2)" }}
        >
          {dialog.title}
        </h2>

        {dialog.body ? (
          <p
            id="confirm-body"
            className="mt-2 max-w-[52ch] leading-relaxed text-ink/70"
            style={{ fontSize: "var(--step--1)" }}
          >
            {dialog.body}
          </p>
        ) : null}

        {dialog.bullets && dialog.bullets.length > 0 ? (
          <ul
            className="mt-3 grid gap-1 border-[2px] border-ink/25 bg-paper/70 px-3 py-2"
            style={{ fontSize: "var(--step--1)" }}
          >
            {dialog.bullets.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-ink/40">
                  ·
                </span>
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button ref={safeRef} onClick={() => answerConfirm(false)}>
            {dialog.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            ref={dangerRef}
            variant={danger ? "danger" : "primary"}
            onClick={() => answerConfirm(true)}
          >
            {dialog.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
