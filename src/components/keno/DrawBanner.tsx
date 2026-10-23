"use client";

import { useKenoStore } from "@/lib/keno/store";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Hourglass,
  Lock,
} from "lucide-react";

/**
 * Banner above the board. Renders different content based on the
 * server-authoritative round phase:
 *   - OPEN      → "Betting open" with countdown to close
 *   - DRAWING   → "Revealing numbers" with progressive pill list (1s/server-driven)
 *   - RESULTS   → Final result of the user's submitted ticket (if any)
 *   - WAITING   → Brief "Next round starting" notice
 *
 * The reveal animation is purely cosmetic — the authoritative outcome
 * is already persisted on the server. The numbers shown are exactly
 * `currentRound.draw.winningNumbers.slice(0, revealedCount)`, which
 * the server computes from `drawnAt` + 1s per number.
 */
export function DrawBanner() {
  const currentRound = useKenoStore((s) => s.currentRound);
  const lastOutcome = useKenoStore((s) => s.lastOutcome);
  const submittedTicket = useKenoStore((s) => s.submittedTicket);

  if (!currentRound) return null;

  const { round, draw, countdownMs, nextPhaseLabel } = currentRound;
  const phase = round.phase;

  // --- OPEN phase: show "betting open" -------------------------------
  if (phase === "OPEN") {
    const seconds = Math.max(0, Math.ceil(countdownMs / 1000));
    return (
      <div className="rounded-xl border border-primary/40 bg-card/80 backdrop-blur p-3 sm:p-4 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="size-4 keno-emerald-text" />
            <span className="text-sm font-semibold keno-emerald-text truncate">
              Betting open — pick your numbers
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              {nextPhaseLabel}
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums keno-amber-text">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:
              {String(seconds % 60).padStart(2, "0")}
            </span>
          </div>
        </div>
        {submittedTicket && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            Ticket submitted ({submittedTicket.spots} spots · $
            {(submittedTicket.stakeMinor / 100).toFixed(2)}). You can still
            adjust nothing — wait for the draw at close of betting.
          </div>
        )}
      </div>
    );
  }

  // --- DRAWING phase: progressive reveal -----------------------------
  if (phase === "DRAWING") {
    const revealed = draw.winningNumbers.slice(0, draw.revealedCount);
    return (
      <div className="rounded-xl border border-accent/40 bg-card/80 backdrop-blur p-3 sm:p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Hourglass className="size-4 keno-amber-text animate-pulse" />
            <span className="text-sm font-semibold keno-gold">
              Drawing 20 numbers…
            </span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {draw.revealedCount}/20
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 min-h-[2.25rem]">
          {revealed.map((n) => {
            const isMatched = submittedTicket?.selectedNumbers.includes(n);
            return (
              <span
                key={n}
                className={cn(
                  "keno-tile-revealing inline-flex items-center justify-center size-7 sm:size-8 rounded-md text-xs font-bold border",
                  isMatched
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-muted/60 text-foreground border-border/40"
                )}
              >
                {n}
              </span>
            );
          })}
          {revealed.length === 0 && (
            <span className="text-xs text-muted-foreground self-center">
              Preparing the draw…
            </span>
          )}
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-background/60 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent keno-shimmer transition-all duration-200"
            style={{ width: `${(draw.revealedCount / 20) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  // --- RESULTS phase: show final outcome of the user's ticket -------
  if (phase === "RESULTS" && lastOutcome) {
    const isWin = lastOutcome.isWin;
    const netMajor = (lastOutcome.netPayoutMinor / 100).toFixed(2);
    return (
      <div
        className={cn(
          "rounded-xl border p-3 sm:p-4 shadow-lg",
          isWin
            ? "border-accent/60 bg-accent/10"
            : "border-destructive/40 bg-destructive/5"
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isWin ? (
              <TrendingUp className="size-4 keno-amber-text" />
            ) : (
              <TrendingDown className="size-4 keno-rose-text" />
            )}
            <span
              className={cn(
                "text-sm font-semibold",
                isWin ? "keno-gold" : "keno-rose-text"
              )}
            >
              {isWin ? "Winner!" : "No payout this round"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {lastOutcome.matchCount}/{lastOutcome.spots} hits
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded-md bg-background/60 border border-border/40 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Stake
            </div>
            <div className="font-mono font-semibold">
              ${(lastOutcome.stakeMinor / 100).toFixed(2)}
            </div>
          </div>
          <div className="rounded-md bg-background/60 border border-border/40 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Payout
            </div>
            <div
              className={cn(
                "font-mono font-semibold",
                isWin ? "keno-amber-text" : "text-muted-foreground"
              )}
            >
              ${(lastOutcome.payoutMinor / 100).toFixed(2)}
            </div>
          </div>
          <div className="rounded-md bg-background/60 border border-border/40 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Net
            </div>
            <div
              className={cn(
                "font-mono font-semibold",
                lastOutcome.netPayoutMinor > 0
                  ? "keno-emerald-text"
                  : "keno-rose-text"
              )}
            >
              {lastOutcome.netPayoutMinor > 0 ? "+" : ""}${netMajor}
            </div>
          </div>
          <div className="rounded-md bg-background/60 border border-border/40 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Matches
            </div>
            <div className="font-mono font-semibold">
              {lastOutcome.matchedNumbers.length === 0
                ? "—"
                : lastOutcome.matchedNumbers.join(", ")}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Next round opens in{" "}
          <span className="font-mono font-semibold keno-amber-text">
            {Math.ceil(countdownMs / 1000)}s
          </span>
        </div>
      </div>
    );
  }

  // --- RESULTS phase but no ticket submitted -------------------------
  if (phase === "RESULTS" && !lastOutcome) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              Round complete — no ticket submitted this round
            </span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            Next round in {Math.ceil(countdownMs / 1000)}s
          </span>
        </div>
      </div>
    );
  }

  // --- WAITING phase -------------------------------------------------
  if (phase === "WAITING") {
    return (
      <div className="rounded-xl border border-primary/40 bg-card/80 backdrop-blur p-3 sm:p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 keno-emerald-text" />
            <span className="text-sm font-semibold keno-emerald-text">
              Next round opening now…
            </span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
