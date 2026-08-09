/**
 * Single source of truth for anything event-specific. Change it here and it
 * changes on every card, every frame and every share caption.
 *
 * The palette and the typeface pairing are read off hhgoa.com itself rather
 * than eyeballed: the site's stylesheet resolves to #fee101, #0b6839, #ff0080
 * and #fffbe8 over black, set in Imbue with Victor Mono for anything technical.
 */

/** The product. Distinct from the event it currently badges. */
export const APP = {
  name: "Badgy Studio",
  tagline: "All-in-One ID Card, Badge, & Frame Creator",
  author: "0neHackers",
  authorUrl: "https://x.com/shanzalfiroz",
  handle: "@shanzalfiroz",
  repoUrl: "https://github.com/shanzalfiroz",
} as const;

export const EVENT = {
  name: "Hacker House Goa",
  shortName: "HH GOA",
  edition: "2026",
  tagline: "Less noise. More signal.",
  location: "GOA, INDIA",
  dates: "28 - 31 OCT 2026",
  datesLong: "28 to 31 October 2026",
  organiser: "2:47 pm Studio",
  organiserHandle: "@247pmstudio",
  site: "hhgoa.com",
  siteUrl: "https://hhgoa.com",
  hashtag: "#FrameInGoa",
  capacity: "247 BUILDERS",
  /** Panaji, to one decimal more than anyone needs. */
  coords: "15.2993° N  74.1240° E",
} as const;

/**
 * Palette.
 *
 * V05.00 moves the interface from yellow-led to green-led. hhgoa.com's own
 * stylesheet resolves #0B6839 as its structural green, so that becomes the
 * primary and the yellow steps back to an accent used for emphasis rather
 * than for whole fields.
 *
 * The token names are deliberately unchanged. `sun` is still the yellow and
 * `palm` is still the green; what changed is which one carries the interface.
 * Renaming them would have touched every file for no benefit.
 */
export const COLORS = {
  /** Near-black. Borders and body copy. */
  ink: "#000000",
  /** Warm off-white. Card stock and panel fills. */
  paper: "#FFFBE8",
  /** The signature yellow. Accent only from V05.00 on. */
  sun: "#FEE101",
  /** Deep bottle green. The primary from V05.00 on. */
  palm: "#0B6839",
  /** A lighter green for hovers and washes. */
  palmLight: "#128A4C",
  /** Darker green, for pressed states and deep fields. */
  palmDeep: "#074726",
  /** Hot magenta, used sparingly for emphasis. */
  neon: "#FF0080",
  /** Pure white, for panels that need to lift off the paper. */
  white: "#FFFFFF",
  /** Alarm red, from the site's error states. */
  flag: "#E40014",
} as const;

export type AccentKey = "sun" | "palm" | "neon" | "white" | "flag";

/** The badge colourways. Order is stable; the serial picks one deterministically. */
export const ACCENTS: { key: AccentKey; label: string; hex: string; onLight: boolean }[] = [
  { key: "sun", label: "Sunrise", hex: COLORS.sun, onLight: true },
  { key: "palm", label: "Palm", hex: COLORS.palm, onLight: false },
  { key: "neon", label: "Signal", hex: COLORS.neon, onLight: false },
  { key: "white", label: "Salt", hex: COLORS.white, onLight: true },
  { key: "flag", label: "Low Tide", hex: COLORS.flag, onLight: false },
];

export function accentByKey(key: AccentKey) {
  return ACCENTS.find((a) => a.key === key) ?? ACCENTS[0];
}

/** Canvas sizes, in CSS pixels before the export multiplier. */
export const CANVAS = {
  card: { w: 1080, h: 1350 },
  pfp: { w: 1024, h: 1024 },
  team: { w: 1600, h: 900 },
} as const;

export type FormatKey = keyof typeof CANVAS;
