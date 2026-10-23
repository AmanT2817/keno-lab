"use client";

import { cn } from "@/lib/utils";
import type { TileState } from "@/lib/keno/store";

interface NumberTileProps {
  number: number;
  state: TileState;
  isRevealing?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * A single Keno board cell. State drives all styling; the tile itself
 * has no business logic. Animations are applied via CSS classes so the
 * browser stays in sync with the server-authoritative draw outcome.
 */
export function NumberTile({
  number,
  state,
  isRevealing = false,
  disabled = false,
  onClick,
}: NumberTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={state === "selected"}
      aria-label={`Keno number ${number}${
        state === "selected"
          ? ", selected"
          : state === "matched"
            ? ", matched"
            : state === "drawn"
              ? ", drawn"
              : ""
      }`}
      className={cn(
        "keno-tile keno-tile-reveal-base relative aspect-square rounded-md text-sm sm:text-base font-semibold select-none",
        "flex items-center justify-center",
        state === "selected" && "keno-tile-selected",
        state === "drawn" && "keno-tile-drawn",
        state === "matched" && "keno-tile-matched",
        isRevealing && "keno-tile-revealing",
        disabled && "cursor-not-allowed opacity-70"
      )}
    >
      {number}
    </button>
  );
}
