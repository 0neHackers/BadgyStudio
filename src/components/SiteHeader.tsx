"use client";

/* eslint-disable @next/next/no-img-element */
// next/image would add a loader and a layout wrapper around a 14px-tall
// decorative mark that is already a vector. The rest of the brand marks are
// plain <img> for the same reason.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP, EVENT } from "@/lib/brand";
import { APP_VERSION } from "@/lib/version";
import { BannerLockup, StudioMark } from "@/components/Lockups";
import { OneHackersMark, XMark } from "@/components/BrandMarks";
import { PanelDecor } from "@/components/PanelDecor";
import { SerialSearch } from "@/components/SerialSearch";

/**
 * One height for every control in the header row.
 *
 * The audit sizes touch targets to 44px on a coarse pointer, so this is the
 * fine-pointer height and the media query lifts it where it matters. Setting
 * it once means the row cannot drift when a label changes length.
 */
const HEADER_CONTROL_H = 38;

/**
 * The two generators, named once.
 *
 * `long` is what a single button says when it has the row to itself. `short`
 * is what each says when both are shown side by side, where the full pair
 * would not fit a 320px header. Two lengths for one destination is a
 * deliberate contextual choice rather than drift, which is why they live in
 * one object: a rename touches one line and both surfaces follow.
 */
const GENERATORS = {
  single: { href: "/", short: "Individual", long: "Individual generator" },
  bulk: { href: "/bulk", short: "Bulk", long: "Bulk generator" },
} as const;

