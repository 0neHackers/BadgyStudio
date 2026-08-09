import type { AccentKey, FormatKey } from "@/lib/brand";

/** How much of a sensitive field ends up on a picture that goes public. */
export type Visibility = "masked" | "full" | "hidden";

export interface BuilderInput {
  name: string;
  username: string;
  team: string;
  role: string;
  dob: string;
  phone: string;
  email: string;
  /** Optional. Printed as a status stripe on the card. */
  tier: string;
  /** Optional. What they are actually building. */
  project: string;
}

export interface FieldVisibility {
  dob: Visibility;
  phone: Visibility;
  email: Visibility;
}

export interface PhotoAsset {
  /** Object URL of the decoded, orientation-corrected, downscaled photo. */
  url: string;
  /**
   * The same bytes the URL points at.
   *
   * Kept alongside so the vault can store a photo without fetching the object
   * URL back or re-encoding it. An object URL dies with the document and a
   * re-encode would lose quality for nothing; the blob is what `loadPhoto`
   * already produced, so this is free.
   */
  blob: Blob;
  width: number;
  height: number;
  /** 0-1 focal point used by the cover crop. Defaults to the upper third. */
  focusX: number;
  focusY: number;
  fileName: string;
  /** 1 = cover fit. Above 1 pushes in for a tighter crop. */
  zoom: number;
  /** Quarter turns, for phones that wrote the wrong EXIF. */
  rotation: 0 | 90 | 180 | 270;
  /** Mirror horizontally. Selfies usually want this. */
  flipped: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  photo: PhotoAsset | null;
}

export interface BadgeState {
  format: FormatKey;
  /** Empty means use the generated class. */
  customTitle: string;
  input: BuilderInput;
  visibility: FieldVisibility;
  accent: AccentKey;
  photo: PhotoAsset | null;
  team: TeamMember[];
  titleOverrideIndex: number;
}

export const DEFAULT_INPUT: BuilderInput = {
  name: "",
  username: "",
  team: "",
  role: "",
  dob: "",
  phone: "",
  email: "",
  tier: "",
  project: "",
};

export const DEFAULT_VISIBILITY: FieldVisibility = {
  dob: "masked",
  phone: "masked",
  email: "masked",
};
