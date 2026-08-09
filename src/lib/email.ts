/**
 * Email checking.
 *
 * There was none. The field accepted anything, so `dhfogvgsuvgu$gsuivg.con`
 * printed onto a card and into the Data Matrix exactly as typed.
 *
 * WHAT THIS DOES AND DOES NOT CLAIM
 *
 * A regular expression cannot tell you an address exists, and the full RFC
 * 5322 grammar accepts things no mail provider will. So this checks structure
 * only, and separately points out the small number of mistakes that are almost
 * always mistakes: a missing @, a space in the middle, a domain with no dot, a
 * trailing dot, and the handful of top-level typos that come from a slipped
 * finger (`.con`, `.cim`, `.co`). Those are warnings on the way to being
 * useful, not grounds for refusing to render a badge.
 *
 * The distinction matters for the roster: a hard failure blocks a row from
 * being issued, and blocking somebody's pass over a plausible-but-unusual
 * address would be worse than printing it.
 */

/**
 * Structural check. Deliberately stricter than RFC 5322 and looser than a
 * provider: one @, no spaces, a dot in the domain, sane label characters.
 */
const SHAPE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** Top-level typos that are worth naming, mapped to what was probably meant. */
const TLD_TYPOS: Record<string, string> = {
  con: "com",
  cim: "com",
  vom: "com",
  xom: "com",
  comm: "com",
  ocm: "com",
  cm: "com",
  co: "com",
  orgg: "org",
  ogr: "org",
  nte: "net",
  ner: "net",
};

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  if (!SHAPE.test(trimmed)) return false;

  const [local, domain] = trimmed.split("@");
  if (local.length > 64) return false;
  // A leading, trailing or doubled dot is invalid on either side.
  if (/^\.|\.$|\.\./.test(local) || /^\.|\.$|\.\./.test(domain)) return false;
  // A label may not start or end with a hyphen.
  if (domain.split(".").some((label) => label.startsWith("-") || label.endsWith("-"))) return false;

  return true;
}

/** What to tell someone whose address is not accepted, or looks mistyped. */
export function emailHint(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.includes("@")) return "An address needs an @.";
  if (trimmed.split("@").length > 2) return "That has more than one @.";
  if (/\s/.test(trimmed)) return "Addresses cannot contain spaces.";

  const [local, domain] = trimmed.split("@");
  if (!local) return "Nothing before the @.";
  if (!domain) return "Nothing after the @.";
  if (!domain.includes(".")) return "The domain needs a dot, for example gmail.com.";

  if (!isValidEmail(trimmed)) return "That address is not a valid shape.";

  // Valid, but probably not what was meant.
  const tld = domain.split(".").pop()!.toLowerCase();
  const suggestion = TLD_TYPOS[tld];
  if (suggestion) return `Did you mean .${suggestion}?`;

  return null;
}
