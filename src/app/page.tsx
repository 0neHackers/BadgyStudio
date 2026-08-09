import { EVENT } from "@/lib/brand";
import { siteOrigin } from "@/lib/site";
import { Studio } from "@/components/Studio";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { AppLockup } from "@/components/AppLockup";
import { PanelDecor } from "@/components/PanelDecor";

/**
 * The hero borrows the site's own construction: yellow field, black rules,
 * the headline set in Imbue. Imbue never touches an artboard, only chrome, so
 * the export stays a two-font job.
 */
export default function HomePage() {
  return (
    <main className="page">
      <SiteHeader />

      <section className="relative overflow-hidden border-b-[4px] border-ink bg-palm">
        {/* Arcs. Different vocabulary from the footer's strata, on purpose. */}
        <PanelDecor variant="banner" tone="#FFFBE8" accent="#FEE101" opacity={0.75} />
        <div
          className="relative mx-auto grid w-full max-w-[var(--shell-max)] items-end gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
          style={{ paddingInline: "var(--pad-shell)", paddingBlock: "var(--gap-lg)" }}
        >
          <div className="min-w-0">
            <h1
              className="mt-1 font-[family-name:var(--font-chrome)] font-bold leading-[0.86] tracking-[-0.01em] text-paper"
              style={{ fontSize: "var(--step-4)" }}
            >
              Get your builder pass.
            </h1>
            <p
              className="mt-3 max-w-[54ch] leading-relaxed text-paper/80"
              style={{ fontSize: "var(--step-0)" }}
            >
              Drop in a photo, fill four fields, take the graphic. Works with whatever came off your
              phone, no cropping first. Post it with{" "}
              <span className="font-[family-name:var(--font-mono)] font-bold text-sun">{EVENT.hashtag}</span> to
              land on the radar.
            </p>
          </div>
          <AppLockup className="hidden text-right lg:block lg:self-end" />
        </div>
      </section>

      <div style={{ paddingBlock: "var(--gap-md)" }}>
        <Studio origin={siteOrigin()} />
      </div>

      <SiteFooter />
    </main>
  );
}
