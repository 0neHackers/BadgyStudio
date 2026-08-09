"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CANVAS, EVENT, type FormatKey } from "@/lib/brand";
import { buildBadge } from "@/lib/badge";
import { makeSerial, prefixedSerial, type SerialFormat } from "@/lib/identifier";
import { downloadBlob, fileNameFor, renderBlob } from "@/lib/export";
import { releasePhoto } from "@/lib/image";
import {
  findPass,
  fromVaultPhoto,
  loadVault,
  savePass,
  subscribeVault,
  toVaultPhoto,
  updatePassPhoto,
  vaultLoaded,
  vaultSnapshot,
} from "@/lib/vault";
import { DEFAULT_INPUT, DEFAULT_VISIBILITY, type BadgeState, type PhotoAsset } from "@/types";
import { CODE_OPTIONS, type CodeKind } from "@/lib/codes";
import { IdCard } from "@/components/IdCard";
import { PfpFrame } from "@/components/PfpFrame";
import { TeamFrame } from "@/components/TeamFrame";
import { Stage } from "@/components/Stage";
import { PhotoEditor } from "@/components/PhotoEditor";
import { PhoneField, EmailField } from "@/components/ContactFields";
import { Button, Segmented, TextField } from "@/components/ui/controls";
import { notifyError, notifyInfo, notifyProgress, notifySuccess } from "@/lib/toast";

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
 *
 * THE PHOTO, ADDED IN V06.04
 *
 * Until now this page always drew an empty photo slot and said "photos are
 * never stored". That stopped being true in V06.00, which stores the photo with
 * the pass in this browser's IndexedDB. So the page was refusing to show
 * something it already had.
 *
 * It now reads the same vault record /passes reads. One store, one photo, every
 * surface: change it here and the saved-pass list, a re-issue and any later
 * render all see the new one, because they are all looking at the same record
 * rather than at their own copy.
 *
 * A photo can be uploaded, re-cropped or removed here, and the page says so
 * plainly rather than leaving it to be discovered.
 *
 * The gate still comes first. Nothing is shown or written until the details
 * recompute to this serial, so updating a photo needs the same proof that
 * downloading one does. And a photo has never been part of the serial hash, so
 * changing a face cannot change a pass number.
 *
 * When this browser has no record, there is nothing to show and nothing to
 * update: the vault is local, so a pass issued on somebody else's laptop is
 * simply not here. The page says that too, rather than showing an empty slot
 * that looks like a missing photo.
 */

type Mode = "personal" | "team";

