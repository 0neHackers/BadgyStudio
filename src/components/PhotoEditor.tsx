/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useRef, useState } from "react";
import { ACCEPTED_TYPES, PhotoError, loadPhoto, photoStyle } from "@/lib/image";
import { makeDemoPhoto } from "@/lib/demo";
import type { PhotoAsset } from "@/types";
import { Button } from "@/components/ui/controls";

/**
 * Photo intake and framing.
 *
 * V02.00 only offered click-to-set-focal-point. That handles an off-centre
 * subject but not a shot that is too wide, upside down, or a mirrored selfie.
 * This adds zoom, quarter turns and a flip, and lets the focal point be dragged
 * rather than clicked, which is what it always wanted to be.
 *
 * The preview here is the same slot geometry the artboard uses, so what is
 * framed is what gets printed.
 */

interface PhotoEditorProps {
  photo: PhotoAsset | null;
  onPhoto: (photo: PhotoAsset) => void;
  onChange: (patch: Partial<PhotoAsset>) => void;
  onClear?: () => void;
  /** Aspect ratio of the destination slot, width / height. */
  aspect?: number;
  compact?: boolean;
}

export function PhotoEditor({
  photo,
  onPhoto,
  onChange,
  onClear,
  aspect = 372 / 496,
  compact = false,
}: PhotoEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const accept = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        onPhoto(await loadPhoto(file));
      } catch (cause) {
        setError(cause instanceof PhotoError ? cause.message : "Could not read that file.");
      } finally {
        setBusy(false);
      }
    },
    [onPhoto],
  );

  const useDemo = async () => {
    setBusy(true);
    try {
      onPhoto(await makeDemoPhoto());
    } finally {
      setBusy(false);
    }
  };

  /** Pointer position to focal point, clamped. Used by both click and drag. */
  const setFocusFromPointer = (clientX: number, clientY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    onChange({
      focusX: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      focusY: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    });
  };

  if (!photo) {
    return (
      <div className="min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          onChange={(e) => {
            void accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void accept(e.dataTransfer.files?.[0]);
          }}
          className={`border-[3px] border-dashed text-center transition-all duration-200 ${
            over ? "scale-[1.015] border-neon bg-sun/30" : "border-ink/40 bg-paper"
          }`}
          style={{ padding: "var(--gap-md)" }}
        >
          <p className="font-[family-name:var(--font-display)]" style={{ fontSize: "var(--step-1)" }}>
            {busy ? "Reading the file" : "Drop a photo here"}
          </p>
          <p
            className="mt-1 font-[family-name:var(--font-mono)] tracking-[0.1em] text-ink/50"
            style={{ fontSize: "0.77rem" }}
          >
            JPG · PNG · WEBP · HEIC · ANY SHAPE
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button variant="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? "Working" : "Choose a photo"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={useDemo}>
              Try a sample
            </Button>
          </div>
        </div>
        {error ? (
          <p
            className="nudge mt-2 border-[3px] border-ink bg-flag px-3 py-2 text-paper"
            style={{ fontSize: "var(--step--1)" }}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="sr-only"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-start gap-3">
        {/* Live framing preview, same aspect as the destination slot. */}
        <div
          ref={frameRef}
          className="relative shrink-0 cursor-grab touch-none overflow-hidden border-[3px] border-ink bg-ink active:cursor-grabbing"
          style={{ width: compact ? 92 : 132, aspectRatio: String(aspect) }}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setFocusFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (dragging.current) setFocusFromPointer(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          data-cursor="crop"
          title="Drag to move the crop centre"
        >
          <img src={photo.url} alt="Your upload" style={photoStyle(photo)} />
          <span
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-paper bg-neon"
            style={{ left: `${photo.focusX * 100}%`, top: `${photo.focusY * 100}%` }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="truncate font-[family-name:var(--font-mono)] text-ink/70"
            style={{ fontSize: "var(--step--1)" }}
            title={photo.fileName}
          >
            {photo.fileName}
          </p>
          <p
            className="mt-0.5 font-[family-name:var(--font-mono)] text-ink/45"
            style={{ fontSize: "0.77rem" }}
          >
            {photo.width} × {photo.height}
          </p>

          {/* Zoom */}
          <label className="mt-2 block">
            <span className="flex items-baseline justify-between">
              <span
                className="font-[family-name:var(--font-mono)] font-bold tracking-[0.14em] text-ink/60"
                style={{ fontSize: "0.77rem" }}
              >
                ZOOM
              </span>
              <span
                className="font-[family-name:var(--font-mono)] text-ink/50"
                style={{ fontSize: "0.77rem" }}
              >
                {photo.zoom.toFixed(2)}×
              </span>
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={photo.zoom}
              onChange={(e) => onChange({ zoom: Number(e.target.value) })}
              className="mt-1 w-full accent-[#FF0080]"
            />
          </label>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <IconButton
              label="Rotate"
              onClick={() =>
                onChange({ rotation: (((photo.rotation + 90) % 360) as PhotoAsset["rotation"]) })
              }
            >
              ⟳ 90°
            </IconButton>
            <IconButton label="Mirror" onClick={() => onChange({ flipped: !photo.flipped })}>
              ⇋ Flip
            </IconButton>
            <IconButton
              label="Recentre"
              onClick={() => onChange({ focusX: 0.5, focusY: 0.38 })}
            >
              ⌖ Centre
            </IconButton>
            <IconButton
              label="Reset"
              onClick={() =>
                onChange({ zoom: 1, rotation: 0, flipped: false, focusX: 0.5, focusY: 0.38 })
              }
            >
              ↺ Reset
            </IconButton>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={() => inputRef.current?.click()} className="!min-h-[36px] !py-1">
              Replace
            </Button>
            {onClear ? (
              <Button variant="ghost" onClick={onClear} className="!min-h-[36px] !py-1">
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <p
          className="nudge mt-2 border-[3px] border-ink bg-flag px-3 py-2 text-paper"
          style={{ fontSize: "var(--step--1)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="tap border-[2px] border-ink bg-paper px-2 py-1 font-[family-name:var(--font-mono)] font-bold transition-colors duration-150 hover:bg-sun"
      style={{ fontSize: "0.77rem" }}
    >
      {children}
    </button>
  );
}
