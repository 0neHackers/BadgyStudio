/**
 * Absolute origin for the running deployment. Vercel fills the second and third
 * variables in on its own, so a fresh deploy works without any configuration.
 */
export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  const preview = process.env.VERCEL_URL;
  if (preview) return `https://${preview}`;

  return "http://localhost:3000";
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
