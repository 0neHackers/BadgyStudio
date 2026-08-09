"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { APP, COLORS, EVENT } from "@/lib/brand";
import { warmBrandAssets } from "@/lib/brand-assets";
import { buildFontEmbedCss } from "@/lib/export";
import { OneHackersMark } from "@/components/BrandMarks";
import { BannerWithYear, StudioMark } from "@/components/Lockups";

/**
 * The boot screen.
 *
 * WHAT IT IS FOR
 *
 * The app has real startup work: two webfonts have to resolve before any type
 * is right, the three brand marks have to be fetched and turned into data URLs
 * before an export can inline them, and the font embed stylesheet has to be
 * built. Until V05.05 that all happened behind a page that was already on
 * screen, so the first thing a visitor saw was the layout assembling itself in
 * fallback type and then reflowing.
 *
 * So the wait is now something to look at, and the work it waits on is the
 * work that was happening anyway. Nothing here is a fake timer dressed up as
 * loading; the bar tracks four real milestones. The floor and ceiling exist
 * for different reasons: a 750 ms floor because a screen that flashes past is
 * worse than none, and a 4 s ceiling because a brand mark that will not load
 * must never be able to trap someone outside the app.
 *
 * WHAT IT IS DRAWN FROM
 *
 * The same vocabulary as the badges: the guilloche rosette from the security
 * print, the sunray fan the site uses, bathymetric contours for the coast, the
 * palms, and a microtext rule. Roughly a hundred and forty elements, all
 * animated in CSS with no JavaScript in the loop, so a slow machine drops
 * frames rather than blocking on the very work the screen is waiting for.
 *
 * It is inert on purpose: aria-hidden, pointer-events none, no focusable
 * child. Someone tabbing during the boot lands in the app, not in the
 * decoration.
 */

const STEPS = ["Setting type", "Inlining brand marks", "Preparing the exporter", "Ready"];

/** Long enough to read, short enough not to be a toll gate. */
const MIN_MS = 750;
/** Nothing that fails to load may keep anyone out of the app. */
const MAX_MS = 4000;

/** How long the boot screen takes to fade. Must match `boot-out` in globals.css. */
const OUT_MS = 420;

export function BootScreen({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(0);
  /** The app is visible and animating in. The boot screen may still be fading. */
  const [revealed, setRevealed] = useState(false);
  /** The boot screen has finished fading and can leave the DOM. */
  const [gone, setGone] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    startedAt.current = performance.now();

    const advance = (next: number) => {
      if (!cancelled) setStep((current) => Math.max(current, next));
    };

    const finish = async () => {
      if (cancelled) return;
      const elapsed = performance.now() - startedAt.current;
      if (elapsed < MIN_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_MS - elapsed));
      }
      if (cancelled) return;
      // The two overlap on purpose: the app rises through the cover as it
      // fades, rather than waiting behind a blank screen for it to finish.
      setRevealed(true);
      setTimeout(() => {
        if (!cancelled) setGone(true);
      }, OUT_MS + 40);
    };

    // The ceiling is armed first so a hung fetch cannot outlive it.
    const ceiling = setTimeout(() => void finish(), MAX_MS);

    void (async () => {
      try {
        await (document.fonts?.ready ?? Promise.resolve());
      } catch {
        // The font loading API is advisory. Carrying on is correct.
      }
      advance(1);

      await warmBrandAssets();
      advance(2);

      // Building the embed stylesheet here means the first export does not
      // have to. It is ~110 KB of base64 and it is cached for the session.
      await buildFontEmbedCss().catch(() => "");
      advance(3);

      await finish();
    })();

    return () => {
      cancelled = true;
      clearTimeout(ceiling);
    };
  }, []);

  return (
    <>
      {gone ? null : <BootArt step={step} leaving={revealed} />}
      {/* The app shell.
          - It is laid out from the first paint and only held at opacity 0, so
            the stage has already measured itself and nothing reflows when it
            appears.
          - `app-scale` is the 90% the interface runs at from V05.06 on. It
            sits here, on the wrapper around the page, rather than on <body>,
            because CSS zoom scales the containing block of a fixed element:
            put it on the body and the boot screen, the ambient layer and the
            cursor would each cover 90% of the viewport instead of all of it.
            Those three are siblings of this wrapper, so they stay at 1. */}
      <div className={`app-scale ${revealed ? "boot-reveal" : "boot-hold"}`}>{children}</div>
    </>
  );
}

