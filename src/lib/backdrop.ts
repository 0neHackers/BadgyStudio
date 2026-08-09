import { COLORS, EVENT } from "@/lib/brand";

/**
 * Artboard backdrops, emitted as a standalone SVG document.
 *
 * WHY THIS IS A STRING AND NOT A COMPONENT
 *
 * Up to V05.05 this was ~150 React-rendered SVG elements sitting inside each
 * artboard. That cost was invisible on the single generator and ruinous in
 * bulk: html-to-image clones the subtree and writes the full computed style of
 * every node onto its clone as inline cssText. That is roughly 340 declarations
 * per element, so the backdrop alone contributed several hundred kilobytes of
 * style text to every single row of a run, before any of it was serialised,
 * parsed back as an SVG document and rasterised.
 *
 * The backdrop is identical for every person sharing a colourway. So it is
 * built once here as a plain string, cached, and painted as one
 * `background-image`. A run of five hundred now serialises one element instead
 * of a hundred and fifty, and the artwork itself is built fifteen times at
 * most: three variants by five accents.
 *
 * WHY IT ALSO FIXES THE RESIZE BUG
 *
 * The component took `width`/`height` props and set them on the <svg> while
 * also positioning it `inset: 0`. Box and viewBox were computed from different
 * numbers, so the artwork drifted as the window resized. A background image
 * with `background-size: 100% 100%` on an `inset: 0` div cannot drift: the box
 * defines the size and the viewBox scales into it. There are no numbers left
 * to disagree.
 *
 * CONSTRAINTS THIS FILE MUST RESPECT
 *
 * - No React. It has to produce identical output on the server and the client,
 *   and importing renderToStaticMarkup into a client bundle to get a string is
 *   a lot of machinery for a template literal.
 * - No Math.random. Same reason as before: a backdrop that shuffled per render
 *   would make the same person's badge differ between runs, and it caused a
 *   hydration mismatch in V00.00.
 * - All trig output rounded. Node and Chrome disagree in the last bits of
 *   Math.cos, which is the other thing that caused that mismatch.
 * - Generic font families only. An SVG loaded as an image is an isolated
 *   document: it cannot see the page's @font-face rules or its custom
 *   properties, so `var(--font-mono)` would resolve to nothing. The microtext
 *   and void tiles are decorative texture at 7.5px and 16px, so the generic
 *   monospace stack is the honest trade rather than base64ing a webfont into
 *   every backdrop.
 * - Ids are local. The document is standalone, so nothing here can collide
 *   with the page, which is why the cache key no longer needs a serial in it.
 *
 * The layers, all drawn here, none copied:
 *   1. bathymetric contours   nested coastline curves
 *   2. sunray fan             from the top right, following the site's sun
 *   3. guilloche rosette      rotated ellipses, the security-print tell
 *   4. halftone field         dot grid fading out
 *   5. microtext band         the event name repeated small, as a real
 *                             credential does to defeat photocopying
 *   6. swell lines            wave rules along the foot
 *   plus palms, a latitude crosshair, perforation rules, void tiles and
 *   corner registration marks.
 */

const round = (n: number) => Math.round(n * 100) / 100;

export type BackdropVariant = "card" | "pfp" | "team";

export interface BackdropSpec {
  variant: BackdropVariant;
  /** The coordinate space the artwork is drawn in. The box it lands in is
   *  whatever the div measures; background-size stretches one onto the other. */
  width: number;
  height: number;
  accent: string;
  /** Base ink colour for line work. */
  ink?: string;
  /** Overall strength. The card carries text, so it runs lighter than the PFP. */
  intensity?: number;
}

/**
 * The line-work ink.
 *
 * V05.00 moved the interface from yellow-led to green-led but left the backdrop
 * drawn in pure black, which read as a photocopy under the green chrome. Deep
 * palm green is still dark enough to hold the security-print detail and now
 * belongs to the same palette as everything around it. The accent wash on top
 * still differs per colourway, so the five badges stay distinguishable.
 */
export const BACKDROP_INK = COLORS.palmDeep;

