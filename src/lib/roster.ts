import { DEFAULT_VISIBILITY, type BuilderInput, type FieldVisibility, type PhotoAsset } from "@/types";
import { identitySeed, makeSerial, prefixedSerial, type SerialFormat } from "@/lib/identifier";
import { builderTitle } from "@/lib/builder-title";
import { formatPhone, isValidPhone, phoneHint } from "@/lib/phone";
import { emailHint } from "@/lib/email";
import { ACCENTS, type AccentKey } from "@/lib/brand";
import { pickIndex } from "@/lib/hash";

/**
 * The roster: one row per badge in a bulk run.
 *
 * A row is not a BadgeState. It carries its own photo and its own issues, and
 * it survives being edited in a table, so it needs an id that outlives sorting
 * and filtering.
 */

export interface RosterRow {
  id: string;
  input: BuilderInput;
  photo: PhotoAsset | null;
  /** Filename from the CSV, used to pair a row with an uploaded photo. */
  photoName: string;
  /** Set once the row has been rendered in a run. */
  serial: string | null;
  issues: string[];
}

export interface RosterSettings {
  visibility: FieldVisibility;
  accent: AccentKey | "perRow";
  fullDetailsInCode: boolean;
  pixelRatio: 2 | 3;
}

export const DEFAULT_ROSTER_SETTINGS: RosterSettings = {
  visibility: DEFAULT_VISIBILITY,
  accent: "perRow",
  fullDetailsInCode: false,
  /**
   * 3x, which is what the single generator's download button produces.
   *
   * Bulk defaulted to 2x because the run was slow and the smaller raster was
   * the only lever anyone had. That made a badge issued from a roster
   * measurably worse than the same badge made by the person themselves, which
   * is the wrong difference for an organiser to be handed. The pipelined
   * encode in lib/batch.ts pays for the larger raster; 2x is still available
   * for anyone who wants smaller files.
   */
  pixelRatio: 3,
};

export const MAX_ROWS = 500;

/* ------------------------------------------------------------------ columns */

/**
 * Header aliases. Organisers export from Devfolio, Google Forms, Airtable and
 * a dozen other things, and none of them agree on a column name. Matching is
 * case-insensitive and ignores spaces, underscores and punctuation, so
 * "Full Name", "full_name" and "FULLNAME" all land on the same field.
 */
const COLUMN_ALIASES: Record<keyof BuilderInput | "photo", string[]> = {
  name: ["name", "fullname", "buildername", "participantname", "attendee", "firstname"],
  username: ["username", "handle", "x", "twitter", "xhandle", "twitterhandle", "socialhandle"],
  team: ["team", "teamname", "squad", "squadname", "project", "projectname", "organisation"],
  role: ["role", "stack", "techstack", "stackrole", "skills", "primarystack", "track", "title"],
  dob: ["dob", "dateofbirth", "birthdate", "birthday"],
  phone: ["phone", "mobile", "contact", "phonenumber", "mobilenumber", "whatsapp"],
  email: ["email", "emailaddress", "mail", "e-mail"],
  photo: ["photo", "image", "picture", "avatar", "photofile", "filename", "photofilename"],
  tier: ["tier", "status", "passtier", "category", "type", "accesslevel"],
  project: ["project", "projectname", "building", "hack", "hackname", "idea"],
};

const normaliseHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export type ColumnMap = Partial<Record<keyof BuilderInput | "photo", string>>;

/** Best-guess mapping from the CSV's own headers to our fields. */
export function autoMapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const seen = new Set<string>();

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    keyof ColumnMap,
    string[],
  ][]) {
    // Exact alias match first, then a prefix match, so "name" does not steal
    // "teamname" and "team name" does not steal "name".
    const exact = headers.find((h) => !seen.has(h) && aliases.includes(normaliseHeader(h)));
    const loose =
      exact ??
      headers.find(
        (h) => !seen.has(h) && aliases.some((a) => normaliseHeader(h).startsWith(a)),
      );

    if (loose) {
      map[field] = loose;
      seen.add(loose);
    }
  }

  return map;
}

export const TEMPLATE_HEADERS = [
  "name",
  "username",
  "team",
  "role",
  "tier",
  "project",
  "dob",
  "phone",
  "email",
  "photo",
] as const;

/** A ready-to-fill CSV, so nobody has to guess the column names. */
export function templateCsv(): string {
  return [
    TEMPLATE_HEADERS.join(","),
    "Ada Lovelace,@ada,Night Shift,Rust and infra,RESIDENT,Analytical Engine,1998-03-14,+91 98765 43210,ada@example.com,ada.jpg",
    "Grace Hopper,@grace,Night Shift,Compilers,SPEAKER,COBOL,1990-12-09,+91 91234 56780,grace@example.com,grace.jpg",
    "",
    "# dob must be YYYY-MM-DD. photo is the filename you will upload alongside.",
    "# Leave any column blank and that line is simply left off the badge.",
  ].join("\n");
}

/* --------------------------------------------------------------- validation */

const DOB = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Row problems are split by severity. `issues` beginning with "!" block the
 * render; everything else is a warning the operator can ignore.
 */
export function validateRow(row: RosterRow): string[] {
  const issues: string[] = [];
  const { input } = row;

  if (!input.name.trim()) issues.push("! Name is required");
  if (input.name.trim().length > 34) issues.push("Name is long and will be shrunk to fit");
  if (input.email.trim()) {
    // The hint carries the reason, so a malformed address says what is wrong
    // with it rather than only that something is.
    const note = emailHint(input.email);
    if (note) issues.push(`Email: ${note}`);
  }
  if (input.dob.trim() && !DOB.test(input.dob.trim())) issues.push("Date of birth is not YYYY-MM-DD");
  if (input.phone.trim() && !isValidPhone(input.phone)) {
    issues.push(`Phone: ${phoneHint(input.phone) ?? "not a complete number"}`);
  }
  if (!row.photo) issues.push("No photo, the frame will render empty");
  if (row.photoName && !row.photo) issues.push(`Photo "${row.photoName}" not uploaded yet`);

  return issues;
}

