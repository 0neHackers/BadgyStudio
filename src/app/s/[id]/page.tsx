/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { list } from "@vercel/blob";
import { CANVAS, EVENT, type FormatKey } from "@/lib/brand";
import { blobConfigured, siteOrigin } from "@/lib/site";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

/**
 * Landing page for a shared card. Its only real job is to carry OG tags that
 * point at the generated PNG, so the X preview shows the card rather than a
 * default thumbnail. Everything visible here is secondary.
 */

export const runtime = "nodejs";
export const revalidate = 3600;

interface ShareRecord {
  id: string;
  serial: string;
  format: FormatKey;
  imageUrl: string;
  name: string;
  title: string;
  team: string;
  createdAt: string;
}

async function readShare(id: string): Promise<ShareRecord | null> {
  if (!blobConfigured() || !/^[0-9A-HJ-NP-Z]{10}-[0-9a-z]+$/.test(id)) return null;

  try {
    const found = await list({ prefix: `shares/${id}.json`, limit: 1 });
    const entry = found.blobs[0];
    if (!entry) return null;

    const response = await fetch(entry.url, { next: { revalidate: 3600 } });
    if (!response.ok) return null;
    return (await response.json()) as ShareRecord;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const record = await readShare(id);
  if (!record) return { title: `${EVENT.shortName} ${EVENT.edition}` };

  const size = CANVAS[record.format] ?? CANVAS.card;
  const who = record.name || "A builder";
  const title = `${who} · ${EVENT.shortName} ${EVENT.edition}`;
  const description = record.title
    ? `${record.title}. Pass ${record.serial}. ${EVENT.datesLong}, ${EVENT.location}.`
    : `Pass ${record.serial}. ${EVENT.datesLong}, ${EVENT.location}.`;

  return {
    metadataBase: new URL(siteOrigin()),
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      url: `${siteOrigin()}/s/${record.id}`,
      images: [{ url: record.imageUrl, width: size.w, height: size.h, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [record.imageUrl],
    },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readShare(id);
  if (!record) notFound();

  return (
    <main className="page">
      <SiteHeader />

      <div
        className="mx-auto w-full max-w-[900px]"
        style={{ paddingInline: "var(--pad-shell)", paddingBlock: "var(--gap-lg)" }}
      >
        <p
          className="font-[family-name:var(--font-mono)] font-bold tracking-[0.22em] text-ink/55"
          style={{ fontSize: "0.77rem" }}
        >
          PASS {record.serial}
        </p>
        <h1
          className="mt-2 font-[family-name:var(--font-chrome)] font-bold leading-[0.9]"
          style={{ fontSize: "var(--step-4)", overflowWrap: "anywhere" }}
        >
          {record.name || "A builder"}
        </h1>
        {record.title ? (
          <p
            className="mt-2 inline-block max-w-full border-[3px] border-ink bg-sun px-3 py-1 font-[family-name:var(--font-display)]"
            style={{ fontSize: "var(--step-1)", overflowWrap: "anywhere" }}
          >
            {record.title}
          </p>
        ) : null}

        <div className="rise-in mt-6 border-[4px] border-ink bg-ink p-2 slab-lg sm:p-3">
          <img
            src={record.imageUrl}
            alt={`${EVENT.shortName} ${EVENT.edition} pass for ${record.name || "a builder"}`}
            className="block w-full"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="press border-[3px] border-ink bg-sun px-5 py-3 font-[family-name:var(--font-display)] slab"
            style={{ fontSize: "var(--step-1)" }}
          >
            Make yours
          </Link>
          <a
            href={record.imageUrl}
            download
            className="press border-[3px] border-ink bg-paper px-5 py-3 font-[family-name:var(--font-display)] slab-sm"
            style={{ fontSize: "var(--step-1)" }}
          >
            Download this one
          </a>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
