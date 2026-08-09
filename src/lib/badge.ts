import { ACCENTS, COLORS, EVENT, accentByKey } from "@/lib/brand";
import { bestOn, contrastRatio } from "@/lib/contrast";
import { builderTitle, builderTitles } from "@/lib/builder-title";
import {
  formatPrefixedSerial,
  identitySeed,
  makeSerial,
  prefixedSerial,
} from "@/lib/identifier";
import { pickIndex } from "@/lib/hash";
import { applyVisibility, formatDob, maskDob, maskEmail, maskPhone } from "@/lib/mask";
import type { BadgeState } from "@/types";

export interface Badge {
  /** The ten-character body. What the check character validates. */
  serial: string;
  /** The full pass number as printed: IDX-XXXXXXXXXX. */
  passNumber: string;
  /** IDX-XXXX XXX XXX, grouped for reading out loud at a desk. */
  serialPretty: string;
  seed: string;
  title: string;
  titleOptions: string[];
  accentHex: string;
  accentLabel: string;
  accentOnLight: boolean;
  /** Whichever of ink or paper actually reads on the accent. Computed. */
  onAccent: string;
  /** Ink or paper, for text sitting on the card's own paper. */
  onPaper: string;
  /** Contrast ratio achieved on the accent, for anyone auditing it. */
  accentContrast: number;
  name: string;
  handle: string;
  team: string;
  role: string;
  tier: string;
  project: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
  issued: string;
  /** Text carried by the Data Matrix. */
  payload: string;
}

function cleanHandle(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, "").replace(/\s+/g, "");
  return trimmed ? `@${trimmed}` : "";
}

function titleCaseName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export interface BuildBadgeOptions {
  /** When true the code carries unmasked contact details. Off by default. */
  fullDetailsInCode: boolean;
  /** Absolute origin, used for the verify line inside the code. */
  origin: string;
}

export function buildBadge(state: BadgeState, options: BuildBadgeOptions): Badge {
  const { input, visibility } = state;
  const seed = identitySeed(input);
  const serial = makeSerial(input);
  // The prefix names the format and does not feed the hash, so a person's card
  // and frame share a body. See lib/identifier.ts for why.
  const passNumber = prefixedSerial(serial, state.format);

  const accentKey = state.accent ?? ACCENTS[pickIndex(`${seed}::accent`, ACCENTS.length)].key;
  const accent = accentByKey(accentKey);

  const dob = applyVisibility(input.dob, visibility.dob, maskDob);
  const phone = applyVisibility(input.phone, visibility.phone, maskPhone);
  const email = applyVisibility(input.email, visibility.email, maskEmail);

  // A typed-in class wins over the generated one. Trimmed and capped so it
  // cannot blow out the chip it sits in.
  const title =
    state.customTitle.trim().slice(0, 40) ||
    builderTitle(seed, input.role, state.titleOverrideIndex);

  const lines = [
    `${EVENT.shortName} ${EVENT.edition} BUILDER PASS`,
    `ID ${passNumber}`,
    `NAME ${titleCaseName(input.name) || "-"}`,
    `X ${cleanHandle(input.username) || "-"}`,
  ];
  if (input.team.trim()) lines.push(`TEAM ${input.team.trim()}`);
  if (input.role.trim()) lines.push(`STACK ${input.role.trim()}`);
  if (input.tier.trim()) lines.push(`TIER ${input.tier.trim()}`);
  if (input.project.trim()) lines.push(`BUILDING ${input.project.trim()}`);
  lines.push(`CLASS ${title}`);

  const codeDob = options.fullDetailsInCode ? formatDob(input.dob) : dob;
  const codePhone = options.fullDetailsInCode ? input.phone : phone;
  const codeEmail = options.fullDetailsInCode ? input.email : email;
  if (codeDob) lines.push(`DOB ${codeDob}`);
  if (codePhone) lines.push(`TEL ${codePhone}`);
  if (codeEmail) lines.push(`MAIL ${codeEmail}`);

  lines.push(`EVENT ${EVENT.datesLong}, ${EVENT.location}`);
  lines.push(`VERIFY ${options.origin.replace(/\/$/, "")}/v/${passNumber}`);

  return {
    serial,
    passNumber,
    serialPretty: formatPrefixedSerial(serial, state.format),
    seed,
    title,
    titleOptions: builderTitles(seed, input.role),
    accentHex: accent.hex,
    accentLabel: accent.label,
    accentOnLight: accent.onLight,
    onAccent: bestOn(accent.hex, [COLORS.ink, COLORS.paper]),
    onPaper: bestOn(COLORS.paper, [COLORS.ink, COLORS.paper]),
    accentContrast:
      Math.round(
        contrastRatio(accent.hex, bestOn(accent.hex, [COLORS.ink, COLORS.paper])) * 100,
      ) / 100,
    name: titleCaseName(input.name),
    handle: cleanHandle(input.username),
    team: input.team.trim(),
    role: input.role.trim(),
    tier: input.tier.trim().toUpperCase(),
    project: input.project.trim(),
    dob: dob ? (visibility.dob === "full" ? formatDob(input.dob) : dob) : null,
    phone,
    email,
    issued: `${EVENT.edition} / OPEN TRIALS`,
    payload: lines.join("\n"),
  };
}

export function suggestedAccent(state: BadgeState): string {
  return ACCENTS[pickIndex(`${identitySeed(state.input)}::accent`, ACCENTS.length)].key;
}
