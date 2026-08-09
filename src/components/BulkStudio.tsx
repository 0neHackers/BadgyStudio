"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ACCENTS, CANVAS, type AccentKey, type FormatKey } from "@/lib/brand";
import { ACCEPTED_TYPES, loadPhoto, releasePhoto } from "@/lib/image";
import { downloadBlob } from "@/lib/export";
import {
  IDLE,
  acknowledge,
  cancel as cancelBatch,
  getPhase,
  isRunning,
  start as startBatch,
  subscribe as subscribeBatch,
} from "@/lib/batch-store";
import { useBrandAssets } from "@/lib/brand-assets";
import { pickFolder } from "@/lib/sink";
import { yieldToBrowser } from "@/lib/schedule";
import { notifyError, notifyInfo, notifyProgress, notifySuccess, notifyWarning } from "@/lib/toast";
import {
  EMPTY_ROSTER,
  clearRoster,
  patchRoster,
  restoreRoster,
  rosterSnapshot,
  setChecked as setCheckedRows,
  setRows as setRosterRows,
  subscribeRoster,
} from "@/lib/roster-store";
import {
  MAX_ROWS,
  autoMapColumns,
  emptyRow,
  isBlocked,
  matchPhotos,
  rowsFromRecords,
  rowSerial,
  templateCsv,
  validateRow,
  type RosterRow,
  type RosterSettings,
} from "@/lib/roster";
import type { BuilderInput, PhotoAsset, Visibility } from "@/types";
import type { CodeKind } from "@/lib/codes";
import { TIERS } from "@/lib/tiers";

import { BatchArtboard } from "@/components/BatchArtboard";
import { RosterTable } from "@/components/RosterTable";
import { RosterDetail } from "@/components/RosterDetail";
import { RosterBulkApply } from "@/components/RosterBulkApply";
import { RosterGoTo, RosterPager, type PageSize } from "@/components/RosterPager";
import { Stage } from "@/components/Stage";
import { Button, Panel, Segmented, VisibilityPicker } from "@/components/ui/controls";

/**
 * Bulk issuance.
 *
 * The single-badge studio is for one person making their own card. This is for
 * whoever has to produce two hundred and forty seven of them: import a roster,
 * fix what is wrong, render the lot, get a zip.
 *
 * Same guarantee as the rest of the app: no photo and no personal detail leaves
 * the browser. The CSV is parsed locally, the badges are drawn locally, and the
 * zip is assembled locally.
 */

/**
 * The shipped roster. Five hundred people, which is the row cap, so loading it
 * exercises the run at its worst case rather than at a comfortable size.
 */
const SAMPLE_ROSTER = "/sample-roster-500.csv";

/** Which entries inside a photo zip are worth trying to decode. */
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i;

const FORMAT_OPTIONS: { value: FormatKey; label: string; sub: string }[] = [
  { value: "card", label: "ID cards", sub: "1080×1350" },
  { value: "pfp", label: "PFP frames", sub: "1024×1024" },
];

/**
 * Fields that genuinely describe a whole intake rather than one person.
 *
 * Date of birth, phone and email are deliberately absent. They are per-person
 * values, and the masking switches that used to sit here were a privacy rule
 * rather than a batch attribute, so they moved to their own control.
 */
const BATCH_FIELDS = [
  { key: "team", label: "Team", placeholder: "Night Shift" },
  { key: "tier", label: "Pass tier", placeholder: "" },
  { key: "project", label: "Building", placeholder: "What the team is shipping" },
  { key: "role", label: "Stack / role", placeholder: "Rust, infra" },
] as const satisfies readonly { key: keyof BuilderInput; label: string; placeholder: string }[];

type BatchField = (typeof BATCH_FIELDS)[number]["key"];

