"use client";

import { useKenoStore, type TileState } from "@/lib/keno/store";
import { KENO_POOL_SIZE, KENO_MAX_SPOTS } from "@/lib/keno/engine";
import { NumberTile } from "./NumberTile";
import { cn } from "@/lib/utils";

/**
 * The 1..80 Keno board. Tile states derive entirely from server-authoritative
 * state polled from /api/game/current-round:
 *   - "selected" — the user picked this number in the current OPEN round
 *   - "drawn"    — the server has revealed this number (drawnAt + 1s revealed)
 *   - "matched"  — drawn AND selected
 *   - "idle"     — none of the above
 *
 * The board never advances state on a client timer. If the user refreshes
 * mid-draw, the board re-renders from the server's revealedCount — picking
 * up the animation where the server says it should be.
 */
export function KenoBoard() {
  const selectedNumbers = useKenoStore((s) => s.selectedNumbers);
  const currentRound = useKenoStore((s) => s.currentRound);
  const lastOutcome = useKenoStore((s) => s.lastOutcome);
  const submittedTicket = useKenoStore((s) => s.submittedTicket);
  const toggleNumber = useKenoStore((s) => s.toggleNumber);

  const phase = currentRound?.round.phase;
  const drawnNumbers = currentRound?.draw.winningNumbers ?? [];
  const revealedCount = currentRound?.draw.revealedCount ?? 0;

  // During DRAWING/RESULTS, show drawn numbers (server-driven subset).
  // During OPEN/WAITING, no numbers are drawn yet — but if lastOutcome
  // exists (just-settled ticket), keep showing the completed draw so
  // the player can see their result.
  const revealedDrawn =
    phase === "DRAWING" || phase === "RESULTS" || phase === "WAITING"
      ? drawnNumbers.slice(0, revealedCount)
      : lastOutcome
        ? lastOutcome.drawnNumbers
        : [];

  const matchedSet = new Set(
    phase === "DRAWING" || phase === "RESULTS" || phase === "WAITING"
      ? // During/after draw, mark matched numbers among revealed.
        (submittedTicket?.selectedNumbers ?? []).filter((n) =>
          revealedDrawn.includes(n)
        )
      : lastOutcome
        ? lastOutcome.matchedNumbers
        : []
  );

  const selectedSet = new Set(
    phase === "OPEN"
      ? selectedNumbers
      : submittedTicket?.selectedNumbers ?? []
  );
  const drawnSet = new Set(revealedDrawn);

  const tiles: {
    number: number;
    state: TileState;
    isRevealing: boolean;
  }[] = Array.from({ length: KENO_POOL_SIZE }, (_, i) => {
    const number = i + 1;
    const isSelected = selectedSet.has(number);
    const isDrawn = drawnSet.has(number);
    const isMatched = matchedSet.has(number);

    let state: TileState = "idle";
    let isRevealing = false;

    if (isMatched) {
      state = "matched";
      // The tile that just got revealed is the latest in revealedDrawn.
      isRevealing = revealedDrawn[revealedDrawn.length - 1] === number;
    } else if (isDrawn) {
      state = "drawn";
      isRevealing = revealedDrawn[revealedDrawn.length - 1] === number;
    } else if (isSelected) {
      state = "selected";
    }

    return { number, state, isRevealing };
  });

  // Disable tile interaction during non-OPEN phases or after ticket submitted.
  const isBettingOpen = phase === "OPEN" && !submittedTicket;
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
              disabled={!isBettingOpen || (atMax && !isSelected)}
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
            {selectedSet.size}
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
