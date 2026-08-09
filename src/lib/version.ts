/**
 * Build version, surfaced in the footer.
 *
 * The single source of truth is the `version` field in package.json, which
 * next.config.ts converts and injects. Bump package.json when you cut a
 * version; nothing else needs touching.
 *
 * On screen this reads "V7.0-PROD". The folders stay VXX.YY, because a padded
 * name sorts correctly in a directory listing and this one does not. Only the
 * interface changed.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "V0.0-PROD";
