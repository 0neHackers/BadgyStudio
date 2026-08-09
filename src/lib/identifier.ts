import { seededRandom } from "@/lib/hash";
import type { BuilderInput } from "@/types";

/**
 * Badge serial. Ten uppercase alphanumerics, repeats allowed, laid out in mono
 * on the card. Nine characters come from a hash of the builder's identity, the
 * tenth is a mod-36 check character so a gate scanner can reject a typo without
 * hitting a database.
 *
 * Deterministic on purpose: the same person filling the form twice gets the
 * same serial, so their card is stable across sessions and devices.
 */

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O, they read as 1 and 0
const BODY_LENGTH = 9;
const NAMESPACE = "hhgoa-2026";

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function identitySeed(input: BuilderInput): string {
  const handle = normalise(input.username).replace(/^@/, "");
  return [
    NAMESPACE,
    normalise(input.name),
    handle,
    normalise(input.email),
    normalise(input.team),
  ].join("|");
}

function checkCharacter(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const value = ALPHABET.indexOf(body[i]);
    // Alternating weights so a swapped pair changes the result.
    sum += value * (i % 2 === 0 ? 3 : 1);
  }
  return ALPHABET[sum % ALPHABET.length];
}

export function makeSerial(input: BuilderInput): string {
  const seed = identitySeed(input);
  const random = seededRandom(seed);
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i++) {
    body += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return body + checkCharacter(body);
}

export function isValidSerial(serial: string): boolean {
  if (!/^[0-9A-HJ-NP-Z]{10}$/.test(serial)) return false;
  return checkCharacter(serial.slice(0, BODY_LENGTH)) === serial[BODY_LENGTH];
}

/** XXXX XXX XXX, easier to read out loud at a check-in desk. */
export function formatSerial(serial: string): string {
  return `${serial.slice(0, 4)} ${serial.slice(4, 7)} ${serial.slice(7, 10)}`;
}

/* -------------------------------------------------------------------------
   Format prefixes.

   A pass number now carries what kind of pass it is: IDX- for the ID card,
   BGX- for the profile frame, FMX- for the team frame.

   The prefix is a TAG, not part of the identity. The ten-character body is
   unchanged and still comes from name, handle, email and team alone, so the
   same person's card and frame share a body and differ only in the prefix.
   That was a deliberate choice over feeding the format into the hash: every
   serial ever issued keeps validating, printed cards stay correct, and a code
   scanned from an old badge still resolves.

   Everything that reads a serial therefore has to accept it either way. That
   is what `parseSerial` is for, and no other file should be splitting on the
   hyphen itself.
------------------------------------------------------------------------- */

export const SERIAL_PREFIXES = {
  card: "IDX",
  pfp: "BGX",
  team: "FMX",
} as const;

export type SerialFormat = keyof typeof SERIAL_PREFIXES;

const PREFIX_TO_FORMAT = new Map<string, SerialFormat>(
  (Object.entries(SERIAL_PREFIXES) as [SerialFormat, string][]).map(([format, prefix]) => [
    prefix,
    format,
  ]),
);

/** The full pass number as it is printed and stored. */
export function prefixedSerial(serial: string, format: SerialFormat): string {
  return `${SERIAL_PREFIXES[format]}-${serial}`;
}

export interface ParsedSerial {
  /** The ten-character body, which is what the check character validates. */
  body: string;
  /** The format the prefix named, or null when there was no prefix. */
  format: SerialFormat | null;
  /** Normalised for display and storage: prefixed when the format is known. */
  canonical: string;
  valid: boolean;
}

/**
 * Reads a serial in any of the shapes a person might arrive with: typed into
 * the header search, pasted from a card, scanned from a code, or left over
 * from before prefixes existed. Spaces and case are forgiven because the
 * printed form is grouped and upper case.
 */
export function parseSerial(input: string): ParsedSerial {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  const match = /^([A-Z]{3})-?([0-9A-HJ-NP-Z]{10})$/.exec(cleaned);

  if (match) {
    const format = PREFIX_TO_FORMAT.get(match[1]) ?? null;
    const body = match[2];
    return {
      body,
      format,
      canonical: format ? prefixedSerial(body, format) : body,
      // An unknown three-letter prefix is not a pass number this app issued.
      valid: format !== null && isValidSerial(body),
    };
  }

  const body = cleaned.replace(/-/g, "");
  return { body, format: null, canonical: body, valid: isValidSerial(body) };
}

/** IDX-XXXX XXX XXX. The prefix stays joined; only the body is grouped. */
export function formatPrefixedSerial(serial: string, format: SerialFormat): string {
  return `${SERIAL_PREFIXES[format]}-${formatSerial(serial)}`;
}
