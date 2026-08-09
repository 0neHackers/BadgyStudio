"use client";

import { CANVAS, COLORS, EVENT } from "@/lib/brand";
import { PhotoSlot } from "@/components/PhotoSlot";
import { fitText } from "@/lib/fit";
import { contrastRatio } from "@/lib/contrast";
import type { Badge } from "@/lib/badge";
import type { CodeKind } from "@/lib/codes";
import type { PhotoAsset } from "@/types";
import { DataCode, VerticalBarcode } from "@/components/CodeBlock";
import { OrganiserMark, PalmRow, SunBurst } from "@/components/Marks";
import { BannerLockup } from "@/components/Lockups";
import { Backdrop } from "@/components/Backdrop";

/**
 * Format B, the builder ID card. Fixed 1080 x 1350 so the export is a straight
 * rasterisation of what is on screen, with no second layout engine involved.
 * Every dimension below is in card pixels; the stage scales the whole thing.
 *
 * Overflow rule for this file: any slot holding user text either steps its
 * font size down through fitText, or clamps to a line count, or both. Nothing
 * is left to wrap freely, because a two-line name pushes the chip into the
 * data grid and there is no scrollbar on a PNG.
 */

const W = CANVAS.card.w;
const H = CANVAS.card.h;

function Field({ label, value, accent }: { label: string; value: string | null; accent?: string }) {
  const text = value && value.trim() ? value : "–";
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="font-[family-name:var(--font-mono)] font-bold tracking-[0.22em]"
        style={{ fontSize: 15, color: COLORS.ink, opacity: 0.55 }}
      >
        {label}
      </div>
      <div
        className="truncate font-[family-name:var(--font-mono)] font-medium"
        style={{
          fontSize: fitText(text, [
            { max: 16, size: 24 },
            { max: 22, size: 20 },
            { max: 30, size: 17 },
          ]),
          marginTop: 4,
          color: accent ?? COLORS.ink,
        }}
        title={text}
      >
        {text}
      </div>
    </div>
  );
}

export interface IdCardProps {
  badge: Badge;
  photo: PhotoAsset | null;
  codeKind: CodeKind;
}

