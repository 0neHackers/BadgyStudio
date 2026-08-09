/**
 * Font wiring.
 *
 * V00.00 used next/font/local, which mangles family names into build-time
 * hashes. That made it impossible to hand html-to-image a precomputed embed
 * stylesheet, so the exporter had to scrape document.styleSheets instead, and
 * any cross-origin sheet on the machine (antivirus injections, corporate
 * proxies, some extensions) threw a SecurityError mid-export and could cost you
 * the webfonts in the PNG.
 *
 * These are plain @font-face declarations in globals.css with stable family
 * names, which means the export path can build its own embed CSS from a known
 * list. See lib/export.ts.
 */

export interface EmbeddedFont {
  family: string;
  weight: number;
  file: string;
}

/**
 * Only the faces that appear on an exported graphic. Imbue is deliberately
 * absent: it dresses the site chrome, never the artboards, so it never needs
 * to be base64'd into a PNG.
 */
export const EXPORT_FONTS: EmbeddedFont[] = [
  { family: "Cal Sans", weight: 600, file: "/fonts/CalSans-SemiBold.woff2" },
  { family: "Victor Mono", weight: 400, file: "/fonts/VictorMono-400.woff2" },
  { family: "Victor Mono", weight: 500, file: "/fonts/VictorMono-500.woff2" },
  { family: "Victor Mono", weight: 700, file: "/fonts/VictorMono-700.woff2" },
];

/** Preloaded in the document head so first paint is not a flash of fallback. */
export const PRELOAD_FONTS = [
  "/fonts/CalSans-SemiBold.woff2",
  "/fonts/VictorMono-400.woff2",
  "/fonts/Imbue-700.woff2",
];