/** Only the characters that can break out of SVG text content. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function contours(w: number, h: number, accent: string, ink: string, a: (n: number) => number) {
  const offsets = [0, 34, 70, 108, 150, 196, 246, 300];
  const paths = offsets
    .map((offset, i) => {
      const d =
        `M${round(-40 - offset)} ${round(h + 40)} ` +
        `C ${round(w * 0.18)} ${round(h * 0.72 - offset * 0.8)}, ` +
        `${round(w * 0.34)} ${round(h * 0.92 - offset * 0.5)}, ` +
        `${round(w * 0.62)} ${round(h * 0.6 - offset * 0.9)} ` +
        `S ${round(w * 0.9)} ${round(h * 0.34 - offset * 0.7)}, ` +
        `${round(w + 60)} ${round(h * 0.46 - offset)}`;
      return `<path d="${d}" fill="none" stroke="${i % 3 === 0 ? accent : ink}" stroke-width="${
        i % 3 === 0 ? 2.4 : 1.4
      }"/>`;
    })
    .join("");
  return `<g opacity="${a(0.34)}" mask="url(#maskDown)">${paths}</g>`;
}

function sunrays(w: number, h: number, accent: string, ink: string, a: (n: number) => number) {
  // Tucked into the corner. Any further in and the rays cross the name.
  const cx = round(w * 0.94);
  const cy = round(h * 0.06);
  const len = Math.max(w, h) * 0.85;

  const lines = Array.from({ length: 22 }, (_, i) => {
    const rad = ((96 + i * 8.4) * Math.PI) / 180;
    return `<line x1="${cx}" y1="${cy}" x2="${round(cx + Math.cos(rad) * len)}" y2="${round(
      cy + Math.sin(rad) * len,
    )}" stroke="${i % 2 === 0 ? accent : ink}" stroke-width="${i % 2 === 0 ? 3 : 1.2}"/>`;
  }).join("");

  return (
    `<g opacity="${a(0.42)}" mask="url(#maskCorner)">${lines}` +
    `<circle cx="${cx}" cy="${cy}" r="46" fill="none" stroke="${ink}" stroke-width="3"/>` +
    `<circle cx="${cx}" cy="${cy}" r="62" fill="none" stroke="${accent}" stroke-width="1.6"/></g>`
  );
}

function rosette(w: number, h: number, accent: string, ink: string, a: (n: number) => number) {
  const count = 18;
  const rings = Array.from({ length: count }, (_, i) => {
    return `<ellipse rx="132" ry="46" fill="none" stroke="${
      i % 4 === 0 ? accent : ink
    }" stroke-width="${i % 4 === 0 ? 1.6 : 0.9}" transform="rotate(${round((i * 180) / count)})"/>`;
  }).join("");

  return `<g opacity="${a(0.3)}" transform="translate(${round(w * 0.17)} ${round(
    h * 0.68,
  )})">${rings}</g>`;
}

function microtext(w: number, h: number, ink: string, a: (n: number) => number) {
  const band =
    `${EVENT.shortName} ${EVENT.edition} · ${EVENT.location} · ${EVENT.coords} · ` +
    `${EVENT.tagline.toUpperCase()} · `;

  return (
    `<g opacity="${a(0.5)}">` +
    `<rect x="0" y="${round(h * 0.405 - 11)}" width="${w}" height="22" fill="url(#hatch)" opacity="0.25"/>` +
    `<text fill="${ink}" font-size="7.5" font-family="ui-monospace, monospace" letter-spacing="1.6">` +
    `<textPath href="#microPath">${escapeText(band.repeat(12))}</textPath></text></g>`
  );
}

function swell(w: number, h: number, accent: string, ink: string, a: (n: number) => number) {
  const rows = [0, 1, 2, 3, 4]
    .map((i) => {
      const y = h - 26 - i * 13;
      const amp = 7 + i * 1.6;
      const step = w / 9;
      let d = `M0 ${round(y)}`;
      for (let x = 0; x < 9; x++) {
        d += ` q ${round(step / 2)} ${round(x % 2 === 0 ? -amp : amp)} ${round(step)} 0`;
      }
      return `<path d="${d}" fill="none" stroke="${i === 0 ? accent : ink}" stroke-width="${
        i === 0 ? 2.2 : 1.2
      }"/>`;
    })
    .join("");
  return `<g opacity="${a(0.4)}">${rows}</g>`;
}

/**
 * Ghosted disc. Sits behind the pocket the card layout leaves empty between
 * the class chip and the pass number, so that space reads as composed rather
 * than forgotten.
 */
