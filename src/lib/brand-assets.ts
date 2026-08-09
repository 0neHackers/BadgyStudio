"use client";

import { useEffect, useState } from "react";

/**
 * Brand marks, resolved to data URLs once.
 *
 * THE BUG THIS EXISTS FOR
 * Every artboard carries three <img> elements pointing at /brand. html-to-image
 * has to inline an image before it can rasterise it, and it does that with
 * fetch. So a single card render made three network requests, and a
 * hundred-person run made three hundred, back to back, while the tab was also
 * holding tens of megabytes of finished PNG.
 *
 * That is where "Failed to fetch" came from. It was not the fonts and not the
 * zip; it was the browser giving up on request three-hundred-and-something
 * under memory pressure. It never showed in the preview because a preview is
 * one render, not a hundred.
 *
 * Fetching each mark once and handing the artboards a data URL takes the
 * per-render network cost to zero. The marks are 27 KB, 25 KB and 32 KB, so the
 * whole cache is under 120 KB even base64'd.
 */

export const BRAND_SOURCES = {
  wordmark: "/brand/hacker-house.png",
  goa: "/brand/goa-devanagari.svg",
  studio: "/brand/247pm-studio.svg",
} as const;

export type BrandKey = keyof typeof BRAND_SOURCES;

/** Resolved data URLs. Read synchronously during render once warmed. */
const cache = new Map<BrandKey, string>();
let warming: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read ${url}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Fills the cache. Safe to call repeatedly; the work happens once.
 *
 * A mark that cannot be read is left out rather than throwing, so a missing
 * brand file degrades to a normal <img> request instead of killing a run.
 */
export function warmBrandAssets(): Promise<void> {
  warming ??= (async () => {
    await Promise.all(
      (Object.keys(BRAND_SOURCES) as BrandKey[]).map(async (key) => {
        try {
          cache.set(key, await toDataUrl(BRAND_SOURCES[key]));
        } catch {
          // Left uncached on purpose. src() falls back to the path.
        }
      }),
    );
    listeners.forEach((notify) => notify());
  })();

  return warming;
}

/** Data URL if warmed, otherwise the plain path so first paint still works. */
export function brandSrc(key: BrandKey): string {
  return cache.get(key) ?? BRAND_SOURCES[key];
}

export function brandAssetsReady(): boolean {
  return cache.size === Object.keys(BRAND_SOURCES).length;
}

/**
 * Warms on mount and re-renders once when the cache fills, so an artboard that
 * first painted with paths swaps to data URLs before anyone can export.
 */
export function useBrandAssets(): boolean {
  const [ready, setReady] = useState(brandAssetsReady);

  useEffect(() => {
    if (brandAssetsReady()) return;

    const notify = () => setReady(brandAssetsReady());
    listeners.add(notify);
    void warmBrandAssets();

    return () => {
      listeners.delete(notify);
    };
  }, []);

  return ready;
}
