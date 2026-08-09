"use client";

import { useEffect, useRef } from "react";

/**
 * Custom cursor.
 *
 * V04.01's version was unstable and the ring jittered. Three causes, all fixed
 * here:
 *
 *   1. It transitioned `width` and `height`. Those are layout properties, so
 *      every state change forced a reflow while the rAF loop was writing
 *      `transform` on the same element. The box is now a fixed 44px and the
 *      size change is a `scale` inside the same transform string.
 *   2. `rotate` was set as a separate CSS property while `transform` was being
 *      written every frame. Two sources of truth for the same matrix. Rotation
 *      is now part of that one transform string too.
 *   3. The loop never stopped. It ran at 60fps forever, and the easing kept
 *      chasing sub-pixel deltas that rounded to the same paint. It now parks
 *      itself once the ring is within a quarter pixel and restarts on the next
 *      move.
 *
 * The dot tracks instantly, the ring lags. The lag is the whole trick; without
 * it the ring reads as a sticker rather than as something with weight.
 */

type State = "idle" | "active" | "crop";

const SCALE: Record<State, number> = { idle: 1, active: 1.5, crop: 1.75 };
const ROTATE: Record<State, number> = { idle: 0, active: 45, crop: 0 };

/**
 * The rotation is sprung rather than switched.
 *
 * Square to diamond used to snap the full 45 degrees in one frame, which read
 * as a glitch rather than as a change of state. A critically-underdamped
 * spring overshoots by a few degrees and settles, so the ring tips into the
 * diamond and rocks back once.
 *
 * Deliberately not a spin. STIFFNESS and DAMPING are tuned so the overshoot is
 * around four degrees and the whole move is over in about 250ms: enough to
 * notice, not enough to wait for. Raising STIFFNESS makes it snappier and
 * lowering DAMPING makes it wobblier; going far in either direction turns a
 * cursor into a toy.
 */
const STIFFNESS = 0.22;
const DAMPING = 0.68;
/** Below this the spring has arrived, in degrees and degrees per frame. */
const SETTLED = 0.05;

export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      !window.matchMedia("(pointer: fine) and (hover: hover)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const root = document.documentElement;
    root.classList.add("has-cursor");

    // Start off-screen so nothing flashes at 0,0 before the first move.
    let px = -200;
    let py = -200;
    let rx = px;
    let ry = py;
    let state: State = "idle";
    let pressed = false;
    let frame = 0;
    let visible = false;
    // Current angle and its velocity, integrated in the same loop that eases
    // the position, so there is still exactly one writer of the transform.
    let rot = 0;
    let rotVelocity = 0;

    const paintRing = () => {
      const scale = SCALE[state] * (pressed ? 0.72 : 1);
      // One transform string. Nothing else writes to this element's matrix.
      ring.style.transform =
        `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0)` +
        ` translate(-50%, -50%) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    };

    /** True while the angle is still moving. */
    const springRotation = () => {
      const target = ROTATE[state];
      rotVelocity = (rotVelocity + (target - rot) * STIFFNESS) * DAMPING;
      rot += rotVelocity;

      if (Math.abs(target - rot) < SETTLED && Math.abs(rotVelocity) < SETTLED) {
        rot = target;
        rotVelocity = 0;
        return false;
      }
      return true;
    };

    const tick = () => {
      rx += (px - rx) * 0.2;
      ry += (py - ry) * 0.2;
      const turning = springRotation();
      paintRing();

      // Park when there is nothing left worth painting. A quarter pixel is
      // below what the compositor can show, and the spring reports when it has
      // arrived, so a still cursor mid-rotation still finishes its move.
      if (turning || Math.abs(px - rx) > 0.25 || Math.abs(py - ry) > 0.25) {
        frame = requestAnimationFrame(tick);
      } else {
        rx = px;
        ry = py;
        paintRing();
        frame = 0;
      }
    };

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const show = (on: boolean) => {
      if (visible === on) return;
      visible = on;
      const value = on ? "1" : "0";
      dot.style.opacity = value;
      ring.style.opacity = value;
    };

    const onMove = (event: PointerEvent) => {
      px = event.clientX;
      py = event.clientY;
      dot.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;

      const target = event.target as Element | null;
      const typing = target?.closest(
        'input:not([type="checkbox"]):not([type="range"]), textarea, [contenteditable="true"]',
      );

      if (typing) {
        show(false);
        root.classList.add("cursor-typing");
        return;
      }
      root.classList.remove("cursor-typing");
      show(true);

      const next: State = target?.closest("[data-cursor='crop']")
        ? "crop"
        : target?.closest(
              'a, button, [role="button"], [role="radio"], label, select, summary, input[type="checkbox"], input[type="range"]',
            )
          ? "active"
          : "idle";

      if (next !== state) {
        state = next;
        ring.dataset.state = next;
        paintRing();
      }

      wake();
    };

    const onDown = () => {
      pressed = true;
      paintRing();
    };
    const onUp = () => {
      pressed = false;
      paintRing();
    };
    const onLeave = () => show(false);
    // A wheel or a keypress can move content out from under a stationary
    // pointer, so re-park the ring rather than leaving it mid-flight.
    const onScroll = () => wake();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("blur", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerleave", onLeave);
      root.classList.remove("has-cursor", "cursor-typing");
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" data-state="idle" aria-hidden="true">
        <span className="cursor-tick cursor-tick-tl" />
        <span className="cursor-tick cursor-tick-tr" />
        <span className="cursor-tick cursor-tick-bl" />
        <span className="cursor-tick cursor-tick-br" />
      </div>
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
    </>
  );
}
