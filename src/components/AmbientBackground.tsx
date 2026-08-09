"use client";

import { useEffect, useRef } from "react";
import { COLORS, EVENT } from "@/lib/brand";

/**
 * Site-wide ambient layer.
 *
 * V04.00 had four blurred fields and a grid, which was still reading flat. This
 * adds the pieces that make it feel like a place: a sun sitting on a horizon,
 * a palm line, a scrolling coordinate ticker, dune contours, and a vignette to
 * hold the edges. All in the event palette, all drawn here.
 *
 * It sits on a fixed layer at z-index -1, outside every artboard, so it can
 * never appear in an exported PNG. The badge has to be deterministic; this
 * moves.
 *
 * Cost control, because this runs on phones:
 *   - only transform and opacity animate, so it stays on the compositor
 *   - pointer moves feed one rAF loop that stops itself on arrival
 *   - pointer tracking is skipped on coarse pointers, where there is no cursor
 *     to follow and the listener would only cost battery
 *   - the whole thing is dropped under prefers-reduced-motion
 */

interface Orb {
  hex: string;
  x: number;
  y: number;
  size: number;
  /** Parallax weight, in px per unit of pointer travel. */
  depth: number;
  drift: string;
  opacity: number;
}

const ORBS: Orb[] = [
  { hex: COLORS.sun, x: 10, y: 12, size: 48, depth: 30, drift: "drift-a", opacity: 0.42 },
  { hex: COLORS.palm, x: 86, y: 18, size: 56, depth: 18, drift: "drift-b", opacity: 0.34 },
  { hex: COLORS.neon, x: 72, y: 74, size: 40, depth: 40, drift: "drift-c", opacity: 0.26 },
  { hex: COLORS.sun, x: 24, y: 86, size: 46, depth: 24, drift: "drift-d", opacity: 0.38 },
  { hex: COLORS.palm, x: 48, y: 46, size: 62, depth: 12, drift: "drift-b", opacity: 0.2 },
];

export function AmbientBackground() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    ) {
      return;
    }

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    const nodes = Array.from(layer.querySelectorAll<HTMLElement>("[data-depth]"));

    const tick = () => {
      // Ease rather than snap. 0.06 is slow enough to read as weight.
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;

      for (const node of nodes) {
        const depth = Number(node.dataset.depth ?? 0);
        node.style.transform = `translate3d(${(currentX * depth).toFixed(2)}px, ${(
          currentY * depth
        ).toFixed(2)}px, 0)`;
      }

      frame =
        Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001
          ? requestAnimationFrame(tick)
          : 0;
    };

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  /*
   * suppressHydrationWarning appears on this div and the three below it.
   *
   * Every mismatch reported against this tree is `bis_skin_checked`, an
   * attribute a browser extension stamps onto every <div> before React
   * hydrates. It is not in our markup and we cannot stop it being added.
   * suppressHydrationWarning silences attribute mismatches on the element it
   * is set on, which is the right scope here: our own attributes on these
   * nodes are static, so nothing real can hide behind it.
   */
  return (
      <div ref={layerRef} className="ambient" aria-hidden="true" suppressHydrationWarning>
      {ORBS.map((orb, index) => (
        <span
          key={index}
          data-depth={orb.depth}
          className={`ambient-orb ${orb.drift}`}
          style={{
            left: `${orb.x}%`,
            top: `${orb.y}%`,
            width: `${orb.size}vmax`,
            height: `${orb.size}vmax`,
            backgroundColor: orb.hex,
            opacity: orb.opacity,
          }}
        />
      ))}

      {/* Sun on a horizon, low and to the right, following the event's own
          illustration. Parallaxes further than the orbs so it reads as distant. */}
      <svg className="ambient-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="amb-cells" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M44 0H0V44" fill="none" stroke={COLORS.ink} strokeWidth="0.7" />
          </pattern>
          <radialGradient id="amb-vignette" cx="50%" cy="46%" r="72%">
            <stop offset="55%" stopColor={COLORS.ink} stopOpacity="0" />
            <stop offset="100%" stopColor={COLORS.ink} stopOpacity="0.16" />
          </radialGradient>
        </defs>

        <rect width="1600" height="900" fill="url(#amb-cells)" opacity="0.32" />

        <g data-depth="9" opacity="0.5">
          {/* Rays */}
          {Array.from({ length: 15 }, (_, i) => {
            const rad = ((192 + i * 12) * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={1210}
                y1={556}
                x2={Math.round(1210 + Math.cos(rad) * 460)}
                y2={Math.round(556 + Math.sin(rad) * 460)}
                stroke={COLORS.sun}
                strokeWidth={i % 2 ? 2 : 5}
                strokeLinecap="round"
              />
            );
          })}
          <path d="M1080 556a130 130 0 0 1 260 0Z" fill={COLORS.sun} />
          <line x1="0" y1="556" x2="1600" y2="556" stroke={COLORS.ink} strokeWidth="3" opacity="0.5" />
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={1210 - 120 + i * 22}
              y1={578 + i * 22}
              x2={1210 + 120 - i * 22}
              y2={578 + i * 22}
              stroke={COLORS.sun}
              strokeWidth="7"
              strokeLinecap="round"
              opacity={0.75 - i * 0.11}
            />
          ))}
        </g>

        {/* Dune contours */}
        <g data-depth="16" opacity="0.3" fill="none" stroke={COLORS.palm} strokeWidth="2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path
              key={i}
              d={`M-60 ${700 + i * 42} C 300 ${610 + i * 42}, 620 ${790 + i * 42}, 980 ${
                660 + i * 42
              } S 1420 ${560 + i * 42}, 1660 ${640 + i * 42}`}
            />
          ))}
        </g>

        {/* Palms along the foot */}
        <g data-depth="26" opacity="0.42" stroke={COLORS.ink} strokeWidth="5" fill="none" strokeLinecap="round">
          {[120, 300, 1420].map((x, i) => {
            const h = i === 1 ? 210 : 165;
            const top = 900 - h;
            const frond = (dx: number, dy: number) =>
              `M${x} ${top} Q ${x + dx * 0.55} ${top + dy * 1.7} ${x + dx} ${top + dy}`;
            return (
              <g key={x}>
                <path d={`M${x} 900 Q ${x + (i % 2 ? 14 : -14)} ${top + h / 2} ${x} ${top}`} />
                <path d={frond(-62, -16)} />
                <path d={frond(62, -16)} />
                <path d={frond(-44, -48)} />
                <path d={frond(44, -48)} />
                <path d={frond(0, -62)} />
              </g>
            );
          })}
        </g>

        <rect width="1600" height="900" fill="url(#amb-vignette)" />
      </svg>

      {/* Coordinate ticker, drifting across the horizon line. */}
      <div className="ambient-ticker" suppressHydrationWarning>
        <div className="ticker" suppressHydrationWarning>
          {Array.from({ length: 2 }, (_, i) => (
            <span key={i} className="ticker-run">
              {`${EVENT.location} · ${EVENT.coords} · ${EVENT.dates} · ${EVENT.tagline.toUpperCase()} · `.repeat(
                4,
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="ambient-grain" suppressHydrationWarning />
    </div>
  );
}
