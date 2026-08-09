"use client";

import type { RosterRow } from "@/lib/roster";
import { isBlocked, rowSerial } from "@/lib/roster";
import { photoStyle } from "@/lib/image";

/**
 * The roster.
 *
 * Two layouts, not one with a horizontal scrollbar. Under 720px each person is
 * a stacked card; above it, a table. A 680px-wide table on a 320px phone is a
 * scrollbar with a table hidden inside it, which is not a layout.
 *
 * Paging is the caller's job. This renders whatever slice it is handed and
 * reports positions using the absolute index, so "row 214" stays row 214 no
 * matter which page it is sitting on.
 */

const COLUMNS = "34px 26px 56px minmax(110px,1.5fr) minmax(84px,1fr) minmax(74px,0.9fr) 90px 36px";

export function RosterTable({
  rows,
  offset,
  focusId,
  checked,
  onFocus,
  onToggle,
  onToggleAll,
  onRemove,
}: {
  /** The visible slice. */
  rows: RosterRow[];
  /** Index of the first visible row within the whole roster. */
  offset: number;
  focusId: string | null;
  checked: Set<string>;
  onFocus: (id: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: (next: boolean) => void;
  onRemove: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="border-[3px] border-dashed border-ink/40 p-5 text-center text-ink/55">
        No one on the roster yet. Upload a CSV or add a person.
      </p>
    );
  }

  const allChecked = rows.every((row) => checked.has(row.id));

  const chips = (row: RosterRow) =>
    row.issues.length > 0 ? (
      <div className="flex flex-wrap gap-1.5 px-2 pb-1.5">
        {row.issues.map((issue) => (
          <span
            key={issue}
            className={`border-[2px] border-ink px-1.5 py-0.5 font-[family-name:var(--font-mono)] ${
              issue.startsWith("!") ? "bg-flag text-paper" : "bg-sun/60 text-ink"
            }`}
            style={{ fontSize: "0.77rem" }}
          >
            {issue.replace(/^!\s*/, "")}
          </span>
        ))}
      </div>
    ) : null;

  const rowTone = (row: RosterRow) =>
    focusId === row.id
      ? "bg-sun/45"
      : checked.has(row.id)
        ? "bg-palm/12"
        : isBlocked(row)
          ? "bg-flag/10"
          : "";

  return (
    <div className="border-[3px] border-ink bg-paper/80">
      {/* ---------- stacked cards, under 720px ---------- */}
      <div className="roster-cards">
        <label className="flex items-center gap-2 border-b-[3px] border-ink bg-ink px-2.5 py-2 text-paper">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => onToggleAll(e.target.checked)}
            className="h-4 w-4 accent-[#FEE101]"
          />
          <span
            className="font-[family-name:var(--font-mono)] font-bold tracking-[0.14em]"
            style={{ fontSize: "0.77rem" }}
          >
            SELECT ALL ON THIS PAGE
          </span>
        </label>

        {rows.map((row, i) => {
          const serial = row.input.name.trim() ? rowSerial(row) : "";
          return (
            <div key={row.id} className={`border-b-[2px] border-ink/15 ${rowTone(row)}`}>
              <div className="flex items-start gap-2.5 p-2.5">
                <input
                  type="checkbox"
                  checked={checked.has(row.id)}
                  onChange={() => onToggle(row.id)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[#FF0080]"
                  aria-label={`Select ${row.input.name || `row ${offset + i + 1}`}`}
                />
                <button
                  type="button"
                  onClick={() => onFocus(row.id)}
                  className="press grid h-14 w-12 shrink-0 place-items-center overflow-hidden border-[2px] border-ink bg-white"
                  aria-label="Edit this person"
                >
                  {row.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.photo.url} alt="" style={photoStyle(row.photo)} />
                  ) : (
                    <span
                      className="font-[family-name:var(--font-mono)] text-ink/40"
                      style={{ fontSize: "0.77rem" }}
                    >
                      NONE
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onFocus(row.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className="font-[family-name:var(--font-mono)] text-ink/45"
                    style={{ fontSize: "0.77rem" }}
                  >
                    #{offset + i + 1}
                  </span>
                  <span
                    className="block truncate font-[family-name:var(--font-display)]"
                    style={{ fontSize: "var(--step-0)" }}
                  >
                    {row.input.name || <span className="text-flag">Needs a name</span>}
                  </span>
                  <span
                    className="block truncate text-ink/60"
                    style={{ fontSize: "0.77rem" }}
                  >
                    {[row.input.team, row.input.tier].filter(Boolean).join(" · ") || "–"}
                  </span>
                  <span
                    className="block truncate font-[family-name:var(--font-mono)] font-bold text-ink/55"
                    style={{ fontSize: "0.77rem" }}
                  >
                    {serial || "–"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onRemove(row.id)}
                  className="tap h-8 w-8 shrink-0 border-[2px] border-ink font-[family-name:var(--font-mono)] font-bold hover:bg-flag hover:text-paper"
                  style={{ fontSize: "0.77rem" }}
                  aria-label={`Remove row ${offset + i + 1}`}
                >
                  ✕
                </button>
              </div>
              {chips(row)}
            </div>
          );
        })}
      </div>

      {/* ---------- table, 720px and up ---------- */}
      <div className="roster-table scroll-x">
        <div style={{ minWidth: 660 }}>
          <div
            className="grid items-center gap-2 border-b-[3px] border-ink bg-ink px-2 py-2 font-[family-name:var(--font-mono)] font-bold tracking-[0.14em] text-paper"
            style={{ gridTemplateColumns: COLUMNS, fontSize: "0.77rem" }}
          >
            <span>#</span>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => onToggleAll(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-[#FEE101]"
              aria-label="Select every visible row"
            />
            <span>PHOTO</span>
            <span>NAME</span>
            <span>TEAM</span>
            <span>TIER</span>
            <span>SERIAL</span>
            <span />
          </div>

          {rows.map((row, i) => {
            const serial = row.input.name.trim() ? rowSerial(row) : "";
            return (
              <div key={row.id}>
                <div
                  className={`grid items-center gap-2 border-b-[2px] border-ink/15 px-2 py-1.5 transition-colors duration-150 ${
                    rowTone(row) || "hover:bg-sun/15"
                  }`}
                  style={{ gridTemplateColumns: COLUMNS }}
                >
                  <button
                    type="button"
                    onClick={() => onFocus(row.id)}
                    className="tap text-left font-[family-name:var(--font-mono)] text-ink/50"
                    style={{ fontSize: "0.77rem" }}
                  >
                    {offset + i + 1}
                  </button>
                  <input
                    type="checkbox"
                    checked={checked.has(row.id)}
                    onChange={() => onToggle(row.id)}
                    className="h-5 w-5 shrink-0 accent-[#FF0080]"
                    aria-label={`Select ${row.input.name || `row ${offset + i + 1}`}`}
                  />
                  <button
                    type="button"
                    onClick={() => onFocus(row.id)}
                    className="press grid h-10 w-12 place-items-center overflow-hidden border-[2px] border-ink bg-white"
                    aria-label="Edit this person"
                  >
                    {row.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.photo.url} alt="" style={photoStyle(row.photo)} />
                    ) : (
                      <span
                        className="font-[family-name:var(--font-mono)] text-ink/40"
                        style={{ fontSize: "0.77rem" }}
                      >
                        NONE
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onFocus(row.id)}
                    className="truncate text-left font-[family-name:var(--font-display)]"
                    style={{ fontSize: "var(--step-0)" }}
                    title={row.input.name}
                  >
                    {row.input.name || <span className="text-flag">Needs a name</span>}
                  </button>
                  <span className="truncate text-ink/70" style={{ fontSize: "0.77rem" }}>
                    {row.input.team || "–"}
                  </span>
                  <span
                    className="truncate font-[family-name:var(--font-mono)] text-ink/70"
                    style={{ fontSize: "0.77rem" }}
                  >
                    {row.input.tier || "–"}
                  </span>
                  <span
                    className="truncate font-[family-name:var(--font-mono)] font-bold text-ink/70"
                    style={{ fontSize: "0.77rem" }}
                    title={serial}
                  >
                    {serial || "–"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    className="tap grid h-8 w-8 place-items-center border-[2px] border-ink font-[family-name:var(--font-mono)] font-bold hover:bg-flag hover:text-paper"
                    style={{ fontSize: "0.77rem" }}
                    aria-label={`Remove row ${offset + i + 1}`}
                  >
                    ✕
                  </button>
                </div>
                {chips(row)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
