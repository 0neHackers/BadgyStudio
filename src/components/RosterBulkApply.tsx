"use client";

import { useState } from "react";
import type { BuilderInput } from "@/types";
import { TIERS } from "@/lib/tiers";
import { Button, Segmented } from "@/components/ui/controls";
import type { CodeKind } from "@/lib/codes";

/**
 * Apply one value to many people at once.
 *
 * The common case for an organiser is not editing a hundred rows, it is setting
 * the same team on twelve of them, or stamping SPEAKER on four. Each field has
 * its own Apply button rather than one at the bottom, so a slip in one input
 * cannot overwrite the other three.
 *
 * Clearing is explicit and separate. "Apply" with an empty box does nothing,
 * because silently wiping a field on twenty rows is not a thing anyone meant to
 * do.
 */

type Field = "team" | "role" | "tier" | "project";

const FIELDS: { key: Field; label: string; placeholder: string }[] = [
  { key: "team", label: "Team", placeholder: "Night Shift" },
  { key: "role", label: "Stack / role", placeholder: "Rust, infra" },
  { key: "project", label: "Building", placeholder: "What they're shipping" },
];

export function RosterBulkApply({
  count,
  codeKind,
  onCodeKind,
  onApply,
  onClear,
  onClearSelection,
  onRemoveSelected,
}: {
  count: number;
  onApply: (patch: Partial<BuilderInput>) => void;
  onClear: (field: Field) => void;
  onClearSelection: () => void;
  onRemoveSelected: () => void;
  /**
   * The code type for the run.
   *
   * It is a run-wide setting rather than a per-row one, so it is shown here as
   * well as in Run settings: this panel is where somebody is already working
   * on a set, and making them scroll to another panel to change one thing
   * about that set is the sort of small friction that adds up.
   */
  codeKind: CodeKind;
  onCodeKind: (next: CodeKind) => void;
}) {
  const [values, setValues] = useState<Record<Field, string>>({
    team: "",
    role: "",
    tier: "",
    project: "",
  });

  const set = (key: Field, value: string) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <div className="pop-in border-[3px] border-ink bg-palm/12 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p
          className="font-[family-name:var(--font-mono)] font-bold tracking-[0.16em] text-ink/70"
          style={{ fontSize: "var(--step--1)" }}
        >
          {count} SELECTED
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onClearSelection} className="!min-h-[34px] !py-1">
            Deselect
          </Button>
          <Button variant="danger" onClick={onRemoveSelected} className="!min-h-[34px] !py-1">
            Remove {count}
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <span
          className="mb-1 block font-[family-name:var(--font-mono)] font-bold tracking-[0.14em] text-ink/60"
          style={{ fontSize: "0.77rem" }}
        >
          CODE ON EVERY BADGE
        </span>
        <Segmented
          ariaLabel="Code type for the run"
          value={codeKind}
          options={[
            { value: "datamatrix", label: "Data Matrix", sub: "denser" },
            { value: "qr", label: "QR", sub: "familiar" },
          ]}
          onChange={(next) => onCodeKind(next as CodeKind)}
        />
      </div>

      <div className="grid gap-2">
        {FIELDS.map((field) => (
          <div key={field.key} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1">
              <span
                className="mb-1 block font-[family-name:var(--font-mono)] font-bold tracking-[0.14em] text-ink/60"
                style={{ fontSize: "0.77rem" }}
              >
                {field.label.toUpperCase()}
              </span>
              <input
                value={values[field.key]}
                placeholder={field.placeholder}
                onChange={(e) => set(field.key, e.target.value)}
                className="w-full min-w-0 border-[2px] border-ink bg-paper px-2"
                style={{ fontSize: "0.78rem", minHeight: 38 }}
              />
            </label>
            <Button
              onClick={() => values[field.key].trim() && onApply({ [field.key]: values[field.key] })}
              disabled={!values[field.key].trim()}
              className="!min-h-[38px] !py-1"
            >
              Apply
            </Button>
            <Button
              variant="ghost"
              onClick={() => onClear(field.key)}
              className="!min-h-[38px] !py-1"
              title={`Clear ${field.label} on the selected rows`}
            >
              Clear
            </Button>
          </div>
        ))}

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span
              className="mb-1 block font-[family-name:var(--font-mono)] font-bold tracking-[0.14em] text-ink/60"
              style={{ fontSize: "0.77rem" }}
            >
              PASS TIER
            </span>
            <select
              value={values.tier}
              onChange={(e) => set("tier", e.target.value)}
              className="w-full min-w-0 border-[2px] border-ink bg-paper px-2"
              style={{ fontSize: "0.78rem", minHeight: 38 }}
            >
              <option value="">Choose a tier</option>
              {TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => values.tier && onApply({ tier: values.tier })}
            disabled={!values.tier}
            className="!min-h-[38px] !py-1"
          >
            Apply
          </Button>
          <Button variant="ghost" onClick={() => onClear("tier")} className="!min-h-[38px] !py-1">
            Clear
          </Button>
        </div>
      </div>

      <p className="mt-2 text-ink/55" style={{ fontSize: "0.77rem" }}>
        Apply overwrites the field on every selected row. An empty box does nothing; use Clear to
        blank a field deliberately.
      </p>
    </div>
  );
}
