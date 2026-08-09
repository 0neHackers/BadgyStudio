import type { PhotoAsset } from "@/types";

/**
 * Photo intake. Whatever comes off a phone has to end up as a same-origin,
 * upright, sanely sized bitmap before it touches the card, otherwise the
 * export either tilts, tastes of tainted canvas, or takes two seconds to draw.
 *
 * Nothing here leaves the browser.
 */

const MAX_EDGE = 1600;
const MAX_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif";

export class PhotoError extends Error {}

function looksHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.type === "image/heic-sequence" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/** Safari and Chrome both honour EXIF here, so the bitmap comes back upright. */
async function decode(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Older WebKit rejects the options bag. Fall through to the element path.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const element = new Image();
    element.decoding = "async";
    element.src = url;
    await element.decode();
    return await createImageBitmap(element);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitWithin(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function loadPhoto(file: File): Promise<PhotoAsset> {
  if (file.size > MAX_BYTES) {
    throw new PhotoError("That file is over 25 MB. Try a smaller version of it.");
  }

  let source: Blob = file;

  if (looksHeic(file)) {
    // Loaded on demand, the wasm decoder is ~1.5 MB and most uploads never need it.
    const { heicTo } = await import("heic-to");
    try {
      source = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
    } catch {
      throw new PhotoError("That HEIC could not be read. Export it as JPG and try again.");
    }
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(source);
  } catch {
    throw new PhotoError("That file is not an image this browser can open.");
  }

  const target = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new PhotoError("This browser blocked canvas access.");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new PhotoError("Could not re-encode that photo.");

  return {
    url: URL.createObjectURL(blob),
    blob,
    width: target.width,
    height: target.height,
    // Faces sit above centre in almost every portrait, so bias upward by default.
    focusX: 0.5,
    focusY: 0.38,
    fileName: file.name,
    zoom: 1,
    rotation: 0,
    flipped: false,
  };
}

export function releasePhoto(photo: PhotoAsset | null) {
  if (photo) URL.revokeObjectURL(photo.url);
}

/**
 * CSS object-position values for a cover fit at the given focal point. Lets a
 * landscape group shot and a tall portrait both land sensibly in the same slot
 * without asking anyone to crop first.
 */
export function coverPosition(photo: PhotoAsset): string {
  return `${(photo.focusX * 100).toFixed(1)}% ${(photo.focusY * 100).toFixed(1)}%`;
}

/**
 * The full set of styles for dropping a photo into a fixed slot: cover fit at
 * the chosen focal point, then zoom, rotation and mirroring on top.
 *
 * Order matters. scale before rotate means the zoom is applied in the photo's
 * own axes, which is what someone dragging a zoom slider expects.
 */
export function photoStyle(photo: PhotoAsset): React.CSSProperties {
  const transforms = [
    photo.zoom !== 1 ? `scale(${photo.zoom})` : "",
    photo.rotation ? `rotate(${photo.rotation}deg)` : "",
    photo.flipped ? "scaleX(-1)" : "",
  ].filter(Boolean);

  return {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: coverPosition(photo),
    display: "block",
    transform: transforms.length ? transforms.join(" ") : undefined,
    transformOrigin: `${(photo.focusX * 100).toFixed(1)}% ${(photo.focusY * 100).toFixed(1)}%`,
  };
}