function BootArt({ step, leaving }: { step: number; leaving: boolean }) {
  const rays = Array.from({ length: 26 }, (_, i) => i);
  const rosette = Array.from({ length: 16 }, (_, i) => i);
  const contours = [0, 1, 2, 3, 4, 5];
  const motes = Array.from({ length: 18 }, (_, i) => i);
  const perfs = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="boot" data-leaving={leaving ? "true" : "false"} aria-hidden="true" role="presentation">
      <svg className="boot-art" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="boot-corner" cx="88%" cy="12%" r="60%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="boot-corner-mask">
            <rect width="1200" height="800" fill="url(#boot-corner)" />
          </mask>
          <linearGradient id="boot-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="55%" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="boot-fade-mask">
            <rect width="1200" height="800" fill="url(#boot-fade)" />
          </mask>
          <pattern id="boot-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.5" fill={COLORS.paper} opacity="0.5" />
          </pattern>
        </defs>

        {/* Sunray fan, sweeping out of the corner the site's sun sits in. */}
        <g className="boot-rays" mask="url(#boot-corner-mask)">
          {rays.map((i) => {
            const angle = 96 + i * 7.2;
            const rad = (angle * Math.PI) / 180;
            return (
              <line
                key={i}
                x1="1056"
                y1="96"
                x2={Math.round(1056 + Math.cos(rad) * 1400)}
                y2={Math.round(96 + Math.sin(rad) * 1400)}
                stroke={i % 2 === 0 ? COLORS.sun : COLORS.paper}
                strokeWidth={i % 2 === 0 ? 3 : 1}
                opacity={i % 2 === 0 ? 0.4 : 0.18}
                style={{ animationDelay: `${i * 55}ms` }}
                className="boot-ray"
              />
            );
          })}
        </g>

        {/* Bathymetric contours, drifting. Each one is a drawn stroke, so the
            coast writes itself in rather than appearing. */}
        <g mask="url(#boot-fade-mask)">
          {contours.map((i) => (
            <path
              key={i}
              className="boot-contour"
              style={{ animationDelay: `${i * 130}ms` }}
              d={`M-80 ${640 + i * 26}
                  C 220 ${560 - i * 34}, 420 ${720 - i * 18}, 700 ${590 - i * 40}
                  S 1000 ${430 - i * 26}, 1300 ${520 - i * 44}`}
              fill="none"
              stroke={i % 3 === 0 ? COLORS.sun : COLORS.paper}
              strokeWidth={i % 3 === 0 ? 2.4 : 1.2}
              opacity={i % 3 === 0 ? 0.55 : 0.3}
            />
          ))}
        </g>

        {/* Guilloche rosette. The security-print tell, turning slowly. */}
        <g className="boot-rosette" transform="translate(196 606)">
          {rosette.map((i) => (
            <ellipse
              key={i}
              rx="150"
              ry="52"
              fill="none"
              stroke={i % 4 === 0 ? COLORS.sun : COLORS.paper}
              strokeWidth={i % 4 === 0 ? 1.4 : 0.8}
              opacity={i % 4 === 0 ? 0.5 : 0.26}
              transform={`rotate(${Math.round((i * 180) / rosette.length)})`}
            />
          ))}
        </g>

        {/* A second rosette, counter-turning, so the field never looks rigid. */}
        <g className="boot-rosette boot-rosette-alt" transform="translate(1010 640)">
          {rosette.slice(0, 11).map((i) => (
            <ellipse
              key={i}
              rx="104"
              ry="36"
              fill="none"
              stroke={COLORS.paper}
              strokeWidth="0.8"
              opacity="0.22"
              transform={`rotate(${Math.round((i * 180) / 11)})`}
            />
          ))}
        </g>

        {/* Halftone field. */}
        <rect x="0" y="656" width="1200" height="144" fill="url(#boot-dots)" opacity="0.28" />

        {/* Palms, rising from the foot. */}
        <g className="boot-palms">
          {[0.09, 0.19, 0.83, 0.93].map((fx, i) => {
            const x = Math.round(1200 * fx);
            const base = 786;
            const h = i === 1 || i === 2 ? 132 : 100;
            const top = base - h;
            const frond = (dx: number, dy: number) =>
              `M${x} ${top} Q ${Math.round(x + dx * 0.55)} ${Math.round(top + dy * 1.7)} ${Math.round(
                x + dx,
              )} ${Math.round(top + dy)}`;
            return (
              <g
                key={fx}
                className="boot-palm"
                style={{ animationDelay: `${180 + i * 110}ms` }}
                stroke={i % 2 === 0 ? COLORS.paper : COLORS.sun}
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
                opacity="0.5"
              >
                <path d={`M${x} ${base} Q ${x + 8} ${base - h / 2} ${x} ${top}`} />
                <path d={frond(-40, -10)} />
                <path d={frond(40, -10)} />
                <path d={frond(-28, -30)} />
                <path d={frond(28, -30)} />
                <path d={frond(0, -40)} />
              </g>
            );
          })}
        </g>

        {/* Motes. The only thing here with no counterpart on a badge; they are
            what stops the field reading as a static illustration. */}
        <g>
          {motes.map((i) => (
            <circle
              key={i}
              className="boot-mote"
              cx={Math.round(40 + ((i * 137) % 1120))}
              cy={Math.round(120 + ((i * 313) % 620))}
              r={i % 3 === 0 ? 3 : 1.8}
              fill={i % 4 === 0 ? COLORS.sun : COLORS.paper}
              opacity="0.5"
              style={{ animationDelay: `${i * 240}ms`, animationDuration: `${5200 + i * 190}ms` }}
            />
          ))}
        </g>

        {/* Perforation rule, the ticket-stub tell, across the middle. */}
        <g opacity="0.3">
          {perfs.map((i) => (
            <line
              key={i}
              className="boot-perf"
              style={{ animationDelay: `${i * 45}ms` }}
              x1={Math.round(60 + i * 46)}
              y1="404"
              x2={Math.round(60 + i * 46 + 22)}
              y2="404"
              stroke={COLORS.paper}
              strokeWidth="2"
            />
          ))}
        </g>
      </svg>

      {/* The plate reads top to bottom: whose event it is, who runs it, what
          this tool is, how far along it is, and who built it. The set-in-type
          "HH GOA 2026" that stood in for the first of those in V05.06 was a
          placeholder for a mark the app already had. */}
      <div className="boot-plate">
        <BannerWithYear height={44} yearColor={COLORS.paper} />

        <div className="boot-organiser">
          <span>BY</span>
          <StudioMark height={20} />
        </div>

        <p className="boot-title">{APP.name}</p>
        <p className="boot-sub">{APP.tagline}</p>

        <div className="boot-rail">
          <span
            className="boot-rail-fill"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <p className="boot-status">
          <span className="boot-dot" />
          {STEPS[Math.min(step, STEPS.length - 1)]}
        </p>

        <p className="boot-where">
          {EVENT.location} · {EVENT.dates}
        </p>

        <div className="boot-credit">
          <OneHackersMark height={18} />
        </div>
      </div>

      <div className="boot-micro">
        <div className="boot-micro-run">
          {`${EVENT.shortName} ${EVENT.edition} · ${EVENT.coords} · ${EVENT.tagline.toUpperCase()} · ${EVENT.hashtag} · `.repeat(
            6,
          )}
        </div>
      </div>
    </div>
  );
}
