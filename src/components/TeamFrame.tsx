"use client";

import { CANVAS, COLORS, EVENT } from "@/lib/brand";
import { PhotoSlot } from "@/components/PhotoSlot";
import { fitText } from "@/lib/fit";
import type { Badge } from "@/lib/badge";
import type { PhotoAsset, TeamMember } from "@/types";
import { DataCode } from "@/components/CodeBlock";
import { GoaSticker, HouseWordmark, OrganiserMark } from "@/components/Marks";
import { Backdrop } from "@/components/Backdrop";
import type { CodeKind } from "@/lib/codes";

/**
 * The combined team frame the task page asks for: everybody in one graphic.
 * 1600 x 900 so it lands on X as a full-width card instead of a cropped square.
 * Tiles are equal width and the row handles two people up to five.
 */

const W = CANVAS.team.w;
const H = CANVAS.team.h;

interface Entry {
  key: string;
  name: string;
  role: string;
  photo: PhotoAsset | null;
}

function Tile({ entry, accent, width }: { entry: Entry; accent: string; width: number }) {
  const name = entry.name || "Teammate";
  const role = entry.role || "BUILDER";

  return (
    <div
      style={{
        width,
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        border: `7px solid ${COLORS.ink}`,
        backgroundColor: COLORS.paper,
        boxShadow: `9px 9px 0 0 ${COLORS.ink}`,
        overflow: "hidden",
      }}
    >
      {/* PhotoSlot clips. Without it a zoomed photo escaped up over the name
          band and out of the tile, in the preview and in the export. */}
      <PhotoSlot
        photo={entry.photo}
        height={296}
        style={{ backgroundColor: COLORS.ink }}
        fallback={
          <div className="hatch" style={{ width: "100%", height: "100%", backgroundColor: COLORS.paper }} />
        }
      />

      <div
        style={{
          borderTop: `7px solid ${COLORS.ink}`,
          padding: "14px 15px 16px",
          backgroundColor: accent,
          minHeight: 122,
          overflow: "hidden",
        }}
      >
        <div
          className="font-[family-name:var(--font-display)]"
          style={{
            fontSize: fitText(name, [
              { max: 11, size: 38 },
              { max: 16, size: 31 },
              { max: 22, size: 25 },
            ]),
            lineHeight: 1.04,
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
          style={{ fontSize: 17, marginTop: 8, opacity: 0.8 }}
        >
          {role}
        </div>
      </div>
    </div>
  );
}

export function TeamFrame({
  badge,
  photo,
  members,
  codeKind,
}: {
  badge: Badge;
  photo: PhotoAsset | null;
  members: TeamMember[];
  codeKind: CodeKind;
}) {
  const accent = badge.accentHex;
  const headerText = badge.onAccent;

  const entries: Entry[] = [
    { key: "owner", name: badge.name || "You", role: badge.role || badge.title, photo },
    ...members.map((member) => ({
      key: member.id,
      name: member.name,
      role: member.role,
      photo: member.photo,
    })),
  ].slice(0, 5);

  const gap = 24;
  const available = W - 52 * 2 - gap * (entries.length - 1);
  const tileWidth = Math.min(320, Math.floor(available / entries.length));
  const teamName = badge.team || "SOLO RUN";

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
      <Backdrop
        variant="team"
        width={W - 24}
        height={H - 24}
        accent={accent}
        intensity={1.05}
      />

      <div
        style={{
          position: "relative",
          height: 128,
          backgroundColor: accent,
          borderBottom: `8px solid ${COLORS.ink}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: "0 36px",
          flex: "0 0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, flex: "0 0 auto" }}>
          <div
            style={{
              width: 68,
              height: 68,
              border: `5px solid ${COLORS.ink}`,
              backgroundColor: COLORS.palm,
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            <GoaSticker size={56} />
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              backgroundColor: COLORS.ink,
              padding: "10px 18px",
              border: `5px solid ${COLORS.ink}`,
              boxShadow: `6px 6px 0 0 ${COLORS.palm}`,
            }}
          >
            <HouseWordmark height={44} />
            <span
              className="font-[family-name:var(--font-mono)] font-bold leading-none"
              style={{ fontSize: 38, color: COLORS.paper, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}
            >
              {EVENT.edition}
            </span>
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 0, overflow: "hidden" }}>
          <div
            className="font-[family-name:var(--font-mono)] font-bold tracking-[0.2em]"
            style={{ fontSize: 16, color: headerText, opacity: 0.8, whiteSpace: "nowrap" }}
          >
            {EVENT.location} · {EVENT.dates}
          </div>
          <div
            className="truncate font-[family-name:var(--font-display)]"
            style={{
              fontSize: fitText(teamName, [
                { max: 14, size: 38 },
                { max: 22, size: 30 },
              ]),
              color: headerText,
              marginTop: 4,
            }}
          >
            {teamName}
          </div>
        </div>
      </div>

      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap,
          padding: "0 52px",
          minHeight: 0,
          position: "relative",
        }}
      >
        {entries.map((entry) => (
          <Tile key={entry.key} entry={entry} accent={accent} width={tileWidth} />
        ))}
      </div>

      <div
        style={{
          height: 118,
          borderTop: `8px solid ${COLORS.ink}`,
          backgroundColor: COLORS.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          gap: 24,
          flex: "0 0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
          <div
            style={{
              width: 82,
              height: 82,
              backgroundColor: COLORS.white,
              padding: 7,
              flex: "0 0 auto",
            }}
          >
            <DataCode value={badge.payload} kind={codeKind} className="h-full w-full" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              className="font-[family-name:var(--font-mono)] font-bold tracking-[0.2em]"
              style={{ fontSize: 15, color: COLORS.paper, opacity: 0.55, whiteSpace: "nowrap" }}
            >
              TEAM LEAD PASS
            </div>
            <div
              className="font-[family-name:var(--font-mono)] font-bold"
              style={{
                fontSize: 30,
                color: COLORS.paper,
                letterSpacing: "0.08em",
                marginTop: 2,
                whiteSpace: "nowrap",
              }}
            >
              {badge.serialPretty}
            </div>
          </div>
        </div>

        <OrganiserMark height={44} />

        <div
          className="font-[family-name:var(--font-display)]"
          style={{
            fontSize: 32,
            color: COLORS.ink,
            backgroundColor: accent,
            padding: "8px 18px",
            border: `4px solid ${COLORS.paper}`,
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
