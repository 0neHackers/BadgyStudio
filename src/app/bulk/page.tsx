import type { Metadata } from "next";
import { EVENT } from "@/lib/brand";
import { MAX_ROWS } from "@/lib/roster";
import { siteOrigin } from "@/lib/site";
import { AppLockup } from "@/components/AppLockup";
import { PanelDecor } from "@/components/PanelDecor";
import { BulkStudio } from "@/components/BulkStudio";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: `Bulk badges · ${EVENT.shortName} ${EVENT.edition}`,
  description: `Issue up to ${MAX_ROWS} ${EVENT.name} badges from a CSV and a folder of photos. Everything runs in the browser.`,
};

export default function BulkPage() {
  return (
    <main className="page">
      <SiteHeader />

      <section className="relative overflow-hidden border-b-[4px] border-ink bg-palm">
        {/* Arcs. Different vocabulary from the footer's strata, on purpose. */}
        <PanelDecor variant="banner" tone="#FFFBE8" accent="#FEE101" opacity={0.75} />
        <div
          className="relative mx-auto grid w-full max-w-[var(--shell-max)] items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
          style={{ paddingInline: "var(--pad-shell)", paddingBlock: "var(--gap-lg)" }}
        >
          <div className="min-w-0">
          <h1
            className="mt-2 font-[family-name:var(--font-chrome)] font-bold leading-[0.86] text-paper"
            style={{ fontSize: "var(--step-4)" }}
          >
            Issue the whole room.
          </h1>
          <p
            className="mt-3 max-w-[58ch] leading-relaxed text-paper/85"
            style={{ fontSize: "var(--step-0)" }}
          >
            Drop in a roster, attach a folder of photos, get every badge back as a zip with a
            manifest of the serials issued. Up to {MAX_ROWS} at a time, and not one byte leaves this
            tab.
          </p>
          </div>
          <AppLockup className="hidden text-right lg:block lg:self-end" />
        </div>
      </section>

      <div style={{ paddingBlock: "var(--gap-md)" }}>
        <BulkStudio origin={siteOrigin()} />
      </div>

      <SiteFooter />
    </main>
  );
}
