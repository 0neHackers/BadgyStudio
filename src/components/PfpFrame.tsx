"use client";

import { CANVAS, COLORS, EVENT } from "@/lib/brand";
import { PhotoSlot } from "@/components/PhotoSlot";
import { Backdrop } from "@/components/Backdrop";
import { fitText } from "@/lib/fit";
import type { Badge } from "@/lib/badge";
import type { PhotoAsset } from "@/types";
import { StudioMark, BannerLockup } from "@/components/Lockups";
import { PalmRow } from "@/components/Marks";

/**
 * Format A, the profile frame. Square, 1024, which is what X wants for an
 * avatar. The photo runs full bleed and the branding hugs the edges, so
 * nothing lands on the face regardless of how the shot was framed.
 */

const S = CANVAS.pfp.w;
const RING = 26;
const BAND = 148;

export function PfpFrame({ badge, photo }: { badge: Badge; photo: PhotoAsset | null }) {
  const accent = badge.accentHex;
  const bandText = badge.onAccent;
  const subtitle = badge.handle || badge.name || EVENT.location;

  return (
    <div
      className="grain relative overflow-hidden"
      style={{ width: S, height: S, backgroundColor: COLORS.ink }}
    >
      {photo ? (
        <PhotoSlot photo={photo} width="100%" height="100%" />
      ) : (
        <div style={{ width: "100%", height: "100%", backgroundColor: COLORS.paper }}>
          <Backdrop
            variant="pfp"
            width={S}
            height={S}
            accent={accent}
            intensity={1.25}
          />
        </div>
      )}

      {/*
        Depth layer. The frame was the one artboard still sitting on flat
        colour: the ring did the branding and everything inside it was the
        photo. These sit between the photo and the rings, in the corners the
        subject never occupies, so the frame reads as designed without
        crowding the face.
      */}
      <div style={{ position: "absolute", inset: RING + 10, pointerEvents: "none" }}>
        <Backdrop
          variant="pfp"
          width={S - (RING + 10) * 2}
          height={S - (RING + 10) * 2}
          accent={accent}
          intensity={photo ? 0.5 : 1.15}
        />
      </div>

      {/* Corner brackets, the registration language the card uses. */}
      {(
        [
          { top: RING + 18, left: RING + 18, rx: 1, ry: 1 },
          { bottom: BAND + RING + 18, right: RING + 18, rx: -1, ry: -1 },
        ] as const
      ).map((pos, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            position: "absolute",
            ...pos,
            width: 54,
            height: 54,
            borderTop: pos.ry > 0 ? `6px solid ${accent}` : undefined,
            borderLeft: pos.rx > 0 ? `6px solid ${accent}` : undefined,
            borderBottom: pos.ry < 0 ? `6px solid ${accent}` : undefined,
            borderRight: pos.rx < 0 ? `6px solid ${accent}` : undefined,
            opacity: 0.9,
          }}
        />
      ))}

      {/* Palms along the inside foot of the ring, above the band. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: RING + 22,
          bottom: BAND + RING + 8,
          width: 240,
          height: 62,
          opacity: 0.42,
          pointerEvents: "none",
        }}
      >
        <PalmRow className="h-full w-full" color={COLORS.paper} />
      </div>

      {/* Rings */}
      <div style={{ position: "absolute", inset: 0, border: `${RING}px solid ${COLORS.ink}`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: RING, border: `10px solid ${accent}`, pointerEvents: "none" }} />

      {/* Corner blocks */}
      {([{ top: RING, left: RING }, { top: RING, right: RING }] as const).map((position, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            ...position,
            width: 54,
            height: 54,
            backgroundColor: accent,
            border: `6px solid ${COLORS.ink}`,
          }}
        />
      ))}

      {/* Hashtag tab */}
      <div
        style={{
          position: "absolute",
          top: RING + 10,
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: COLORS.paper,
          border: `6px solid ${COLORS.ink}`,
          padding: "6px 20px",
          whiteSpace: "nowrap",
        }}
        className="font-[family-name:var(--font-display)]"
      >
        <span style={{ fontSize: 30, letterSpacing: "-0.01em" }}>{EVENT.hashtag}</span>
      </div>

      {/* Bottom band */}
      <div
        style={{
          position: "absolute",
          left: RING,
          right: RING,
          bottom: RING,
          height: BAND,
          backgroundColor: accent,
          borderTop: `10px solid ${COLORS.ink}`,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 22px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            border: `6px solid ${COLORS.ink}`,
            backgroundColor: COLORS.palmDeep,
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
            flex: "0 0 auto",
          }}
        >
          {/* Organiser mark. The गोवा element moved into the main lockup on
              the band, where the site itself puts it. */}
          <StudioMark height={44} />
        </div>

        <div style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
          {/* Black plate, because the wordmark is yellow and needs a dark ground. */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              backgroundColor: COLORS.ink,
              padding: "8px 14px",
              border: `4px solid ${COLORS.ink}`,
            }}
          >
            <BannerLockup fluidHeight="34px" onDark={false} />
            <span
              className="font-[family-name:var(--font-mono)] font-bold leading-none"
              style={{ fontSize: 32, color: COLORS.paper, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}
            >
              {EVENT.edition}
            </span>
          </div>
          <div
            className="truncate font-[family-name:var(--font-mono)] font-medium"
            style={{
              fontSize: fitText(subtitle, [
                { max: 18, size: 24 },
                { max: 26, size: 20 },
              ]),
              color: bandText,
              marginTop: 8,
              opacity: 0.85,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
          <div
            className="font-[family-name:var(--font-mono)] font-bold tracking-[0.14em]"
            style={{ fontSize: 15, color: bandText, whiteSpace: "nowrap" }}
          >
            {EVENT.dates}
          </div>
          <div
            className="font-[family-name:var(--font-mono)] font-bold"
            style={{
              fontSize: 18,
              marginTop: 6,
              color: COLORS.paper,
              backgroundColor: COLORS.ink,
              padding: "4px 10px",
              letterSpacing: "0.1em",
              display: "inline-block",
              whiteSpace: "nowrap",
            }}
          >
            {badge.passNumber}
          </div>
        </div>
      </div>
    </div>
  );
}
