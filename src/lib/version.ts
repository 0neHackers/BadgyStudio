/**
 * Build version, surfaced in the footer.
 *
 * The single source of truth is the `version` field in package.json, which
 * next.config.ts converts to VXX.YY and injects. Bump package.json when you cut
 * a version; nothing else needs touching.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "V00.00";
