"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { parseSerial } from "@/lib/identifier";
import { notifyInfo } from "@/lib/toast";
import {
  loadVault,
  searchPasses,
  subscribeVault,
  vaultSnapshot,
  type VaultPass,
} from "@/lib/vault";

/**
 * Serial search, in the header on every page.
 *
 * Takes a pass number in any shape someone might have it: `IDX-1A01A0K6A1`
 * off a card, `1A01 A0K 6A1` grouped the way it is printed, or the bare ten
 * characters out of a scanner. Sends them to /v/{serial}, which is unchanged
 * and still refuses to show anything until the holder's details check out.
 *
 * WHAT THE SUGGESTIONS ARE AND ARE NOT
 *
 * They come from the local vault, so they only ever show passes this browser
 * issued. That is a convenience for the organiser sitting at the desk who made
 * them, not a directory: nothing about anyone else's pass is available here,
 * and picking a suggestion still lands on the same gate as typing the number
 * by hand. Nothing is bypassed by knowing a name.
 */

const EMPTY: VaultPass[] = [];

export function SerialSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // The vault is read once per document; the snapshot keeps suggestions
  // instant, which they have to be to be worth showing at all.
  useSyncExternalStore(subscribeVault, vaultSnapshot, () => EMPTY);
  useEffect(() => {
    void loadVault();
  }, []);

  const suggestions = useMemo(() => (query.trim() ? searchPasses(query) : []), [query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const open_ = (canonical: string) => {
    setError("");
    setOpen(false);
    notifyInfo("Opening the pass check", canonical);
    router.push(`/v/${canonical}`);
  };

  /**
   * A pass number, or a name.
   *
   * The suggestion list has matched on name and handle since V05.09, but
   * pressing Find with a name in the box failed: `go` only ever parsed a
   * serial, so anyone who typed "Ada" and hit Enter rather than clicking the
   * suggestion got told a pass number is ten characters. The list was already
   * showing them the answer.
   *
   * So a query that is not a serial now falls through to the same vault search
   * the suggestions use. One match opens it. Several leave the list open rather
   * than guessing, because picking the first alphabetically is not an answer to
   * "which Ada".
   *
   * The serial path is untouched, including its two error messages, and this
   * still bypasses nothing: every route out of here lands on the same gate at
   * /v, which asks for the four details the serial was built from. Knowing a
   * name gets you to the door, not through it.
   */
  const go = (value: string) => {
    const typed = value.trim();
    if (!typed) return;

    const parsed = parseSerial(typed);
    if (parsed.valid) {
      open_(parsed.canonical);
      return;
    }

    const looksLikeSerial = /^[A-Za-z]{3}-?[A-Za-z0-9\s]{6,}$/.test(typed) || /^[A-Za-z0-9\s]{9,13}$/.test(typed);

    const matches = searchPasses(typed, 12);
    if (matches.length === 1) {
      open_(matches[0].id);
      return;
    }
    if (matches.length > 1) {
      setError("");
      setOpen(true);
      notifyInfo(`${matches.length} passes match`, "Pick one from the list.");
      return;
    }

    // Nothing matched by name either, so answer the question they were most
    // likely asking. A ten-character-shaped query that failed to parse is a
    // mistyped serial; anything else is a name this browser has never issued.
    setError(
      looksLikeSerial
        ? parsed.body.length === 10
          ? "That check character does not agree. Retype it."
          : "A pass number is ten characters, with or without the IDX-, BGX- or FMX- prefix."
        : "No pass on this device matches that name. Search a pass number instead.",
    );
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, -1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={boxRef} className={`relative ${compact ? "w-full" : "w-full sm:w-[min(34vw,300px)]"}`}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          go(highlight >= 0 && suggestions[highlight] ? suggestions[highlight].id : query);
        }}
        className="flex items-stretch"
      >
        {/*
          "holder", not "name".

          The obvious label for this control is "Find a pass by serial or name",
          and it is wrong: an accessible name containing "name" collides with
          every "Name" and "Full name" field in the app. Anything resolving a
          control by its label, a screen reader user tabbing by name included,
          reaches this box first because it is the earliest in the document.

          It is not a cosmetic string. The first version of this change silently
          redirected typing into the header search, which produced a different
          serial and made the saved-pass gate refuse correct details.
        */}
        <label className="sr-only" htmlFor="serial-search">
          Find a pass by number or holder
        </label>
        <input
          id="serial-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError("");
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="IDX-1A01A0K6A1 or a name"
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="serial-search-results"
          aria-expanded={open && suggestions.length > 0}
          className="min-w-0 flex-1 border-[3px] border-paper/30 bg-ink text-paper placeholder:text-paper/35 focus:border-sun focus:bg-black"
          style={{
            paddingInline: "0.6rem",
            paddingBlock: "0.35rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.77rem",
            letterSpacing: "0.06em",
            minHeight: 34,
          }}
        />
        <button
          type="submit"
          className="press shrink-0 border-[3px] border-l-0 border-paper/30 bg-sun px-2.5 font-[family-name:var(--font-display)] text-ink"
          style={{ fontSize: "0.77rem" }}
        >
          Find
        </button>
      </form>

      {error ? (
        <p
          className="absolute left-0 right-0 top-full z-40 mt-1 border-[3px] border-ink bg-flag px-2 py-1 text-paper"
          role="alert"
          style={{ fontSize: "0.77rem" }}
        >
          {error}
        </p>
      ) : null}

      {open && !error && suggestions.length > 0 ? (
        <ul
          id="serial-search-results"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[60vh] overflow-auto border-[3px] border-ink bg-paper slab"
          role="listbox"
          aria-label="Passes saved on this device"
        >
          {suggestions.map((pass, index) => (
            <li key={pass.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                onClick={() => go(pass.id)}
                onMouseEnter={() => setHighlight(index)}
                className={`block w-full border-b-[2px] border-ink/10 px-2.5 py-1.5 text-left ${
                  index === highlight ? "bg-sun" : "bg-paper hover:bg-sun/30"
                }`}
              >
                <span
                  className="block font-[family-name:var(--font-mono)] font-bold"
                  style={{ fontSize: "0.77rem", letterSpacing: "0.04em" }}
                >
                  {pass.id}
                </span>
                <span className="block truncate text-ink/65" style={{ fontSize: "0.77rem" }}>
                  {pass.input.name || "Unnamed"}
                  {pass.input.team ? ` · ${pass.input.team}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
