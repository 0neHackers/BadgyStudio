import type { Metadata } from "next";
import Link from "next/link";
import { EVENT } from "@/lib/brand";
import { formatSerial, parseSerial } from "@/lib/identifier";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PassCheck } from "@/components/PassCheck";
import { siteOrigin } from "@/lib/site";

/**
 * The address the scannable code points at. It runs the same mod-36 check the
 * card was issued with, so a door scanner gets a yes or no without a database
 * and without any personal data being stored anywhere.
 */

export const metadata: Metadata = {
  title: `Check a pass · ${EVENT.shortName} ${EVENT.edition}`,
  robots: { index: false, follow: false },
};

export default async function VerifyPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial: raw } = await params;
  // Accepts IDX-XXXXXXXXXX, the bare ten characters, and the grouped form a
  // person might copy off a card. Everything downstream works in the body.
  const parsed = parseSerial(decodeURIComponent(raw));
  const { body: serial, format, valid } = parsed;

  return (
    <main className="page">
      <SiteHeader />

      {/* See the note on /passes: the same cascade the generators use. */}
      <div
        className="stagger mx-auto w-full max-w-[960px]"
        style={{ paddingInline: "var(--pad-shell)", paddingBlock: "var(--gap-lg)" }}
      >
        <p
          className="font-[family-name:var(--font-mono)] font-bold tracking-[0.22em] text-ink/55"
          style={{ fontSize: "0.77rem" }}
        >
          PASS CHECK
        </p>

        <p
          className="mt-3 break-all font-[family-name:var(--font-mono)] font-bold tracking-[0.05em]"
          style={{ fontSize: "var(--step-3)" }}
        >
          {valid ? parsed.canonical.replace(serial, formatSerial(serial)) : parsed.canonical.slice(0, 28)}
        </p>

        <div
          className={`rise-in mt-5 border-[4px] border-ink px-5 py-4 slab ${
            valid ? "bg-palm text-paper" : "bg-flag text-paper"
          }`}
        >
          <p className="font-[family-name:var(--font-display)]" style={{ fontSize: "var(--step-2)" }}>
            {valid ? "Well formed" : "Not a valid serial"}
          </p>
          <p className="mt-1 leading-snug" style={{ fontSize: "var(--step-0)" }}>
            {valid
              ? "Ten characters, check character agrees. This is the format issued by the generator."
              : "The check character does not agree with the first nine. Either it was mistyped or it was not issued here."}
          </p>
        </div>

        <p
          className="mt-6 max-w-[62ch] leading-relaxed text-ink/65"
          style={{ fontSize: "var(--step-0)" }}
        >
          The check above is arithmetic on the serial itself, not a lookup. Nothing about the holder
          is stored here, so roll call at the door is still a human with a list.
        </p>

        {valid ? (
          <>
            <p
              className="mt-8 font-[family-name:var(--font-mono)] font-bold tracking-[0.22em] text-ink/55"
              style={{ fontSize: "0.77rem" }}
            >
              RECOVER THE PASS
            </p>
            <p
              className="mt-2 mb-4 max-w-[62ch] leading-relaxed text-ink/65"
              style={{ fontSize: "var(--step-0)" }}
            >
              A serial is a hash of the details it was issued from. Enter them and this page will
              recompute it: if the two agree, it draws the pass here, in your browser, from what you
              typed. That is the only proof a system with no database can offer, and it is the same
              reason nobody else can pull up your card from the serial alone.
            </p>
            <PassCheck serial={serial} format={format} origin={siteOrigin()} />
          </>
        ) : null}

        <Link
          href="/"
          className="press mt-8 inline-block border-[3px] border-ink bg-sun px-5 py-3 font-[family-name:var(--font-display)] slab"
          style={{ fontSize: "var(--step-1)" }}
        >
          Make a pass
        </Link>
      </div>

      <SiteFooter />
    </main>
  );
}
