"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ACCENTS, CANVAS, EVENT, type AccentKey, type FormatKey } from "@/lib/brand";
import { buildBadge } from "@/lib/badge";
import { copyBlobToClipboard, downloadBlob, fileNameFor, renderBlob } from "@/lib/export";
import {
  buildCaption,
  canShareFiles,
  composerUrl,
  rememberShareConsent,
  shareConsent,
  shareUploadSummary,
  uploadForPreview,
} from "@/lib/share";
import { releasePhoto } from "@/lib/image";
import { savePass, toVaultPhoto } from "@/lib/vault";
import { notifyProgress, notifyWarning } from "@/lib/toast";
import { useBrandAssets } from "@/lib/brand-assets";
import type { CodeKind } from "@/lib/codes";
import {
  DEFAULT_INPUT,
  DEFAULT_VISIBILITY,
  type BadgeState,
  type PhotoAsset,
  type TeamMember,
  type Visibility,
} from "@/types";

import { IdCard } from "@/components/IdCard";
import { PfpFrame } from "@/components/PfpFrame";
import { TeamFrame } from "@/components/TeamFrame";
import { Stage } from "@/components/Stage";
import { TeamEditor } from "@/components/TeamEditor";
import { PhotoEditor } from "@/components/PhotoEditor";
import { PRESET_TITLES } from "@/lib/builder-title";
import { TIERS } from "@/lib/tiers";
import { PhoneField, EmailField } from "@/components/ContactFields";
import { Button, Panel, Segmented, TextField, VisibilityPicker } from "@/components/ui/controls";

const FORMAT_OPTIONS: { value: FormatKey; label: string; sub: string }[] = [
  { value: "card", label: "ID card", sub: "1080×1350" },
  { value: "pfp", label: "PFP frame", sub: "1024×1024" },
  { value: "team", label: "Team", sub: "1600×900" },
];

const CONTACT_FIELDS = [
  { key: "dob" as const, label: "Date of birth", type: "date", placeholder: "" },
  { key: "phone" as const, label: "Phone", type: "tel", placeholder: "+91 98765 43210" },
  { key: "email" as const, label: "Email", type: "email", placeholder: "you@domain.com" },
];

