"use client";

/* eslint-disable @next/next/no-img-element */
import { COLORS, EVENT } from "@/lib/brand";
import { brandSrc } from "@/lib/brand-assets";

/**
 * Composite lockups.
 *
 * The event's banner sets the गोवा sticker over the middle of the HACKER HOUSE
 * wordmark, so the two marks read as one. Both files are already in
 * /public/brand, so the lockup is built by overlaying them rather than by
 * shipping a third image.
 *
 * The sticker sits at 50% and is centred with a translate, which keeps the
 * overlap correct at any height, since the wordmark is sized by height with
 * width left automatic.
 */

export function BannerLockup({
  height = 52,
  className,
  onDark = true,
  /**
   * CSS length for the height, used where the lockup should scale with the
   * viewport. Takes precedence over `height`.
   *
   * This exists because the component sets its own `display`, so a `hidden`
   * utility passed through `className` never won the cascade and both the
   * desktop and mobile instances rendered at 320px. One scaling instance is the
   * correct answer anyway.
   */
  fluidHeight,
}: {
  height?: number;
  className?: string;
  /** The wordmark is yellow with a black shadow and needs a dark ground. */
  onDark?: boolean;
  fluidHeight?: string;
}) {
  const h = fluidHeight ?? `${height}px`;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center ${className ?? ""}`}
      style={{
        height: h,
        paddingInline: `calc(${h} * 0.18)`,
        backgroundColor: onDark ? COLORS.ink : "transparent",
      }}
    >
      <img
        src={brandSrc("wordmark")}
        alt={EVENT.name}
        style={{ height: `calc(${h} * 0.72)`, width: "auto", display: "block" }}
      />
      {/* The sticker straddles the wordmark, exactly as the banner does. */}
      <img
        src={brandSrc("goa")}
        alt="Goa"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          height: `calc(${h} * 0.86)`,
          width: "auto",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />
    </span>
  );
}

/** Banner lockup plus the year, for artboard headers. */
export function BannerWithYear({
  height = 48,
  yearColor = COLORS.paper,
  shadow,
}: {
  height?: number;
  yearColor?: string;
  shadow?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: height * 0.28,
        backgroundColor: COLORS.ink,
        border: `${Math.max(4, height * 0.1)}px solid ${COLORS.ink}`,
        paddingInline: height * 0.3,
        boxShadow: shadow ? `6px 6px 0 0 ${shadow}` : undefined,
      }}
    >
      <BannerLockup height={height} onDark={false} />
      <span
        className="font-[family-name:var(--font-mono)] font-bold leading-none"
        style={{
          fontSize: height * 0.86,
          color: yearColor,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}
      >
        {EVENT.edition}
      </span>
    </span>
  );
}

/** The organiser lockup. */
export function StudioMark({ height = 34, className }: { height?: number; className?: string }) {
  return (
    <img
      src={brandSrc("studio")}
      alt={EVENT.organiser}
      className={className}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
