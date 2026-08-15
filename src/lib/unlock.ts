"use client";

import Papa from "papaparse";
import { makeSerial } from "@/lib/identifier";
import { DEFAULT_INPUT } from "@/types";
import type { VaultPass } from "@/lib/vault";

/**
 * Unlocking a selection of saved passes.
 *
 * WHY THE OLD FORM WAS WRONG
 *
 * Until V07.02 a batch re-issue asked for one set of details and checked every
 * selected pass against them. That can only ever unlock the one person whose
 * details were typed, and refuse everyone else. It was not insecure, it was
 * useless: twenty-five ticked passes, one answer, twenty-four refusals.
 *
 * The check itself was right and is unchanged. A pass number is a hash of
 * name, handle, email and team, and the only way to prove someone knows what a
 * pass was issued from is to recompute it. What was wrong was asking the
 * question once.
 *
 * WHAT REPLACES IT
 *
 * One answer per pass, supplied either by typing into a table or by filling in
 * a CSV. Every pass is still verified on its own, against its own answer, so
 * the guarantee per pass is exactly what it was when you unlocked one by hand.
 *
 * WHAT IS ASKED FOR, AND WHY NOTHING ELSE IS
 *
 * The four hashed fields and the pass number. Phone was considered and cut: it
 * is not part of the hash, so it could not be a criterion, and the badge is
 * redrawn from the stored record, so supplying it here would not have reached
 * the card either. A field that verifies nothing and prints nothing is a box
 * that asks somebody to type for no reason.
 */

/**
 * The columns, written with the headings a person reads rather than the keys
 * the parser uses. Both templates emit exactly these, in this order.
 *
 * They are the four fields a pass number is hashed from, plus the pass number
 * itself. Nothing else, because nothing else would do anything: the badge is
 * redrawn from the stored record, so a column the check does not read and the
 * render does not use is a box that asks somebody to type for no reason.
 *
 * Phone was in an earlier draft of this file and is gone for that reason. It is
 * not part of the hash, so it verified nothing, and it was never written back
 * to the record, so it printed nothing either.
 */
export const UNLOCK_HEADERS = ["Serial ID", "Name", "@handle", "Team", "Email"] as const;

export interface UnlockAnswer {
  /** Prefixed pass number. The only field that identifies which pass this is. */
  serial: string;
  name: string;
  handle: string;
  team: string;
  email: string;
}

export const EMPTY_ANSWER: Omit<UnlockAnswer, "serial"> = {
  name: "",
  handle: "",
  team: "",
  email: "",
};

/**
 * Does this answer produce this pass's serial?
 *
 * A team pass keeps the name and email from the record, because a team frame
 * is gated on the team and the lead's handle: those are the two of the four
 * that a team pass shares with the person filling this in. That rule is
 * inherited from V05.07 and is not new here.
 */
export function answerMatches(pass: VaultPass, answer: Omit<UnlockAnswer, "serial">): boolean {
  const isTeam = pass.format === "team";
  return (
    makeSerial({
      ...DEFAULT_INPUT,
      name: isTeam ? pass.input.name : answer.name,
      username: answer.handle,
      email: isTeam ? pass.input.email : answer.email,
      team: answer.team,
    }) === pass.serial
  );
}

/** Which fields a given pass actually needs filled in before it can be checked. */
export function requiredFor(pass: VaultPass): (keyof Omit<UnlockAnswer, "serial">)[] {
  return pass.format === "team" ? ["handle", "team"] : ["name", "handle", "team", "email"];
}

export function isComplete(pass: VaultPass, answer: Omit<UnlockAnswer, "serial">): boolean {
  return requiredFor(pass).every((field) => answer[field].trim().length > 0);
}

/* ------------------------------------------------------------------ templates */

function csv(rows: string[][]): string {
  return Papa.unparse(rows, { newline: "\n" }) + "\n";
}

/**
 * A template with nothing in it. For someone who already has the details in a
 * spreadsheet and would rather paste a column than fill a form.
 */
export function blankTemplate(): string {
  return csv([[...UNLOCK_HEADERS]]);
}

/**
 * A template with the pass number and the holder's name already in it, so the
 * operator only supplies the handle, team and email.
 *
 * SAID PLAINLY, BECAUSE IT WEAKENS THE GATE
 *
 * The name is one of the four fields the pass number is hashed from. Writing it
 * into a file the app hands out means bulk unlock proves knowledge of three of
 * the four, not four, so anyone who can export this template can unlock the
 * passes in it.
 *
 * That is a deliberate trade and it is bounded: the vault is local to this
 * browser, and anyone who can press this button can already read the names off
 * the list on screen. The single-pass gate is unchanged and still asks for all
 * four. The blank template above asks for all four as well.
 */
export function prefilledTemplate(passes: VaultPass[]): string {
  return csv([
    [...UNLOCK_HEADERS],
    ...passes.map((pass) => [pass.id, pass.input.name, "", "", ""]),
  ]);
}

/* -------------------------------------------------------------------- import */

export interface ParsedUnlockCsv {
  /** Answers whose serial matched a pass in the selection or in the vault. */
  matched: UnlockAnswer[];
  /** Serials in the file that this browser has no record of. */
  unknown: string[];
  /** Rows with no serial at all, which is the one thing that cannot be guessed. */
  malformed: number;
}

const normaliseKey = (key: string) => key.trim().toLowerCase().replace(/[^a-z]/g, "");

/**
 * Column aliases, so a file that has been through a spreadsheet still imports.
 * The same idea as the roster's own mapping, kept deliberately small: this file
 * is one the app generated, so the aliases only have to survive a round trip
 * through Excel rather than an arbitrary export.
 */
const ALIASES: Record<string, keyof UnlockAnswer> = {
  serial: "serial",
  serialid: "serial",
  passnumber: "serial",
  passno: "serial",
  id: "serial",
  name: "name",
  fullname: "name",
  handle: "handle",
  username: "handle",
  xhandle: "handle",
  x: "handle",
  team: "team",
  teamname: "team",
  email: "email",
  emailid: "email",
};

/**
 * Reads a filled-in template.
 *
 * Rows are keyed by serial and nothing else, so the order in the file does not
 * matter, rows can be deleted, and a file covering more passes than are
 * currently ticked still works. That last part is deliberate: the upload is
 * allowed to widen the selection, because someone who filled in forty rows
 * meant forty.
 */
export function parseUnlockCsv(text: string, known: VaultPass[]): ParsedUnlockCsv {
  const byId = new Map(known.map((pass) => [pass.id.toUpperCase(), pass]));
  const bySerial = new Map(known.map((pass) => [pass.serial.toUpperCase(), pass]));

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => ALIASES[normaliseKey(header)] ?? normaliseKey(header),
  });

  const matched: UnlockAnswer[] = [];
  const unknown: string[] = [];
  let malformed = 0;

  for (const row of parsed.data) {
    const raw = (row.serial ?? "").trim().toUpperCase().replace(/\s+/g, "");
    if (!raw) {
      malformed += 1;
      continue;
    }

    // Accepts the prefixed form the template writes and the bare body, for the
    // same reason /v does: people retype these from a card.
    const pass = byId.get(raw) ?? bySerial.get(raw.replace(/^[A-Z]{3}-?/, ""));
    if (!pass) {
      unknown.push(raw);
      continue;
    }

    matched.push({
      serial: pass.id,
      name: (row.name ?? "").trim(),
      handle: (row.handle ?? "").trim(),
      team: (row.team ?? "").trim(),
      email: (row.email ?? "").trim(),
    });
  }

  return { matched, unknown, malformed };
}
