/**
 * Phone numbers: country code, grouping, and length.
 *
 * A badge prints a phone number, a Data Matrix carries it, and an organiser
 * may dial it. All three want the country code present and the digits grouped,
 * and none of them want the person to have typed the spaces.
 *
 * WHAT WAS WRONG BEFORE V05.07
 *
 * This file already existed and was already correct enough. It was simply
 * never wired to a keystroke: `formatPhone` was called once, on CSV import,
 * and the inputs on both the single generator and the roster editor were plain
 * text fields. So a number typed by hand stayed exactly as typed, at any
 * length, with no code and no spaces, and the placeholder promised a format
 * the field would not produce.
 *
 * WHAT IS NEW
 *
 * Grouping and length are now per country rather than one rule for everyone.
 * India groups 5-5 and is exactly ten digits after +91, which is the case that
 * was asked for and the one most of this roster will be. The rest of the table
 * covers the countries a Goa intake actually draws from; anything not in it
 * falls back to a sane generic grouping and E.164's 4-to-14 subscriber range,
 * which is a real constraint rather than no constraint.
 *
 * The stored value is always the formatted string. Masking and validation both
 * work off the digits, recovered with a strip, so formatting cannot break
 * either.
 */

export interface DialPlan {
  /** Country calling code, without the plus. */
  code: string;
  /** Two-letter code, for the picker. */
  iso: string;
  label: string;
  /** Digit counts the subscriber part is allowed to be. */
  lengths: number[];
  /** Group sizes, applied left to right. The last repeats if digits remain. */
  groups: number[];
}

/**
 * Ordered longest-code-first so `splitDial` cannot mistake +91 for +9.
 * `lengths` are national significant numbers, excluding the country code.
 */
