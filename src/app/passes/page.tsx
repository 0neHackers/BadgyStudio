import type { Metadata } from "next";
import { EVENT } from "@/lib/brand";
import { siteOrigin } from "@/lib/site";
import { PassVault } from "@/components/PassVault";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

/**
 * Passes saved in this browser.
 *
 * `noindex` because the page is about the visitor's own machine and there is
 * nothing here for a crawler. Everything on it is rendered client-side from
 * IndexedDB; the server has no idea what any of these are, which is the point.
 */

export const metadata: Metadata = {
  title: `Saved passes · ${EVENT.shortName} ${EVENT.edition}`,
  description: "Passes issued on this device. Stored locally, never uploaded.",
  robots: { index: false, follow: false },
};

export default function PassesPage() {
  return (
    <main className="page">
      <SiteHeader />

      {/* `stagger` cascades the direct children in, the same way the two
          generators do. Without it these pages appeared fully formed the
          instant the boot screen lifted, which read as a different app. */}
      <div
        className="stagger mx-auto w-full max-w-[960px]"
        style={{ paddingInline: "var(--pad-shell)", paddingBlock: "var(--gap-lg)" }}
      >
        <p
          className="font-[family-name:var(--font-mono)] font-bold tracking-[0.22em] text-ink/55"
          style={{ fontSize: "0.77rem" }}
        >
          SAVED PASSES
        </p>
        <h1
          className="mt-2 font-[family-name:var(--font-chrome)] leading-[0.9]"
          style={{ fontSize: "var(--step-3)" }}
        >
          Everything this browser has issued.
        </h1>
        <p
          className="mt-3 mb-6 max-w-[64ch] leading-relaxed text-ink/65"
          style={{ fontSize: "var(--step-0)" }}
        >
          Each pass is kept as the details it was built from, about a kilobyte, so a
          five-hundred-person run costs less than a megabyte and re-draws on demand at either
          resolution. Taking a PNG out asks the same question the pass check does.
        </p>

        <PassVault origin={siteOrigin()} />
      </div>

      <SiteFooter />
    </main>
  );
}