function ghostDisc(w: number, h: number, accent: string, ink: string, a: (n: number) => number) {
  const cx = round(w * 0.72);
  const cy = round(h * 0.4);
  const r = round(w * 0.15);
  const rules = Array.from({ length: 4 }, (_, i) => {
    const y = round(cy - 25 + i * 17);
    return `<line x1="${round(cx - r)}" y1="${y}" x2="${round(
      cx + r,
    )}" y2="${y}" stroke="${ink}" stroke-width="2" opacity="0.25"/>`;
  }).join("");

  return (
    `<g opacity="${a(0.5)}">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${accent}" opacity="0.4"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink}" stroke-width="3" opacity="0.45"/>` +
    rules +
    `</g>`
  );
}

/**
 * Palm silhouettes along the foot. The site's own furniture, drawn rather than
 * copied, and low enough to sit under the code block.
 */
function palms(w: number, h: number, accent: string, ink: string, a: (n: number) => number) {
  const trees = [0.08, 0.2, 0.88]
    .map((fx, i) => {
      const x = round(w * fx);
      const base = round(h - 34);
      const height = i === 1 ? 118 : 92;
      const lean = i === 2 ? -7 : 6;
      const top = round(base - height);
      const frond = (dx: number, dy: number) =>
        `<path d="M${x} ${top} Q ${round(x + dx * 0.55)} ${round(top + dy * 1.7)} ${round(
          x + dx,
        )} ${round(top + dy)}"/>`;

      return (
        `<g stroke="${i === 1 ? accent : ink}" stroke-width="2.4" fill="none" stroke-linecap="round">` +
        `<path d="M${x} ${base} Q ${round(x + lean)} ${round(base - height / 2)} ${x} ${top}"/>` +
        frond(-34, -9) +
        frond(34, -9) +
        frond(-24, -26) +
        frond(24, -26) +
        frond(0, -34) +
        `</g>`
      );
    })
    .join("");
  return `<g opacity="${a(0.3)}">${trees}</g>`;
}

/**
 * Latitude crosshair. A quiet nod to the coordinates printed on the spine, and
 * it gives the lower left something to hold.
 */
function crosshair(w: number, h: number, accent: string, ink: string, a: (n: number) => number) {
  const gx = round(w * 0.14);
  const gy = round(h * 0.52);
  const ticks = [0, 1, 2, 3]
    .map((i) => {
      const rad = ((45 + i * 90) * Math.PI) / 180;
      return `<line x1="${round(gx + Math.cos(rad) * 40)}" y1="${round(
        gy + Math.sin(rad) * 40,
      )}" x2="${round(gx + Math.cos(rad) * 52)}" y2="${round(
        gy + Math.sin(rad) * 52,
      )}" stroke-width="2"/>`;
    })
    .join("");

  return (
    `<g opacity="${a(0.34)}" stroke="${ink}" fill="none">` +
    `<circle cx="${gx}" cy="${gy}" r="40" stroke-width="1.6"/>` +
    `<circle cx="${gx}" cy="${gy}" r="22" stroke-width="1.2" stroke="${accent}"/>` +
    `<line x1="${round(gx - 58)}" y1="${gy}" x2="${round(gx + 58)}" y2="${gy}" stroke-width="1.2"/>` +
    `<line x1="${gx}" y1="${round(gy - 58)}" x2="${gx}" y2="${round(gy + 58)}" stroke-width="1.2"/>` +
    ticks +
    `</g>`
  );
}

/**
 * Void tiles. Print them small enough and they read as texture; look closely
 * and the word is there, which is what a real pass does.
 */
function voidTiles(w: number, h: number, ink: string, a: (n: number) => number) {
  const tiles = [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const x = round(w * 0.05 + i * w * 0.17);
      const y = round(h * 0.9 + (i % 2 ? 16 : 0));
      return `<text x="${x}" y="${y}" fill="${ink}" font-size="16" font-family="ui-monospace, monospace" letter-spacing="4" transform="rotate(-18 ${x} ${round(
        h * 0.9,
      )})">VOID</text>`;
    })
    .join("");
  return `<g opacity="${a(0.16)}">${tiles}</g>`;
}

