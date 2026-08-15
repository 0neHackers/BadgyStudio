"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ACCENTS, CANVAS, EVENT, type AccentKey, type FormatKey } from "@/lib/brand";
import { buildBadge } from "@/lib/badge";
import { makeSerial } from "@/lib/identifier";
import { downloadBlob, downloadText, fileNameFor, renderBlob } from "@/lib/export";
import { yieldToBrowser } from "@/lib/schedule";
import { releasePhoto } from "@/lib/image";
import { DEFAULT_INPUT, type BadgeState, type FieldVisibility, type PhotoAsset } from "@/types";
import { CODE_OPTIONS, type CodeKind } from "@/lib/codes";
import {
  clearVault,
  deletePass,
  deletePasses,
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
import {
  EMPTY_ANSWER,
  answerMatches,
  blankTemplate,
  isComplete,
  parseUnlockCsv,
  prefilledTemplate,
} from "@/lib/unlock";
import {
  EMPTY_DRAFT,
  clearUnlock,
  restoreUnlock,
  setAnswer,
  setAnswers,
  subscribeUnlock,
  unlockSnapshot,
} from "@/lib/unlock-store";
import {
  DEFAULT_VAULT_PAGE_SIZE,
  VaultPager,
  pageCountFor,
  perPageFor,
  type VaultPageSize,
} from "@/components/Pager";
import { notifyError, notifyInfo, notifyProgress, notifySuccess, notifyWarning } from "@/lib/toast";
import { ask } from "@/lib/confirm";

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
  const [pageSize, setPageSize] = useState<VaultPageSize>(DEFAULT_VAULT_PAGE_SIZE);
  const [page, setPage] = useState(0);

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

  /**
   * The selection is everything ticked across the whole filtered set, not just
   * this page. Paging is a way of looking at the list; it should not silently
   * narrow what a batch re-issue covers, because somebody who ticked forty
   * people over four pages meant forty.
   */
  const selected = useMemo(
    () => shown.filter((pass) => checked.has(pass.id)),
    [shown, checked],
  );

  /**
   * Clamped during render rather than corrected in an effect.
   *
   * Deleting the last pass on the last page, or filtering the list down, can
   * leave the index past the end. Fixing that with setState inside an effect is
   * the cascading-render pattern React warns about, and it is the same lint
   * error the roster pager hit in V04.02.
   */
  const pages = pageCountFor(pageSize, shown.length);
  const currentPage = Math.min(page, pages - 1);
  const perPage = perPageFor(pageSize, shown.length);
  const visible = useMemo(
    () => shown.slice(currentPage * perPage, currentPage * perPage + perPage),
    [shown, currentPage, perPage],
  );

  const open = passes.find((pass) => pass.id === openId) ?? null;

  /**
   * Select-all is scoped to the page, and the label says which. Ticking a box
   * marked "select all" and silently taking a thousand passes with it is not a
   * choice anybody made. The count of everything ticked sits beside it, so what
   * a batch would cover is never hidden.
   */
  const allVisibleChecked =
    visible.length > 0 && visible.every((pass) => checked.has(pass.id));

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
      if (allVisibleChecked) visible.forEach((pass) => next.delete(pass.id));
      else visible.forEach((pass) => next.add(pass.id));
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
              onClick={async () => {
                const count = passes.length;
                if (
                  await ask({
                    title: `Delete all ${count} saved passes?`,
                    body: "Every record in this browser goes, photos included. There is no server copy and no undo.",
                    confirmLabel: `Delete all ${count}`,
                    tone: "danger",
                  })
                ) {
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
          {/* Beside Clear everything, and only when there is a selection to
              delete. A destructive button that is always live next to another
              destructive button is how the wrong one gets pressed. */}
          {checked.size > 0 ? (
            <Button
              variant="danger"
              onClick={async () => {
                const ids = [...checked];
                if (
                  !(await ask({
                    title: `Delete ${ids.length} selected pass${ids.length === 1 ? "" : "es"}?`,
                    body: "They go from this browser, photos included. There is no server copy and no undo.",
                    confirmLabel: `Delete ${ids.length}`,
                    tone: "danger",
                  }))
                ) {
                  return;
                }
                void deletePasses(ids).then((removed) => {
                  setChecked(new Set());
                  if (openId && ids.includes(openId)) setOpenId(null);
                  notifySuccess(
                    `${removed} pass${removed === 1 ? "" : "es"} deleted`,
                    "Removed from this browser.",
                  );
                });
              }}
            >
              Delete {checked.size} selected
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
              onChange={(event) => {
                setFilter(event.target.value);
                // A filter changes what the pages contain, so staying on page 4
                // would show a different four passes, or none. Back to the
                // first page, where the best matches are.
                setPage(0);
              }}
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
                checked={allVisibleChecked}
                onChange={toggleAll}
                className="h-5 w-5 accent-[#FF0080]"
                aria-label={`Select the ${visible.length} passes on this page`}
              />
              Select all {visible.length}
              {pages > 1 ? " on this page" : shown.length === passes.length ? "" : " shown"}
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
            <BatchUnlock
              passes={selected}
              allPasses={passes}
              settings={settings}
              origin={origin}
              onImported={(serials) =>
                setChecked((current) => new Set([...current, ...serials]))
              }
            />
          ) : null}

          {/* Above and below, because a list you have scrolled to the end of
              should not make you scroll back up to turn the page, and a list
              you have just arrived at should not make you scroll down to
              choose how much of it to see. */}
          <VaultPager
            idPrefix="vault-top"
            total={shown.length}
            pageSize={pageSize}
            page={currentPage}
            onPageSize={setPageSize}
            onPage={setPage}
          />

          <ul className="grid gap-2" id="vault-list">
            {visible.map((pass) => (
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
                      onClick={async () => {
                        if (
                          await ask({
                            title: `Delete ${pass.id}?`,
                            body: `${pass.input.name || "This pass"} goes from this browser, photo included. There is no undo.`,
                            confirmLabel: "Delete it",
                            tone: "danger",
                          })
                        ) {
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

          <VaultPager
            idPrefix="vault-bottom"
            total={shown.length}
            pageSize={pageSize}
            page={currentPage}
            onPageSize={setPageSize}
            onPage={setPage}
            scrollTargetId="vault-list"
          />
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
            options={CODE_OPTIONS}
            onChange={(next) => set("codeKind", next)}
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
              <PfpFrame badge={badge} photo={photo} codeKind={settings.codeKind} />
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
  allPasses,
  settings,
  origin,
  onImported,
}: {
  passes: VaultPass[];
  /** Everything in the vault, so an import can match a pass that is not ticked. */
  allPasses: VaultPass[];
  settings: RenderSettings;
  origin: string;
  /** An import is allowed to widen the selection: forty filled rows meant forty. */
  onImported: (serials: string[]) => void;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<{ pass: VaultPass; photo: PhotoAsset | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<{ ok: number; refused: string[] } | null>(null);

  // The sheet lives outside this component, so navigating away and back does
  // not throw away forty rows of typing. See lib/unlock-store.ts.
  const draft = useSyncExternalStore(subscribeUnlock, unlockSnapshot, () => EMPTY_DRAFT);
  useEffect(() => {
    restoreUnlock();
  }, []);

  /**
   * Reads a filled-in template.
   *
   * Rows are keyed on the pass number, so the file may cover more passes than
   * are ticked, fewer, or the same ones in another order. Anything it
   * recognises is written into the sheet; anything it does not is reported by
   * number rather than dropped.
   */
  const importCsv = async (file: File | null) => {
    if (!file) return;
    const job = notifyProgress("Reading the CSV", file.name);
    try {
      const parsed = parseUnlockCsv(await file.text(), allPasses);
      if (parsed.matched.length === 0) {
        job.fail(
          "Nothing in that file matched",
          parsed.unknown.length > 0
            ? `${parsed.unknown.length} pass numbers are not in this browser.`
            : "No pass number column was found.",
        );
        return;
      }

      setAnswers(parsed.matched);
      onImported(parsed.matched.map((row) => row.serial));

      const notes = [
        parsed.unknown.length > 0 ? `${parsed.unknown.length} unknown` : "",
        parsed.malformed > 0 ? `${parsed.malformed} without a pass number` : "",
      ].filter(Boolean);

      job.succeed(
        `${parsed.matched.length} row${parsed.matched.length === 1 ? "" : "s"} imported`,
        notes.length > 0 ? `Ignored: ${notes.join(", ")}.` : "Selected and ready to check.",
      );
    } catch {
      job.fail("That file could not be read", "It has to be a CSV.");
    }
  };

  const mount = useCallback(async (pass: VaultPass, photo: PhotoAsset | null) => {
    setCurrent({ pass, photo });
    // Two yields: one for React to commit, one for the code element to encode.
    await yieldToBrowser();
    await yieldToBrowser();
    return nodeRef.current;
  }, []);

  const run = async () => {
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

      // One answer per pass, not one answer for the batch. Each is still
      // verified on its own, so the guarantee per pass is what it always was.
      const answer = draft.answers[pass.id] ?? EMPTY_ANSWER;
      if (!isComplete(pass, answer) || !answerMatches(pass, answer)) {
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
      <p className="mt-1 mb-3 max-w-[76ch] leading-snug text-ink/70" style={{ fontSize: "0.77rem" }}>
        <strong>One answer per pass.</strong> Every pass is checked on its own, against its own
        row, so this produces only the ones whose details genuinely reproduce their pass number.
        Anything that does not match is named rather than skipped quietly. Fill the table in, or
        download a template and upload it back.
      </p>

      {/* CSV in and out. The generated template carries the pass number and the
          holder's name; the blank one carries neither. Both are offered because
          they answer different questions, and the difference is stated rather
          than left to be worked out. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 border-[2px] border-ink/25 bg-paper/60 px-2.5 py-2">
        <span
          className="font-[family-name:var(--font-mono)] font-bold tracking-[0.14em] text-ink/55"
          style={{ fontSize: "0.72rem" }}
        >
          CSV
        </span>
        <Button
          onClick={() => {
            downloadText(prefilledTemplate(passes), "badgy-unlock-selected.csv");
            notifyInfo(
              `Template for ${passes.length} pass${passes.length === 1 ? "" : "es"}`,
              "Pass number and name filled in. Add handle, team and email.",
            );
          }}
          className="!min-h-[34px] !py-1"
        >
          Template for these {passes.length}
        </Button>
        <Button
          onClick={() => {
            downloadText(blankTemplate(), "badgy-unlock-blank.csv");
            notifyInfo("Blank template", "Columns only. You supply the pass numbers.");
          }}
          variant="ghost"
          className="!min-h-[34px] !py-1"
        >
          Blank template
        </Button>
        <label className="press inline-flex cursor-pointer items-center border-[3px] border-ink bg-paper px-2.5 py-1" style={{ fontSize: "var(--step--1)", minHeight: 34 }}>
          Upload filled CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => void importCsv(event.target.files?.[0] ?? null)}
          />
        </label>
        {Object.keys(draft.answers).length > 0 ? (
          <Button
            variant="ghost"
            className="!min-h-[34px] !py-1"
            onClick={async () => {
              if (
                await ask({
                  title: "Clear the unlock sheet?",
                  body: "Every answer typed or imported here goes. The passes themselves are untouched.",
                  confirmLabel: "Clear the sheet",
                  tone: "danger",
                })
              ) {
                clearUnlock();
                notifyInfo("Sheet cleared");
              }
            }}
          >
            Clear the sheet
          </Button>
        ) : null}
      </div>

      <p className="mb-2 max-w-[76ch] leading-snug text-ink/55" style={{ fontSize: "0.72rem" }}>
        The generated template already contains the pass number and the name, so filling it in
        proves three of the four fields a pass number is built from rather than all four. The blank
        template and the single-pass check still ask for all four. The five columns are the pass
        number and the four fields it is built from; nothing else is asked for, because nothing
        else would change what comes out.
      </p>

      {/* One row per selected pass. A team pass needs only the team and the
          lead's handle, so the fields it does not use are disabled rather than
          hidden: a gap in a table reads as a bug. */}
      <div className="max-h-[42vh] overflow-auto border-[2px] border-ink/25 bg-paper/60">
        <table className="w-full border-collapse" style={{ fontSize: "0.72rem" }}>
          <thead className="sticky top-0 bg-paper">
            <tr className="text-left">
              {["Pass", "Name", "@handle", "Team", "Email", ""].map((head) => (
                <th
                  key={head}
                  className="border-b-[2px] border-ink/25 px-1.5 py-1 font-[family-name:var(--font-mono)] font-bold tracking-[0.1em] text-ink/55"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {passes.map((pass) => {
              const answer = draft.answers[pass.id] ?? EMPTY_ANSWER;
              const team = pass.format === "team";
              const ready = isComplete(pass, answer);
              return (
                <tr key={pass.id} className="border-b-[1px] border-ink/10">
                  <td className="whitespace-nowrap px-1.5 py-1 font-[family-name:var(--font-mono)] font-bold">
                    {pass.id}
                  </td>
                  {(["name", "handle", "team", "email"] as const).map((field) => {
                    const unused = team && (field === "name" || field === "email");
                    return (
                      <td key={field} className="px-1 py-1">
                        <input
                          value={answer[field]}
                          disabled={unused}
                          aria-label={`${field} for ${pass.id}`}
                          placeholder={unused ? "not used" : ""}
                          onChange={(event) => setAnswer(pass.id, { [field]: event.target.value })}
                          className="w-full min-w-[7rem] border-[2px] border-ink/40 bg-paper px-1.5 py-1 disabled:opacity-40"
                          style={{ fontSize: "0.72rem" }}
                        />
                      </td>
                    );
                  })}
                  <td className="px-1.5 py-1 text-center">
                    <span
                      title={ready ? "Ready to check" : "Incomplete"}
                      className={ready ? "text-palm" : "text-ink/30"}
                      aria-label={ready ? "Ready to check" : "Incomplete"}
                    >
                      {ready ? "●" : "○"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
              <PfpFrame badge={badge} photo={current.photo} codeKind={settings.codeKind} />
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
