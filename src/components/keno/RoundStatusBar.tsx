"use client";

import { useKenoStore } from "@/lib/keno/store";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Clock,
  Hash,
  Lock,
  Sparkles,
  CheckCircle2,
  Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatMS(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const PHASE_LABEL: Record<string, string> = {
  OPEN: "Open — pick your numbers",
  DRAWING: "Drawing — revealing numbers",
  RESULTS: "Results — round complete",
  WAITING: "Waiting — next round soon",
};

const PHASE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  OPEN: Sparkles,
  DRAWING: Hourglass,
  RESULTS: CheckCircle2,
  WAITING: Clock,
};

/**
 * Sticky status bar above the board that shows the current round number,
 * the current phase, and a server-driven countdown to the next phase.
 *
 * The countdown is computed from the server's `countdownMs` field on each
 * poll. We do NOT use a client setInterval to drive it independently —
 * the server polls every 1s and updates this bar. This keeps the client
 * in sync with the server's authoritative schedule.
 */
export function RoundStatusBar() {
  const currentRound = useKenoStore((s) => s.currentRound);
  const submittedTicket = useKenoStore((s) => s.submittedTicket);

  if (!currentRound) {
    return (
      <Card className="bg-card/80 backdrop-blur border-border/60">
        <CardContent className="py-2.5 px-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Hourglass className="size-4 animate-pulse" />
          <span>Connecting to round scheduler…</span>
        </CardContent>
      </Card>
    );
  }

  const { round, countdownMs, nextPhaseLabel, draw } = currentRound;
  const phase = round.phase;
  const PhaseIcon = PHASE_ICON[phase] ?? Clock;

  // Compute total cycle duration for progress bar.
  // OPEN: 30s; DRAWING: 20s; RESULTS: 30s; WAITING: ~0s (immediate)
  const phaseTotalMs =
    phase === "OPEN"
      ? 30_000
      : phase === "DRAWING"
        ? 20_000
        : phase === "RESULTS"
          ? 30_000
          : 30_000;
  const progressPct =
    phaseTotalMs > 0
      ? Math.max(0, Math.min(100, ((phaseTotalMs - countdownMs) / phaseTotalMs) * 100))
      : 0;

  const isBettingOpen = phase === "OPEN";
  const ticketSubmitted = !!submittedTicket;

  return (
    <Card
      className={cn(
        "bg-card/80 backdrop-blur border-border/60",
        isBettingOpen
          ? "border-primary/40"
          : phase === "DRAWING"
            ? "border-accent/40"
            : "border-border/40"
      )}
    >
      <CardContent className="py-2.5 px-3 sm:px-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        {/* Left: round number + phase */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Hash className="size-3.5 keno-emerald-text" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Round
            </span>
            <span className="text-sm font-mono font-semibold">
              #{round.roundNumber ?? "?"}
            </span>
          </div>

          <div className="h-4 w-px bg-border/40 hidden sm:block" />

          <div className="flex items-center gap-1.5">
            <PhaseIcon
              className={cn(
                "size-4",
                isBettingOpen
                  ? "keno-emerald-text"
                  : phase === "DRAWING"
                    ? "keno-amber-text animate-pulse"
                    : "text-muted-foreground"
              )}
            />
            <span className="text-sm font-medium">
              {PHASE_LABEL[phase]}
            </span>
          </div>

          {/* Submitted ticket chip */}
          {ticketSubmitted && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 border border-primary/30">
              <CheckCircle2 className="size-3 keno-emerald-text" />
              <span className="text-[10px] font-medium">
                Ticket in: {submittedTicket.spots} spots · ${" "}
                {(submittedTicket.stakeMinor / 100).toFixed(2)}
              </span>
            </div>
          )}

          {/* Betting lock indicator */}
          {!isBettingOpen && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/40 border border-border/40">
              <Lock className="size-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Betting locked
              </span>
            </div>
          )}
        </div>

        {/* Right: countdown + progress (server-driven) */}
        <div className="flex-1 flex items-center gap-3 sm:justify-end">
          {phase !== "WAITING" && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3" />
                <span>{nextPhaseLabel}</span>
              </div>
              <div className="font-mono text-sm font-semibold tabular-nums keno-amber-text">
                {formatMS(countdownMs)}
              </div>
            </>
          )}
        </div>
      </CardContent>

      {/* Draw progress during DRAWING phase */}
      {phase === "DRAWING" && (
        <div className="px-3 sm:px-4 pb-2 -mt-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>Revealing draw</span>
            <span className="font-mono">
              {draw.revealedCount}/{draw.totalCount || 20}
            </span>
          </div>
          <Progress
            value={
              draw.totalCount > 0
                ? (draw.revealedCount / draw.totalCount) * 100
                : 0
            }
            className="h-1.5"
          />
        </div>
      )}

      {/* Phase progress (other phases) */}
      {phase !== "DRAWING" && phase !== "WAITING" && (
        <div className="px-3 sm:px-4 pb-2 -mt-1">
          <Progress value={progressPct} className="h-1" />
        </div>
      )}
    </Card>
  );
}