/** Corner registration marks, as a printed credential carries. */
function registration(w: number, h: number, ink: string, a: (n: number) => number) {
  const corners: [number, number, number, number][] = [
    [26, 26, 1, 1],
    [w - 26, 26, -1, 1],
    [26, h - 26, 1, -1],
    [w - 26, h - 26, -1, -1],
  ];
  return corners
    .map(
      ([x, y, sx, sy]) =>
        `<g opacity="${a(0.55)}" stroke="${ink}" stroke-width="2">` +
        `<line x1="${round(x)}" y1="${round(y)}" x2="${round(x + 18 * sx)}" y2="${round(y)}"/>` +
        `<line x1="${round(x)}" y1="${round(y)}" x2="${round(x)}" y2="${round(y + 18 * sy)}"/></g>`,
    )
    .join("");
}

/** Builds the full SVG document. Pure: same spec in, same string out. */
export function backdropSvg(spec: BackdropSpec): string {
  const { variant, width: w, height: h, accent, ink = BACKDROP_INK, intensity = 1 } = spec;

  const a = (value: number) => round(value * intensity);

  const defs =
    `<defs>` +
    // Halftone dots.
    `<pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">` +
    `<circle cx="3" cy="3" r="1.6" fill="${ink}"/></pattern>` +
    // Fine diagonal hatch, the ground for the microtext band.
    `<pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">` +
    `<line x1="0" y1="0" x2="0" y2="9" stroke="${ink}" stroke-width="1.1"/></pattern>` +
    // Fade masks so every layer dies away rather than stopping dead.
    `<linearGradient id="fadeDown" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#fff" stop-opacity="1"/>` +
    `<stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<mask id="maskDown"><rect width="${w}" height="${h}" fill="url(#fadeDown)"/></mask>` +
    `<radialGradient id="fadeCorner" cx="94%" cy="6%" r="52%">` +
    `<stop offset="0%" stop-color="#fff" stop-opacity="1"/>` +
    `<stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<mask id="maskCorner"><rect width="${w}" height="${h}" fill="url(#fadeCorner)"/></mask>` +
    `<path id="microPath" d="M0 ${round(h * 0.405)} H ${w}" fill="none"/>` +
    `</defs>`;

  const body =
    // 0. Accent wash. Cheapest possible way to stop the paper reading bare.
    `<rect width="${w}" height="${h}" fill="${accent}" opacity="${a(0.09)}"/>` +
    `<rect x="0" y="${round(h * 0.16)}" width="${w}" height="${round(
      h * 0.5,
    )}" fill="${ink}" opacity="${a(0.035)}"/>` +
    contours(w, h, accent, ink, a) +
    sunrays(w, h, accent, ink, a) +
    rosette(w, h, accent, ink, a) +
    // 4. Halftone field, bottom right.
    `<rect x="${round(w * 0.6)}" y="${round(h * 0.74)}" width="${round(w * 0.4)}" height="${round(
      h * 0.26,
    )}" fill="url(#dots)" opacity="${a(0.26)}"/>` +
    microtext(w, h, ink, a) +
    swell(w, h, accent, ink, a) +
    (variant === "card" ? ghostDisc(w, h, accent, ink, a) : "") +
    palms(w, h, accent, ink, a) +
    crosshair(w, h, accent, ink, a) +
    // Perforation rules, the ticket-stub tell, down both margins.
    `<g opacity="${a(0.4)}">` +
    [10, w - 10]
      .map(
        (x) =>
          `<line x1="${round(x)}" y1="40" x2="${round(x)}" y2="${round(
            h - 40,
          )}" stroke="${ink}" stroke-width="2" stroke-dasharray="3 9"/>`,
      )
      .join("") +
    `</g>` +
    voidTiles(w, h, ink, a) +
    (variant !== "pfp" ? registration(w, h, ink, a) : "");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
    `preserveAspectRatio="none">${defs}${body}</svg>`
  );
}

/* -------------------------------------------------------------------------
   Cache.

   Keyed on everything that changes the artwork. Three variants and five
   accents means fifteen entries at most for a whole run, and the single
   generator touches one per colourway.

   Percent-encoded rather than base64: an SVG is mostly ASCII, so the encoded
   form comes out roughly a third smaller than base64 would, and every byte
   here is a byte html-to-image copies into every row of a batch.
------------------------------------------------------------------------- */

const urlCache = new Map<string, string>();

export function backdropDataUrl(spec: BackdropSpec): string {
  const key = [
    spec.variant,
    spec.width,
    spec.height,
    spec.accent,
    spec.ink ?? BACKDROP_INK,
    spec.intensity ?? 1,
  ].join("|");

  let url = urlCache.get(key);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(backdropSvg(spec))}`;
    urlCache.set(key, url);
  }
  return url;
}
