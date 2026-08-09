"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { BatchArtboard } from "@/components/BatchArtboard";
import {
  EMPTY_HOST,
  IDLE,
  getHostState,
  getPhase,
  registerMounter,
  setHostRow,
  subscribe,
} from "@/lib/batch-store";
import type { RosterRow } from "@/lib/roster";

/**
 * The render surface a bulk run draws onto, mounted from the root layout.
 *
 * It is here rather than inside the bulk page for one reason: a run has to
 * survive leaving that page. Someone issuing five hundred badges should be
 * able to go and make their own card while it works, and before V05.06
 * navigating away unmounted the artboard mid-run and killed it.
 *
 * Nothing renders at all unless a run is in progress, so every other page pays
 * one store subscription and nothing else for it.
 *
 * The status strip is the other half of that promise. Off the bulk page there
 * is otherwise no sign a run is happening, and progress you cannot see is
 * indistinguishable from a hang.
 */

export function BatchHost() {
  const artboardRef = useRef<HTMLDivElement>(null);

  const host = useSyncExternalStore(subscribe, getHostState, () => EMPTY_HOST);
  const phase = useSyncExternalStore(subscribe, getPhase, () => IDLE);

  /**
   * Commits a row and hands back the node to rasterise.
   *
   * flushSync rather than waiting on animation frames: html-to-image forces
   * layout through getBoundingClientRect, so a commit is all that is required
   * and a paint never was. That mattered enough to measure. Waiting two frames
   * per row cost ~280 ms of a ~1 s row budget, and in a background tab, where
   * no frame ever arrives at all, it cost far more than that.
   */
  const mount = useCallback(async (row: RosterRow) => {
    flushSync(() => setHostRow(row));
    const node = artboardRef.current;
    if (!node) throw new Error("Artboard is not mounted");
    return node;
  }, []);

  useEffect(() => {
    registerMounter(mount);
    return () => registerMounter(null);
  }, [mount]);

  if (!host.request) return null;

  const { request } = host;
  const progress = phase.kind === "running" ? phase.progress : null;

  return (
    <>
      <BatchArtboard
        ref={artboardRef}
        row={host.row}
        format={request.format}
        settings={request.settings}
        codeKind={request.codeKind}
        origin={request.origin}
      />
      {progress ? (
        <div className="batch-strip" role="status" aria-live="polite">
          <span className="batch-strip-dot" aria-hidden="true" />
          <span>
            Rendering {progress.done} of {progress.total}
          </span>
          <span className="batch-strip-rail" aria-hidden="true">
            <span
              className="batch-strip-fill"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
            />
          </span>
        </div>
      ) : null}
    </>
  );
}
