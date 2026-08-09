"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ACCENTS, CANVAS, EVENT, type AccentKey, type FormatKey } from "@/lib/brand";
import { buildBadge } from "@/lib/badge";
import { makeSerial } from "@/lib/identifier";
import { downloadBlob, fileNameFor, renderBlob } from "@/lib/export";
import { yieldToBrowser } from "@/lib/schedule";
import { releasePhoto } from "@/lib/image";
import { DEFAULT_INPUT, type BadgeState, type FieldVisibility, type PhotoAsset } from "@/types";
import type { CodeKind } from "@/lib/codes";
import {
  clearVault,
  deletePass,
  fromVaultPhoto,
  loadVault,
  subscribeVault,
  vaultLoaded,
  vaultQuotaPressure,
  vaultSnapshot,
  vaultUsage,
  type VaultPass,
} from "@/lib/vault";
import { IdCard } from "@/components/IdCard";
import { PfpFrame } from "@/components/PfpFrame";
import { TeamFrame } from "@/components/TeamFrame";
import { Stage } from "@/components/Stage";
import { Button, Segmented, TextField, VisibilityPicker } from "@/components/ui/controls";
import { EmailField } from "@/components/ContactFields";
import { notifyError, notifyProgress, notifySuccess, notifyWarning } from "@/lib/toast";

/**
 * Passes saved in this browser.
 *
 * WHY THE DOWNLOAD IS GATED WHEN THE LIST IS NOT
 *
 * The list shows what this machine issued, because whoever is looking at it
 * made these passes. But a downloadable badge is a credential, and a laptop
 * left open at a registration desk is exactly the situation where "it was
 * already on the screen" becomes someone walking away with a pass in somebody
 * else's name.
 *
 * So taking a PNG out asks the same question /v asks: reproduce the details
 * the serial was built from. It is the identical rule, on purpose, and it is
 * checked the same way, by recomputing the serial rather than by comparing
 * against anything stored. The record on disk is not the authority; the hash
 * is. Nothing is rendered until it passes, because showing the finished card
 * and then refusing to save it would be theatre.
 *
 * WHAT THIS GATE IS NOT
 *
 * It runs in the browser, on data sitting in that browser's own IndexedDB.
 * Anyone with developer tools on the machine can read the store directly and
 * has no need to defeat anything. That is not a flaw to be patched, it is
 * what "stored locally" means, and the only way to change it would be to put
 * the data on a server, which is exactly what this app refuses to do.
 *
 * So the gate is a guard against the person who wanders up to an unattended
 * laptop, not against the person who owns it. Stating that plainly matters
 * more than the gate does, because a security control that is trusted beyond
 * what it does is worse than no control at all.
 *
 * WHAT THE SELECTION IS FOR
 *
 * Re-issuing one pass is a detail change. Re-issuing forty at 3x with the
 * contact block masked is a job, and doing it one at a time is not a job
 * anybody should be asked to do. So the settings panel applies to whatever is
 * ticked, and the same gate covers the batch: one identity is checked per
 * pass, in sequence, and any that fail are reported rather than skipped
 * silently.
 */

const EMPTY: VaultPass[] = [];

const FORMAT_LABEL: Record<FormatKey, string> = {
  card: "ID card",
  pfp: "PFP frame",
  team: "Team frame",
};

/**
 * The render settings, matching the two generators field for field.
 *
 * A pass re-drawn from the vault has to be able to come out the way the
 * originals do, otherwise the vault is a viewer rather than a generator and
 * anyone needing a variant has to retype the person.
 */
export interface RenderSettings {
  pixelRatio: 2 | 3;
  accent: AccentKey | "asIssued";
  visibility: FieldVisibility | "asIssued";
  codeKind: CodeKind;
  fullDetailsInCode: boolean | "asIssued";
  includePhoto: boolean;
}

const DEFAULT_RENDER: RenderSettings = {
  pixelRatio: 3,
  accent: "asIssued",
  visibility: "asIssued",
  codeKind: "datamatrix",
  fullDetailsInCode: "asIssued",
  includePhoto: true,
};

