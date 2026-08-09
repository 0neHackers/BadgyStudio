"use client";

import { useMemo, useRef, useState } from "react";
import { CANVAS, EVENT, type FormatKey } from "@/lib/brand";
import { buildBadge } from "@/lib/badge";
import { makeSerial, prefixedSerial, type SerialFormat } from "@/lib/identifier";
import { downloadBlob, fileNameFor, renderBlob } from "@/lib/export";
import { DEFAULT_INPUT, DEFAULT_VISIBILITY, type BadgeState } from "@/types";
import { IdCard } from "@/components/IdCard";
import { PfpFrame } from "@/components/PfpFrame";
import { TeamFrame } from "@/components/TeamFrame";
import { Stage } from "@/components/Stage";
import { PhoneField, EmailField } from "@/components/ContactFields";
import { Button, Segmented, TextField } from "@/components/ui/controls";
import { notifyError, notifyProgress, notifySuccess } from "@/lib/toast";

/**
 * Recovering a badge from its serial.
 *
 * WHAT THIS IS ACTUALLY DOING, BECAUSE IT LOOKS LIKE SOMETHING IT IS NOT
 *
 * There is no database. Nothing about any holder is stored anywhere, by
 * design, and that is the property the whole app is built to keep. So this
 * cannot look a serial up.
 *
 * What it can do is the reverse. A serial is a hash of four fields: name,
 * @handle, email and team. Give it those four and it recomputes the serial and
 * compares. A match proves whoever is typing knows the details the pass was
 * issued from, which is the only thing a stateless system can prove, and it is
 * enough to then draw the card locally.
 *
 * Date of birth and phone are asked for as well, because they appear on the
 * card and it would be a poor reissue without them. They are NOT part of the
 * hash and therefore cannot be checked against anything. The panel says so
 * rather than implying a check it is not performing. Security theatre is worse
 * than no security, because someone eventually relies on it.
 *
 * A team frame is gated on the team name and the lead's handle, which are the
 * two fields of the four that a team pass shares.
 */

type Mode = "personal" | "team";

const FORMATS: { value: FormatKey; label: string; sub: string }[] = [
  { value: "card", label: "ID card", sub: "1080×1350" },
  { value: "pfp", label: "PFP frame", sub: "1024×1024" },
];

