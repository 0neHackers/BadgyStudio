"use client";

import { Button } from "@/components/ui/controls";

/**
 * Page-size picker and numbered pager. Used by the saved-pass list and by the
 * bulk roster.
 *
 * IT WAS ONLY THE VAULT'S, AND THEN THE CONSTRAINT CHANGED
 *
 * When this was written it deliberately did not serve the roster: the roster
 * caps at 500 rows per run, so a 1000 option there would have been an offer the
 * run could not honour, and its old pager reported "3/40" rather than numbering
 * the pages.
 *
 * Both halves of that stopped being true when the same size list and the same
 * numbered pages were asked for on /bulk. Two components drawing the same
 * control from the same list of sizes is drift, so there is one.
 *
 * At the 500-row cap, 1000 and ALL mean the same thing on the roster. That is
 * harmless: the option shows everything, which is exactly what it says.
 */

export const VAULT_PAGE_SIZES = [10, 25, 50, 100, 250, 500, 1000] as const;
export type VaultPageSize = (typeof VAULT_PAGE_SIZES)[number] | "all";

export const DEFAULT_VAULT_PAGE_SIZE: VaultPageSize = 25;

/**
 * Narrows an unknown stored value to a size this control actually offers.
 *
 * The roster persists its page size to IndexedDB, so the value comes back from
 * a previous version of this app rather than from this code. Casting it, which
 * is what the call site used to do, is the same mistake that let `"qr"` reach
 * an encoder expecting `"qrcode"`: a cast asserts rather than checks, and a
 * size that is not in the list would render the picker blank.
 */
export function toVaultPageSize(value: unknown): VaultPageSize {
  if (value === "all") return "all";
  const size = VAULT_PAGE_SIZES.find((option) => option === value);
  return size ?? DEFAULT_VAULT_PAGE_SIZE;
}

/** How many passes a page holds, with "all" resolved against the real total. */
export function perPageFor(size: VaultPageSize, total: number): number {
  return size === "all" ? Math.max(1, total) : size;
}

/** Page count for a size, never less than one so an empty list still has page 1. */
export function pageCountFor(size: VaultPageSize, total: number): number {
  return Math.max(1, Math.ceil(total / perPageFor(size, total)));
}

/**
 * Which page buttons to draw.
 *
 * A thousand passes at ten per page is a hundred pages, and a hundred buttons
 * is not a control. First and last are always reachable, the current page keeps
 * two neighbours either side, and the gaps collapse to an ellipsis. The
 * ellipsis is a gap marker rather than a button: a clickable "…" that jumps an
 * arbitrary distance is a guess dressed as a control.
 */
export function pageWindow(current: number, pages: number, radius = 2): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);

  const items: (number | "gap")[] = [];
  const first = 0;
  const last = pages - 1;
  const from = Math.max(first + 1, current - radius);
  const to = Math.min(last - 1, current + radius);

  items.push(first);
  if (from > first + 1) items.push("gap");
  for (let i = from; i <= to; i += 1) items.push(i);
  if (to < last - 1) items.push("gap");
  items.push(last);

  return items;
}

export function VaultPager({
  total,
  pageSize,
  page,
  onPageSize,
  onPage,
  /**
   * The bottom copy returns you to the head of the list on a page change.
   * Without it, pressing "next" at the bottom of fifty rows leaves you at the
   * bottom of the next fifty, looking at its last entry.
   */
  scrollTargetId,
  idPrefix,
  /** What the size picker counts, for the readout and the ALL warning. */
  noun = "Passes",
}: {
  total: number;
  pageSize: VaultPageSize;
  page: number;
  onPageSize: (next: VaultPageSize) => void;
  onPage: (next: number) => void;
  scrollTargetId?: string;
  idPrefix: string;
  noun?: string;
}) {
  const perPage = perPageFor(pageSize, total);
  const pages = pageCountFor(pageSize, total);
  const from = total === 0 ? 0 : page * perPage + 1;
  const to = Math.min(total, (page + 1) * perPage);

  const go = (next: number) => {
    onPage(Math.min(Math.max(0, next), pages - 1));
    if (!scrollTargetId) return;
    const target = document.getElementById(scrollTargetId);
    if (!target) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  };

  const step = "!min-h-[34px] !px-2 !py-1";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-[3px] border-ink bg-paper px-3 py-2">
      <label className="flex items-center gap-2">
        <span
          className="font-[family-name:var(--font-mono)] font-bold tracking-[0.14em] text-ink/60"
          style={{ fontSize: "0.77rem" }}
        >
          SHOW
        </span>
        <select
          id={`${idPrefix}-page-size`}
          value={String(pageSize)}
          onChange={(event) => {
            const raw = event.target.value;
            onPageSize(toVaultPageSize(raw === "all" ? "all" : Number(raw)));
            // Page 3 of 40 is not page 3 of 4. Going back to the first page is
            // the only answer that means the same thing at every size.
            onPage(0);
          }}
          className="border-[2px] border-ink bg-paper px-2"
          style={{ fontSize: "0.77rem", minHeight: 36 }}
          aria-label={`${noun} per page`}
        >
          {VAULT_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          <option value="all">ALL</option>
        </select>
        <span
          className="font-[family-name:var(--font-mono)] text-ink/55"
          style={{ fontSize: "0.77rem" }}
          data-pager-range
        >
          {from}–{to} of {total}
        </span>
      </label>

      {pages > 1 ? (
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Pages">
          <Button onClick={() => go(0)} disabled={page === 0} className={step} aria-label="First page">
            ««
          </Button>
          <Button
            onClick={() => go(page - 1)}
            disabled={page === 0}
            className={step}
            aria-label="Previous page"
          >
            ‹
          </Button>

          {pageWindow(page, pages).map((item, index) =>
            item === "gap" ? (
              <span
                key={`gap-${index}`}
                aria-hidden="true"
                className="px-0.5 font-[family-name:var(--font-mono)] text-ink/40"
                style={{ fontSize: "0.77rem" }}
              >
                …
              </span>
            ) : (
              <Button
                key={item}
                onClick={() => go(item)}
                variant={item === page ? "primary" : "ghost"}
                className={step}
                aria-label={`Page ${item + 1}`}
                aria-current={item === page ? "page" : undefined}
                data-page-button={item + 1}
              >
                {item + 1}
              </Button>
            ),
          )}

          <Button
            onClick={() => go(page + 1)}
            disabled={page >= pages - 1}
            className={step}
            aria-label="Next page"
          >
            ›
          </Button>
          <Button
            onClick={() => go(pages - 1)}
            disabled={page >= pages - 1}
            className={step}
            aria-label="Last page"
          >
            »»
          </Button>
        </nav>
      ) : null}

      {pageSize === "all" && total > 250 ? (
        <p className="w-full text-ink/55" style={{ fontSize: "0.77rem" }}>
          Showing all {total} at once. Each row draws a thumbnail, so this gets heavy well
          before it gets unusable; paging is lighter.
        </p>
      ) : null}
    </div>
  );
}
