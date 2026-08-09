"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/**
 * Every control here is sized in clamp() rather than fixed pixels, so the UI
 * stretches continuously from a 320px phone to a wide desktop instead of
 * jumping at breakpoints. Touch targets never drop below 44px.
 *
 * Motion comes from the .press / .lift / .tap classes in globals.css. They
 * overshoot by a few percent on a spring curve and settle inside 200ms, which
 * reads as responsiveness rather than decoration, and they all collapse to
 * nothing under prefers-reduced-motion.
 */

const BASE_BUTTON = [
  "press sheen inline-flex items-center justify-center gap-2",
  "border-[3px] border-ink font-[family-name:var(--font-display)]",
  "min-h-[44px] leading-none",
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-x-0 disabled:hover:translate-y-0",
].join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-palm text-paper slab hover:bg-palm-light",
  secondary: "bg-paper text-ink slab-sm hover:bg-palm/12",
  ghost: "bg-transparent text-ink border-dashed hover:bg-palm/8",
  danger: "bg-flag text-paper slab-sm hover:bg-[#ff1a2e]",
};

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`${BASE_BUTTON} ${VARIANTS[variant]} ${className}`}
      style={{
        paddingInline: "clamp(0.75rem, 0.6rem + 0.7vw, 1.15rem)",
        paddingBlock: "clamp(0.5rem, 0.42rem + 0.35vw, 0.7rem)",
        fontSize: "var(--step-0)",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2">
      <span
        className="font-[family-name:var(--font-mono)] font-bold tracking-[0.18em] text-ink/70"
        style={{ fontSize: "var(--step--1)" }}
      >
        {children}
      </span>
      {hint ? (
        <span className="shrink-0 text-ink/45" style={{ fontSize: "var(--step--1)" }}>
          {hint}
        </span>
      ) : null}
    </span>
  );
}

export function TextField({
  label,
  hint,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <Label hint={hint}>{label}</Label>
      <input
        className="w-full min-w-0 border-[3px] border-ink bg-paper placeholder:text-ink/30 focus:bg-white"
        style={{
          paddingInline: "clamp(0.6rem, 0.5rem + 0.4vw, 0.85rem)",
          paddingBlock: "clamp(0.55rem, 0.48rem + 0.3vw, 0.7rem)",
          fontSize: "var(--step-0)",
          minHeight: "calc(44px / var(--app-zoom))",
        }}
        {...rest}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; sub?: string }[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid border-[3px] border-ink bg-paper slab-sm"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`tap min-h-[46px] px-1.5 py-2 text-center transition-colors duration-150 ${
              index > 0 ? "border-l-[3px] border-ink" : ""
            } ${active ? "bg-palm text-paper" : "bg-paper text-ink hover:bg-palm/12"}`}
          >
            <span
              className="block truncate font-[family-name:var(--font-display)] leading-tight"
              style={{ fontSize: "var(--step-0)" }}
            >
              {option.label}
            </span>
            {option.sub ? (
              <span
                className="mt-0.5 block truncate font-[family-name:var(--font-mono)] tracking-[0.1em] opacity-60"
                style={{ fontSize: "0.77rem" }}
              >
                {option.sub}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function VisibilityPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "masked" | "full" | "hidden";
  onChange: (next: "masked" | "full" | "hidden") => void;
}) {
  const options: { value: "masked" | "full" | "hidden"; label: string }[] = [
    { value: "masked", label: "PARTIAL" },
    { value: "full", label: "FULL" },
    { value: "hidden", label: "OFF" },
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <div className="flex shrink-0 border-[2px] border-ink">
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`tap min-h-[34px] px-2.5 font-[family-name:var(--font-mono)] font-bold tracking-[0.08em] transition-colors duration-150 ${
              index > 0 ? "border-l-[2px] border-ink" : ""
            } ${value === option.value ? "bg-palm text-paper" : "bg-paper text-ink/65 hover:bg-palm/12"}`}
            style={{ fontSize: "0.77rem" }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Panel({
  title,
  step,
  children,
  action,
}: {
  title: string;
  step: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="lift frost border-[3px] border-ink slab">
      <header className="flex items-center justify-between gap-3 border-b-[3px] border-ink bg-palm px-3 py-2 sm:px-4 sm:py-2.5">
        <h2 className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid shrink-0 place-items-center bg-sun font-[family-name:var(--font-mono)] font-bold text-ink"
            style={{ width: 24, height: 24, fontSize: "0.77rem" }}
          >
            {step}
          </span>
          <span
            className="truncate font-[family-name:var(--font-display)] text-paper"
            style={{ fontSize: "var(--step-1)" }}
          >
            {title}
          </span>
        </h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div style={{ padding: "var(--gap-md)" }}>{children}</div>
    </section>
  );
}
