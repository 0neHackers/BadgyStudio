import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

/**
 * The version shown in the footer comes from package.json and nowhere else.
 * "2.0.0" becomes "V02.00": major maps to XX, minor maps to YY, and the patch
 * field is unused because the scheme only has two parts.
 */
function displayVersion(semver: string): string {
  const [major = "0", minor = "0"] = semver.split(".");
  return `V${major.padStart(2, "0")}.${minor.padStart(2, "0")}`;
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
