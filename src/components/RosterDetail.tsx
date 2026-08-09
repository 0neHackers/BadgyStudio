"use client";

import type { BuilderInput, PhotoAsset } from "@/types";
import type { RosterRow } from "@/lib/roster";
import { TIERS } from "@/lib/tiers";
import { PhotoEditor } from "@/components/PhotoEditor";
import { PhoneField, EmailField } from "@/components/ContactFields";
import { Button, TextField } from "@/components/ui/controls";

/**
 * Everything about one person, in one place.
 *
 * The table only shows five columns because ten will not fit on a laptop, let
 * alone a phone. This is where the rest of the fields live, and it is also the
 * only place a bulk roster can reach the photo editor, which V03.00 left out of
 * the bulk flow entirely.
 */

const FIELDS: { key: keyof BuilderInput; label: string; placeholder: string; max: number; type?: string }[] = [
  { key: "name", label: "Name", placeholder: "Ada Lovelace", max: 34 },
  { key: "username", label: "X handle", placeholder: "@handle", max: 20 },
  { key: "team", label: "Team", placeholder: "Night Shift", max: 26 },
  { key: "role", label: "Stack / role", placeholder: "Rust, infra", max: 28 },
  { key: "project", label: "Building", placeholder: "What they're shipping", max: 30 },
  { key: "dob", label: "Date of birth", placeholder: "", max: 10, type: "date" },
  { key: "phone", label: "Phone", placeholder: "+91 98765 43210", max: 20, type: "tel" },
  { key: "email", label: "Email", placeholder: "you@domain.com", max: 60, type: "email" },
];

export function RosterDetail({
  row,
  index,
  total,
  onPatch,
  onPhoto,
  onPhotoPatch,
  onClearPhoto,
  onClose,
  onStep,
  onJump,
  onGo,
}: {
  row: RosterRow;
  index: number;
  total: number;
  onPatch: (patch: Partial<BuilderInput>) => void;
  onPhoto: (photo: PhotoAsset) => void;
  onPhotoPatch: (patch: Partial<PhotoAsset>) => void;
  onClearPhoto: () => void;
  onClose: () => void;
  onStep: (delta: number) => void;
  /** Jump to an absolute index in the roster. */
  onJump: (index: number) => void;
  /** Optional go-to control, rendered in the editor header. */
  onGo?: React.ReactNode;
}) {
  return (
    <div className="grid gap-[var(--gap-md)]">
      {/* One wrapping row. Done used to sit in a nested flex that did not
          share the row's baseline, so it floated above the spinner. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/*
          Position spinner. Typing 6 here jumps straight to the sixth person,
          which is what "1 / 10" implies but the previous prev/next pair did
          not deliver. The field is uncontrolled between commits so a partial
          entry like "1" on the way to "12" is not snatched back mid-keystroke;
          it commits on Enter or on blur.
        */}
        <div className="flex items-center gap-1.5">
          <Button onClick={() => onStep(-1)} disabled={index === 0} className="!min-h-[36px] !px-2 !py-1">
            ‹
          </Button>
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Go to person number</span>
            <input
              key={index}
              type="number"
              inputMode="numeric"
              min={1}
              max={total}
              defaultValue={index + 1}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  (event.target as HTMLInputElement).blur();
                }
              }}
              onBlur={(event) => {
                const wanted = Number(event.target.value);
                if (!Number.isFinite(wanted)) {
                  event.target.value = String(index + 1);
                  return;
                }
                const clamped = Math.min(total, Math.max(1, Math.round(wanted)));
                event.target.value = String(clamped);
                if (clamped - 1 !== index) onJump(clamped - 1);
              }}
              className="w-14 border-[2px] border-ink bg-paper px-1.5 text-center font-[family-name:var(--font-mono)] font-bold"
              style={{ fontSize: "0.78rem", minHeight: 36 }}
              aria-label={`Person number, 1 to ${total}`}
            />
            <span
              className="font-[family-name:var(--font-mono)] tracking-[0.1em] text-ink/60"
              style={{ fontSize: "0.77rem" }}
            >
              / {total}
            </span>
          </label>
          <Button
            onClick={() => onStep(1)}
            disabled={index === total - 1}
            className="!min-h-[36px] !px-2 !py-1"
          >
            ›
          </Button>
        </div>
        {onGo ? <div className="hidden min-w-0 flex-1 sm:block">{onGo}</div> : null}
        <Button variant="ghost" onClick={onClose} className="!min-h-[36px] shrink-0 !py-1">
          Done
        </Button>
      </div>

      <div>
        <p
          className="mb-2 font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70"
          style={{ fontSize: "var(--step--1)" }}
        >
          PHOTO
        </p>
        <PhotoEditor
          photo={row.photo}
          onPhoto={onPhoto}
          onChange={onPhotoPatch}
          onClear={onClearPhoto}
          aspect={372 / 496}
        />
      </div>

      <div className="grid gap-[var(--gap-sm)] sm:grid-cols-2">
        {/* Phone and email go through the shared components so a number
            corrected here formats exactly as one typed on the single
            generator. See components/ContactFields.tsx. */}
        {FIELDS.map((field) =>
          field.key === "phone" ? (
            <div key={field.key} className="sm:col-span-2">
              <PhoneField value={row.input.phone} onChange={(next) => onPatch({ phone: next })} />
            </div>
          ) : field.key === "email" ? (
            <EmailField key={field.key} value={row.input.email} onChange={(next) => onPatch({ email: next })} />
          ) : (
            <TextField
              key={field.key}
              label={field.label}
              type={field.type}
              value={row.input[field.key]}
              maxLength={field.max}
              placeholder={field.placeholder}
              onChange={(event) => onPatch({ [field.key]: event.target.value })}
            />
          ),
        )}

        <label className="block min-w-0">
          <span
            className="mb-1.5 block font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70"
            style={{ fontSize: "var(--step--1)" }}
          >
            Pass tier
          </span>
          <select
            value={row.input.tier}
            onChange={(event) => onPatch({ tier: event.target.value })}
            className="w-full min-w-0 border-[3px] border-ink bg-paper px-2"
            style={{ fontSize: "var(--step-0)", minHeight: 44 }}
          >
            <option value="">No tier</option>
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