export function isBlocked(row: RosterRow): boolean {
  return row.issues.some((issue) => issue.startsWith("!"));
}

/* -------------------------------------------------------------------- rows */

let counter = 0;
const nextId = () => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

export function emptyRow(): RosterRow {
  const row: RosterRow = {
    id: nextId(),
    input: {
      name: "",
      username: "",
      team: "",
      role: "",
      dob: "",
      phone: "",
      email: "",
      tier: "",
      project: "",
    },
    photo: null,
    photoName: "",
    serial: null,
    issues: [],
  };
  row.issues = validateRow(row);
  return row;
}

/** Turns parsed CSV records into rows using the supplied column mapping. */
export function rowsFromRecords(
  records: Record<string, string>[],
  map: ColumnMap,
): RosterRow[] {
  const pick = (record: Record<string, string>, field: keyof ColumnMap) => {
    const column = map[field];
    return column ? (record[column] ?? "").toString().trim() : "";
  };

  return records
    .filter((record) =>
      // Drop blank lines and the comment rows the template ships with.
      Object.values(record).some((v) => (v ?? "").toString().trim() && !v.toString().startsWith("#")),
    )
    .slice(0, MAX_ROWS)
    .map((record) => {
      const row: RosterRow = {
        id: nextId(),
        input: {
          name: pick(record, "name"),
          username: pick(record, "username"),
          team: pick(record, "team"),
          role: pick(record, "role"),
          dob: pick(record, "dob"),
          phone: formatPhone(pick(record, "phone")),
          email: pick(record, "email"),
          tier: pick(record, "tier"),
          project: pick(record, "project"),
        },
        photo: null,
        photoName: pick(record, "photo"),
        serial: null,
        issues: [],
      };
      row.issues = validateRow(row);
      return row;
    });
}

/**
 * Pairs uploaded photo files to rows by filename, ignoring case, path and
 * extension. Falls back to positional order for any row that named no file,
 * which is what happens when someone drags in a folder of photos with no
 * photo column at all.
 */
export function matchPhotos(
  rows: RosterRow[],
  photos: Map<string, PhotoAsset>,
): { rows: RosterRow[]; matched: number; unmatched: string[] } {
  const stem = (name: string) => name.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "").toLowerCase();
  const byStem = new Map([...photos.entries()].map(([name, asset]) => [stem(name), asset]));
  const used = new Set<string>();
  let matched = 0;

  const next = rows.map((row) => {
    if (row.photo) return row;

    let asset: PhotoAsset | undefined;
    if (row.photoName) {
      asset = byStem.get(stem(row.photoName));
    }
    if (asset) {
      used.add(stem(row.photoName));
      matched++;
      const updated = { ...row, photo: asset };
      updated.issues = validateRow(updated);
      return updated;
    }
    return row;
  });

  const unmatched = [...photos.keys()].filter((name) => !used.has(stem(name)));
  return { rows: next, matched, unmatched };
}

/** Serial for a row, without needing a full BadgeState. */
/**
 * Which colourway a row gets.
 *
 * Lived in BatchArtboard, which meant the vault could not record what a badge
 * was actually printed in without duplicating the rule. Deterministic per
 * person, so a roster comes out varied and stable.
 */
export function rowAccent(row: RosterRow, settings: RosterSettings): AccentKey {
  if (settings.accent !== "perRow") return settings.accent;
  return ACCENTS[pickIndex(`${identitySeed(row.input)}::accent`, ACCENTS.length)].key;
}

/** The ten-character body. */
export function rowSerial(row: RosterRow): string {
  return makeSerial(row.input);
}

/** The pass number as printed, for the format the run is producing. */
export function rowPassNumber(row: RosterRow, format: SerialFormat): string {
  return prefixedSerial(makeSerial(row.input), format);
}

export function rowTitle(row: RosterRow): string {
  return builderTitle(identitySeed(row.input), row.input.role, 0);
}

/** Filename for a row's PNG inside the zip. Collisions are impossible: the
 *  serial is unique per identity, and the index disambiguates duplicates. */
export function rowFileName(row: RosterRow, serial: string, index: number): string {
  const slug =
    row.input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "builder";
  return `${String(index + 1).padStart(3, "0")}-${slug}-${serial.toLowerCase()}.png`;
}

/**
 * The manifest written alongside the badges, so an organiser has a record of
 * what was issued.
 *
 * Built a line at a time rather than from an array of rows. V05.06 held every
 * `RosterRow` of the run so it could produce this at the end, which kept five
 * hundred rows and their photo references alive for no reason other than the
 * CSV. A line is about 120 bytes; a row with a decoded photo is orders of
 * magnitude more.
 */
const escapeCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const MANIFEST_COLUMNS = [
  "file",
  "serial",
  "name",
  "username",
  "team",
  "role",
  "builder_class",
] as const;

export const manifestCsv = {
  header: () => `${MANIFEST_COLUMNS.join(",")}\n`,
  line: (row: RosterRow, serial: string, file: string) =>
    [
      file,
      serial,
      row.input.name,
      row.input.username,
      row.input.team,
      row.input.role,
      rowTitle(row),
    ]
      .map((v) => escapeCell(String(v ?? "")))
      .join(","),
};
