import { backdropDataUrl, type BackdropSpec } from "@/lib/backdrop";

export type { BackdropVariant } from "@/lib/backdrop";

/**
 * Paints a backdrop into whatever box it is dropped into.
 *
 * The artwork itself lives in lib/backdrop.ts as a plain string. All this does
 * is stretch one cached image across its parent, which is the whole point:
 *
 *   - `inset: 0` takes the size from the parent's padding box, so there is no
 *     second set of numbers to fall out of step with the first. That is the
 *     resize drift from V05.05 gone structurally rather than corrected.
 *   - `background-size: 100% 100%` plus `preserveAspectRatio="none"` on the
 *     SVG means the artwork always fills the box exactly. The card and the
 *     frame both hand it a box with the same aspect as the coordinate space,
 *     so nothing is actually stretched in practice.
 *   - One element instead of ~150. html-to-image writes the full computed
 *     style of every node onto its clone, so element count is close to a
 *     linear term in the per-row export cost.
 *
 * `width` and `height` here describe the drawing's coordinate space, not the
 * box. They stay as props because the layers are laid out relative to them
 * (the microtext band sits at 40.5% of height, the rosette at 17% of width),
 * and because they key the cache.
 */
export function Backdrop(spec: BackdropSpec) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: `url("${backdropDataUrl(spec)}")`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      }}
    />
  );
}
