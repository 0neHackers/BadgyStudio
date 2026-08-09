import type { Visibility } from "@/types";
import { splitDial } from "@/lib/phone";

/**
 * These cards get posted publicly, so the default is to show enough for a
 * human to recognise their own record and not enough for anyone else to reuse
 * it. Full values are always available behind an explicit per-field toggle.
 */

/**
 * Dot runs are a fixed width rather than matched to the real length. Matching
 * produced 28 dots for a long address, which overran its column on the card and
 * also published the exact length of the address, which is the sort of detail
 * that narrows a guess. A fixed run says "hidden" without saying how much.
 */
const RUN = "••••";

export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at < 1) return value;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const tld = dot > -1 ? domain.slice(dot) : "";
  const host = dot > -1 ? domain.slice(0, dot) : domain;

  return `${local.slice(0, 2)}${RUN}@${host.slice(0, 1)}${RUN}${tld}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return value;

  // Country code from the shared dial-code table rather than a digit-count
  // guess, so +1 numbers no longer lost a digit off the code.
  const { code } = splitDial(digits);
  const lead = value.trim().startsWith("+") ? `+${code} ` : "";
  return `${lead}•••• •• ${digits.slice(-4)}`;
}

/** Keeps the day and month, drops the year. Enough for a birthday shout-out. */
export function maskDob(value: string): string {
  const parsed = parseDob(value);
  if (!parsed) return value;
  return `${parsed.day} ${parsed.month} ••••`;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function parseDob(value: string): { day: string; month: string; year: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { day: match[3], month: MONTHS[monthIndex], year: match[1] };
}

export function formatDob(value: string): string {
  const parsed = parseDob(value);
  return parsed ? `${parsed.day} ${parsed.month} ${parsed.year}` : value;
}

export function applyVisibility(
  value: string,
  mode: Visibility,
  masker: (input: string) => string,
): string | null {
  if (!value.trim()) return null;
  if (mode === "hidden") return null;
  if (mode === "full") return value;
  return masker(value);
}