/** Stable empty array, so the subscription snapshot never changes identity. */
const EMPTY_PASSES: ReturnType<typeof vaultSnapshot> = [];

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
  const [codeKind, setCodeKind] = useState<CodeKind>("datamatrix");
  /** A photo picked in this session, before it has been written to the vault. */
  const [draftPhoto, setDraftPhoto] = useState<PhotoAsset | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);

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

  /* ------------------------------------------------------- the stored photo */

  // Subscribing rather than reading once: an update from this page, or from
  // /passes in another tab, has to reach this render.
  const records = useSyncExternalStore(subscribeVault, vaultSnapshot, () => EMPTY_PASSES);
  const vaultReady = useSyncExternalStore(subscribeVault, vaultLoaded, () => false);

  useEffect(() => {
    void loadVault();
  }, []);

  const passId = prefixedSerial(serial, state.format);
  const record = useMemo(
    // `records` is the subscription; findPass reads the same cache and is the
    // one place that knows how a pass number can be written.
    () => (records.length >= 0 ? findPass(passId) : null),
    [records, passId],
  );

  /**
   * What the artboard draws: the photo picked in this session if there is one,
   * otherwise whatever the vault holds. Object URLs, so both are revoked when
   * they stop being the current one.
   */
  const storedPhoto = useMemo(
    () => (unlocked && record?.photo ? fromVaultPhoto(record.photo) : null),
    [unlocked, record],
  );
  useEffect(() => () => releasePhoto(storedPhoto), [storedPhoto]);
  useEffect(() => () => releasePhoto(draftPhoto), [draftPhoto]);

  const photo = draftPhoto ?? storedPhoto;

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

  /**
   * Writes the picked photo into the vault record, so every other surface sees
   * it. Creates the record when this browser does not have one yet: the gate
   * has already proved these details produce this serial, which is the same
   * proof the generators never had to ask for.
   */
  const savePhoto = async (next: PhotoAsset | null) => {
    setSavingPhoto(true);
    const job = notifyProgress(next ? "Saving the photo" : "Removing the photo", passId);
    try {
      const stored = toVaultPhoto(next);
      const updated = record ? await updatePassPhoto(passId, stored) : false;

      if (!updated) {
        const written = await savePass({
          serial,
          format: state.format,
          input: state.input,
          visibility: DEFAULT_VISIBILITY,
          accent: "sun",
          customTitle: "",
          titleOverrideIndex: 0,
          fullDetailsInCode: false,
          photo: stored,
          source: "single",
        });
        if (!written) {
          job.fail(
            "The photo could not be saved",
            "This browser refused storage, so it is only on screen.",
          );
          setSavingPhoto(false);
          return;
        }
        job.succeed("Photo saved to this browser", `${passId} is now in Saved.`);
        setSavingPhoto(false);
        setDraftPhoto(null);
        return;
      }

      job.succeed(
        next ? "Photo updated" : "Photo removed",
        "Every place this pass appears now uses it.",
      );
      // The draft has served its purpose; from here the vault is the source.
      setDraftPhoto(null);
    } catch {
      job.fail("The photo could not be saved", "Try again in a moment.");
    } finally {
      setSavingPhoto(false);
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

          <Segmented
            ariaLabel="Code"
            value={codeKind}
            options={CODE_OPTIONS}
            onChange={setCodeKind}
          />

          <Stage width={size.w} height={size.h} nodeRef={nodeRef}>
            {state.format === "card" ? (
              <IdCard badge={badge} photo={photo} codeKind={codeKind} />
            ) : state.format === "pfp" ? (
              <PfpFrame badge={badge} photo={photo} codeKind={codeKind} />
            ) : (
              <TeamFrame badge={badge} photo={photo} members={[]} codeKind={codeKind} />
            )}
          </Stage>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void download()}>
              Download PNG
            </Button>
            <span
              className="font-[family-name:var(--font-mono)] tracking-[0.12em] text-ink/45"
              style={{ fontSize: "0.77rem" }}
            >
              {size.w} × {size.h} · 3× ON DOWNLOAD
            </span>
          </div>

          {/* Photo. Said explicitly, because a control nobody expects on this
              page is a control nobody finds. */}
          <div className="border-[3px] border-ink bg-paper p-[var(--gap-sm)]">
            <p
              className="font-[family-name:var(--font-mono)] font-bold tracking-[0.2em] text-ink/55"
              style={{ fontSize: "0.77rem" }}
            >
              PHOTO · YOU CAN UPDATE IT HERE
            </p>
            <p
              className="mt-1 max-w-[70ch] leading-relaxed text-ink/65"
              style={{ fontSize: "var(--step--1)" }}
            >
              {record?.photo
                ? "This pass already has a photo saved in this browser, and it is the one drawn above. Upload a new one to replace it, or re-crop the one that is there."
                : vaultReady && record
                  ? "This pass is saved in this browser without a photo. Add one and it will be kept with the pass."
                  : "This pass was not issued from this browser, so there is no photo here to show. Add one and the pass will be saved on this device with it."}{" "}
              Whatever you set is shared everywhere the pass appears: the saved list, a
              re-issue, and any later render all read the same record. It never changes the
              pass number, because the serial is built from the details and never from the
              face.
            </p>

            <div className="mt-3">
              <PhotoEditor
                photo={photo}
                aspect={state.format === "pfp" ? 1 : 372 / 496}
                onPhoto={(next) => {
                  releasePhoto(draftPhoto);
                  setDraftPhoto(next);
                }}
                /**
                 * A crop change edits the draft. When the only photo in hand is
                 * the stored one, it is promoted to a draft first, so re-cropping
                 * what is saved does not silently rewrite the record before
                 * anyone presses save.
                 */
                onChange={(patch) =>
                  setDraftPhoto((prev) => {
                    const base = prev ?? storedPhoto;
                    return base ? { ...base, ...patch } : prev;
                  })
                }
                onClear={() => {
                  releasePhoto(draftPhoto);
                  setDraftPhoto(null);
                  if (record?.photo) void savePhoto(null);
                }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={() => void savePhoto(draftPhoto ?? photo)}
                disabled={savingPhoto || !photo}
              >
                {record?.photo ? "Save the new photo" : "Save this photo"}
              </Button>
              {draftPhoto ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    releasePhoto(draftPhoto);
                    setDraftPhoto(null);
                    notifyInfo("Reverted", "Back to the photo saved with this pass.");
                  }}
                  disabled={savingPhoto}
                >
                  Discard the change
                </Button>
              ) : null}
              {draftPhoto ? (
                <span className="text-ink/60" style={{ fontSize: "var(--step--1)" }}>
                  Not saved yet. The badge above is already using it.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
