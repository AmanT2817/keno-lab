"use client";

import { useKenoStore, type TileState } from "@/lib/keno/store";
import { KENO_POOL_SIZE, KENO_MAX_SPOTS } from "@/lib/keno/engine";
import { NumberTile } from "./NumberTile";
import { cn } from "@/lib/utils";

/**
 * The 1..80 Keno board. During a play the board reflects the
 * server-authoritative draw: each tile is selected, drawn, matched, or
 * idle based on store state. All visual states derive from the same
 * server-persisted numbers — the browser never decides an outcome.
 */
export function KenoBoard() {
  const selectedNumbers = useKenoStore((s) => s.selectedNumbers);
  const drawnNumbers = useKenoStore((s) => s.drawnNumbers);
  const revealedCount = useKenoStore((s) => s.revealedCount);
  const isPlaying = useKenoStore((s) => s.isPlaying);
  const lastOutcome = useKenoStore((s) => s.lastOutcome);
  const toggleNumber = useKenoStore((s) => s.toggleNumber);

  // The revealed numbers so far (during animation) or all 20 after settle.
  const revealedDrawn = isPlaying
    ? drawnNumbers.slice(0, revealedCount)
    : lastOutcome
      ? lastOutcome.drawnNumbers
      : [];

  const matchedSet = new Set(
    isPlaying
      ? // during animation, only mark matched numbers that have been revealed
        // AND are also part of the player's selection
        selectedNumbers.filter((n) => revealedDrawn.includes(n))
      : lastOutcome
        ? lastOutcome.matchedNumbers
        : []
  );

  const selectedSet = new Set(selectedNumbers);
  const drawnSet = new Set(revealedDrawn);

  const tiles: { number: number; state: TileState; isRevealing: boolean }[] =
    Array.from({ length: KENO_POOL_SIZE }, (_, i) => {
      const number = i + 1;
      const isSelected = selectedSet.has(number);
      const isDrawn = drawnSet.has(number);
      const isMatched = matchedSet.has(number);

      let state: TileState = "idle";
      let isRevealing = false;

      if (isMatched) {
        state = "matched";
        // the tile that just got revealed (the last one in revealedDrawn)
        isRevealing = revealedDrawn[revealedDrawn.length - 1] === number;
      } else if (isDrawn) {
        state = "drawn";
        isRevealing = revealedDrawn[revealedDrawn.length - 1] === number;
      } else if (isSelected) {
        state = "selected";
      }

      return { number, state, isRevealing };
    });

  // Once selection is full, the player can still deselect (toggle is allowed
  // for currently selected tiles). Only the not-yet-selected ones get disabled.
  const atMax = selectedNumbers.length >= KENO_MAX_SPOTS;

  return (
    <div className="keno-felt-bg rounded-2xl p-3 sm:p-5 border border-border/60 shadow-2xl">
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
        {tiles.map(({ number, state, isRevealing }) => {
          const isSelected = selectedSet.has(number);
          return (
            <NumberTile
              key={number}
              number={number}
              state={state}
              isRevealing={isRevealing}
              disabled={isPlaying || (atMax && !isSelected)}
              onClick={() => toggleNumber(number)}
            />
          );
        })}
      </div>
      <div
        className={cn(
          "mt-3 flex items-center justify-between text-xs sm:text-sm",
          "text-muted-foreground"
        )}
      >
        <span>
          Spots:{" "}
          <span className="keno-emerald-text font-semibold">
            {selectedNumbers.length}
          </span>
          /{KENO_MAX_SPOTS}
        </span>
        <span>
          Drawn:{" "}
          <span className="keno-amber-text font-semibold">
            {revealedDrawn.length}
          </span>
          /20
        </span>
      </div>
    </div>
  );
}
