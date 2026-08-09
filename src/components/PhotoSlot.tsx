/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import { photoStyle } from "@/lib/image";
import type { PhotoAsset } from "@/types";

/**
 * The one place a photo is ever put into a fixed box.
 *
 * THE BUG THIS EXISTS TO KILL
 * `photoStyle` returns a `transform: scale(...)` for the zoom control. A
 * transform paints outside its element's box unless an ancestor clips it. The
 * team frame's photo slot was a plain sized div with no `overflow`, so zooming
 * a teammate's photo pushed it up over the name band and out of the tile, in
 * the preview and in the exported PNG alike.
 *
 * Every artboard and every editor thumbnail now goes through this component, so
 * the clip cannot be forgotten in one place and remembered in another. That is
 * the actual fix; adding `overflow: hidden` to the team tile alone would have
 * left the same trap set for the next slot anyone adds.
 *
 * `isolation: isolate` matters too: it gives the slot its own stacking context,
 * so a scaled photo cannot paint over a sibling that happens to come later in
 * the tree.
 */

export function PhotoSlot({
  photo,
  width,
  height,
  className,
  style,
  fallback,
  radius = 0,
}: {
  photo: PhotoAsset | null;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  fallback?: React.ReactNode;
  radius?: number;
}) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        overflow: "hidden",
        isolation: "isolate",
        position: "relative",
        borderRadius: radius || undefined,
        ...style,
      }}
    >
      {photo ? (
        <img src={photo.url} alt="" style={photoStyle(photo)} />
      ) : (
        (fallback ?? null)
      )}
    </div>
  );
}
