"use client";

import { forwardRef } from "react";
import { CANVAS, type FormatKey } from "@/lib/brand";
import { buildBadge } from "@/lib/badge";
import type { CodeKind } from "@/lib/codes";
import { rowAccent, type RosterRow, type RosterSettings } from "@/lib/roster";
import { DEFAULT_INPUT, type BadgeState } from "@/types";
import { IdCard } from "@/components/IdCard";
import { PfpFrame } from "@/components/PfpFrame";

/**
 * The single artboard a batch run reuses.
 *
 * It sits off-screen rather than behind `display: none`, because a hidden
 * subtree is not laid out and html-to-image would capture nothing. Pushed far
 * to the left with the document clipped, it renders normally and is invisible.
 *
 * `data-serial` is how the batch runner reads back the pass number that was
 * issued without recomputing it and risking a mismatch with what is printed.
 * It carries the prefixed form from V05.09 on, because that is what goes into
 * the filename, the manifest and the local vault.
 */

export interface BatchArtboardProps {
  row: RosterRow | null;
  format: FormatKey;
  settings: RosterSettings;
  codeKind: CodeKind;
  origin: string;
  /** Off-screen for a real run, in-flow when previewing a single row. */
  visible?: boolean;
}

export const BatchArtboard = forwardRef<HTMLDivElement, BatchArtboardProps>(function BatchArtboard(
  { row, format, settings, codeKind, origin, visible = false },
  ref,
) {
  const size = CANVAS[format];

  const state: BadgeState = {
    format,
    customTitle: "",
    input: row?.input ?? DEFAULT_INPUT,
    visibility: settings.visibility,
    accent: row ? rowAccent(row, settings) : "sun",
    photo: row?.photo ?? null,
    team: [],
    titleOverrideIndex: 0,
  };

  const badge = buildBadge(state, {
    fullDetailsInCode: settings.fullDetailsInCode,
    origin,
  });

  return (
    <div
      aria-hidden={!visible}
      style={
        visible
          ? { width: size.w, height: size.h }
          : {
              position: "absolute",
              left: -100000,
              top: 0,
              width: size.w,
              height: size.h,
              pointerEvents: "none",
            }
      }
    >
      <div ref={ref} data-serial={badge.passNumber} style={{ width: size.w, height: size.h }}>
        {format === "pfp" ? (
          <PfpFrame badge={badge} photo={state.photo} />
        ) : (
          <IdCard badge={badge} photo={state.photo} codeKind={codeKind} />
        )}
      </div>
    </div>
  );
});
