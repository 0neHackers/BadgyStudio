"use client";

import { useMemo } from "react";
import { TextField } from "@/components/ui/controls";
import { DIAL_PLANS, formatPhone, isValidPhone, phoneDigits, phoneHint, planFor, splitDial } from "@/lib/phone";
import { emailHint, isValidEmail } from "@/lib/email";

/**
 * The phone and email inputs, shared by the single generator and the roster
 * editor so the two cannot drift apart.
 *
 * WHY THESE EXIST AS COMPONENTS
 *
 * lib/phone.ts had a correct formatter since V05.00 and nothing ever called it
 * on a keystroke. Both surfaces used a plain TextField, so a number typed by
 * hand kept whatever shape it was typed in and grew to any length. Putting the
 * behaviour in one component is the difference between a rule that exists and
 * a rule that applies.
 */

/* --------------------------------------------------------------- feedback */

function FieldNote({ tone, children }: { tone: "warn" | "ok"; children: React.ReactNode }) {
  return (
    <p
      className={`mt-1 leading-snug ${tone === "warn" ? "text-flag" : "text-palm"}`}
      style={{ fontSize: "0.77rem" }}
      role={tone === "warn" ? "status" : undefined}
    >
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ phone */

export function PhoneField({
  value,
  onChange,
  label = "Phone",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const plan = useMemo(() => planFor(value), [value]);
  const digits = phoneDigits(value);
  const hint = phoneHint(value);
  const complete = isValidPhone(value);

  /**
   * Changing the country rewrites the code and keeps the subscriber digits, so
   * picking the wrong one is a one-click mistake rather than a retype.
   */
  const setCountry = (code: string) => {
    const rest = value.trim() ? splitDial(digits).rest : "";
    onChange(formatPhone(`${code}${rest}`));
  };

  return (
    <div className="min-w-0">
      <div className="grid gap-1.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-end">
        <label className="block min-w-0">
          <span
            className="mb-1 block font-[family-name:var(--font-mono)] tracking-[0.14em] text-ink/60"
            style={{ fontSize: "0.77rem" }}
          >
            COUNTRY
          </span>
          <select
            aria-label="Country calling code"
            value={plan?.code ?? ""}
            onChange={(event) => setCountry(event.target.value)}
            className="w-full min-w-0 border-[3px] border-ink bg-paper focus:bg-white"
            style={{
              paddingInline: "clamp(0.5rem, 0.4rem + 0.3vw, 0.7rem)",
              paddingBlock: "clamp(0.55rem, 0.48rem + 0.3vw, 0.7rem)",
              fontSize: "var(--step--1)",
              minHeight: 44,
            }}
          >
            <option value="">
              {plan ? plan.label : digits ? `+${splitDial(digits).code} (unlisted)` : "Pick a country"}
            </option>
            {DIAL_PLANS.map((option) => (
              <option key={option.iso} value={option.code}>
                {option.label} +{option.code}
              </option>
            ))}
          </select>
        </label>

        <TextField
          label={label}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          placeholder="+91 98765 43210"
          aria-invalid={value.trim().length > 0 && !complete}
          // Formatted on every keystroke, which is also where over-typing is
          // refused: the formatter caps the subscriber part at what the
          // country allows and simply does not return the extra digits.
          onChange={(event) => onChange(formatPhone(event.target.value))}
        />
      </div>

      {hint ? <FieldNote tone="warn">{hint}</FieldNote> : null}
      {!hint && complete && plan ? (
        <FieldNote tone="ok">
          {plan.label}, {plan.lengths.includes(splitDial(digits).rest.length) ? "complete" : "accepted"}.
        </FieldNote>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ email */

export function EmailField({
  value,
  onChange,
  label = "Email",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const hint = emailHint(value);
  const valid = isValidEmail(value);

  return (
    <div className="min-w-0">
      <TextField
        label={label}
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        value={value}
        placeholder="you@domain.com"
        aria-invalid={value.trim().length > 0 && !valid}
        // Trimmed rather than rewritten. An address is not a format anyone
        // wants reflowed under their cursor, so the only edit made here is
        // dropping whitespace, which is never meant.
        onChange={(event) => onChange(event.target.value.replace(/\s/g, ""))}
      />
      {hint ? <FieldNote tone="warn">{hint}</FieldNote> : null}
    </div>
  );
}