export function PassVault({ origin }: { origin: string }) {
  const passes = useSyncExternalStore(subscribeVault, vaultSnapshot, () => EMPTY);
  const loaded = useSyncExternalStore(subscribeVault, vaultLoaded, () => false);
  const quotaHit = useSyncExternalStore(subscribeVault, vaultQuotaPressure, () => false);

  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_RENDER);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    void loadVault();
    void vaultUsage().then(setUsage);
  }, [passes.length]);

  const shown = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return passes;
    return passes.filter(
      (pass) =>
        pass.id.includes(q) ||
        pass.input.name.toUpperCase().includes(q) ||
        pass.input.team.toUpperCase().includes(q) ||
        pass.input.username.toUpperCase().includes(q),
    );
  }, [passes, filter]);

  const selected = useMemo(
    () => shown.filter((pass) => checked.has(pass.id)),
    [shown, checked],
  );

  const open = passes.find((pass) => pass.id === openId) ?? null;
  const allShownChecked = shown.length > 0 && shown.every((pass) => checked.has(pass.id));

  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setChecked((current) => {
      const next = new Set(current);
      if (allShownChecked) shown.forEach((pass) => next.delete(pass.id));
      else shown.forEach((pass) => next.add(pass.id));
      return next;
    });

  const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="grid gap-[var(--gap-md)]">
      <div className="border-[3px] border-ink bg-paper p-[var(--gap-sm)] slab">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p
              className="font-[family-name:var(--font-mono)] font-bold tracking-[0.2em] text-ink/55"
              style={{ fontSize: "0.77rem" }}
            >
              ON THIS DEVICE
            </p>
            <p style={{ fontSize: "var(--step-1)" }}>
              {loaded ? `${passes.length} pass${passes.length === 1 ? "" : "es"} saved` : "Reading…"}
              {usage && usage.usage > 0 ? (
                <span className="text-ink/55" style={{ fontSize: "var(--step--1)" }}>
                  {" "}
                  · {megabytes(usage.usage)} used
                </span>
              ) : null}
            </p>
          </div>
          {passes.length > 0 ? (
            <Button
              variant="danger"
              onClick={() => {
                const count = passes.length;
                if (window.confirm(`Delete all ${count} saved passes from this browser?`)) {
                  void clearVault().then(() =>
                    notifySuccess(`Deleted ${count} saved pass${count === 1 ? "" : "es"}`),
                  );
                  setChecked(new Set());
                  setOpenId(null);
                }
              }}
            >
              Clear everything
            </Button>
          ) : null}
        </div>

        {/* Said once, plainly, where someone will read it. */}
        <p
          className="mt-3 max-w-[70ch] leading-relaxed text-ink/65"
          style={{ fontSize: "var(--step--1)" }}
        >
          These are stored in this browser only. Nothing is uploaded, so they do not follow you to
          another device and nobody else can see them over the network. They contain names, handles,
          emails, dates of birth and the photo each pass was made with.
        </p>
        <p className="mt-2 max-w-[70ch] leading-relaxed text-ink/55" style={{ fontSize: "0.77rem" }}>
          The check before a download stops someone who wanders up to your open laptop. It cannot
          stop someone who owns the machine, because the data is on it. On a shared computer, clear
          this when you are done.
        </p>

        {quotaHit ? (
          <p
            className="mt-2 border-[3px] border-ink bg-sun px-3 py-2"
            role="status"
            style={{ fontSize: "var(--step--1)" }}
          >
            This browser ran out of storage, so some passes were kept without their photo. The
            details and the serial are intact; re-render those from the generator with the photo
            attached, or clear some space here.
          </p>
        ) : null}

        {passes.length > 0 ? (
          <div className="mt-3">
            <TextField
              label="Filter"
              value={filter}
              placeholder="Serial, name, team or handle"
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      {loaded && passes.length === 0 ? (
        <p
          className="border-[3px] border-ink bg-paper px-4 py-6 text-center text-ink/65"
          style={{ fontSize: "var(--step-0)" }}
        >
          Nothing here yet. Every card, frame and team badge you make gets recorded automatically,
          from the single generator and from a bulk run.
        </p>
      ) : null}

      {shown.length > 0 ? (
        <>
          <RenderControls
            settings={settings}
            onChange={setSettings}
            selectedCount={selected.length}
          />

          <div className="flex flex-wrap items-center gap-3 border-[3px] border-ink bg-paper px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2" style={{ fontSize: "var(--step--1)" }}>
              <input
                type="checkbox"
                checked={allShownChecked}
                onChange={toggleAll}
                className="h-5 w-5 accent-[#FF0080]"
                aria-label="Select every listed pass"
              />
              Select all {shown.length === passes.length ? "" : `${shown.length} shown`}
            </label>
            {checked.size > 0 ? (
              <>
                <span className="text-ink/60" style={{ fontSize: "var(--step--1)" }}>
                  {checked.size} selected
                </span>
                <Button variant="ghost" onClick={() => setChecked(new Set())}>
                  Clear selection
                </Button>
              </>
            ) : null}
          </div>

          {selected.length > 0 ? (
            <BatchUnlock passes={selected} settings={settings} origin={origin} />
          ) : null}

          <ul className="grid gap-2">
            {shown.map((pass) => (
              <li key={pass.id} className="border-[3px] border-ink bg-paper">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked.has(pass.id)}
                      onChange={() => toggle(pass.id)}
                      className="h-5 w-5 shrink-0 accent-[#FF0080]"
                      aria-label={`Select ${pass.id}`}
                    />
                    <span className="min-w-0">
                      <span
                        className="block font-[family-name:var(--font-mono)] font-bold"
                        style={{ fontSize: "0.82rem", letterSpacing: "0.04em" }}
                      >
                        {pass.id}
                      </span>
                      <span className="block truncate text-ink/70" style={{ fontSize: "var(--step--1)" }}>
                        {pass.input.name || "Unnamed"}
                        {pass.input.team ? ` · ${pass.input.team}` : ""} ·{" "}
                        {FORMAT_LABEL[pass.format]} ·{" "}
                        {pass.source === "bulk" ? "bulk run" : "made here"}
                        {pass.photo ? " · photo kept" : " · no photo"}
                      </span>
                    </span>
                  </label>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button onClick={() => setOpenId(openId === pass.id ? null : pass.id)}>
                      {openId === pass.id ? "Close" : "Open"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Delete ${pass.id} from this browser?`)) {
                          void deletePass(pass.id).then(() => notifySuccess("Deleted", pass.id));
                          if (openId === pass.id) setOpenId(null);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {openId === pass.id && open ? (
                  <PassPanel pass={open} settings={settings} origin={origin} />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {loaded && passes.length > 0 && shown.length === 0 ? (
        <p className="text-ink/60" style={{ fontSize: "var(--step-0)" }}>
          Nothing matches that.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- the settings */

function RenderControls({
  settings,
  onChange,
  selectedCount,
}: {
  settings: RenderSettings;
  onChange: (next: RenderSettings) => void;
  selectedCount: number;
}) {
  const set = <K extends keyof RenderSettings>(key: K, value: RenderSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="border-[3px] border-ink bg-paper p-[var(--gap-sm)]">
      <p
        className="font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/60"
        style={{ fontSize: "0.77rem" }}
      >
        RENDER SETTINGS
      </p>
      <p className="mt-1 mb-3 text-ink/60" style={{ fontSize: "0.77rem" }}>
        {selectedCount > 0
          ? `Applied to the ${selectedCount} selected pass${selectedCount === 1 ? "" : "es"}.`
          : "Applied to whichever pass you open. Tick some to apply them to a set."}{" "}
        “As issued” keeps whatever the pass was made with.
      </p>

      <div className="grid gap-[var(--gap-sm)] sm:grid-cols-2">
        <div>
          <FieldLabel>Resolution</FieldLabel>
          <Segmented
            ariaLabel="Resolution"
            value={String(settings.pixelRatio)}
            options={[
              { value: "2", label: "2×", sub: "screens" },
              { value: "3", label: "3×", sub: "print" },
            ]}
            onChange={(next) => set("pixelRatio", next === "2" ? 2 : 3)}
          />
        </div>

        <div>
          <FieldLabel>Code</FieldLabel>
          <Segmented
            ariaLabel="Code type"
            value={settings.codeKind}
            options={[
              { value: "datamatrix", label: "Data Matrix", sub: "dense" },
              { value: "qr", label: "QR", sub: "familiar" },
            ]}
            onChange={(next) => set("codeKind", next as CodeKind)}
          />
        </div>

        <div className="sm:col-span-2">
          <FieldLabel>Colourway</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <ChipButton
              active={settings.accent === "asIssued"}
              onClick={() => set("accent", "asIssued")}
            >
              As issued
            </ChipButton>
            {ACCENTS.map((accent) => (
              <ChipButton
                key={accent.key}
                active={settings.accent === accent.key}
                onClick={() => set("accent", accent.key)}
                swatch={accent.hex}
              >
                {accent.label}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <FieldLabel>Contact block</FieldLabel>
          <div className="flex flex-wrap items-center gap-3">
            <ChipButton
              active={settings.visibility === "asIssued"}
              onClick={() => set("visibility", "asIssued")}
            >
              As issued
            </ChipButton>
            <VisibilityPicker
              label="Contact visibility for every field"
              value={settings.visibility === "asIssued" ? "full" : settings.visibility.dob}
              onChange={(next) =>
                set("visibility", { dob: next, phone: next, email: next })
              }
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 sm:col-span-2">
          <input
            type="checkbox"
            checked={settings.includePhoto}
            onChange={(event) => set("includePhoto", event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF0080]"
          />
          <span style={{ fontSize: "var(--step--1)" }}>
            Use the saved photo. Turn this off for a badge with the frame and no face.
          </span>
        </label>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-1.5 font-[family-name:var(--font-mono)] font-bold tracking-[0.16em] text-ink/60"
      style={{ fontSize: "0.77rem" }}
    >
      {children}
    </p>
  );
}

function ChipButton({
  active,
  onClick,
  children,
  swatch,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`press inline-flex min-h-[40px] items-center gap-2 border-[3px] border-ink px-3 font-[family-name:var(--font-display)] ${
        active ? "bg-ink text-paper" : "bg-paper"
      }`}
      style={{ fontSize: "var(--step--1)" }}
    >
      {swatch ? (
        <span
          aria-hidden="true"
          className="inline-block h-3.5 w-3.5 border-2 border-ink"
          style={{ backgroundColor: swatch }}
        />
      ) : null}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------- shared plumbing */

/** Turns a stored pass plus the chosen settings into something renderable. */
function stateFor(pass: VaultPass, settings: RenderSettings, photo: PhotoAsset | null): BadgeState {
  return {
    format: pass.format as FormatKey,
    input: { ...DEFAULT_INPUT, ...pass.input },
    visibility: settings.visibility === "asIssued" ? pass.visibility : settings.visibility,
    accent: settings.accent === "asIssued" ? pass.accent : settings.accent,
    photo,
    team: [],
    titleOverrideIndex: pass.titleOverrideIndex,
    customTitle: pass.customTitle,
  };
}

/**
 * The gate, in one place so the single and batch paths cannot drift.
 *
 * Recomputes the serial from what was typed. Deliberately not a comparison
 * against the stored record: that would make the record the authority and let
 * anyone who can read the database walk through.
 */
function identityMatches(
  pass: VaultPass,
  answers: { name: string; username: string; email: string; team: string },
): boolean {
  const isTeam = pass.format === "team";
  return (
    makeSerial({
      ...DEFAULT_INPUT,
      name: isTeam ? pass.input.name : answers.name,
      username: answers.username,
      email: isTeam ? pass.input.email : answers.email,
      team: answers.team,
    }) === pass.serial
  );
}

/**
 * Rebuilds a stored photo into a usable one, and owns its object URL.
 *
 * Derived during render rather than set from an effect. `setState` inside an
 * effect is an error in this lint config, and it has caught a real bug three
 * times on this project: the state lags a render behind, so the artboard draws
 * once without the photo before drawing again with it, and html-to-image can
 * capture the first of those.
 *
 * The effect that remains does nothing but revoke. Five hundred unowned object
 * URLs is how a vault page leaks a session's memory.
 */
function useRestoredPhoto(pass: VaultPass, enabled: boolean): PhotoAsset | null {
  const photo = useMemo(
    () => (enabled && pass.photo ? fromVaultPhoto(pass.photo) : null),
    [pass.photo, enabled],
  );

  useEffect(() => () => releasePhoto(photo), [photo]);

  return photo;
}

/* ------------------------------------------------------------------ one pass */

function PassPanel({
  pass,
  settings,
  origin,
}: {
  pass: VaultPass;
  settings: RenderSettings;
  origin: string;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [answers, setAnswers] = useState({ name: "", username: "", email: "", team: "" });
  const [attempted, setAttempted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const isTeam = pass.format === "team";
  const photo = useRestoredPhoto(pass, unlocked && settings.includePhoto);

  const state = useMemo(() => stateFor(pass, settings, photo), [pass, settings, photo]);
  const fullDetails =
    settings.fullDetailsInCode === "asIssued" ? pass.fullDetailsInCode : settings.fullDetailsInCode;
  const badge = useMemo(
    () => buildBadge(state, { fullDetailsInCode: fullDetails, origin }),
    [state, fullDetails, origin],
  );

  const edit = (patch: Partial<typeof answers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
    setAttempted(false);
    setUnlocked(false);
  };

  const required = isTeam
    ? [answers.team, answers.username]
    : [answers.name, answers.username, answers.email, answers.team];
  const complete = required.every((value) => value.trim().length > 0);

  const download = async () => {
    const node = nodeRef.current;
    if (!node) return;
    const job = notifyProgress(`Rendering at ${settings.pixelRatio}×`, pass.id);
    try {
      const size = CANVAS[state.format];
      const blob = await renderBlob(node, {
        width: size.w,
        height: size.h,
        pixelRatio: settings.pixelRatio,
      });
      downloadBlob(blob, fileNameFor(state.format, pass.id));
      job.succeed("Saved to your downloads", pass.id);
    } catch {
      job.fail("The render failed", "Try again in a moment.");
    }
  };

  const size = CANVAS[state.format];

  return (
    <div className="border-t-[3px] border-ink bg-paper/60 p-[var(--gap-sm)]">
      {!unlocked ? (
        <>
          <p
            className="font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/60"
            style={{ fontSize: "0.77rem" }}
          >
            CONFIRM THIS IS YOURS
          </p>
          <p className="mt-1 mb-3 max-w-[68ch] leading-snug text-ink/65" style={{ fontSize: "0.77rem" }}>
            {isTeam
              ? "The team name and the lead's handle are what this serial was built from."
              : "The name, handle, email and team this pass was issued with. They are checked by recomputing the serial, not by reading the saved record."}
          </p>

          <div className="grid gap-[var(--gap-sm)] sm:grid-cols-2">
            {!isTeam ? (
              <TextField
                label="Full name"
                value={answers.name}
                onChange={(event) => edit({ name: event.target.value })}
              />
            ) : null}
            <TextField
              label={isTeam ? "Lead's X handle" : "X handle"}
              value={answers.username}
              placeholder="@handle"
              onChange={(event) => edit({ username: event.target.value })}
            />
            <TextField
              label="Team"
              value={answers.team}
              onChange={(event) => edit({ team: event.target.value })}
            />
            {!isTeam ? (
              <div className="sm:col-span-2">
                <EmailField value={answers.email} onChange={(next) => edit({ email: next })} />
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              onClick={() => {
                const ok = identityMatches(pass, answers);
                setAttempted(true);
                setUnlocked(ok);
                if (ok) notifySuccess("Unlocked", pass.id);
                else notifyError("Those details do not produce this serial", pass.id);
              }}
              disabled={!complete}
            >
              Unlock
            </Button>
            {attempted && !unlocked ? (
              <span className="text-flag" style={{ fontSize: "var(--step--1)" }}>
                Those details do not produce {pass.id}.
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <div className="rise-in grid gap-[var(--gap-sm)]">
          <p
            className="border-[3px] border-ink bg-palm px-3 py-1.5 text-paper"
            style={{ fontSize: "var(--step--1)" }}
          >
            Unlocked. {EVENT.shortName} {EVENT.edition} {FORMAT_LABEL[state.format]}.
          </p>

          <Stage width={size.w} height={size.h} nodeRef={nodeRef}>
            {state.format === "card" ? (
              <IdCard badge={badge} photo={photo} codeKind={settings.codeKind} />
            ) : state.format === "pfp" ? (
              <PfpFrame badge={badge} photo={photo} />
            ) : (
              <TeamFrame badge={badge} photo={photo} members={[]} codeKind={settings.codeKind} />
            )}
          </Stage>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void download()}>
              Download at {settings.pixelRatio}×
            </Button>

          </div>

          {!pass.photo ? (
            <p className="text-ink/60" style={{ fontSize: "var(--step--1)" }}>
              This pass was saved without a photo, so it renders with an empty slot.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- many passes */

/**
 * Re-issuing a selection.
 *
 * The gate applies per pass, not once for the batch, because the whole point
 * of it is that holding a list does not entitle you to the badges on it. Each
 * one is checked against details typed for that person; the run reports what
 * it could not unlock rather than quietly producing fewer files than expected.
 */
function BatchUnlock({
  passes,
  settings,
  origin,
}: {
  passes: VaultPass[];
  settings: RenderSettings;
  origin: string;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<{ pass: VaultPass; photo: PhotoAsset | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<{ ok: number; refused: string[] } | null>(null);

  const mount = useCallback(async (pass: VaultPass, photo: PhotoAsset | null) => {
    setCurrent({ pass, photo });
    // Two yields: one for React to commit, one for the code element to encode.
    await yieldToBrowser();
    await yieldToBrowser();
    return nodeRef.current;
  }, []);

  const run = async () => {
    const answers = {
      name: (document.getElementById("batch-name") as HTMLInputElement | null)?.value ?? "",
      username: (document.getElementById("batch-handle") as HTMLInputElement | null)?.value ?? "",
      email: (document.getElementById("batch-email") as HTMLInputElement | null)?.value ?? "",
      team: (document.getElementById("batch-team") as HTMLInputElement | null)?.value ?? "",
    };

    setRunning(true);
    setReport(null);
    setProgress({ done: 0, total: passes.length });
    const job = notifyProgress(
      `Re-issuing ${passes.length} pass${passes.length === 1 ? "" : "es"}`,
      `at ${settings.pixelRatio}×`,
    );

    let ok = 0;
    const refused: string[] = [];

    for (let index = 0; index < passes.length; index++) {
      const pass = passes[index];
      setProgress({ done: index, total: passes.length });
      job.update({ detail: `${index} of ${passes.length}`, progress: index / passes.length });

      if (!identityMatches(pass, answers)) {
        refused.push(pass.id);
        continue;
      }

      const photo = settings.includePhoto ? fromVaultPhoto(pass.photo) : null;
      try {
        const node = await mount(pass, photo);
        if (!node) continue;
        const size = CANVAS[pass.format as FormatKey];
        const blob = await renderBlob(node, {
          width: size.w,
          height: size.h,
          pixelRatio: settings.pixelRatio,
        });
        downloadBlob(blob, fileNameFor(pass.format, pass.id));
        ok += 1;
      } catch {
        refused.push(pass.id);
      } finally {
        releasePhoto(photo);
      }
    }

    setCurrent(null);
    setProgress({ done: passes.length, total: passes.length });
    setRunning(false);
    setReport({ ok, refused });

    if (ok === 0) {
      job.fail("Nothing was re-issued", "None of the selected passes matched those details.");
    } else if (refused.length > 0) {
      job.done();
      notifyWarning(
        `${ok} re-issued, ${refused.length} refused`,
        "The refused ones do not belong to the details given.",
      );
    } else {
      job.succeed(`${ok} pass${ok === 1 ? "" : "es"} re-issued`, `at ${settings.pixelRatio}×`);
    }
  };

  const badge = current
    ? buildBadge(stateFor(current.pass, settings, current.photo), {
        fullDetailsInCode:
          settings.fullDetailsInCode === "asIssued"
            ? current.pass.fullDetailsInCode
            : settings.fullDetailsInCode,
        origin,
      })
    : null;
  const size = current ? CANVAS[current.pass.format as FormatKey] : CANVAS.card;

  return (
    <div className="border-[3px] border-ink bg-sun/25 p-[var(--gap-sm)]">
      <p
        className="font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70"
        style={{ fontSize: "0.77rem" }}
      >
        RE-ISSUE {passes.length} SELECTED
      </p>
      <p className="mt-1 mb-3 max-w-[70ch] leading-snug text-ink/70" style={{ fontSize: "0.77rem" }}>
        Every pass is checked individually against the details below, so this only produces the ones
        that genuinely belong to whoever fills this in. Anything that does not match is listed
        rather than skipped quietly.
      </p>

      <div className="grid gap-[var(--gap-sm)] sm:grid-cols-2">
        <label className="block min-w-0">
          <FieldLabel>Full name</FieldLabel>
          <input id="batch-name" className="w-full border-[3px] border-ink bg-paper px-3 py-2" />
        </label>
        <label className="block min-w-0">
          <FieldLabel>X handle</FieldLabel>
          <input id="batch-handle" className="w-full border-[3px] border-ink bg-paper px-3 py-2" />
        </label>
        <label className="block min-w-0">
          <FieldLabel>Team</FieldLabel>
          <input id="batch-team" className="w-full border-[3px] border-ink bg-paper px-3 py-2" />
        </label>
        <label className="block min-w-0">
          <FieldLabel>Email</FieldLabel>
          <input id="batch-email" className="w-full border-[3px] border-ink bg-paper px-3 py-2" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => void run()} disabled={running}>
          {running
            ? `Rendering ${progress.done} of ${progress.total}…`
            : `Unlock and download ${passes.length} at ${settings.pixelRatio}×`}
        </Button>
        {report ? (
          <span style={{ fontSize: "var(--step--1)" }}>
            {report.ok} downloaded
            {report.refused.length > 0 ? (
              <span className="text-flag">
                {" "}
                · {report.refused.length} refused: {report.refused.slice(0, 3).join(", ")}
                {report.refused.length > 3 ? "…" : ""}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {/* The render surface. Off-screen, never display:none, because a hidden
          subtree has no layout and would rasterise to nothing. */}
      {current && badge ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -100000,
            top: 0,
            width: size.w,
            height: size.h,
            pointerEvents: "none",
          }}
        >
          <div ref={nodeRef} style={{ width: size.w, height: size.h }}>
            {current.pass.format === "card" ? (
              <IdCard badge={badge} photo={current.photo} codeKind={settings.codeKind} />
            ) : current.pass.format === "pfp" ? (
              <PfpFrame badge={badge} photo={current.photo} />
            ) : (
              <TeamFrame
                badge={badge}
                photo={current.photo}
                members={[]}
                codeKind={settings.codeKind}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
