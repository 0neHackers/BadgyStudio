/**
 * Pass tiers. Kept short on purpose: a tier is a stripe on a badge, not a job
 * title. Shared by the single studio and the bulk roster so the dropdown cannot
 * drift between them.
 */
export const TIERS = ["RESIDENT", "BUILDER", "SPEAKER", "MENTOR", "CREW", "ALUMNI"] as const;

export type Tier = (typeof TIERS)[number];
