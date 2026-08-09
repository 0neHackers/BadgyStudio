import { APP } from "@/lib/brand";

/**
 * The Badgy Studio lockup.
 *
 * Horizontal, with the tagline set beneath it. An earlier version ran this
 * rotated down the banner edge, which was not asked for and made the tagline
 * unreadable at a glance.
 *
 * Two faces on purpose: "Badgy" in Cal Sans, the app's own display face, and
 * "Studio" in Imbue, the event's. The pairing ties the product to the event it
 * badges without either one impersonating the other.
 */
export function AppLockup({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className ?? ""}`} aria-hidden="true">
      <div className="whitespace-nowrap" style={{ lineHeight: 1 }}>
        <span
          className="font-[family-name:var(--font-display)] text-sun"
          style={{ fontSize: "clamp(1.7rem, 4vw, 3.4rem)", letterSpacing: "-0.02em" }}
        >
          Badgy
        </span>
        <span
          className="font-[family-name:var(--font-chrome)] font-bold text-paper"
          style={{ fontSize: "clamp(1.7rem, 4vw, 3.4rem)", letterSpacing: "0.01em" }}
        >
          {" "}
          Studio
        </span>
      </div>
      <div
        className="mt-2 font-[family-name:var(--font-mono)] tracking-[0.18em] text-paper/55"
        style={{ fontSize: "clamp(0.52rem, 0.9vw, 0.66rem)" }}
      >
        {APP.tagline.toUpperCase()}
      </div>
    </div>
  );
}