export const DIAL_PLANS: DialPlan[] = [
  { code: "91", iso: "IN", label: "India", lengths: [10], groups: [5, 5] },
  { code: "1", iso: "US", label: "United States / Canada", lengths: [10], groups: [3, 3, 4] },
  { code: "44", iso: "GB", label: "United Kingdom", lengths: [10], groups: [4, 6] },
  { code: "61", iso: "AU", label: "Australia", lengths: [9], groups: [3, 3, 3] },
  { code: "49", iso: "DE", label: "Germany", lengths: [10, 11], groups: [3, 4, 4] },
  { code: "33", iso: "FR", label: "France", lengths: [9], groups: [1, 2, 2, 2, 2] },
  { code: "81", iso: "JP", label: "Japan", lengths: [10], groups: [2, 4, 4] },
  { code: "86", iso: "CN", label: "China", lengths: [11], groups: [3, 4, 4] },
  { code: "65", iso: "SG", label: "Singapore", lengths: [8], groups: [4, 4] },
  { code: "971", iso: "AE", label: "United Arab Emirates", lengths: [9], groups: [2, 3, 4] },
  { code: "966", iso: "SA", label: "Saudi Arabia", lengths: [9], groups: [2, 3, 4] },
  { code: "60", iso: "MY", label: "Malaysia", lengths: [9, 10], groups: [2, 4, 4] },
  { code: "62", iso: "ID", label: "Indonesia", lengths: [9, 10, 11], groups: [3, 4, 4] },
  { code: "63", iso: "PH", label: "Philippines", lengths: [10], groups: [3, 3, 4] },
  { code: "66", iso: "TH", label: "Thailand", lengths: [9], groups: [2, 3, 4] },
  { code: "84", iso: "VN", label: "Vietnam", lengths: [9], groups: [3, 3, 3] },
  { code: "94", iso: "LK", label: "Sri Lanka", lengths: [9], groups: [2, 3, 4] },
  { code: "880", iso: "BD", label: "Bangladesh", lengths: [10], groups: [4, 6] },
  { code: "977", iso: "NP", label: "Nepal", lengths: [10], groups: [3, 7] },
  { code: "92", iso: "PK", label: "Pakistan", lengths: [10], groups: [3, 7] },
  { code: "27", iso: "ZA", label: "South Africa", lengths: [9], groups: [2, 3, 4] },
  { code: "234", iso: "NG", label: "Nigeria", lengths: [10], groups: [3, 3, 4] },
  { code: "254", iso: "KE", label: "Kenya", lengths: [9], groups: [3, 3, 3] },
  { code: "55", iso: "BR", label: "Brazil", lengths: [10, 11], groups: [2, 5, 4] },
  { code: "52", iso: "MX", label: "Mexico", lengths: [10], groups: [2, 4, 4] },
  { code: "31", iso: "NL", label: "Netherlands", lengths: [9], groups: [3, 3, 3] },
  { code: "34", iso: "ES", label: "Spain", lengths: [9], groups: [3, 3, 3] },
  { code: "39", iso: "IT", label: "Italy", lengths: [9, 10], groups: [3, 3, 4] },
  { code: "41", iso: "CH", label: "Switzerland", lengths: [9], groups: [2, 3, 2, 2] },
  { code: "46", iso: "SE", label: "Sweden", lengths: [9], groups: [2, 3, 2, 2] },
  { code: "47", iso: "NO", label: "Norway", lengths: [8], groups: [3, 2, 3] },
  { code: "48", iso: "PL", label: "Poland", lengths: [9], groups: [3, 3, 3] },
  { code: "351", iso: "PT", label: "Portugal", lengths: [9], groups: [3, 3, 3] },
  { code: "353", iso: "IE", label: "Ireland", lengths: [9], groups: [2, 3, 4] },
  { code: "358", iso: "FI", label: "Finland", lengths: [9], groups: [2, 3, 4] },
  { code: "372", iso: "EE", label: "Estonia", lengths: [7, 8], groups: [4, 4] },
  { code: "420", iso: "CZ", label: "Czechia", lengths: [9], groups: [3, 3, 3] },
  { code: "64", iso: "NZ", label: "New Zealand", lengths: [8, 9], groups: [3, 3, 3] },
  { code: "82", iso: "KR", label: "South Korea", lengths: [9, 10], groups: [2, 4, 4] },
  { code: "90", iso: "TR", label: "Türkiye", lengths: [10], groups: [3, 3, 4] },
  { code: "972", iso: "IL", label: "Israel", lengths: [9], groups: [2, 3, 4] },
  { code: "7", iso: "RU", label: "Russia / Kazakhstan", lengths: [10], groups: [3, 3, 2, 2] },
  { code: "20", iso: "EG", label: "Egypt", lengths: [10], groups: [3, 3, 4] },
  { code: "30", iso: "GR", label: "Greece", lengths: [10], groups: [3, 3, 4] },
  { code: "32", iso: "BE", label: "Belgium", lengths: [9], groups: [3, 2, 2, 2] },
  { code: "36", iso: "HU", label: "Hungary", lengths: [9], groups: [2, 3, 4] },
  { code: "40", iso: "RO", label: "Romania", lengths: [9], groups: [3, 3, 3] },
  { code: "43", iso: "AT", label: "Austria", lengths: [10, 11], groups: [3, 3, 4] },
  { code: "45", iso: "DK", label: "Denmark", lengths: [8], groups: [2, 2, 2, 2] },
  { code: "56", iso: "CL", label: "Chile", lengths: [9], groups: [1, 4, 4] },
  { code: "57", iso: "CO", label: "Colombia", lengths: [10], groups: [3, 3, 4] },
  { code: "58", iso: "VE", label: "Venezuela", lengths: [10], groups: [3, 3, 4] },
  { code: "54", iso: "AR", label: "Argentina", lengths: [10], groups: [2, 4, 4] },
  { code: "212", iso: "MA", label: "Morocco", lengths: [9], groups: [3, 3, 3] },
  { code: "233", iso: "GH", label: "Ghana", lengths: [9], groups: [3, 3, 3] },
  { code: "852", iso: "HK", label: "Hong Kong", lengths: [8], groups: [4, 4] },
  { code: "886", iso: "TW", label: "Taiwan", lengths: [9], groups: [3, 3, 3] },
  { code: "993", iso: "TM", label: "Turkmenistan", lengths: [8], groups: [2, 2, 2, 2] },
  { code: "998", iso: "UZ", label: "Uzbekistan", lengths: [9], groups: [2, 3, 2, 2] },
];