export function SiteHeader() {
  const pathname = usePathname();
  const onBulk = pathname?.startsWith("/bulk") ?? false;
  // The generator is the main page, so a back arrow on it would point at
  // itself. Everywhere else gets one.
  const atHome = pathname === "/";

  /**
   * Which generator links the header carries, and in what shape.
   *
   * On a generator page there is one sensible destination, so it is a single
   * emphasised CTA that swaps by route: offering "Bulk generator" while
   * already on /bulk is a dead link.
   *
   * On /passes and /v there is no current generator, so both are offered.
   * V06.02 removed the CTA from these two routes on the reasoning that the
   * back arrow covered the way out. It does not: the arrow only reaches the
   * single generator, so getting to bulk from a pass check was two clicks
   * through a page you did not want. Two links is the fix.
   */
  const onGenerator = pathname === "/" || onBulk;
  const cta = onBulk ? GENERATORS.single : GENERATORS.bulk;

  /**
   * Saved is everywhere except the page it opens.
   *
   * Same rule as the generator CTA: a link to the page you are already on is a
   * dead control, and the header is tight enough that a dead control is worth
   * removing rather than styling as current.
   */
  const onPasses = pathname?.startsWith("/passes") ?? false;

  return (
    <header className="sticky top-0 z-30 border-b-[4px] border-ink bg-ink/95 backdrop-blur-md">
      <div
        className="mx-auto flex w-full max-w-[var(--shell-max)] flex-wrap items-center justify-between gap-3"
        style={{ paddingInline: "var(--pad-shell)", paddingBlock: "clamp(0.45rem, 0.35rem + 0.5vw, 0.75rem)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {/* Back to the generator. A real link rather than history.back(),
              because arriving from a scanned code or a shared URL means there
              is no history to go back to, and an arrow that sometimes leaves
              the site is worse than one that always goes to the same place. */}
          {atHome ? null : (
            <Link
              href="/"
              aria-label="Back to the generator"
              title="Back to the generator"
              className="press inline-flex shrink-0 items-center justify-center border-[3px] border-paper/30 bg-ink text-paper hover:border-sun hover:text-sun"
              style={{ width: 38, height: 38 }}
              suppressHydrationWarning
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none">
                <path
                  d="M15 5l-7 7 7 7"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="square"
                />
              </svg>
            </Link>
          )}

          {/* The event banner: wordmark with the गोवा sticker straddling it. */}
          <Link href="/" className="press flex min-w-0 items-center gap-3" aria-label={`${EVENT.name} home`}>
            <BannerLockup fluidHeight="clamp(26px, 5.4vw, 46px)" onDark={false} />
            <span
              className="font-[family-name:var(--font-mono)] font-bold leading-none text-sun"
              style={{ fontSize: "clamp(0.85rem, 2.6vw, var(--step-1))", letterSpacing: "-0.02em" }}
            >
              {EVENT.edition}
            </span>
          </Link>
        </div>

        {/* Serial search. On every page, because the reason to look a pass up
            is rarely the page you happen to be on. Its own row below ~640px so
            it never squeezes the lockup. */}
        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-[320px]">
          <SerialSearch />
        </div>

        {/* Order: Saved, generator links, organiser, event site. Every item is
            HEADER_CONTROL_H tall so the row is level by construction rather
            than by three sets of padding happening to agree. */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {onPasses ? null : (
            <Link
              href="/passes"
              className="press inline-flex items-center border-[3px] border-paper/30 px-2.5 font-[family-name:var(--font-display)] text-paper hover:border-sun hover:text-sun"
              style={{ fontSize: "var(--step-0)", height: HEADER_CONTROL_H }}
              title="Passes saved in this browser"
              suppressHydrationWarning
            >
              Saved
            </Link>
          )}

          {onGenerator ? (
            <Link
              key={cta.href}
              href={cta.href}
              className="press pop-in inline-flex items-center border-[3px] border-ink bg-sun px-3 font-[family-name:var(--font-display)] text-ink"
              style={{ fontSize: "var(--step-0)", height: HEADER_CONTROL_H }}
              suppressHydrationWarning
            >
              {cta.long}
            </Link>
          ) : (
            /* Both generators, outlined rather than filled. The single CTA is
               filled because on a generator page it is the one action worth
               emphasising. Here they are two peers among navigation, and a
               third and fourth yellow block beside hhgoa.com would shout
               without saying which one to press. */
            [GENERATORS.single, GENERATORS.bulk].map((generator) => (
              <Link
                key={generator.href}
                href={generator.href}
                title={generator.long}
                className="press pop-in inline-flex items-center border-[3px] border-paper/30 px-2.5 font-[family-name:var(--font-display)] text-paper hover:border-sun hover:text-sun"
                style={{ fontSize: "var(--step-0)", height: HEADER_CONTROL_H }}
                suppressHydrationWarning
              >
                {generator.short}
              </Link>
            ))
          )}

          <a
            href="https://x.com/247pmstudio"
            target="_blank"
            rel="noreferrer noopener"
            className="press hidden items-center gap-2 border-[3px] border-paper/30 px-2 md:inline-flex"
            style={{ height: HEADER_CONTROL_H }}
            suppressHydrationWarning
            title={EVENT.organiser}
          >
            <StudioMark height={20} />
          </a>

          {/* Dropped below 380px. With the search, Saved and the generator CTA,
              the cluster no longer fits on the narrowest phones, and this is
              the only item of the four that also appears in the footer. */}
          <a
            href={EVENT.siteUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="press hidden items-center border-[3px] border-ink bg-sun px-3 font-[family-name:var(--font-display)] text-ink min-[380px]:inline-flex"
            style={{ fontSize: "var(--step-0)", height: HEADER_CONTROL_H }}
            suppressHydrationWarning
          >
            {EVENT.site}
          </a>
        </div>
      </div>
    </header>
  );
}

/**
 * The credits row.
 *
 * Every item is a bordered box of exactly CREDIT_H, so equality is structural
 * rather than something that happens to come out right. Levelling by font
 * metrics alone kept drifting, because an inline SVG, a wordmark and mono text
 * do not share a cap height.
 */
const CREDIT_SIZE = "0.72rem";
const CREDIT_MARK = 12;
/** Every credit box is exactly this tall, so the row cannot drift. */
const CREDIT_H = 26;

export function SiteFooter() {
  return (
    <footer className="relative mt-10 overflow-hidden border-t-[4px] border-ink bg-palm-deep">
      {/* Strata. Different vocabulary from the banner's arcs, on purpose. */}
      <PanelDecor variant="footer" tone="#FFFBE8" accent="#FEE101" opacity={0.5} />
      {/* Ticker, the one piece of chrome motion that is not hover-driven. */}
      <div className="relative overflow-hidden border-b-[2px] border-paper/15 py-1.5">
        <div
          className="ticker font-[family-name:var(--font-mono)] tracking-[0.2em] text-paper/40"
          style={{ fontSize: "0.77rem" }}
        >
          {Array.from({ length: 2 }, (_, i) => (
            <span key={i} className="ticker-run">
              {`${EVENT.location} · ${EVENT.coords} · ${EVENT.dates} · ${EVENT.tagline.toUpperCase()} · ${EVENT.hashtag.toUpperCase()} · `.repeat(
                3,
              )}
            </span>
          ))}
        </div>
      </div>

      <div
        className="relative mx-auto flex w-full max-w-[var(--shell-max)] flex-col gap-4 text-paper/70 lg:flex-row lg:items-center lg:justify-between"
        style={{ paddingInline: "var(--pad-shell)", paddingBlock: "var(--gap-md)", ["--credit-h" as string]: `${CREDIT_H}px`, ["--credit-size" as string]: CREDIT_SIZE }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={EVENT.siteUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="press inline-flex items-center gap-2"
            title={EVENT.organiser}
            suppressHydrationWarning
          >
            <StudioMark height={30} />
          </a>
          <p
            className="font-[family-name:var(--font-mono)] tracking-[0.12em]"
            style={{ fontSize: "0.77rem" }}
          >
            BUILT FOR {EVENT.shortName} {EVENT.edition}
          </p>
        </div>

        {/*
          Credits row.

          Every item is sized from one constant and the row is a flex with
          `items-center`, so the wordmark, the logo, the handle and the version
          share a cap height and a baseline. The logo previously ran at 17px
          against 0.95rem text, which put it visibly out of step; it is now
          derived from the same number.

          currentColor on the inlined marks means the whole row takes one
          colour from the parent rather than each piece carrying its own.
        */}
        <div className="flex flex-wrap items-center gap-2 text-sun">
          {/* Name and version in one box. Each keeps its own face: the name in
              the display face it is set in everywhere else, the version in mono
              because that is what every serial and figure in this app uses. */}
          <span className="credit-box gap-1.5">
            <span className="font-[family-name:var(--font-display)]">{APP.name}</span>
            <span className="font-[family-name:var(--font-mono)] font-bold tracking-[0.1em]">
              {APP_VERSION}
            </span>
          </span>

          <a
            href={APP.repoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="press credit-box"
            title={`${APP.author} on GitHub`}
            suppressHydrationWarning
          >
            <OneHackersMark height={CREDIT_MARK} />
          </a>

          <a
            href={APP.authorUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="press credit-box gap-1.5 hover:opacity-80"
            title={`${APP.handle} on X`}
            suppressHydrationWarning
          >
            <XMark size={CREDIT_MARK} />
            <span className="font-[family-name:var(--font-mono)] tracking-[0.06em]">
              {APP.handle}
            </span>
          </a>

        </div>
      </div>

      {/* Build credit, centred at the foot. */}
      <div className="relative flex justify-center border-t-[2px] border-paper/12 py-2.5">
        {/* Supplied artwork, served from /public rather than inlined: it is
            6241 units wide and carries its own colours, so there is nothing to
            recolour and no reason to put 18 KB of path data in the bundle. */}
        <img
          src="/brand/madeby0nehackers.svg"
          alt="made by 0neHackers"
          title="made by 0neHackers"
          style={{ height: 14, width: "auto", display: "block", opacity: 0.75 }}
        />
      </div>
    </footer>
  );
}
