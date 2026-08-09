/**
 * Contrast picking.
 *
 * The badge takes any of five accent colours, and text was being coloured by a
 * hand-set `onLight` boolean per colourway. That works until someone adds a
 * sixth colour or changes a hex, at which point a label quietly goes
 * unreadable. This computes it instead.
 *
 * Relative luminance is the WCAG definition, so `contrastRatio` returns the
 * same number the accessibility tools do and the 4.5 threshold means what it
 * normally means.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Best foreground for a given background, from the candidates supplied.
 * Returns whichever wins on contrast rather than whichever was listed first,
 * so adding a colourway cannot make a label disappear.
 */
export function bestOn(background: string, candidates: string[]): string {
  return candidates.reduce((best, candidate) =>
    contrastRatio(background, candidate) > contrastRatio(background, best) ? candidate : best,
  );
}

/** True when the pair clears the WCAG AA threshold for normal-size text. */
export function isReadable(background: string, foreground: string): boolean {
  return contrastRatio(background, foreground) >= 4.5;
}

/**
 * A hairline outline for text that has to sit on an unknown background, used
 * on the artboards where a label crosses both the accent field and the paper.
 */
export function outlineFor(background: string, ink: string, paper: string): string {
  return luminance(background) > 0.45 ? paper : ink;
}
