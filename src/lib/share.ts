import { EVENT } from "@/lib/brand";
import type { Badge } from "@/lib/badge";
import type { FormatKey } from "@/lib/brand";

/**
 * Share to X, three ways, tried in order of how good the result looks:
 *
 * 1. Native share sheet with the PNG attached. This is the mobile path and the
 *    only one that puts the actual image into the composer in one tap.
 * 2. Upload to blob storage, then open the X composer pointed at a /s/<id>
 *    page whose OG tags are the generated graphic. The link preview shows the
 *    card, not a default thumbnail.
 * 3. Download the file and open the composer with the caption pre-filled, so
 *    the last step is dragging one file in.
 *
 * Which one runs depends on the device and on whether blob storage is
 * configured, not on anything the person has to choose.
 */

const CAPTIONS: Record<FormatKey, (badge: Badge) => string> = {
  card: (badge) =>
    `Got my ${EVENT.shortName} ${EVENT.edition} builder pass. ${badge.title}, pass ${badge.serial}.`,
  pfp: () => `New profile picture, courtesy of ${EVENT.shortName} ${EVENT.edition}.`,
  team: (badge) =>
    badge.team
      ? `${badge.team} is going for ${EVENT.shortName} ${EVENT.edition}.`
      : `Rounded up the crew for ${EVENT.shortName} ${EVENT.edition}.`,
};

export function buildCaption(format: FormatKey, badge: Badge, shareUrl?: string): string {
  const lines = [
    CAPTIONS[format](badge),
    "",
    `${EVENT.datesLong} · ${EVENT.location}`,
    "",
  ];

  // On the link path the URL rides in its own parameter, so it is left out here.
  if (shareUrl) lines.push(`Make your own: ${shareUrl}`);
  lines.push(EVENT.hashtag);

  return lines.join("\n");
}

export function composerUrl(text: string, url?: string): string {
  const params = new URLSearchParams({ text });
  if (url) params.set("url", url);
  return `https://x.com/intent/post?${params.toString()}`;
}

export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

export interface UploadResult {
  id: string;
  pageUrl: string;
  imageUrl: string;
}

/**
 * Consent for the one thing in this app that leaves the browser.
 *
 * Everything else is local by construction. Share to X is the exception: to
 * make the link preview show the actual badge, the PNG has to sit at a public
 * URL, which means uploading it. That is a reasonable trade for a share button
 * and an unreasonable thing to do without saying so, particularly in an app
 * whose whole pitch is that nothing is uploaded.
 *
 * So it is asked once, in plain words, and the answer is remembered. Declining
 * is not a failure: the share falls back to the native sheet or to
 * download-then-attach, which is what happens on a browser without the blob
 * store configured anyway.
 */
const CONSENT_KEY = "badgy-share-consent";

export function shareConsent(): "granted" | "denied" | "unasked" {
  if (typeof localStorage === "undefined") return "unasked";
  const stored = localStorage.getItem(CONSENT_KEY);
  return stored === "granted" || stored === "denied" ? stored : "unasked";
}

export function rememberShareConsent(answer: "granted" | "denied") {
  try {
    localStorage.setItem(CONSENT_KEY, answer);
  } catch {
    // Storage refused. Asking again next time is the safe failure.
  }
}

/** Exactly what would be sent, so the prompt can list it rather than gesture at it. */
export function shareUploadSummary(meta: { serial: string; name: string; team: string }): string[] {
  return [
    "the rendered PNG of this badge",
    `its pass number, ${meta.serial}`,
    meta.name ? `the name on it, ${meta.name}` : "the name on it",
    meta.team ? `the team, ${meta.team}` : "the team, if set",
    "the builder class printed on it",
  ];
}

export async function uploadForPreview(
  blob: Blob,
  meta: { format: FormatKey; serial: string; name: string; title: string; team: string },
): Promise<UploadResult | null> {
  const body = new FormData();
  body.set("image", blob, `${meta.serial}.png`);
  body.set("format", meta.format);
  body.set("serial", meta.serial);
  body.set("name", meta.name);
  body.set("title", meta.title);
  body.set("team", meta.team);

  try {
    const response = await fetch("/api/share", { method: "POST", body });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<UploadResult>;
    if (!data.id || !data.pageUrl || !data.imageUrl) return null;
    return data as UploadResult;
  } catch {
    return null;
  }
}

export type ShareOutcome = "native" | "link" | "manual";
