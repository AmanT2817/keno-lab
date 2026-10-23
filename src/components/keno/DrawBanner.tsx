"use client";

import { useKenoStore } from "@/lib/keno/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Sparkles, TrendingUp, TrendingDown } from "lucide-react";

/**
 * Banner shown above the board while the draw is being revealed.
 * Each number appears one at a time; the animation is purely cosmetic —
 * the authoritative outcome is already persisted on the server.
 */
export function DrawBanner() {
  const isPlaying = useKenoStore((s) => s.isPlaying);
  const drawnNumbers = useKenoStore((s) => s.drawnNumbers);
  const revealedCount = useKenoStore((s) => s.revealedCount);
  const lastOutcome = useKenoStore((s) => s.lastOutcome);

  if (isPlaying) {
    const revealed = drawnNumbers.slice(0, revealedCount);
    return (
      <div className="rounded-xl border border-primary/40 bg-card/80 backdrop-blur p-3 sm:p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 keno-amber-text animate-pulse" />
            <span className="text-sm font-semibold keno-gold">
              Drawing 20 numbers...
            </span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {revealedCount}/20
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 min-h-[2.25rem]">
          {revealed.map((n) => (
            <span
              key={n}
              className="keno-tile-revealing inline-flex items-center justify-center size-7 sm:size-8 rounded-md bg-accent text-accent-foreground text-xs font-bold border border-accent/50"
            >
              {n}
            </span>
          ))}
          {revealedCount === 0 && (
            <span className="text-xs text-muted-foreground self-center">
              Spinning up the CSPRNG...
            </span>
          )}
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-background/60 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent keno-shimmer transition-all duration-200"
            style={{ width: `${(revealedCount / 20) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  if (lastOutcome) {
    const netMajor = (lastOutcome.netPayoutMinor / 100).toFixed(2);
    const isWin = lastOutcome.isWin;
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
            {isWin && ` · ${lastOutcome.multiplier}x`}
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
              {lastOutcome.netPayoutMinor > 0 ? "+" : ""}
              ${netMajor}
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
      </div>
    );
  }

  return null;
}

/**
 * Compact summary card of the last draw for the history column.
 */
export function LastResultCard() {
  const lastOutcome = useKenoStore((s) => s.lastOutcome);
  if (!lastOutcome) return null;

  return (
    <Card className="bg-card/80 backdrop-blur border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span>Last Ticket</span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {lastOutcome.spots}-spot · ${(lastOutcome.stakeMinor / 100).toFixed(2)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Outcome</span>
          <span
            className={cn(
              "font-semibold",
              lastOutcome.isWin ? "keno-amber-text" : "keno-rose-text"
            )}
          >
            {lastOutcome.matchCount}/{lastOutcome.spots} ·{" "}
            {lastOutcome.isWin
              ? `+${(lastOutcome.netPayoutMinor / 100).toFixed(2)}`
              : `-${Math.abs(lastOutcome.stakeMinor / 100).toFixed(2)}`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Drawn</span>
          <span className="font-mono">
            {lastOutcome.drawnNumbers.join(", ")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
