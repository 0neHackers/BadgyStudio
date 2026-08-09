"use client";

import { Button } from "@/components/ui/controls";

/**
 * Page-size picker and pager for the roster.
 *
 * A 500-person roster rendered in one go is 500 photo thumbnails and 500
 * validation passes on every keystroke elsewhere on the page. Paging keeps the
 * DOM small; the page size options match the sizes an organiser actually thinks
 * in.
 *
 * ALL is offered because someone will want it, with a note about the cost
 * rather than a refusal.
 */

export const PAGE_SIZES = [10, 25, 50, 100, 250, 500] as const;
export type PageSize = (typeof PAGE_SIZES)[number] | "all";

export function RosterPager({
  total,
  pageSize,
  page,
  onPageSize,
  onPage,
}: {
  total: number;
  pageSize: PageSize;
  page: number;
  onPageSize: (next: PageSize) => void;
  onPage: (next: number) => void;
}) {
  const perPage = pageSize === "all" ? total : pageSize;
  const pages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const from = total === 0 ? 0 : page * perPage + 1;
  const to = Math.min(total, (page + 1) * perPage);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label className="flex items-center gap-2">
        <span
          className="font-[family-name:var(--font-mono)] font-bold tracking-[0.14em] text-ink/60"
          style={{ fontSize: "0.77rem" }}
        >
          SHOW
        </span>
        <select
          value={String(pageSize)}
          onChange={(e) => {
            const raw = e.target.value;
            onPageSize(raw === "all" ? "all" : (Number(raw) as PageSize));
            onPage(0);
          }}
          className="border-[2px] border-ink bg-paper px-2"
          style={{ fontSize: "0.77rem", minHeight: 36 }}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          <option value="all">ALL</option>
        </select>
        <span
          className="font-[family-name:var(--font-mono)] text-ink/50"
          style={{ fontSize: "0.77rem" }}
        >
          {from}–{to} of {total}
        </span>
      </label>

      {pages > 1 ? (
        <div className="flex items-center gap-1.5">
          <Button onClick={() => onPage(0)} disabled={page === 0} className="!min-h-[34px] !px-2 !py-1">
            ««
          </Button>
          <Button
            onClick={() => onPage(page - 1)}
            disabled={page === 0}
            className="!min-h-[34px] !px-2 !py-1"
          >
            ‹
          </Button>
          <span
            className="px-1 font-[family-name:var(--font-mono)] font-bold"
            style={{ fontSize: "0.77rem" }}
          >
            {page + 1}/{pages}
          </span>
          <Button
            onClick={() => onPage(page + 1)}
            disabled={page >= pages - 1}
            className="!min-h-[34px] !px-2 !py-1"
          >
            ›
          </Button>
          <Button
            onClick={() => onPage(pages - 1)}
            disabled={page >= pages - 1}
            className="!min-h-[34px] !px-2 !py-1"
          >
            »»
          </Button>
        </div>
      ) : null}

      {pageSize === "all" && total > 250 ? (
        <p className="w-full text-ink/55" style={{ fontSize: "0.77rem" }}>
          Showing all {total} at once. Editing elsewhere on the page will feel slower; paging is
          lighter.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Jump straight to a person by roster position or by serial. On a 500-row
 * roster, scrolling to find someone is not a workflow.
 */
export function RosterGoTo({
  total,
  onGo,
}: {
  total: number;
  onGo: (query: string) => { ok: boolean; message: string };
}) {
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem("goto") as HTMLInputElement | null;
        if (!input) return;
        const result = onGo(input.value);
        input.setCustomValidity("");
        if (result.ok) input.value = "";
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Go to row number or serial</span>
        <input
          name="goto"
          inputMode="text"
          placeholder={`Go to 1–${total} or a serial`}
          className="w-full min-w-0 border-[2px] border-ink bg-paper px-2 uppercase"
          style={{ fontSize: "0.77rem", minHeight: 38 }}
        />
      </label>
      <Button type="submit" className="!min-h-[38px] !py-1">
        Go
      </Button>
    </form>
  );
}
