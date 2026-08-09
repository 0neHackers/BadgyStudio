"use client";

/* eslint-disable @next/next/no-img-element */
import { COLORS, EVENT } from "@/lib/brand";
import { brandSrc } from "@/lib/brand-assets";

/**
 * Event marks.
 *
 * Two kinds live in here and the distinction matters.
 *
 * OFFICIAL FILES, in /public/brand, taken from hhgoa.com:
 *   hacker-house.png      the HACKER HOUSE wordmark
 *   goa-devanagari.svg    the गोवा sticker
 *   247pm-studio.svg      the organiser lockup
 * These are the event's identity marks and belong to the event. They are here
 * because this is a badge generator for that event and the task asks for an
 * instantly recognisable identity. If this code is ever reused for anything
 * else, delete them.
 *
 * DRAWN BY US, in code below:
 *   SunBurst, PalmRow, Perforation
 * The site's own sun and palm illustrations are original artwork rather than
 * identity marks, so they are not copied. These are built from the same
 * geometry the site uses (thin rays over a half disc on a hard horizon, with
 * reflection dashes) so they sit alongside the real marks without pretending
 * to be them.
 *
 * Every coordinate out of a trig call is rounded. Node and Chrome disagree in
 * the last bits of Math.cos, which threw a hydration mismatch in V00.00.
 */

const round = (n: number) => Math.round(n * 100) / 100;

/* ---------------------------------------------------------------- official */

/**
 * The wordmark. Loaded as an <img> from /public so it is same-origin, which is
 * what lets html-to-image inline it into the exported PNG.
 */
export function HouseWordmark({
  className,
  height = 64,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <img
      src={brandSrc("wordmark")}
      alt={EVENT.name}
      className={className}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}

/** The गोवा sticker. Square, and reads as a stamp on a badge. */
export function GoaSticker({ className, size = 96 }: { className?: string; size?: number }) {
  return (
    <img
      src={brandSrc("goa")}
      alt="Goa"
      className={className}
      style={{ width: size, height: size, display: "block" }}
    />
  );
}

/** Organiser lockup, for the card footer. */
export function OrganiserMark({ className, height = 40 }: { className?: string; height?: number }) {
  return (
    <img
      src={brandSrc("studio")}
      alt={EVENT.organiser}
      className={className}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}

/* ------------------------------------------------------------------- drawn */

/**
 * Sunrise. Redrawn to follow the site's illustration: a half disc resting on
 * the horizon, thin rays fanning above it, and short dashes below standing in
 * for the reflection on water. The earlier version used thick banded stripes
 * across the disc, which was not what the site does.
 */
export function SunBurst({
  className,
  color = COLORS.sun,
  line = COLORS.ink,
}: {
  className?: string;
  color?: string;
  line?: string;
}) {
  const rays = Array.from({ length: 11 }, (_, i) => i);
  const cx = 100;
  const cy = 104;
  const r = 34;

  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden="true">
      {/* Rays: thin, evenly fanned, stopping short of the disc. */}
      {rays.map((i) => {
        const rad = ((186 + (i * 168) / (rays.length - 1)) * Math.PI) / 180;
        const inner = r + 12;
        const outer = r + (i % 2 === 0 ? 40 : 27);
        return (
          <line
            key={i}
            x1={round(cx + Math.cos(rad) * inner)}
            y1={round(cy + Math.sin(rad) * inner)}
            x2={round(cx + Math.cos(rad) * outer)}
            y2={round(cy + Math.sin(rad) * outer)}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}

      {/* Half disc sitting on the horizon. */}
      <path d={`M${cx - r} ${cy} a${r} ${r} 0 0 1 ${r * 2} 0 Z`} fill={color} />

      {/* Horizon. */}
      <line x1="6" y1={cy} x2="194" y2={cy} stroke={line} strokeWidth="4" strokeLinecap="round" />

      {/* Reflection dashes, narrowing as they recede. */}
      {[0, 1, 2, 3].map((i) => {
        const w = 30 - i * 6;
        const y = cy + 9 + i * 9;
        return (
          <line
            key={i}
            x1={cx - w}
            y1={y}
            x2={cx + w}
            y2={y}
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export function PalmRow({ className, color = COLORS.ink }: { className?: string; color?: string }) {
  const frond = (cx: number, cy: number, dx: number, dy: number) =>
    `M${cx} ${cy} Q ${round(cx + dx * 0.5)} ${round(cy + dy * 1.6)} ${cx + dx} ${cy + dy}`;

  return (
    <svg viewBox="0 0 240 80" className={className} aria-hidden="true">
      {[30, 95, 165, 220].map((x, index) => {
        const h = index % 2 === 0 ? 46 : 34;
        return (
          <g key={x} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round">
            <path d={`M${x} 80 Q ${x + (index % 2 ? 5 : -5)} ${80 - h / 2} ${x} ${80 - h}`} />
            <path d={frond(x, 80 - h, -20, -6)} />
            <path d={frond(x, 80 - h, 20, -6)} />
            <path d={frond(x, 80 - h, -14, -14)} />
            <path d={frond(x, 80 - h, 14, -14)} />
          </g>
        );
      })}
    </svg>
  );
}

/** Repeating ticket-stub perforation. */
export function Perforation({
  className,
  count = 24,
  color = COLORS.ink,
}: {
  className?: string;
  count?: number;
  color?: string;
}) {
  return (
    <div className={`flex flex-col justify-between ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="block h-[6px] w-[6px] rounded-full"
          style={{ backgroundColor: color, opacity: 0.5 }}
        />
      ))}
    </div>
  );
}
