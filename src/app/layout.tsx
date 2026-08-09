import type { Metadata, Viewport } from "next";
import { APP, EVENT } from "@/lib/brand";
import { PRELOAD_FONTS } from "@/lib/fonts";
import { siteOrigin } from "@/lib/site";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Cursor } from "@/components/Cursor";
import { BootScreen } from "@/components/BootScreen";
import { BatchHost } from "@/components/BatchHost";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

const origin = siteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: `${APP.name} · ${APP.tagline}`,
  description: `${APP.tagline}. Upload a photo, get a ${EVENT.name} ${EVENT.edition} builder pass, badge or profile frame. Download it, post it with ${EVENT.hashtag}.`,
  applicationName: APP.name,
  openGraph: {
    type: "website",
    siteName: APP.name,
    title: `${APP.name} · ${APP.tagline}`,
    description: `Make your builder pass in one pass. ${EVENT.datesLong}, ${EVENT.location}.`,
    url: origin,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP.name} · ${APP.tagline}`,
    description: `Make your builder pass in one pass. ${EVENT.hashtag}`,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B6839",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {PRELOAD_FONTS.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
      </head>
      {/* suppressHydrationWarning covers extensions that stamp attributes onto
          <body> before React attaches. It does not mask mismatches in our own
          markup, which stay visible in the console. */}
      <body suppressHydrationWarning>
        {/* All three of these are fixed overlays and must stay outside the
            scaled wrapper. CSS zoom scales the containing block of a fixed
            element, so anything covering the viewport has to sit at zoom 1.
            See .app-scale in globals.css. */}
        <AmbientBackground />
        <Cursor />
        <BootScreen>{children}</BootScreen>
        {/* The bulk render surface. Nothing renders unless a run is going,
            and it is mounted here so a run outlives the page that started it. */}
        <BatchHost />
        {/* Notifications. Outlives every route, because a bulk run started on
            /bulk can finish while somebody is reading /passes. */}
        <Toaster />
      </body>
    </html>
  );
}
