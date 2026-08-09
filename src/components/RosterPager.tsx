"use client";

import { Button } from "@/components/ui/controls";

/**
 * The roster's go-to field.
 *
 * This file used to hold the roster's own pager as well. V06.04 moved both
 * lists onto the shared numbered pager in Pager.tsx, which left the old
 * component and its PAGE_SIZES unreferenced. Deleted rather than kept: a dead
 * copy of a live control is how two versions of the same thing come back, and
 * this file is where that drift started.
 */

/**
 * Jump straight to a person by roster position, serial or name. On a 500-row
 * roster, scrolling to find someone is not a workflow.
 *
 * The serial can be partial, which is what you get from reading a few
 * characters off a card across a desk. The row number is the one thing this
 * field can do that the header search cannot, because the header has no list to
 * count.
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
        <span className="sr-only">Go to row number, serial or name</span>
        <input
          name="goto"
          inputMode="text"
          placeholder={`Go to 1–${total}, a serial or a name`}
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