export function Studio({ origin }: { origin: string }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  // Resolves the brand marks to data URLs so an export fetches nothing.
  useBrandAssets();

  const [state, setState] = useState<BadgeState>({
    format: "card",
    input: DEFAULT_INPUT,
    visibility: DEFAULT_VISIBILITY,
    accent: "sun",
    photo: null,
    team: [],
    titleOverrideIndex: 0,
    customTitle: "",
  });
  const [codeKind, setCodeKind] = useState<CodeKind>("datamatrix");
  const [fullDetailsInCode, setFullDetailsInCode] = useState(false);
  const [rerolls, setRerolls] = useState(0);
  const [classMode, setClassMode] = useState<"generated" | "preset" | "custom">("generated");

  const badge = useMemo(
    () => buildBadge(state, { fullDetailsInCode, origin }),
    [state, fullDetailsInCode, origin],
  );

  const size = CANVAS[state.format];

  const setInput = (patch: Partial<BadgeState["input"]>) =>
    setState((prev) => ({ ...prev, input: { ...prev.input, ...patch } }));

  const setVisibility = (key: keyof BadgeState["visibility"], value: Visibility) =>
    setState((prev) => ({ ...prev, visibility: { ...prev.visibility, [key]: value } }));

  const setPhoto = (photo: PhotoAsset) =>
    setState((prev) => {
      releasePhoto(prev.photo);
      return { ...prev, photo };
    });

  const clearPhoto = () =>
    setState((prev) => {
      releasePhoto(prev.photo);
      return { ...prev, photo: null };
    });

  const setTeam = (team: TeamMember[]) => setState((prev) => ({ ...prev, team }));

  const capture = useCallback(
    async (pixelRatio: number) => {
      const node = nodeRef.current;
      if (!node) throw new Error("Nothing to export yet.");
      return renderBlob(node, { width: size.w, height: size.h, pixelRatio });
    },
    [size.w, size.h],
  );

  /**
   * Records the pass in the local vault.
   *
   * Called when a graphic is actually taken, not on every keystroke: a vault
   * full of half-typed names would be worse than useless, and "created" means
   * the person did something with it. Keyed on the pass number, so taking the
   * same card twice updates one record rather than making two.
   *
   * Never allowed to fail the thing it is recording. A refused IndexedDB, and
   * private browsing does refuse, must not stop a download.
   */
  const remember = useCallback(() => {
    void savePass({
      serial: badge.serial,
      format: state.format,
      input: state.input,
      visibility: state.visibility,
      accent: state.accent ?? "sun",
      customTitle: state.customTitle,
      titleOverrideIndex: state.titleOverrideIndex,
      fullDetailsInCode,
      // The photo exactly as cropped. See lib/vault.ts for why the blob is
      // stored rather than a re-encode of it.
      photo: toVaultPhoto(state.photo),
      source: "single",
    }).catch(() => {});
  }, [badge.serial, state, fullDetailsInCode]);

  /**
   * Download at a chosen multiplier.
   *
   * Until V06.04 this was one button fixed at 3x, while the bulk studio and the
   * vault both offered the choice. A card at 3x is 3240x4050 and several
   * megabytes, which is right for print and wrong for a phone with a slow
   * connection, so the person making their own badge was the only one who could
   * not pick.
   */
  const handleDownload = async (pixelRatio: 2 | 3) => {
    const size = CANVAS[state.format];
    const pixels = `${size.w * pixelRatio}x${size.h * pixelRatio}`;
    const job = notifyProgress(`Rendering at ${pixelRatio}x`, pixels);
    try {
      const blob = await capture(pixelRatio);
      downloadBlob(blob, fileNameFor(state.format, badge.passNumber));
      remember();
      job.succeed("Saved to your downloads", `${pixels}, kept as ${badge.passNumber} here.`);
    } catch {
      job.fail("The render failed", "Try again in a moment.");
    }
  };

  const handleShare = async () => {
    const job = notifyProgress("Preparing the post");

    let blob: Blob;
    try {
      blob = await capture(2);
    } catch {
      job.fail("The render failed", "Try again in a moment.");
      return;
    }

    const file = new File([blob], fileNameFor(state.format, badge.passNumber), { type: "image/png" });
    remember();

    // Mobile: the share sheet takes the file straight into the X composer.
    if (canShareFiles([file])) {
      try {
        await navigator.share({ files: [file], text: buildCaption(state.format, badge, origin) });
        job.succeed("Handed off to your share sheet");
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          job.done();
          return;
        }
      }
    }

    // Desktop: park the image so the link preview shows the real graphic.
    //
    // This is the only thing in the app that leaves the browser, so it is
    // asked for rather than assumed. Declining is a normal answer and falls
    // through to download-then-attach, which is also what happens when the
    // blob store is not configured.
    if (shareConsent() === "unasked") {
      const summary = shareUploadSummary({
        serial: badge.passNumber,
        name: badge.name,
        team: badge.team,
      });
      const agreed = window.confirm(
        [
          "To make X show your badge in the link preview, it has to be uploaded to a public address.",
          "",
          "That means sending:",
          ...summary.map((line) => `  · ${line}`),
          "",
          "Anyone with the link can see it. Nothing else in this app is ever uploaded.",
          "",
          "Cancel to skip the upload: the image will download and you can attach it yourself.",
        ].join("\n"),
      );
      rememberShareConsent(agreed ? "granted" : "denied");
    }

    const uploaded =
      shareConsent() === "granted"
        ? await uploadForPreview(blob, {
            format: state.format,
            serial: badge.serial,
            name: badge.name,
            title: badge.title,
            team: badge.team,
          })
        : null;

    if (uploaded) {
      window.open(
        composerUrl(buildCaption(state.format, badge), uploaded.pageUrl),
        "_blank",
        "noopener,noreferrer",
      );
      job.succeed("Composer open", "The link preview is your card.");
      return;
    }

    downloadBlob(blob, fileNameFor(state.format, badge.passNumber));
    window.open(composerUrl(buildCaption(state.format, badge, origin)), "_blank", "noopener,noreferrer");
    job.done();
    notifyWarning("Image saved instead", "Attach it in the composer that just opened.");
  };

  const handleCopy = async () => {
    const job = notifyProgress("Copying to the clipboard");
    const ok = await copyBlobToClipboard(() => capture(2));
    remember();
    if (ok) {
      job.succeed("On your clipboard", "Paste it straight into a post.");
    } else {
      // Firefox cannot write images to the clipboard at all, so save instead.
      try {
        downloadBlob(await capture(3), fileNameFor(state.format, badge.passNumber));
        job.done();
        notifyWarning("This browser blocks image copy", "It downloaded instead.");
      } catch {
        job.fail("Could not copy or save", "Try the download button.");
      }
    }
  };

  const cycleTitle = () => {
    setState((prev) => ({ ...prev, titleOverrideIndex: prev.titleOverrideIndex + 1 }));
    setRerolls((n) => n + 1);
  };

  return (
    <div
      className="mx-auto grid w-full max-w-[var(--shell-max)] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]"
      style={{ gap: "var(--gap-lg)", paddingInline: "var(--pad-shell)", paddingBottom: "var(--gap-lg)" }}
    >
      {/* Controls */}
      <div className="stagger min-w-0" style={{ display: "grid", gap: "var(--gap-md)" }}>
        <Panel step="1" title="Your photo">
          <PhotoEditor
            photo={state.photo}
            onPhoto={setPhoto}
            onClear={clearPhoto}
            aspect={state.format === "pfp" ? 1 : 372 / 496}
            onChange={(patch) =>
              setState((prev) =>
                prev.photo ? { ...prev, photo: { ...prev.photo, ...patch } } : prev,
              )
            }
          />
        </Panel>

        <Panel step="2" title="Who you are">
          <div style={{ display: "grid", gap: "var(--gap-sm)" }}>
            <div className="grid min-w-0 gap-[var(--gap-sm)] sm:grid-cols-2">
              <TextField
                label="Name"
                value={state.input.name}
                maxLength={34}
                placeholder="Ada Lovelace"
                autoComplete="name"
                onChange={(event) => setInput({ name: event.target.value })}
              />
              <TextField
                label="X handle"
                value={state.input.username}
                maxLength={20}
                placeholder="@handle"
                onChange={(event) => setInput({ username: event.target.value })}
              />
            </div>

            <div className="grid min-w-0 gap-[var(--gap-sm)] sm:grid-cols-2">
              <TextField
                label="Team"
                hint="optional"
                value={state.input.team}
                maxLength={26}
                placeholder="Night Shift"
                onChange={(event) => setInput({ team: event.target.value })}
              />
              <TextField
                label="Stack / role"
                value={state.input.role}
                maxLength={28}
                placeholder="Rust, infra"
                onChange={(event) => setInput({ role: event.target.value })}
              />
            </div>

            <div className="grid min-w-0 gap-[var(--gap-sm)] sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span
                    className="font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70"
                    style={{ fontSize: "var(--step--1)" }}
                  >
                    Pass tier
                  </span>
                  <span className="shrink-0 text-ink/45" style={{ fontSize: "var(--step--1)" }}>
                    optional
                  </span>
                </span>
                <select
                  value={state.input.tier}
                  onChange={(event) => setInput({ tier: event.target.value })}
                  className="w-full min-w-0 border-[3px] border-ink bg-paper"
                  style={{
                    paddingInline: "clamp(0.6rem,0.5rem + 0.4vw,0.85rem)",
                    paddingBlock: "clamp(0.55rem,0.48rem + 0.3vw,0.7rem)",
                    fontSize: "var(--step-0)",
                    minHeight: 44,
                  }}
                >
                  <option value="">No tier</option>
                  {TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="Building"
                hint="optional"
                value={state.input.project}
                maxLength={30}
                placeholder="What you're shipping"
                onChange={(event) => setInput({ project: event.target.value })}
              />
            </div>

            {/*
              Builder class. This block overflowed in V00.00: the title sat in a
              flex row next to the Reroll button with only min-w-0 on the text
              side, which is not enough on its own. A flex child defaults to
              flex-basis:auto, so it takes its content width first and pushes the
              row wider than the panel. It needs flex-1 as well, and the button
              needs shrink-0 so it never gives up space instead.
            */}
            <div className="border-[3px] border-ink bg-sun/25 p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className="font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/60"
                    style={{ fontSize: "var(--step--1)" }}
                  >
                    BUILDER CLASS
                  </p>
                  <p
                    key={`${rerolls}-${badge.title}`}
                    className="pop-in truncate font-[family-name:var(--font-display)]"
                    style={{ fontSize: "var(--step-2)" }}
                    title={badge.title}
                  >
                    {badge.title}
                  </p>
                </div>
                {classMode === "generated" ? (
                  <Button onClick={cycleTitle} className="shrink-0">
                    Reroll
                  </Button>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {(
                  [
                    ["generated", "Generated"],
                    ["preset", "Pick one"],
                    ["custom", "Write my own"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={classMode === mode}
                    onClick={() => {
                      setClassMode(mode);
                      if (mode === "generated") setState((p) => ({ ...p, customTitle: "" }));
                    }}
                    className={`tap border-[2px] border-ink px-2 py-1 font-[family-name:var(--font-mono)] font-bold transition-colors duration-150 ${
                      classMode === mode ? "bg-ink text-paper" : "bg-paper hover:bg-sun"
                    }`}
                    style={{ fontSize: "0.77rem" }}
                  >
                    {label.toUpperCase()}
                  </button>
                ))}
              </div>

              {classMode === "preset" ? (
                <select
                  value={state.customTitle}
                  onChange={(event) => setState((p) => ({ ...p, customTitle: event.target.value }))}
                  className="mt-2 w-full border-[3px] border-ink bg-paper px-2 py-2"
                  style={{ fontSize: "var(--step-0)", minHeight: 44 }}
                >
                  <option value="">Use the generated one</option>
                  {PRESET_TITLES.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              ) : null}

              {classMode === "custom" ? (
                <input
                  value={state.customTitle}
                  maxLength={40}
                  placeholder="Whatever you want on the chip"
                  onChange={(event) => setState((p) => ({ ...p, customTitle: event.target.value }))}
                  className="mt-2 w-full border-[3px] border-ink bg-paper px-2 py-2"
                  style={{ fontSize: "var(--step-0)", minHeight: 44 }}
                />
              ) : null}

              <p className="mt-2 text-ink/60" style={{ fontSize: "var(--step--1)" }}>
                {classMode === "generated"
                  ? "Drawn from your stack and your pass number. Same inputs, same class, every time."
                  : "Yours overrides the generated one. Clear it to go back."}
              </p>
            </div>
          </div>
        </Panel>

        <Panel step="3" title="Contact block">
          <div style={{ display: "grid", gap: "var(--gap-sm)" }}>
            {CONTACT_FIELDS.map((field) => (
              <div key={field.key} className="grid min-w-0 gap-1.5">
                {/* Phone and email get their own components so the formatting
                    and the checks are the same here and in the roster editor.
                    See components/ContactFields.tsx. */}
                {field.key === "phone" ? (
                  <PhoneField
                    value={state.input.phone}
                    onChange={(next) => setInput({ phone: next })}
                  />
                ) : field.key === "email" ? (
                  <EmailField
                    value={state.input.email}
                    onChange={(next) => setInput({ email: next })}
                  />
                ) : (
                  <TextField
                    label={field.label}
                    type={field.type}
                    value={state.input[field.key]}
                    placeholder={field.placeholder}
                    onChange={(event) => setInput({ [field.key]: event.target.value })}
                  />
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className="font-[family-name:var(--font-mono)] tracking-[0.12em] text-ink/45"
                    style={{ fontSize: "0.77rem" }}
                  >
                    ON THE CARD
                  </span>
                  <VisibilityPicker
                    label={`${field.label} visibility`}
                    value={state.visibility[field.key]}
                    onChange={(next) => setVisibility(field.key, next)}
                  />
                </div>
              </div>
            ))}

            <label className="press flex cursor-pointer items-start gap-2.5 border-[3px] border-ink bg-paper p-3 hover:bg-sun/20">
              <input
                type="checkbox"
                checked={fullDetailsInCode}
                onChange={(event) => setFullDetailsInCode(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF0080]"
              />
              <span className="min-w-0" style={{ fontSize: "var(--step--1)" }}>
                Put my unmasked details inside the scannable code.
                <span className="mt-1 block text-ink/55">
                  Off by default. Anyone who scans the image you post can read whatever the code
                  carries.
                </span>
              </span>
            </label>
          </div>
        </Panel>

        <Panel step="4" title="Look">
          <div style={{ display: "grid", gap: "var(--gap-md)" }}>
            <div>
              <p
                className="mb-2 font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70"
                style={{ fontSize: "var(--step--1)" }}
              >
                COLOURWAY
              </p>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent.key}
                    type="button"
                    aria-label={accent.label}
                    aria-pressed={state.accent === accent.key}
                    onClick={() => setState((prev) => ({ ...prev, accent: accent.key as AccentKey }))}
                    className={`press border-[3px] border-ink ${
                      state.accent === accent.key ? "slab-sm" : "opacity-65"
                    }`}
                    style={{ width: 44, height: 44, backgroundColor: accent.hex }}
                    title={accent.label}
                  />
                ))}
              </div>
            </div>

            <div>
              <p
                className="mb-2 font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70"
                style={{ fontSize: "var(--step--1)" }}
              >
                SCANNABLE CODE
              </p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: "datamatrix" as const, label: "DATA MATRIX" },
                  { value: "qrcode" as const, label: "QR" },
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={codeKind === option.value}
                    onClick={() => setCodeKind(option.value)}
                    className={`press min-h-[40px] border-[3px] border-ink px-3 font-[family-name:var(--font-mono)] font-bold ${
                      codeKind === option.value ? "bg-ink text-paper" : "bg-paper hover:bg-sun/40"
                    }`}
                    style={{ fontSize: "0.77rem" }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        {state.format === "team" ? (
          <Panel step="5" title="Your crew">
            <TeamEditor members={state.team} onChange={setTeam} />
          </Panel>
        ) : null}
      </div>

      {/* Preview */}
      <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <div className="mb-3">
          <Segmented
            ariaLabel="Output format"
            value={state.format}
            options={FORMAT_OPTIONS}
            onChange={(format) => setState((prev) => ({ ...prev, format }))}
          />
        </div>

        {/* The frame is drawn by Stage, wrapped tightly around the scaled
            artboard. It used to be this div, full width, with the card sitting
            in the corner of it. See components/Stage.tsx. */}
        <div key={state.format} className="rise-in">
          <Stage width={size.w} height={size.h} nodeRef={nodeRef}>
            {state.format === "card" ? (
              <IdCard badge={badge} photo={state.photo} codeKind={codeKind} />
            ) : state.format === "pfp" ? (
              <PfpFrame badge={badge} photo={state.photo} codeKind={codeKind} />
            ) : (
              <TeamFrame badge={badge} photo={state.photo} members={state.team} codeKind={codeKind} />
            )}
          </Stage>
        </div>

        {/* Two download buttons rather than one, each naming the pixels it
            produces. "Download PNG" said nothing about what came out, and 3x
            was the only thing it ever produced. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={() => void handleDownload(2)}
            className="flex-1 sm:flex-none"
            style={{ paddingInline: "clamp(0.9rem, 0.7rem + 1.2vw, 1.5rem)", fontSize: "var(--step-1)" }}
          >
            Download 2×
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleDownload(3)}
            className="flex-1 sm:flex-none"
            style={{ paddingInline: "clamp(0.9rem, 0.7rem + 1.2vw, 1.5rem)", fontSize: "var(--step-1)" }}
          >
            Download 3×
          </Button>
          <Button
            onClick={handleShare}
            className="flex-1 sm:flex-none"
            style={{ paddingInline: "clamp(0.9rem, 0.7rem + 1.2vw, 1.5rem)", fontSize: "var(--step-1)" }}
          >
            Share to X
          </Button>
          <Button onClick={handleCopy}>Copy image</Button>
        </div>

        {/* What each button actually produces, for every format rather than
            only the one on screen, so the choice can be made before switching
            to it. */}
        <dl
          className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-[family-name:var(--font-mono)] text-ink/50"
          style={{ fontSize: "0.77rem" }}
          data-export-sizes
        >
          {FORMAT_OPTIONS.map((option) => {
            const canvas = CANVAS[option.value];
            const here = option.value === state.format;
            return (
              <div key={option.value} className={here ? "text-ink" : undefined}>
                <dt className="inline font-bold tracking-[0.12em]">
                  {option.label.toUpperCase()}
                  {here ? " ·" : " ·"}
                </dt>{" "}
                <dd className="inline">
                  {canvas.w}×{canvas.h} · 2× {canvas.w * 2}×{canvas.h * 2} · 3×{" "}
                  {canvas.w * 3}×{canvas.h * 3}
                </dd>
              </div>
            );
          })}
        </dl>

        <p className="mt-4 max-w-[62ch] leading-relaxed text-ink/60" style={{ fontSize: "var(--step--1)" }}>
          Your photo and details never leave this browser. The card is drawn locally and only the
          finished PNG is uploaded, and only if you press Share on a desktop. Every post needs{" "}
          <span className="font-[family-name:var(--font-mono)] font-bold text-ink">{EVENT.hashtag}</span>{" "}
          to count.
        </p>
      </div>
    </div>
  );
}
