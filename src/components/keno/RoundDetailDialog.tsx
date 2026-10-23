"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Coins,
  Hash,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Layers,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketDetailResponse {
  ticket: {
    id: string;
    selectedNumbers: number[];
    spots: number;
    stakeMinor: number;
    paytableVersion: string;
    status: string;
    idempotencyKey: string;
    createdAt: string;
    player: { id: string; name: string };
  };
  round: {
    id: string;
    status: string;
    rulesVersion: string;
    opensAt: string;
    closesAt: string | null;
    drawnAt: string | null;
    settledAt: string | null;
  };
  draw: {
    winningNumbers: number[];
    algorithmVersion: string;
    createdAt: string;
  } | null;
  result: {
    matchedNumbers: number[];
    matchCount: number;
    payoutMinor: number;
    isWin: boolean;
    createdAt: string;
  } | null;
  ledger: {
    id: string;
    entryType: string;
    amountMinor: number;
    idempotencyKey: string;
    createdAt: string;
  }[];
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtRel(iso: string | null, baseIso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const base = baseIso ? new Date(baseIso).getTime() : Date.now();
  const diff = Math.max(0, base - t);
  if (diff < 1000) return "0 ms";
  if (diff < 60_000) return `${Math.round(diff / 1000)} ms`;
  return `${(diff / 1000).toFixed(2)} s`;
}

interface RoundDetailDialogProps {
  ticketId: string | null;
  onClose: () => void;
}

export function RoundDetailDialog({ ticketId, onClose }: RoundDetailDialogProps) {
  const [data, setData] = useState<TicketDetailResponse | null>(null);
  const [loadedTicketId, setLoadedTicketId] = useState<string | null>(null);
  // Loading is derived: true if we have a ticketId that hasn't been loaded yet.
  const loading = ticketId !== null && loadedTicketId !== ticketId;

  // Local replay animation state
  const [revealed, setRevealed] = useState<number[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayTimer, setReplayTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;
    fetch(`/api/game/tickets/${ticketId}`)
      .then((r) => r.json())
      .then((d: TicketDetailResponse) => {
        if (!cancelled) {
          setData(d);
          setLoadedTicketId(ticketId);
          setRevealed([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoadedTicketId(ticketId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // Cleanup any replay timer on close
  useEffect(() => {
    return () => {
      if (replayTimer) clearInterval(replayTimer);
    };
  }, [replayTimer]);

  const startReplay = () => {
    if (!data?.draw) return;
    if (replayTimer) clearInterval(replayTimer);
    setRevealed([]);
    setIsReplaying(true);
    let i = 0;
    const drawn = data.draw.winningNumbers;
    const id = setInterval(() => {
      i += 1;
      setRevealed(drawn.slice(0, i));
      if (i >= drawn.length) {
        clearInterval(id);
        setReplayTimer(null);
        setIsReplaying(false);
      }
    }, 110);
    setReplayTimer(id);
  };

  const stopReplay = () => {
    if (replayTimer) clearInterval(replayTimer);
    setReplayTimer(null);
    setIsReplaying(false);
  };

  const resetReplay = () => {
    stopReplay();
    setRevealed([]);
  };

  const isOpen = ticketId !== null;
  const matchedSet = new Set(data?.result?.matchedNumbers ?? []);
  const revealedSet = new Set(
    isReplaying || revealed.length > 0 ? revealed : data?.draw?.winningNumbers ?? []
  );

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 py-4 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 keno-emerald-text" />
            Round Transparency Report
          </DialogTitle>
          <DialogDescription className="text-xs">
            Every value below comes from the server-authoritative database
            record. Nothing here is computed by the browser.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 keno-scrollbar">
          <div className="p-5 space-y-4">
            {loading && (
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading audit data…
              </div>
            )}
            {!loading && data && (
              <>
                {/* Top summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-md bg-background/60 border border-border/40 p-2 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Spots
                    </div>
                    <div className="text-sm font-semibold">{data.ticket.spots}</div>
                  </div>
                  <div className="rounded-md bg-background/60 border border-border/40 p-2 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Stake
                    </div>
                    <div className="text-sm font-mono font-semibold">
                      ${(data.ticket.stakeMinor / 100).toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-md bg-background/60 border border-border/40 p-2 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Hits
                    </div>
                    <div className="text-sm font-semibold">
                      {data.result?.matchCount ?? 0}/{data.ticket.spots}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "rounded-md border p-2 text-center",
                      data.result?.isWin
                        ? "bg-accent/10 border-accent/30"
                        : "bg-destructive/5 border-destructive/30"
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Payout
                    </div>
                    <div
                      className={cn(
                        "text-sm font-mono font-semibold",
                        data.result?.isWin
                          ? "keno-amber-text"
                          : "keno-rose-text"
                      )}
                    >
                      ${((data.result?.payoutMinor ?? 0) / 100).toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Draw replay */}
                {data.draw && (
                  <section className="rounded-md border border-border/40 bg-background/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Play className="size-3 keno-emerald-text" />
                        Draw Replay
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={startReplay}
                          disabled={isReplaying}
                        >
                          <Play className="size-3" />
                          Replay
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={stopReplay}
                          disabled={!isReplaying}
                        >
                          <Pause className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={resetReplay}
                          disabled={isReplaying}
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 min-h-[2rem]">
                      {(isReplaying || revealed.length > 0
                        ? revealed
                        : data.draw.winningNumbers
                      ).map((n) => {
                        const isMatch = matchedSet.has(n);
                        return (
                          <span
                            key={n}
                            className={cn(
                              "inline-flex items-center justify-center size-7 rounded text-xs font-mono font-semibold border",
                              isMatch
                                ? "bg-accent text-accent-foreground border-accent"
                                : "bg-muted/40 text-foreground border-border/40"
                            )}
                          >
                            {n}
                          </span>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      The animation is cosmetic only — the authoritative draw
                      was already persisted before this dialog opened.
                    </div>
                  </section>
                )}

                {/* Selected numbers */}
                <section className="rounded-md border border-border/40 bg-background/40 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Hash className="size-3 keno-emerald-text" />
                    Your selection
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {data.ticket.selectedNumbers.map((n) => {
                      const isMatch = matchedSet.has(n);
                      return (
                        <span
                          key={n}
                          className={cn(
                            "inline-flex items-center justify-center size-7 rounded text-xs font-mono font-semibold border",
                            isMatch
                              ? "bg-accent text-accent-foreground border-accent"
                              : "bg-muted/40 text-muted-foreground border-border/30 line-through"
                          )}
                        >
                          {n}
                        </span>
                      );
                    })}
                  </div>
                </section>

                {/* Round state machine timeline */}
                <section className="rounded-md border border-border/40 bg-background/40 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Layers className="size-3 keno-emerald-text" />
                    Round state machine
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
                    <div className="rounded bg-card/60 border border-border/30 p-1.5">
                      <div className="text-[9px] uppercase text-muted-foreground">
                        OPEN
                      </div>
                      <div className="font-mono">{fmtTime(data.round.opensAt)}</div>
                    </div>
                    <div className="rounded bg-card/60 border border-border/30 p-1.5">
                      <div className="text-[9px] uppercase text-muted-foreground">
                        CLOSED
                      </div>
                      <div className="font-mono">{fmtTime(data.round.closesAt)}</div>
                      <div className="text-[9px] text-muted-foreground">
                        +{fmtRel(data.round.closesAt, data.round.opensAt)}
                      </div>
                    </div>
                    <div className="rounded bg-card/60 border border-border/30 p-1.5">
                      <div className="text-[9px] uppercase text-muted-foreground">
                        DRAWN
                      </div>
                      <div className="font-mono">{fmtTime(data.round.drawnAt)}</div>
                      <div className="text-[9px] text-muted-foreground">
                        +{fmtRel(data.round.drawnAt, data.round.closesAt)}
                      </div>
                    </div>
                    <div className="rounded bg-card/60 border border-border/30 p-1.5">
                      <div className="text-[9px] uppercase text-muted-foreground">
                        SETTLED
                      </div>
                      <div className="font-mono">{fmtTime(data.round.settledAt)}</div>
                      <div className="text-[9px] text-muted-foreground">
                        +{fmtRel(data.round.settledAt, data.round.drawnAt)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                    <Clock className="size-3" />
                    Round ID:{" "}
                    <span className="font-mono truncate">{data.round.id}</span>
                  </div>
                </section>

                {/* Integrity & versions */}
                <section className="rounded-md border border-border/40 bg-background/40 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Database className="size-3 keno-emerald-text" />
                    Integrity & versions
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="rounded bg-card/60 border border-border/30 p-1.5">
                      <div className="text-[9px] uppercase text-muted-foreground">
                        Paytable
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px] mt-0.5">
                        {data.ticket.paytableVersion}
                      </Badge>
                    </div>
                    <div className="rounded bg-card/60 border border-border/30 p-1.5">
                      <div className="text-[9px] uppercase text-muted-foreground">
                        Rules
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px] mt-0.5">
                        {data.round.rulesVersion}
                      </Badge>
                    </div>
                    <div className="rounded bg-card/60 border border-border/30 p-1.5">
                      <div className="text-[9px] uppercase text-muted-foreground">
                        Draw algorithm
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px] mt-0.5">
                        {data.draw?.algorithmVersion ?? "—"}
                      </Badge>
                    </div>
                    <div className="rounded bg-card/60 border border-border/30 p-1.5">
                      <div className="text-[9px] uppercase text-muted-foreground">
                        Round status
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px] mt-0.5">
                        {data.round.status}
                      </Badge>
                    </div>
                  </div>
                </section>

                {/* Ledger entries */}
                <section className="rounded-md border border-border/40 bg-background/40 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Coins className="size-3 keno-emerald-text" />
                    Ledger entries
                  </div>
                  <div className="space-y-1">
                    {data.ledger.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">
                        No ledger entries recorded.
                      </div>
                    ) : (
                      data.ledger.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between text-[11px] border-b border-border/20 py-0.5 last:border-0"
                        >
                          <span className="font-mono">
                            <Badge
                              variant="outline"
                              className="font-mono text-[9px]"
                            >
                              {e.entryType}
                            </Badge>{" "}
                            <span className="text-muted-foreground ml-1">
                              {fmtTime(e.createdAt)}
                            </span>
                          </span>
                          <span className="font-mono font-semibold">
                            {(e.entryType.includes("DEBIT") ? "−" : "+")}$
                            {(e.amountMinor / 100).toFixed(2)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Idempotency keys prevent any of these entries from being
                    applied twice, even if the player retries the request.
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
