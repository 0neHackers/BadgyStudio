import { COLORS } from "@/lib/brand";

/**
 * Decorative fill for the two full-bleed chrome panels.
 *
 * Non-interactive by construction: `pointer-events: none`, `aria-hidden`, and
 * absolutely positioned behind its panel's content. Nothing here animates,
 * because both panels already sit over the ambient layer, which does.
 *
 * Two variants, deliberately different so the top and the bottom of the page
 * do not read as the same wallpaper twice:
 *
 *   banner  arcs. Concentric rings thrown from off the right edge, crossed by
 *           a ray fan and a low horizon. Open and airy, because the banner
 *           carries a large headline and a vertical lockup.
 *   footer  strata. Horizontal contour bands, a dot matrix and tick rules.
 *           Denser and flatter, because the footer is a thin strip of small
 *           type and can carry more texture without competing.
 *
 * Fixed geometry, no Math.random, so neither can shift between renders.
 */

const round = (n: number) => Math.round(n * 100) / 100;

export function PanelDecor({
  variant,
  tone = COLORS.paper,
  accent = COLORS.sun,
  opacity = 1,
}: {
  variant: "banner" | "footer";
  /** Line colour. Both panels are dark, so this is normally the paper. */
  tone?: string;
  accent?: string;
  opacity?: number;
}) {
  const common = {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none" as const,
  };

  if (variant === "banner") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 1600 420"
        preserveAspectRatio="xMaxYMid slice"
        style={{ ...common, opacity }}
      >
        {/* Concentric arcs thrown from beyond the right edge. */}
        <g fill="none" opacity="0.22">
          {[140, 240, 340, 440, 540, 640, 740].map((r, i) => (
            <circle
              key={r}
              cx="1520"
              cy="210"
              r={r}
              stroke={i % 3 === 0 ? accent : tone}
              strokeWidth={i % 3 === 0 ? 2.4 : 1.2}
            />
          ))}
        </g>

        {/* Ray fan across the same origin, cut short so it stays background. */}
        <g opacity="0.2">
          {Array.from({ length: 13 }, (_, i) => {
            const rad = ((150 + i * 5.6) * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={round(1520 + Math.cos(rad) * 180)}
                y1={round(210 + Math.sin(rad) * 180)}
                x2={round(1520 + Math.cos(rad) * 760)}
                y2={round(210 + Math.sin(rad) * 760)}
                stroke={i % 2 ? tone : accent}
                strokeWidth={i % 2 ? 1.1 : 2.2}
                strokeLinecap="round"
              />
            );
          })}
        </g>

        {/* Low horizon with a couple of swells. */}
        <g opacity="0.16" stroke={tone} fill="none">
          <line x1="0" y1="330" x2="1600" y2="330" strokeWidth="2" />
          {[0, 1].map((i) => (
            <path
              key={i}
              d={`M-20 ${356 + i * 26} q 100 ${i % 2 ? -12 : 12} 200 0 t 200 0 t 200 0 t 200 0 t 200 0 t 200 0 t 200 0 t 200 0`}
              strokeWidth="1.6"
            />
          ))}
        </g>
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1600 260"
      preserveAspectRatio="none"
      style={{ ...common, opacity }}
    >
      <defs>
        <pattern id="decor-matrix" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill={tone} />
        </pattern>
      </defs>

      {/* Strata: flat contour bands, tighter toward the foot. */}
      <g fill="none" opacity="0.2">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path
            key={i}
            d={`M-40 ${52 + i * 30} C 300 ${34 + i * 30}, 620 ${76 + i * 30}, 940 ${
              48 + i * 30
            } S 1360 ${26 + i * 30}, 1640 ${60 + i * 30}`}
            stroke={i % 3 === 0 ? accent : tone}
            strokeWidth={i % 3 === 0 ? 2 : 1}
          />
        ))}
      </g>

      {/* Dot matrix, left third only, so the right side stays clean for the
          credits row. */}
      <rect x="0" y="0" width="520" height="260" fill="url(#decor-matrix)" opacity="0.16" />

      {/* Tick rules along the top edge, like a measuring scale. */}
      <g opacity="0.24" stroke={tone}>
        {Array.from({ length: 40 }, (_, i) => (
          <line
            key={i}
            x1={i * 40}
            y1="0"
            x2={i * 40}
            y2={i % 5 === 0 ? 16 : 8}
            strokeWidth={i % 5 === 0 ? 2 : 1}
          />
        ))}
      </g>
    </svg>
  );
}
