"use client";

import type { PhotoAsset, TeamMember } from "@/types";
import { Button, TextField } from "@/components/ui/controls";
import { PhotoEditor } from "@/components/PhotoEditor";

const MAX_TEAMMATES = 4;

export function TeamEditor({
  members,
  onChange,
}: {
  members: TeamMember[];
  onChange: (next: TeamMember[]) => void;
}) {
  const update = (id: string, patch: Partial<TeamMember>) =>
    onChange(members.map((member) => (member.id === id ? { ...member, ...patch } : member)));

  const add = () =>
    onChange([...members, { id: `m${Date.now().toString(36)}`, name: "", role: "", photo: null }]);

  const remove = (id: string) => onChange(members.filter((member) => member.id !== id));

  return (
    <div style={{ display: "grid", gap: "var(--gap-sm)" }}>
      <p className="leading-snug text-ink/65" style={{ fontSize: "var(--step--1)" }}>
        You are the first tile. Add up to {MAX_TEAMMATES} more and everyone lands in one graphic.
      </p>

      {members.map((member, index) => (
        <div key={member.id} className="pop-in min-w-0 border-[3px] border-ink bg-paper p-3 slab-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className="truncate font-[family-name:var(--font-mono)] font-bold tracking-[0.16em] text-ink/60"
              style={{ fontSize: "0.77rem" }}
            >
              TEAMMATE {index + 2}
            </span>
            <button
              type="button"
              onClick={() => remove(member.id)}
              className="tap min-h-[32px] shrink-0 border-[2px] border-ink px-2.5 py-1 font-[family-name:var(--font-mono)] font-bold transition-colors duration-150 hover:bg-flag hover:text-paper"
              style={{ fontSize: "0.77rem" }}
            >
              REMOVE
            </button>
          </div>

          <div className="grid min-w-0 gap-[var(--gap-sm)] sm:grid-cols-2">
            <TextField
              label="Name"
              value={member.name}
              maxLength={28}
              placeholder="Teammate"
              onChange={(event) => update(member.id, { name: event.target.value })}
            />
            <TextField
              label="Stack / role"
              value={member.role}
              maxLength={28}
              placeholder="Backend"
              onChange={(event) => update(member.id, { role: event.target.value })}
            />
          </div>

          <div className="mt-3">
            <PhotoEditor
              compact
              aspect={320 / 296}
              photo={member.photo}
              onPhoto={(photo: PhotoAsset) => update(member.id, { photo })}
              onChange={(patch) =>
                member.photo && update(member.id, { photo: { ...member.photo, ...patch } })
              }
              onClear={() => update(member.id, { photo: null })}
            />
          </div>
        </div>
      ))}

      {members.length < MAX_TEAMMATES ? (
        <Button onClick={add} className="w-full">
          Add a teammate
        </Button>
      ) : (
        <p
          className="font-[family-name:var(--font-mono)] tracking-[0.12em] text-ink/45"
          style={{ fontSize: "0.77rem" }}
        >
          FIVE TILES IS THE LIMIT
        </p>
      )}
    </div>
  );
}
