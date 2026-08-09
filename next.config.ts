import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

/**
 * The version shown in the footer comes from package.json and nowhere else.
 *
 * From V06.04 the interface reads "V6.4-PROD" rather than "V06.04". The two
 * describe the same build and answer different questions: the folder scheme
 * (webapp/V06.04, docs/V06.04) is a sortable archive name, and the padding
 * exists so V05.09 files next to V06.00 in a directory listing. On screen that
 * padding buys nothing, and the -PROD suffix says which of the two dozen
 * folders in this repository is the one that is actually deployed.
 *
 * Deliberately derived rather than typed. A hand-written display string is a
 * second source of truth that drifts the first time somebody bumps
 * package.json and forgets, which is exactly the failure this function existed
 * to prevent.
 *
 *   "6.4.0"  ->  "V6.4-PROD"
 */
function displayVersion(semver: string): string {
  const [major = "0", minor = "0"] = semver.split(".");
  return `V${Number(major)}.${Number(minor)}-PROD`;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: displayVersion(pkg.version),
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        /**
         * Content Security Policy.
         *
         * The app renders user text into SVG through bwip-js and into an
         * artboard that html-to-image serialises, so it is worth being
         * explicit about what may execute even though the audit found nothing
         * exploitable today. This is the belt to that braces.
         *
         * `unsafe-inline` is present for styles and cannot be removed: every
         * artboard is positioned with inline `style` props, which is what
         * makes the export a rasterisation of the preview rather than a
         * second layout. Scripts get no such exception.
         *
         * `data:` and `blob:` are in `img-src` because they are the entire
         * image pipeline: brand marks are inlined as data URLs, backdrops are
         * data-URL SVGs, and photos are object URLs. `https:` is there for the
         * one uploaded share image.
         */
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            /**
             * `unsafe-eval` in development only.
             *
             * React's development build uses `eval()` to rebuild callstacks
             * across environments, which is how a component stack in an error
             * overlay points at your source rather than at the bundle. The
             * V06.00 policy forbade it in both modes, so `npm run dev` logged
             * "eval() is not supported in this environment" on every page load
             * and the overlay lost that ability.
             *
             * Production never needs it, and this is the one directive worth
             * being fussy about: `unsafe-eval` turns any injected string into
             * executable code. So it is switched on the build mode rather than
             * left on for convenience.
             */
            process.env.NODE_ENV === "development"
              ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
              : "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' blob: data:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests",
          ].join("; "),
        },
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        },
      ],
    },
    {
      source: "/fonts/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
  ],
};

export default nextConfig;