export function PassCheck({
  serial,
  format: issuedFormat,
  origin,
}: {
  serial: string;
  /** What the prefix said this pass was, or null for an unprefixed serial. */
  format: SerialFormat | null;
  origin: string;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);

  // The prefix already says whether this is a card, a frame or a team frame,
  // so the form opens on the right one instead of making someone pick again.
  const [mode, setMode] = useState<Mode>(issuedFormat === "team" ? "team" : "personal");
  const [format, setFormat] = useState<FormatKey>(
    issuedFormat === "pfp" ? "pfp" : "card",
  );
  const [fields, setFields] = useState({
    name: "",
    username: "",
    email: "",
    team: "",
    dob: "",
    phone: "",
  });
  const [attempted, setAttempted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const set = (patch: Partial<typeof fields>) => {
    setFields((prev) => ({ ...prev, ...patch }));
    // Any edit invalidates the last answer, so a stale "no match" cannot sit
    // under a form that has since been corrected.
    setAttempted(false);
    setUnlocked(false);
  };

  const state: BadgeState = useMemo(
    () => ({
      format: mode === "team" ? "team" : format,
      input: { ...DEFAULT_INPUT, ...fields },
      visibility: DEFAULT_VISIBILITY,
      accent: "sun",
      photo: null,
      team: [],
      titleOverrideIndex: 0,
      customTitle: "",
    }),
    [fields, format, mode],
  );

  const badge = useMemo(
    () => buildBadge(state, { fullDetailsInCode: false, origin }),
    [state, origin],
  );

  const computed = useMemo(() => makeSerial(state.input), [state.input]);
  const matches = computed === serial;

  const required =
    mode === "team"
      ? [fields.team, fields.username]
      : [fields.name, fields.username, fields.email, fields.team];
  const complete = required.every((value) => value.trim().length > 0);

  const check = () => {
    setAttempted(true);
    setUnlocked(matches);
    if (matches) notifySuccess("Match", `This pass was issued to these details.`);
    else notifyError("Those details do not produce this serial");
  };

  const download = async () => {
    const node = nodeRef.current;
    if (!node) return;
    const job = notifyProgress("Rendering at full size", "3x, print weight");
    try {
      const size = CANVAS[state.format];
      const blob = await renderBlob(node, { width: size.w, height: size.h, pixelRatio: 3 });
      downloadBlob(blob, fileNameFor(state.format, prefixedSerial(serial, state.format)));
      job.succeed("Saved to your downloads");
    } catch {
      job.fail("The render failed", "Try again in a moment.");
    }
  };

  const size = CANVAS[state.format];

  return (
    <div className="grid gap-[var(--gap-md)]">
      <div className="border-[3px] border-ink bg-paper p-[var(--gap-sm)] slab">
        <Segmented
          ariaLabel="What kind of pass"
          value={mode}
          options={[
            { value: "personal", label: "A person's pass", sub: "card or frame" },
            { value: "team", label: "A team frame", sub: "1600×900" },
          ]}
          onChange={(next) => {
            setMode(next);
            setAttempted(false);
            setUnlocked(false);
          }}
        />

        <p className="mt-3 leading-relaxed text-ink/70" style={{ fontSize: "var(--step--1)" }}>
          {mode === "team"
            ? "The team name and the lead's handle are what a team serial is built from. Enter both to recover the frame."
            : "A serial is built from the name, handle, email and team it was issued with. Enter them to recover the pass."}
        </p>

        <div className="mt-4 grid gap-[var(--gap-sm)] sm:grid-cols-2">
          {mode === "personal" ? (
            <TextField
              label="Full name"
              value={fields.name}
              autoComplete="name"
              placeholder="Ada Lovelace"
              onChange={(event) => set({ name: event.target.value })}
            />
          ) : null}

          <TextField
            label={mode === "team" ? "Lead's X handle" : "X handle"}
            value={fields.username}
            placeholder="@handle"
            onChange={(event) => set({ username: event.target.value })}
          />

          <TextField
            label="Team"
            value={fields.team}
            placeholder="Night Shift"
            onChange={(event) => set({ team: event.target.value })}
          />

          {mode === "personal" ? (
            <div className="sm:col-span-2">
              <EmailField value={fields.email} onChange={(next) => set({ email: next })} />
            </div>
          ) : null}
        </div>

        {mode === "personal" ? (
          <>
            <p
              className="mt-5 font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/60"
              style={{ fontSize: "0.77rem" }}
            >
              PRINTED ON THE CARD, NOT CHECKED
            </p>
            <p className="mt-1 leading-snug text-ink/55" style={{ fontSize: "0.77rem" }}>
              These two are not part of the serial, so nothing here can verify them. They are asked
              for so the recovered card is complete.
            </p>
            <div className="mt-2 grid gap-[var(--gap-sm)] sm:grid-cols-2">
              <TextField
                label="Date of birth"
                type="date"
                value={fields.dob}
                onChange={(event) => set({ dob: event.target.value })}
              />
              <div className="sm:col-span-2">
                <PhoneField value={fields.phone} onChange={(next) => set({ phone: next })} />
              </div>
            </div>
          </>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={check} disabled={!complete}>
            Check and show the pass
          </Button>
          {!complete ? (
            <span className="text-ink/55" style={{ fontSize: "var(--step--1)" }}>
              Fill every field above.
            </span>
          ) : null}
        </div>

        {attempted && !matches ? (
          <p
            className="nudge mt-4 border-[3px] border-ink bg-flag px-3 py-2 text-paper"
            role="alert"
            style={{ fontSize: "var(--step--1)" }}
          >
            Those details do not produce this serial. Every field has to match what the pass was
            issued with, including spelling and the team name. Nothing is stored here, so there is
            no other way to check and no way to tell you which field is wrong.
          </p>
        ) : null}
      </div>

      {unlocked ? (
        <div className="rise-in grid gap-[var(--gap-sm)]">
          <div className="border-[3px] border-ink bg-palm px-3 py-2 text-paper">
            <p style={{ fontSize: "var(--step-0)" }}>
              Match. This pass was issued to these details for {EVENT.shortName} {EVENT.edition}.
            </p>
          </div>

          {mode === "personal" ? (
            <Segmented
              ariaLabel="Format"
              value={format}
              options={FORMATS}
              onChange={setFormat}
            />
          ) : null}

          <Stage width={size.w} height={size.h} nodeRef={nodeRef}>
            {state.format === "card" ? (
              <IdCard badge={badge} photo={null} codeKind="datamatrix" />
            ) : state.format === "pfp" ? (
              <PfpFrame badge={badge} photo={null} />
            ) : (
              <TeamFrame badge={badge} photo={null} members={[]} codeKind="datamatrix" />
            )}
          </Stage>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void download()}>
              Download PNG
            </Button>
            <span className="text-ink/60" style={{ fontSize: "var(--step--1)" }}>
              Photos are never stored, so this renders without one. Add it on the generator.
            </span>
          </div>

        </div>
      ) : null}
    </div>
  );
}