/** E.164 caps the whole number at fifteen digits including the country code. */
const E164_MAX = 15;

const BY_CODE = new Map(DIAL_PLANS.map((plan) => [plan.code, plan]));

/** Longest match wins, so +91 is never read as +9. */
export function splitDial(digits: string): { code: string; rest: string; plan: DialPlan | null } {
  for (const length of [3, 2, 1]) {
    const candidate = digits.slice(0, length);
    const plan = BY_CODE.get(candidate);
    if (plan) return { code: candidate, rest: digits.slice(length), plan };
  }
  // Unknown code. Assume the shortest plausible split so the field still
  // formats rather than freezing on an unrecognised country.
  return { code: digits.slice(0, 2), rest: digits.slice(2), plan: null };
}

export function planFor(value: string): DialPlan | null {
  return splitDial(phoneDigits(value)).plan;
}

/** Applies a group pattern, repeating the last size once the pattern runs out. */
function group(rest: string, sizes: number[]): string {
  const out: string[] = [];
  let index = 0;
  let step = 0;
  while (index < rest.length) {
    const size = sizes[Math.min(step, sizes.length - 1)];
    out.push(rest.slice(index, index + size));
    index += size;
    step += 1;
  }
  return out.join(" ");
}

/** Generic grouping for countries not in the table. Threes, then a four. */
function genericGroups(rest: string): number[] {
  if (rest.length <= 4) return [rest.length || 1];
  if (rest.length <= 7) return [3, 4];
  return [3, 3, 4];
}

/** The longest national number a plan allows, used to stop over-typing. */
export function maxRestLength(plan: DialPlan | null, code: string): number {
  if (plan) return Math.max(...plan.lengths);
  return Math.max(1, E164_MAX - code.length);
}

/**
 * Formats as the person types.
 *
 * Always leads with a `+`, inserts the space after the country code without
 * anyone pressing space, and refuses digits past what the country allows. The
 * refusal is the part that was missing: a field that silently accepts twenty
 * digits has told the person their number is fine when it is not.
 */
export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, E164_MAX);
  if (!digits) return input.trim().startsWith("+") ? "+" : "";

  const { code, rest, plan } = splitDial(digits);
  const capped = rest.slice(0, maxRestLength(plan, code));
  if (!capped) return `+${code}`;

  const sizes = plan ? plan.groups : genericGroups(capped);
  return `+${code} ${group(capped, sizes)}`;
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * True when the number is complete for its country.
 *
 * Length is checked against the country's own plan rather than against E.164's
 * outer bounds, so a nine-digit Indian number is now rejected where it used to
 * pass for being over eight.
 */
export function isValidPhone(value: string): boolean {
  if (!value.trim().startsWith("+")) return false;
  const digits = phoneDigits(value);
  if (digits.length < 8 || digits.length > E164_MAX) return false;

  const { rest, plan } = splitDial(digits);
  if (!plan) return rest.length >= 4 && rest.length <= 14;
  return plan.lengths.includes(rest.length);
}

/** What to tell someone whose number is not accepted yet. */
export function phoneHint(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("+")) return "Start with the country code, for example +91.";

  const digits = phoneDigits(trimmed);
  const { rest, plan } = splitDial(digits);

  if (!plan) {
    if (rest.length < 4) return "That country code is not one we know; keep going.";
    return null;
  }
  if (rest.length === 0) return `${plan.label}: ${plan.lengths[0]} digits to go.`;
  if (plan.lengths.includes(rest.length)) return null;

  const shortest = Math.min(...plan.lengths);
  if (rest.length < shortest) {
    return `${plan.label} numbers are ${plan.lengths.join(" or ")} digits. ${shortest - rest.length} to go.`;
  }
  return `${plan.label} numbers are ${plan.lengths.join(" or ")} digits.`;
}