export function IdCard({ badge, photo, codeKind }: IdCardProps) {
  const accent = badge.accentHex;
  // Computed rather than declared, so adding a colourway cannot make a label
  // vanish. See lib/contrast.ts.
  const headerText = badge.onAccent;
  const chipText = badge.onAccent;
  const name = badge.name || "Your Name";
  // Some colourways are too dark to sit on the ink stripe; fall back to paper.
  const contrastOnInk = contrastRatio(COLORS.ink, accent) >= 4.5 ? accent : COLORS.paper;

  return (
    <div
      className="grain relative overflow-hidden"
      style={{
        width: W,
        height: H,
        backgroundColor: COLORS.paper,
        border: `12px solid ${COLORS.ink}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Backdrop sits under everything. Runs light on the card because the
          card is dense with text. */}
      <Backdrop
        variant="card"
        width={W - 24}
        height={H - 24}
        accent={accent}
        intensity={1}
      />

      {/* Header */}
      <div
        style={{
          height: 132,
          backgroundColor: accent,
          borderBottom: `8px solid ${COLORS.ink}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          padding: "0 32px",
          flex: "0 0 auto",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, minWidth: 0 }}>
          {/*
            The header now carries the same lockup the site header does: the
            wordmark with the गोवा sticker straddling its middle. The sun tile
            that used to sit beside it moved down to the sign-off block.

            The plate stays. The wordmark is yellow with a black drop shadow and
            needs a dark ground, or it disappears into an accent field.
          */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              minWidth: 0,
              backgroundColor: COLORS.ink,
              border: `5px solid ${COLORS.ink}`,
              padding: "10px 18px",
              boxShadow: `6px 6px 0 0 ${COLORS.palm}`,
            }}
          >
            <BannerLockup fluidHeight="46px" onDark={false} />
            <span
              className="font-[family-name:var(--font-mono)] font-bold leading-none"
              style={{ fontSize: 40, color: COLORS.paper, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}
            >
              {EVENT.edition}
            </span>
          </div>
        </div>

        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
          <div
            className="font-[family-name:var(--font-mono)] font-bold tracking-[0.2em]"
            style={{ fontSize: 16, color: headerText, whiteSpace: "nowrap" }}
          >
            {EVENT.location}
          </div>
          <div
            className="font-[family-name:var(--font-mono)] tracking-[0.14em]"
            style={{ fontSize: 16, color: headerText, opacity: 0.75, marginTop: 4, whiteSpace: "nowrap" }}
          >
            {EVENT.dates}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0, position: "relative" }}>
        {/* Spine: the serial as a vertical Code 128, with the digits beside it */}
        <div
          style={{
            width: 122,
            borderRight: `6px solid ${COLORS.ink}`,
            backgroundColor: COLORS.paper,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "22px 0",
            flex: "0 0 auto",
          }}
        >
          <div
            className="font-[family-name:var(--font-mono)] font-bold tracking-[0.3em]"
            style={{
              fontSize: 14,
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              opacity: 0.55,
            }}
          >
            SERIAL
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 560 }}>
            {/* The linear code carries the ten-character body, not the
                prefixed pass number. Code 128 gets denser with every character
                and this one is only 58px wide before the export multiplier;
                /v resolves an unprefixed serial, so the prefix costs scan
                reliability and buys nothing a scanner uses. The Data Matrix
                carries the full pass number, and so does the printed text. */}
            <VerticalBarcode value={badge.serial} className="h-full w-[58px]" />
            {/* The human-readable serial, running with the bars. */}
            <div
              className="font-[family-name:var(--font-mono)] font-bold"
              style={{
                // 24/0.2em rather than 26/0.26em: the prefix added four
                // characters to a run with a fixed 560px height.
                fontSize: 24,
                letterSpacing: "0.2em",
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                whiteSpace: "nowrap",
                lineHeight: 1,
              }}
            >
              {badge.passNumber}
            </div>
          </div>

          <div
            className="font-[family-name:var(--font-mono)]"
            style={{
              fontSize: 12,
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              opacity: 0.45,
              letterSpacing: "0.12em",
              whiteSpace: "nowrap",
            }}
          >
            {EVENT.coords}
          </div>
        </div>

        {/* Main column */}
        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            padding: 32,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Photo + identity */}
          <div style={{ display: "flex", gap: 26, flex: "0 0 auto", minWidth: 0 }}>
            <div
              style={{
                width: 372,
                height: 496,
                border: `8px solid ${COLORS.ink}`,
                boxShadow: `12px 12px 0 0 ${accent}`,
                backgroundColor: COLORS.ink,
                flex: "0 0 auto",
                overflow: "hidden",
              }}
            >
              <PhotoSlot
                photo={photo}
                width="100%"
                height="100%"
                fallback={
                  <div
                    className="hatch"
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      backgroundColor: COLORS.paper,
                    }}
                  >
                    <span
                      className="font-[family-name:var(--font-mono)] font-bold tracking-[0.2em]"
                      style={{
                        fontSize: 18,
                        backgroundColor: COLORS.paper,
                        padding: "8px 14px",
                        border: `4px solid ${COLORS.ink}`,
                      }}
                    >
                      NO PHOTO
                    </span>
                  </div>
                }
              />
            </div>

            <div
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Set in Imbue, the event's own display face. Decorative
                  furniture only: nothing anyone has to read at a door. */}
              <div
                className="font-[family-name:var(--font-chrome)] font-bold tracking-[0.3em]"
                style={{ fontSize: 22, opacity: 0.6, lineHeight: 1 }}
              >
                BUILDER
              </div>

              {/* Two lines maximum, size stepped by length. */}
              <div
                className="font-[family-name:var(--font-display)]"
                style={{
                  fontSize: fitText(name, [
                    { max: 12, size: 88 },
                    { max: 16, size: 74 },
                    { max: 22, size: 60 },
                    { max: 30, size: 48 },
                  ]),
                  lineHeight: 0.95,
                  marginTop: 8,
                  letterSpacing: "-0.015em",
                  overflowWrap: "anywhere",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {name}
              </div>

              <div
                className="truncate font-[family-name:var(--font-mono)] font-medium"
                style={{ fontSize: 25, marginTop: 10, color: COLORS.palm }}
              >
                {badge.handle || "@handle"}
              </div>

              <div style={{ marginTop: 18, minWidth: 0 }}>
                <div
                  className="font-[family-name:var(--font-mono)] font-bold tracking-[0.24em]"
                  style={{ fontSize: 14, opacity: 0.55, marginBottom: 8 }}
                >
                  CLASS
                </div>
                <div
                  className="font-[family-name:var(--font-display)]"
                  style={{
                    maxWidth: "100%",
                    fontSize: fitText(badge.title, [
                      { max: 18, size: 32 },
                      { max: 26, size: 27 },
                      { max: 34, size: 23 },
                    ]),
                    lineHeight: 1.08,
                    padding: "10px 15px",
                    backgroundColor: accent,
                    color: chipText,
                    border: `5px solid ${COLORS.ink}`,
                    boxShadow: `6px 6px 0 0 ${COLORS.ink}`,
                    overflowWrap: "anywhere",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {badge.title}
                </div>
              </div>

              <div style={{ marginTop: "auto", paddingTop: 16 }}>
                <div
                  className="font-[family-name:var(--font-mono)] font-bold tracking-[0.24em]"
                  style={{ fontSize: 14, opacity: 0.55 }}
                >
                  PASS NO.
                </div>
                <div
                  className="font-[family-name:var(--font-mono)] font-bold"
                  style={{
                    // fitText would be overkill for a string of known length,
                    // but IDX- is four more characters in the same slot.
                    fontSize: 32,
                    letterSpacing: "0.03em",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {badge.serialPretty}
                </div>
              </div>
            </div>
          </div>

          {/* Status stripe. Only drawn when a tier was set. */}
          {badge.tier ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flex: "0 0 auto",
                marginTop: -8,
              }}
            >
              <span
                className="font-[family-name:var(--font-display)]"
                style={{
                  fontSize: 26,
                  padding: "6px 16px",
                  backgroundColor: COLORS.ink,
                  // The stripe is ink, so the accent has to read on ink, not paper.
                  color: contrastOnInk,
                  border: `4px solid ${COLORS.ink}`,
                  whiteSpace: "nowrap",
                  letterSpacing: "0.02em",
                }}
              >
                {badge.tier}
              </span>
              {badge.project ? (
                <span
                  className="truncate font-[family-name:var(--font-mono)]"
                  style={{ fontSize: 19, opacity: 0.75 }}
                  title={badge.project}
                >
                  BUILDING: {badge.project}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Data grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "18px 24px",
              borderTop: `5px solid ${COLORS.ink}`,
              borderBottom: `5px solid ${COLORS.ink}`,
              padding: "18px 14px",
              flex: "0 0 auto",
              // Scrim. The backdrop is deliberately busy, and mono values at
              // 24px lose against line work without something to sit on.
              backgroundColor: "rgba(255,251,232,0.82)",
              position: "relative",
            }}
          >
            <Field label="TEAM" value={badge.team || null} />
            <Field label="STACK / ROLE" value={badge.role || null} />
            <Field label="D.O.B." value={badge.dob} />
            <Field label="PHONE" value={badge.phone} />
            <Field label="EMAIL" value={badge.email} />
            <Field label="ISSUED" value={badge.issued} accent={COLORS.palm} />
          </div>

          {/*
            Ticket-stub marquee. It exists to close the vertical gap that used
            to sit between the data grid and the code block, and it earns its
            place by repeating the event's own furniture rather than padding
            with whitespace.
          */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              height: 52,
              border: `4px solid ${COLORS.ink}`,
              backgroundColor: COLORS.ink,
              overflow: "hidden",
              flex: "0 0 auto",
              paddingInline: 2,
            }}
            aria-hidden="true"
          >
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="font-[family-name:var(--font-mono)] font-bold"
                style={{
                  fontSize: 17,
                  letterSpacing: "0.18em",
                  color: i % 2 === 0 ? accent : COLORS.paper,
                  whiteSpace: "pre",
                  opacity: i % 2 === 0 ? 1 : 0.5,
                  // Without this the spans shrink below their content width and
                  // the text paints over its neighbour instead of being clipped.
                  flex: "0 0 auto",
                }}
              >
                {i % 2 === 0 ? `${EVENT.hashtag.toUpperCase()}  ·` : "OPEN TRIALS  ·"}
              </span>
            ))}
          </div>

          {/* Code + sign-off. marginTop:auto pins it to the bottom so any
              leftover height collects above it rather than inside it. */}
          <div
            style={{
              display: "flex",
              gap: 22,
              alignItems: "flex-end",
              flex: "0 0 auto",
              marginTop: "auto",
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 182,
                height: 182,
                border: `6px solid ${COLORS.ink}`,
                backgroundColor: COLORS.white,
                padding: 10,
                flex: "0 0 auto",
              }}
            >
              <DataCode value={badge.payload} kind={codeKind} className="h-full w-full" />
            </div>

            <div
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                paddingBottom: 4,
                paddingInline: 10,
                backgroundColor: "rgba(255,251,232,0.78)",
              }}
            >
              <div
                className="font-[family-name:var(--font-mono)] font-bold tracking-[0.24em]"
                style={{ fontSize: 14, opacity: 0.55 }}
              >
                SCAN AT THE DOOR
              </div>
              <div
                className="font-[family-name:var(--font-mono)]"
                style={{ fontSize: 16, marginTop: 6, lineHeight: 1.45, opacity: 0.8 }}
              >
                Carries this pass in full.
                <br />
                Check character validates offline.
              </div>
              <PalmRow className="mt-3 h-[42px] w-[190px]" color={COLORS.palm} />
            </div>

            {/* The गोवा sticker, sat on green the way the site presents it. */}
            <div
              style={{
                textAlign: "right",
                flex: "0 0 auto",
                paddingBottom: 4,
                display: "flex",
                alignItems: "flex-end",
                gap: 16,
              }}
            >
              <div>
                <div
                  className="font-[family-name:var(--font-display)]"
                  style={{ fontSize: 30, lineHeight: 1, color: COLORS.palm, whiteSpace: "nowrap" }}
                >
                  {EVENT.capacity}
                </div>
                <div
                  className="font-[family-name:var(--font-mono)] tracking-[0.16em]"
                  style={{ fontSize: 13, marginTop: 8, opacity: 0.65, whiteSpace: "nowrap" }}
                >
                  {EVENT.tagline.toUpperCase()}
                </div>
              </div>
              <div
                style={{
                  width: 116,
                  height: 116,
                  backgroundColor: COLORS.palm,
                  border: `5px solid ${COLORS.ink}`,
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 auto",
                  boxShadow: `6px 6px 0 0 ${COLORS.ink}`,
                }}
              >
                <SunBurst className="h-[96px] w-[96px]" color={COLORS.sun} line={COLORS.paper} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          height: 84,
          backgroundColor: COLORS.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "0 32px",
          flex: "0 0 auto",
          position: "relative",
        }}
      >
        <div
          className="font-[family-name:var(--font-chrome)] font-bold tracking-[0.12em]"
          style={{ fontSize: 26, color: COLORS.paper, whiteSpace: "nowrap" }}
        >
          {EVENT.site.toUpperCase()}
        </div>
        {/* Organiser lockup rather than the name set as text. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
          <span
            className="font-[family-name:var(--font-mono)] tracking-[0.16em]"
            style={{ fontSize: 13, color: COLORS.paper, opacity: 0.5, whiteSpace: "nowrap" }}
          >
            BY
          </span>
          <OrganiserMark height={38} />
        </div>
        <div
          className="font-[family-name:var(--font-display)]"
          style={{
            fontSize: 26,
            color: COLORS.ink,
            backgroundColor: accent,
            padding: "6px 14px",
            border: `3px solid ${COLORS.paper}`,
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
        >
          {EVENT.hashtag}
        </div>
      </div>
    </div>
  );
}