export function BulkStudio({ origin }: { origin: string }) {
  useBrandAssets();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  // The run is a document-level singleton, not component state, so that
  // navigating away from this page does not cancel it. See lib/batch-store.ts.
  const phase = useSyncExternalStore(subscribeBatch, getPhase, () => IDLE);

  /**
   * The roster lives in lib/roster-store.ts, not here.
   *
   * Everything on this page used to be component state, and Next unmounts a
   * route component on navigation, so going to the single generator and coming
   * back discarded the whole roster and every correction in it. Now the page
   * is a view over a store that outlives it, and only the Clear button empties
   * it. See lib/roster-store.ts.
   */
  const roster = useSyncExternalStore(subscribeRoster, rosterSnapshot, () => EMPTY_ROSTER);
  const { rows, format, settings, focusId, page, batchDefaults, notice } = roster;
  const pageSize = roster.pageSize as PageSize;
  const checked = useMemo(() => new Set(roster.checked), [roster.checked]);
  const [codeKind, setCodeKind] = useState<CodeKind>("datamatrix");

  // Reads the roster back after a reload. Photos do not survive, so the rows
  // come back with their filenames and no image; re-attaching re-matches them.
  useEffect(() => {
    void restoreRoster();
  }, []);

  const setRows = setRosterRows;
  const setFormat = (next: FormatKey) => patchRoster({ format: next });
  const setNotice = (next: string) => patchRoster({ notice: next });
  const setFocusId = (next: string | null) => patchRoster({ focusId: next });
  const setPage = (next: number) => patchRoster({ page: next });
  const setPageSize = (next: PageSize) => patchRoster({ pageSize: next });
  const setSettings = (next: RosterSettings | ((current: RosterSettings) => RosterSettings)) =>
    patchRoster({ settings: typeof next === "function" ? next(settings) : next });
  const setBatchDefaults = (
    next:
      | Record<BatchField, string>
      | ((current: Record<BatchField, string>) => Record<BatchField, string>),
  ) => patchRoster({ batchDefaults: typeof next === "function" ? next(batchDefaults) : next });
  const setChecked = (next: Set<string> | ((current: Set<string>) => Set<string>)) =>
    setCheckedRows((current) => [
      ...(typeof next === "function" ? next(new Set(current)) : next),
    ]);

  const ready = useMemo(() => rows.filter((row) => !isBlocked(row)), [rows]);
  const blockedCount = rows.length - ready.length;

  /**
   * What the Render button will actually issue.
   *
   * Ticking rows now narrows the run rather than only narrowing the bulk-edit
   * tools. An organiser who has just corrected six people should be able to
   * reissue those six without producing the other four hundred and ninety
   * four again, and before V05.07 there was no way to say so.
   */
  const queued = useMemo(
    () => (checked.size > 0 ? ready.filter((row) => checked.has(row.id)) : ready),
    [ready, checked],
  );
  const running = phase.kind === "running" || isRunning();

  const focusIndex = rows.findIndex((row) => row.id === focusId);
  const focusRow = focusIndex >= 0 ? rows[focusIndex] : null;

  const perPage = pageSize === "all" ? Math.max(1, rows.length) : pageSize;
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  // Clamped here rather than corrected in an effect. Removing rows can leave
  // `page` past the end, and fixing that with setState inside an effect causes
  // the cascading render React warns about. Deriving it costs nothing.
  const safePage = Math.min(page, pageCount - 1);
  const offset = safePage * perPage;
  const visible = rows.slice(offset, offset + perPage);

  /** Keeps the focused person on screen when stepping across a page boundary. */
  const focusAt = (index: number) => {
    if (index < 0 || index >= rows.length) return;
    setFocusId(rows[index].id);
    if (pageSize !== "all") setPage(Math.floor(index / perPage));
  };

  /** Row number or serial. Returns a result so the form can report failure. */
  const goTo = (query: string) => {
    const q = query.trim().toUpperCase();
    if (!q) return { ok: false, message: "Enter a row number or a serial." };

    if (/^\d+$/.test(q)) {
      const index = Number(q) - 1;
      if (index < 0 || index >= rows.length) {
        notifyWarning("No such row", `The roster has ${rows.length} rows.`);
        return { ok: false, message: "Out of range" };
      }
      focusAt(index);
      setNotice("");
      return { ok: true, message: "" };
    }

    const index = rows.findIndex((row) => rowSerial(row) === q);
    if (index === -1) {
      notifyWarning("No match", `Nothing in the roster carries ${q}.`);
      return { ok: false, message: "No match" };
    }
    focusAt(index);
    setNotice("");
    return { ok: true, message: "" };
  };

  /** Rewrites one row and revalidates it. */
  const patchRow = (id: string, mutate: (row: RosterRow) => RosterRow) =>
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next = mutate(row);
        return { ...next, issues: validateRow(next) };
      }),
    );

  /** Rewrites every checked row. Used by the apply-to-selected panel. */
  const patchChecked = (mutate: (row: RosterRow) => RosterRow) =>
    setRows((current) =>
      current.map((row) => {
        if (!checked.has(row.id)) return row;
        const next = mutate(row);
        return { ...next, issues: validateRow(next) };
      }),
    );

  /** Writes a batch default onto rows that left the field empty. */
  const applyBatchDefault = (field: BatchField) => {
    const value = batchDefaults[field].trim();
    if (!value) return;
    let touched = 0;
    setRows((current) =>
      current.map((row) => {
        if (row.input[field].trim()) return row;
        touched++;
        const next = { ...row, input: { ...row.input, [field]: value } };
        return { ...next, issues: validateRow(next) };
      }),
    );
    if (touched === 0) {
      notifyInfo("Nothing to fill", `Every row already has a ${field}.`);
    } else {
      notifySuccess(
        `${field} filled on ${touched} row${touched === 1 ? "" : "s"}`,
        "Only the rows that had it blank were touched.",
      );
    }
  };

  /** Same, but replaces existing values too. Separate button, on purpose. */
  const overwriteBatchDefault = (field: BatchField) => {
    const value = batchDefaults[field].trim();
    if (!value) return;
    setRows((current) =>
      current.map((row) => {
        const next = { ...row, input: { ...row.input, [field]: value } };
        return { ...next, issues: validateRow(next) };
      }),
    );
    notifySuccess(
      `${field} overwritten on all ${rows.length} rows`,
      `Every row now reads "${value}", including the ones that had something else.`,
    );
  };

  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ------------------------------------------------------------ importing */

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    await importCsvText(await file.text());
  };

  /** Loads the shipped roster so the bulk flow can be tried without a file. */
  const importSample = async () => {
    const loading = notifyProgress("Loading the sample roster", "500 people");
    try {
      const response = await fetch(SAMPLE_ROSTER);
      if (!response.ok) throw new Error("missing");
      await importCsvText(await response.text());
      loading.done();
    } catch {
      loading.fail("The sample roster could not be loaded");
    }
  };

  const importCsvText = async (text: string) => {
    setNotice("");
    try {
      const Papa = (await import("papaparse")).default;
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => h.trim(),
      });

      const headers = parsed.meta.fields ?? [];
      const map = autoMapColumns(headers);

      if (!map.name) {
        notifyError(
          "No name column in that CSV",
          `Headers seen: ${headers.slice(0, 6).join(", ") || "none"}. The template shows what is expected.`,
        );
        return;
      }

      const next = rowsFromRecords(parsed.data, map);
      setRows(next);

      const mapped = Object.entries(map)
        .map(([field, column]) => `${column} → ${field}`)
        .join(", ");
      notifySuccess(
        `${next.length} row${next.length === 1 ? "" : "s"} imported`,
        `Matched ${Object.keys(map).length} columns.` +
          (parsed.data.length > MAX_ROWS ? ` Capped at ${MAX_ROWS}.` : ""),
      );
      // The full mapping stays on the page: it is a list worth re-reading, and
      // a toast that disappears is the wrong place for one.
      setNotice(`Matched columns: ${mapped}.`);
    } catch {
      notifyError("That file could not be parsed as CSV");
    }
  };

  /**
   * Photos, from loose files or from a zip.
   *
   * Selecting five hundred files in a picker is miserable and some browsers
   * cap the selection, so a zip of the folder is the practical way to hand
   * over a whole intake. Entries are matched on their file name exactly as
   * loose files are, so any folder structure inside the archive is ignored and
   * the same `photo` column works for both.
   */
  const importPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const reading = notifyProgress("Reading photos");

    const loaded = new Map<string, PhotoAsset>();
    let skipped = 0;

    const take = async (name: string, blob: Blob) => {
      try {
        loaded.set(name, await loadPhoto(new File([blob], name, { type: blob.type })));
      } catch {
        // A single unreadable file should not abandon the rest of the folder.
        skipped += 1;
      }
    };

    for (const file of Array.from(files)) {
      const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip";
      if (!isZip) {
        await take(file.name, file);
        continue;
      }

      try {
        const { readZip } = await import("@/lib/unzip");
        const entries = await readZip(file);
        const images = entries.filter((entry) => IMAGE_NAME.test(entry.fileName));
        if (images.length === 0) {
          reading.fail("No usable images", `${file.name} has nothing in a supported format.`);
          return;
        }
        reading.update({ title: `Reading ${images.length} photos`, detail: file.name });
        for (const entry of images) {
          // Yield between entries so a large archive does not lock the tab.
          await yieldToBrowser();
          await take(entry.fileName, await entry.read());
        }
      } catch (cause) {
        reading.fail(
          "That zip could not be read",
          cause instanceof Error ? cause.message : undefined,
        );
        return;
      }
    }

    setRows((current) => {
      const { rows: next, matched, unmatched } = matchPhotos(current, loaded);
      const trouble = unmatched.length + skipped;
      if (matched === 0) {
        reading.fail("No photos matched", "Filenames have to match the photo column.");
      } else if (trouble > 0) {
        reading.done();
        notifyWarning(
          `${matched} photo${matched === 1 ? "" : "s"} matched`,
          `${unmatched.length} matched no row${skipped ? `, ${skipped} could not be decoded` : ""}.`,
        );
      } else {
        reading.succeed(`${matched} photo${matched === 1 ? "" : "s"} matched by filename`);
      }
      if (unmatched.length) {
        setNotice(
          `Did not match any row: ${unmatched.slice(0, 6).join(", ")}${unmatched.length > 6 ? "…" : ""}`,
        );
      }
      return next;
    });
  };

  const downloadTemplate = () => {
    downloadBlob(new Blob([templateCsv()], { type: "text/csv" }), "hhgoa-2026-roster-template.csv");
  };

  /**
   * The only thing that empties the roster.
   *
   * Everything else about this page is now durable across navigation and
   * reloads, so losing work has to be a decision rather than a side effect.
   * Confirmed when there is anything to lose.
   */
  const clearAll = () => {
    if (rows.length > 0 && !window.confirm(`Clear all ${rows.length} rows? This cannot be undone.`)) {
      return;
    }
    rows.forEach((row) => releasePhoto(row.photo));
    clearRoster();
    acknowledge();
  };

  /* ------------------------------------------------------------- rendering */

  /**
   * The run itself lives in lib/batch-store.ts and draws onto the artboard
   * BatchHost mounts from the root layout, so leaving this page no longer
   * cancels it. This is only the button.
   */
  /**
   * Starts the run.
   *
   * The folder picker is opened here, in the click handler, and nothing is
   * awaited before it. `showDirectoryPicker` requires transient activation, so
   * reaching it after any other await throws SecurityError and the person sees
   * a run that silently fell back to zips.
   *
   * Declining the dialog is a normal answer, not an error: the run goes ahead
   * and writes zips instead.
   */
  const run = async () => {
    if (queued.length === 0) return;
    setNotice("");

    const choice = await pickFolder();

    // Cancel means cancel. V05.07 treated a dismissed dialog and a browser
    // without File System Access as the same answer and started the run in
    // both cases, so pressing Cancel began a five-hundred-badge render.
    if (choice.kind === "cancelled") {
      notifyInfo("Cancelled", "Nothing was rendered. Press Render again when you have a folder ready.");
      return;
    }

    if (choice.kind === "unsupported") {
      notifyWarning(
        "No folder access in this browser",
        "The badges will arrive as zip files. Chrome and Edge can write them straight to disk.",
      );
    }

    void startBatch({
      rows: queued,
      format,
      settings,
      codeKind,
      origin,
      folder: choice.kind === "folder" ? choice.handle : null,
    });
  };

  const cancel = () => {
    cancelBatch();
    notifyInfo("Stopping the run", "Everything already written has been kept.");
  };

  /* ------------------------------------------------------------------- UI */

  const size = CANVAS[format];
  const progressPct =
    phase.kind === "running" && phase.progress.total > 0
      ? Math.round((phase.progress.done / phase.progress.total) * 100)
      : 0;

  return (
    <div
      className="mx-auto w-full max-w-[var(--shell-max)]"
      style={{ paddingInline: "var(--pad-shell)", paddingBottom: "var(--gap-lg)" }}
    >
      {/* Hidden inputs */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          void importCsv(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={photosInputRef}
        type="file"
        accept={`${ACCEPTED_TYPES},.zip,application/zip`}
        multiple
        className="sr-only"
        onChange={(e) => {
          void importPhotos(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="stagger grid gap-[var(--gap-md)]">
        <Panel step="1" title="Load the roster">
          <div className="grid gap-[var(--gap-sm)]">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => csvInputRef.current?.click()} disabled={running}>
                Upload CSV
              </Button>
              <Button onClick={() => photosInputRef.current?.click()} disabled={running || rows.length === 0}>
                Attach photos or a zip
              </Button>
              <Button
                onClick={() => {
                  const row = emptyRow();
                  setRows((r) => [...r, row]);
                  setFocusId(row.id);
                }}
                disabled={running}
              >
                Add a person
              </Button>
              <Button variant="ghost" onClick={() => void importSample()} disabled={running}>
                Load 500-person sample
              </Button>
              <Button variant="ghost" onClick={downloadTemplate}>
                CSV template
              </Button>
              {rows.length > 0 ? (
                <Button variant="ghost" onClick={clearAll} disabled={running}>
                  Clear
                </Button>
              ) : null}
            </div>

            <p className="leading-snug text-ink/60" style={{ fontSize: "var(--step--1)" }}>
              Columns are matched by name, so exports from Devfolio, Google Forms or a spreadsheet
              usually import without editing. Add a <code>photo</code> column with filenames, then
              select all the photos at once and they pair up automatically. Up to {MAX_ROWS} rows.
            </p>

            {notice ? (
              <p
                className="pop-in border-[3px] border-ink bg-sun px-3 py-2"
                style={{ fontSize: "var(--step--1)" }}
                role="status"
              >
                {notice}
              </p>
            ) : null}
          </div>
        </Panel>

        {rows.length > 0 ? (
          <>
            <Panel
              step="2"
              title={`Roster (${rows.length})`}
              action={
                blockedCount > 0 ? (
                  <span
                    className="border-[2px] border-paper bg-flag px-2 py-0.5 font-[family-name:var(--font-mono)] font-bold text-paper"
                    style={{ fontSize: "0.77rem" }}
                  >
                    {blockedCount} BLOCKED
                  </span>
                ) : (
                  <span
                    className="border-[2px] border-paper bg-palm px-2 py-0.5 font-[family-name:var(--font-mono)] font-bold text-paper"
                    style={{ fontSize: "0.77rem" }}
                  >
                    ALL READY
                  </span>
                )
              }
            >
              <div className="grid gap-[var(--gap-sm)]">
                {checked.size > 0 ? (
                  <RosterBulkApply
                    count={checked.size}
                    codeKind={codeKind}
                    onCodeKind={setCodeKind}
                    onApply={(patch: Partial<BuilderInput>) =>
                      patchChecked((row) => ({ ...row, input: { ...row.input, ...patch } }))
                    }
                    onClear={(field) =>
                      patchChecked((row) => ({ ...row, input: { ...row.input, [field]: "" } }))
                    }
                    onClearSelection={() => setChecked(new Set())}
                    onRemoveSelected={() => {
                      setRows((current) => current.filter((row) => !checked.has(row.id)));
                      if (focusId && checked.has(focusId)) setFocusId(null);
                      setChecked(new Set());
                    }}
                  />
                ) : null}

                <RosterPager
                  total={rows.length}
                  pageSize={pageSize}
                  page={safePage}
                  onPageSize={setPageSize}
                  onPage={setPage}
                />

                {rows.length > 10 ? <RosterGoTo total={rows.length} onGo={goTo} /> : null}

                <RosterTable
                  rows={visible}
                  offset={offset}
                  focusId={focusId}
                  checked={checked}
                  onFocus={(id) => setFocusId(id === focusId ? null : id)}
                  onToggle={toggle}
                  onToggleAll={(next) =>
                    setChecked((current) => {
                      // Scoped to the visible page, which is what the label says.
                      const set = new Set(current);
                      for (const row of visible) {
                        if (next) set.add(row.id);
                        else set.delete(row.id);
                      }
                      return set;
                    })
                  }
                  onRemove={(id) => {
                    setRows((current) => current.filter((row) => row.id !== id));
                    if (focusId === id) setFocusId(null);
                  }}
                />
              </div>
            </Panel>


        {focusRow ? (
          <Panel step="3" title={focusRow.input.name || "Untitled"}>
            <div className="grid gap-[var(--gap-md)] lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
              <RosterDetail
                row={focusRow}
                index={focusIndex}
                total={rows.length}
                onPatch={(patch) =>
                  patchRow(focusRow.id, (row) => ({ ...row, input: { ...row.input, ...patch } }))
                }
                onPhoto={(photo) =>
                  patchRow(focusRow.id, (row) => ({ ...row, photo, photoName: photo.fileName }))
                }
                onPhotoPatch={(patch) =>
                  patchRow(focusRow.id, (row) =>
                    row.photo ? { ...row, photo: { ...row.photo, ...patch } } : row,
                  )
                }
                onClearPhoto={() => patchRow(focusRow.id, (row) => ({ ...row, photo: null }))}
                onJump={focusAt}
                onGo={rows.length > 10 ? <RosterGoTo total={rows.length} onGo={goTo} /> : null}
                onClose={() => setFocusId(null)}
                onStep={(delta) => {
                  const next = rows[focusIndex + delta];
                  if (next) setFocusId(next.id);
                }}
              />

              {/* Live preview of the person being edited. */}
              <div className="lg:sticky lg:top-4 lg:self-start">
                <Stage width={size.w} height={size.h} nodeRef={{ current: null }}>
                  <BatchArtboard
                    row={focusRow}
                    format={format}
                    settings={settings}
                    codeKind={codeKind}
                    origin={origin}
                    visible
                  />
                </Stage>
              </div>
            </div>
          </Panel>
        ) : null}

            <Panel step="4" title="Run settings">
              <div className="grid gap-[var(--gap-md)] lg:grid-cols-2">
                <div className="grid gap-[var(--gap-sm)]">
                  <div>
                    <p className="mb-2 font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70" style={{ fontSize: "var(--step--1)" }}>
                      FORMAT
                    </p>
                    <Segmented
                      ariaLabel="Bulk output format"
                      value={format}
                      options={FORMAT_OPTIONS}
                      onChange={setFormat}
                    />
                  </div>

                  <div>
                    <p className="mb-2 font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70" style={{ fontSize: "var(--step--1)" }}>
                      COLOURWAY
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-pressed={settings.accent === "perRow"}
                        onClick={() => setSettings((s) => ({ ...s, accent: "perRow" }))}
                        className={`press min-h-[44px] border-[3px] border-ink px-3 font-[family-name:var(--font-display)] ${
                          settings.accent === "perRow" ? "bg-ink text-paper" : "bg-paper"
                        }`}
                        style={{ fontSize: "var(--step-0)" }}
                      >
                        Varied
                      </button>
                      {ACCENTS.map((accent) => (
                        <button
                          key={accent.key}
                          type="button"
                          aria-label={accent.label}
                          aria-pressed={settings.accent === accent.key}
                          onClick={() => setSettings((s) => ({ ...s, accent: accent.key as AccentKey }))}
                          className={`press border-[3px] border-ink ${
                            settings.accent === accent.key ? "slab-sm" : "opacity-65"
                          }`}
                          style={{ width: 44, height: 44, backgroundColor: accent.hex }}
                          title={accent.label}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 text-ink/55" style={{ fontSize: "0.77rem" }}>
                      Varied picks a colour per person from their serial, so a roster looks mixed
                      but no card changes between runs.
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70" style={{ fontSize: "var(--step--1)" }}>
                      RESOLUTION
                    </p>
                    <div className="flex gap-2">
                      {([2, 3] as const).map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          aria-pressed={settings.pixelRatio === ratio}
                          onClick={() => setSettings((s) => ({ ...s, pixelRatio: ratio }))}
                          className={`press min-h-[40px] border-[3px] border-ink px-3 font-[family-name:var(--font-mono)] font-bold ${
                            settings.pixelRatio === ratio ? "bg-ink text-paper" : "bg-paper"
                          }`}
                          style={{ fontSize: "0.77rem" }}
                        >
                          {ratio}× · {size.w * ratio}px
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-ink/55" style={{ fontSize: "0.77rem" }}>
                      2× is plenty for screens and keeps a large run manageable. 3× is print weight.
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70" style={{ fontSize: "var(--step--1)" }}>
                      CODE
                    </p>
                    <Segmented
                      ariaLabel="Code type for every badge in the run"
                      value={codeKind}
                      options={[
                        { value: "datamatrix", label: "Data Matrix", sub: "denser" },
                        { value: "qr", label: "QR", sub: "familiar" },
                      ]}
                      onChange={(next) => setCodeKind(next as CodeKind)}
                    />
                    <p className="mt-1.5 text-ink/55" style={{ fontSize: "0.77rem" }}>
                      Both carry the same payload. Data Matrix packs it into a smaller square; QR is
                      the one every phone camera recognises on sight.
                    </p>
                  </div>
                </div>

                <div className="grid gap-[var(--gap-sm)]">
                  {/*
                    Batch-level only.

                    Date of birth, phone and email used to live here as
                    run-wide masking switches, which was wrong twice over:
                    they are per-person values, and a masking rule is not a
                    property of a batch. Masking moved to a single privacy
                    control below, and this column now carries the fields that
                    genuinely apply to a whole intake.
                  */}
                  <p
                    className="font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70"
                    style={{ fontSize: "var(--step--1)" }}
                  >
                    BATCH DEFAULTS
                  </p>
                  <p className="text-ink/55" style={{ fontSize: "0.77rem" }}>
                    Written onto every row that has the field empty. Anything already filled in,
                    by CSV or by hand, is left alone.
                  </p>

                  {BATCH_FIELDS.map((field) => (
                    <div key={field.key} className="flex flex-wrap items-end gap-2">
                      <label className="min-w-0 flex-1">
                        <span
                          className="mb-1 block font-[family-name:var(--font-mono)] font-bold tracking-[0.14em] text-ink/60"
                          style={{ fontSize: "0.77rem" }}
                        >
                          {field.label.toUpperCase()}
                        </span>
                        {field.key === "tier" ? (
                          <select
                            value={batchDefaults.tier}
                            onChange={(e) =>
                              setBatchDefaults((b) => ({ ...b, tier: e.target.value }))
                            }
                            className="w-full min-w-0 border-[2px] border-ink bg-paper px-2"
                            style={{ fontSize: "0.78rem", minHeight: 38 }}
                          >
                            <option value="">No tier</option>
                            {TIERS.map((tier) => (
                              <option key={tier} value={tier}>
                                {tier}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={batchDefaults[field.key]}
                            placeholder={field.placeholder}
                            onChange={(e) =>
                              setBatchDefaults((b) => ({ ...b, [field.key]: e.target.value }))
                            }
                            className="w-full min-w-0 border-[2px] border-ink bg-paper px-2"
                            style={{ fontSize: "0.78rem", minHeight: 38 }}
                          />
                        )}
                      </label>
                      <Button
                        onClick={() => applyBatchDefault(field.key)}
                        disabled={!batchDefaults[field.key].trim()}
                        className="!min-h-[38px] !py-1"
                      >
                        Fill blanks
                      </Button>
                      <Button
                        onClick={() => overwriteBatchDefault(field.key)}
                        disabled={!batchDefaults[field.key].trim()}
                        variant="ghost"
                        className="!min-h-[38px] !py-1"
                      >
                        Overwrite all
                      </Button>
                    </div>
                  ))}

                  <div className="mt-1 border-t-[2px] border-ink/20 pt-3">
                    <p
                      className="mb-2 font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70"
                      style={{ fontSize: "var(--step--1)" }}
                    >
                      PRIVACY, APPLIED TO THE WHOLE RUN
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-[2px] border-ink/25 px-2 py-1.5">
                      <span
                        className="font-[family-name:var(--font-mono)] tracking-[0.1em] text-ink/60"
                        style={{ fontSize: "0.77rem" }}
                      >
                        CONTACT DETAILS ON THE BADGE
                      </span>
                      <VisibilityPicker
                        label="Contact detail visibility"
                        value={settings.visibility.email}
                        onChange={(next: Visibility) =>
                          setSettings((s) => ({
                            ...s,
                            visibility: { dob: next, phone: next, email: next },
                          }))
                        }
                      />
                    </div>

                    <label className="press mt-2 flex cursor-pointer items-start gap-2.5 border-[3px] border-ink bg-paper p-3 hover:bg-palm/10">
                      <input
                        type="checkbox"
                        checked={settings.fullDetailsInCode}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, fullDetailsInCode: e.target.checked }))
                        }
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF0080]"
                      />
                      <span className="min-w-0" style={{ fontSize: "var(--step--1)" }}>
                        Put unmasked details inside the scannable code.
                        <span className="mt-1 block text-ink/55">
                          Reasonable for badges handed out at a door. Not for anything posted
                          publicly.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel step="5" title="Generate">
              <div className="grid gap-[var(--gap-sm)]">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="primary"
                    onClick={() => void run()}
                    disabled={running || queued.length === 0}
                    style={{ paddingInline: "clamp(1rem,.7rem + 1.6vw,1.75rem)", fontSize: "var(--step-1)" }}
                  >
                    {running
                      ? "Rendering…"
                      : checked.size > 0
                        ? `Render ${queued.length} selected`
                        : `Render all ${queued.length}`}
                  </Button>
                  {running ? (
                    <Button variant="danger" onClick={cancel}>
                      Cancel
                    </Button>
                  ) : null}
                  {blockedCount > 0 ? (
                    <span className="text-ink/60" style={{ fontSize: "var(--step--1)" }}>
                      {blockedCount} row{blockedCount === 1 ? "" : "s"} will be skipped.
                    </span>
                  ) : null}
                </div>

                {phase.kind === "running" ? (
                  <div className="border-[3px] border-ink bg-paper p-3">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="truncate font-[family-name:var(--font-mono)]" style={{ fontSize: "var(--step--1)" }}>
                        {phase.progress.current}
                      </span>
                      <span className="shrink-0 font-[family-name:var(--font-mono)] font-bold" style={{ fontSize: "var(--step--1)" }}>
                        {phase.progress.done} / {phase.progress.total}
                      </span>
                    </div>
                    <div className="h-4 border-[2px] border-ink bg-white">
                      <div
                        className="h-full bg-sun transition-[width] duration-200"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {phase.kind === "done" ? (
                  <div className="pop-in border-[3px] border-ink bg-palm px-3 py-2 text-paper" role="status">
                    <p style={{ fontSize: "var(--step-0)" }}>
                      {phase.rendered} badge{phase.rendered === 1 ? "" : "s"} rendered
                      {phase.sinkKind === "folder"
                        ? ` into ${phase.destination}, alongside a manifest.csv of the serials issued.`
                        : phase.parts > 1
                          ? ` across ${phase.parts} zip files in your downloads, each with its own manifest.csv.`
                          : ". The zip is in your downloads, with a manifest.csv of the serials issued."}
                    </p>
                    <p className="mt-1 opacity-75" style={{ fontSize: "var(--step--1)" }}>
                      Peak held in memory: {(phase.peakHeldBytes / (1024 * 1024)).toFixed(1)} MB.
                    </p>
                    {phase.failed.length > 0 ? (
                      <p className="mt-1 opacity-80" style={{ fontSize: "var(--step--1)" }}>
                        {phase.failed.length} failed: {phase.failed.slice(0, 3).map((f) => f.name).join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {phase.kind === "error" ? (
                  <p className="nudge border-[3px] border-ink bg-flag px-3 py-2 text-paper" role="alert" style={{ fontSize: "var(--step--1)" }}>
                    {phase.message}
                  </p>
                ) : null}

                <p className="max-w-[70ch] leading-relaxed text-ink/60" style={{ fontSize: "var(--step--1)" }}>
                  Everything happens in this tab: the CSV is parsed here, the badges are drawn
                  here, and nothing is uploaded. Pick a folder and each badge is written straight
                  to disk as it is made; without one they arrive as zip files. The run keeps going
                  if you switch tabs or move to another part of the app, and a status strip follows
                  it. Reloading the page is the one thing that ends it.
                </p>
              </div>
            </Panel>
          </>
        ) : null}

      </div>

      {/* The artboard the run draws onto used to sit here. It moved to
          components/BatchHost.tsx, mounted from the root layout, so a run
          survives navigating away from this page. */}
    </div>
  );
}
