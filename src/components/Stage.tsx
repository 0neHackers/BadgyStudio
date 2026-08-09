"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Holds a fixed-size artboard, scales it to the space available, and draws the
 * frame around it. The child keeps its true pixel dimensions, which is what
 * makes the export a plain rasterisation instead of a re-layout at a different
 * size.
 *
 * THE BUG THIS FILE HAD UNTIL V05.07
 *
 * The frame used to be a separate div in the page, full width, with the stage
 * inside it scaled and anchored `top left`. The moment the column was not
 * exactly the artboard's width the two disagreed: the frame stayed as wide as
 * the column and the card sat in the corner of it, leaving a slab of frame
 * showing down one side. On a wide screen the scale was clamped at 1 and the
 * gap was everything past 1080px.
 *
 * That is what "the background gets out of size when I change the device
 * width" was. V05.06 fixed a different thing with a similar description, the
 * SVG backdrop drawn inside the artboard, and left this untouched.
 *
 * THE FIX
 *
 * The frame is drawn here, wrapped tightly around the scaled artboard, so it
 * is the card by construction. There is no width at which they can disagree
 * because there is only one measurement now.
 *
 * Measuring is done on the outer element, which stays full width, rather than
 * on the frame, which does not. Measuring something whose size depends on the
 * scale you are computing is how you get a resize loop.
 *
 * The scale is allowed above 1. The artboard is live DOM under a CSS
 * transform, not a bitmap, so enlarging stays sharp, and a preview that fills
 * its column is worth more than a rule about never enlarging. Capped so a very
 * wide column cannot produce something absurd.
 */

const MAX_SCALE = 1.6;

export function Stage({
  width,
  height,
  children,
  nodeRef,
  /** The frame. Deep palm green from V05.07; it used to be flat black. */
  frameClassName = "border-[3px] border-ink bg-palm-deep slab-lg",
}: {
  width: number;
  height: number;
  children: ReactNode;
  nodeRef: React.RefObject<HTMLDivElement | null>;
  frameClassName?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const measure = () => {
      const frame = frameRef.current;
      // The frame's own padding and border eat into what the artboard can
      // have. Read them rather than duplicating the clamp() in JavaScript.
      let chrome = 0;
      if (frame) {
        const style = getComputedStyle(frame);
        chrome =
          parseFloat(style.paddingLeft) +
          parseFloat(style.paddingRight) +
          parseFloat(style.borderLeftWidth) +
          parseFloat(style.borderRightWidth);
      }
      const available = outer.clientWidth - chrome;
      if (available > 0) setScale(Math.min(MAX_SCALE, available / width));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={outerRef} className="flex w-full justify-center">
      <div
        ref={frameRef}
        className={frameClassName}
        style={{ padding: "clamp(0.5rem, 0.35rem + 0.7vw, 0.85rem)" }}
      >
        {/* Sized from the scale, so the frame wraps the card exactly. Rounded
            because a fractional box leaves a sub-pixel seam of frame showing
            along one edge at some zoom levels. */}
        <div
          style={{
            width: Math.round(width * scale),
            height: Math.round(height * scale),
            overflow: "hidden",
          }}
        >
          <div ref={nodeRef} className="stage" style={{ width, height, transform: `scale(${scale})` }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
