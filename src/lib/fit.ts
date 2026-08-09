/**
 * Length-driven type sizing.
 *
 * An exported PNG has no scrollbar, so a slot that overflows is a defect
 * rather than an inconvenience. Every user-supplied string on an artboard runs
 * through here: pick the first step whose ceiling the string fits under, and
 * fall back to the smallest.
 *
 * Character count rather than measured width, on purpose. Measuring means a
 * layout read per keystroke, and at three artboards that is a jank source for
 * an accuracy nobody can see.
 */

export interface FitStep {
  /** Highest character count this size handles. */
  max: number;
  /** Font size in artboard pixels. */
  size: number;
}

export function fitText(value: string, steps: FitStep[]): number {
  const length = value.trim().length;
  for (const step of steps) {
    if (length <= step.max) return step.size;
  }
  // One step below the last rung, so very long strings still shrink.
  return Math.round(steps[steps.length - 1].size * 0.85);
}

/**
 * Clamp for the form side of the app, where CSS can do the work. Returns a
 * clamp() string so a control scales continuously with the viewport instead of
 * jumping at a breakpoint.
 */
export function fluid(minPx: number, maxPx: number, minVw = 360, maxVw = 1440): string {
  const slope = (maxPx - minPx) / (maxVw - minVw);
  const intercept = minPx - slope * minVw;
  return `clamp(${minPx}px, ${intercept.toFixed(2)}px + ${(slope * 100).toFixed(3)}vw, ${maxPx}px)`;
}
