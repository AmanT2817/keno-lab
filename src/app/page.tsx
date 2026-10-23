"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useKenoStore, type CurrentRoundState, type PlayOutcome } from "@/lib/keno/store";
import { GameHeader } from "@/components/keno/GameHeader";
import { KenoBoard } from "@/components/keno/KenoBoard";
import { TicketBuilder } from "@/components/keno/TicketBuilder";
import { PaytablePanel } from "@/components/keno/PaytablePanel";
import { HistoryPanel } from "@/components/keno/HistoryPanel";
import { KenoLabPanel } from "@/components/keno/KenoLabPanel";
import { DrawBanner } from "@/components/keno/DrawBanner";
import { RoundStatusBar } from "@/components/keno/RoundStatusBar";
import { RoundDetailDialog } from "@/components/keno/RoundDetailDialog";
import { CooldownOverlay } from "@/components/keno/ResponsiblePlay";
import { toast } from "sonner";
import { Sparkles, ShieldCheck, Cpu, Beaker, Trophy, History as HistoryIcon, Flame } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface GameStateResponse {
  config: {
    poolSize: number;
    drawSize: number;
    minSpots: number;
    maxSpots: number;
    minStakeMinor: number;
    maxStakeMinor: number;
    startingBalanceMinor: number;
    paytableVersion: string;
    drawAlgorithmVersion: string;
  };
  player: {
    id: string;
    name: string;
    balanceMinor: number;
  };
  stats: {
    totalRounds: number;
    totalTickets: number;
  };
}

interface SubmitResponse {
  replayed: boolean;
  ticket: {
    id: string;
    roundId: string;
    roundNumber: number | null;
    selectedNumbers: number[];
    spots: number;
    stakeMinor: number;
    paytableVersion: string;
    status: string;
    createdAt: string;
  };
  player?: { id: string; name: string; balanceMinor: number };
  result?: {
    matchedNumbers: number[];
    matchCount: number;
    payoutMinor: number;
    isWin: boolean;
  } | null;
}

const POLL_INTERVAL_MS = 1000;

export default function Home() {
  const store = useKenoStore;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [config, setConfig] = useState<GameStateResponse["config"] | null>(null);
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);

  // Track which ticket IDs we've already shown a "settled" toast for,
  // so we don't re-notify on every poll after settlement.
  const notifiedTicketIds = useRef<Set<string>>(new Set());

  // --- Initial load: fetch game config + balance + stats ------------
  const loadState = useCallback(async () => {
    try {
      const r = await fetch("/api/game/state");
      const d: GameStateResponse = await r.json();
      setConfig(d.config);
      store.getState().setBalance(d.player.balanceMinor);
      store.getState().setStats(d.stats.totalRounds, d.stats.totalTickets);
    } catch (e) {
      console.error(e);
      toast.error("Could not load game state.");
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // --- Poll current round state every second -------------------------
  // The poll drives ALL visible game phases. The frontend never uses a
  // client timer to advance state — it only displays what the server
  // says is currently true. This keeps page refreshes correct and
  // prevents duplicate draws.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const r = await fetch("/api/game/current-round", { cache: "no-store" });
        if (!r.ok) return;
        const d: CurrentRoundState = await r.json();
        if (cancelled) return;
        store.getState().setCurrentRound(d);

        // If the user has a submitted ticket for this round and the
        // round has just settled, fetch the result and toast it.
        const sub = store.getState().submittedTicket;
        if (sub && d.round.phase === "RESULTS" && d.round.status === "SETTLED") {
          if (!notifiedTicketIds.current.has(sub.ticketId)) {
            notifiedTicketIds.current.add(sub.ticketId);
            // Fetch the official result for this ticket.
            fetch(`/api/game/tickets/${sub.ticketId}`)
              .then((r) => r.json())
              .then((data) => {
                if (!data?.result) return;
                const outcome: PlayOutcome = {
                  ticketId: sub.ticketId,
                  roundId: sub.roundId,
                  selectedNumbers: sub.selectedNumbers,
                  drawnNumbers: data.draw?.winningNumbers ?? [],
                  matchedNumbers: data.result.matchedNumbers,
                  matchCount: data.result.matchCount,
                  spots: sub.spots,
                  stakeMinor: sub.stakeMinor,
                  payoutMinor: data.result.payoutMinor,
                  multiplier: 0,
                  netPayoutMinor:
                    data.result.payoutMinor - sub.stakeMinor,
                  isWin: data.result.isWin,
                  createdAt: sub.createdAt,
                };
                store.getState().setLastOutcome(outcome);
                // Refresh balance from server.
                fetch("/api/game/state")
                  .then((r) => r.json())
                  .then((s: GameStateResponse) => {
                    store.getState().setBalance(s.player.balanceMinor);
                    store.getState().setStats(
                      s.stats.totalRounds,
                      s.stats.totalTickets
                    );
                  })
                  .catch(() => {});
                // Refresh history.
                fetch("/api/game/history")
                  .then((r) => r.json())
                  .then((h) =>
                    useKenoStore.getState().setHistory(h.items ?? [])
                  )
                  .catch(() => {});

                if (data.result.isWin) {
                  const net = (
                    (data.result.payoutMinor - sub.stakeMinor) / 100
                  ).toFixed(2);
                  toast.success(
                    `Winner! ${data.result.matchCount}/${sub.spots} hits · +$${net}`
                  );
                } else {
                  toast.warning(
                    `${data.result.matchCount}/${sub.spots} hits — no payout this round.`
                  );
                }
              })
              .catch(() => {});
          }
        }
      } catch {
        // Network blip — try again next tick.
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // --- Submit a ticket to the current OPEN round ---------------------
  const handleSubmit = async () => {
    const { selectedNumbers, stakeMinor, currentRound } = store.getState();

    if (!currentRound || currentRound.round.phase !== "OPEN") {
      toast.error("Betting is closed. Wait for the next round to open.");
      return;
    }
    if (selectedNumbers.length === 0) {
      toast.error("Pick at least one number first.");
      return;
    }

    setIsSubmitting(true);
    const idempotencyKey = `ticket-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    try {
      const r = await fetch("/api/game/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedNumbers,
          stakeMinor,
          idempotencyKey,
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Request failed." }));
        toast.error(err.error ?? "Could not submit ticket.");
        return;
      }

      const d: SubmitResponse = await r.json();

      if (d.player) {
        store.getState().setBalance(d.player.balanceMinor);
      } else {
        // Refresh balance from state endpoint (covers replayed ticket case).
        fetch("/api/game/state")
          .then((r) => r.json())
          .then((s: GameStateResponse) =>
            store.getState().setBalance(s.player.balanceMinor)
          )
          .catch(() => {});
      }
      store.getState().setStats(
        store.getState().totalRounds + 1,
        store.getState().totalTickets + 1
      );
      store.getState().recordSpending(stakeMinor);

      store.getState().setSubmittedTicket({
        ticketId: d.ticket.id,
        roundId: d.ticket.roundId,
        roundNumber: d.ticket.roundNumber,
        selectedNumbers: d.ticket.selectedNumbers,
        spots: d.ticket.spots,
        stakeMinor: d.ticket.stakeMinor,
        status: d.ticket.status,
        createdAt: d.ticket.createdAt,
      });

      if (d.replayed) {
        toast.info("Replayed idempotent ticket.");
      } else {
        toast.success(
          `Ticket submitted for round #${d.ticket.roundNumber ?? "?"}. Good luck!`
        );
      }
    } catch (e) {
      console.error(e);
      toast.error("Network error while submitting ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Reset balance --------------------------------------------------
  const handleReset = async () => {
    setIsResetting(true);
    try {
      const r = await fetch("/api/game/reset", { method: "POST" });
      const d = await r.json();
      if (d.player) {
        store.getState().setBalance(d.player.balanceMinor);
        toast.success("Balance reset to $1,000.00");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not reset balance.");
    } finally {
      setIsResetting(false);
    }
  };

  // Pull state values for responsible-play + cooldown gating
  const cooldownUntil = useKenoStore((s) => s.cooldownUntil);
  const spendingLimitMinor = useKenoStore((s) => s.spendingLimitMinor);
  const sessionSpentMinor = useKenoStore((s) => s.sessionSpentMinor);
  const clearExpiredCooldown = useKenoStore((s) => s.clearExpiredCooldown);
  const activePanel = useKenoStore((s) => s.activePanel);
  const setActivePanel = useKenoStore((s) => s.setActivePanel);
  const undo = useKenoStore((s) => s.undo);
  const redo = useKenoStore((s) => s.redo);
  const quickPick = useKenoStore((s) => s.quickPick);
  const clearSelection = useKenoStore((s) => s.clearSelection);

  const cooldownActive = !!cooldownUntil && cooldownUntil > Date.now();
  const spendingLimitReached =
    spendingLimitMinor != null && sessionSpentMinor >= spendingLimitMinor;

  // Poll for cooldown expiry
  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => clearExpiredCooldown(), 500);
    return () => clearInterval(id);
  }, [cooldownUntil, clearExpiredCooldown]);

  // Keyboard shortcuts (only when round is OPEN and no submitted ticket)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? "";
      if (
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        clearSelection();
        return;
      }
      if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        quickPick();
      }
      if (e.key.toLowerCase() === "c") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, quickPick, clearSelection]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <GameHeader onReset={handleReset} isResetting={isResetting} />

      <main className="flex-1 w-full mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Round status bar — server-driven phase + countdown */}
        <RoundStatusBar />

        {/* Draw banner — server-driven progressive reveal */}
        <DrawBanner />

        {/* Board + Side panel */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 sm:gap-6">
          <div className="space-y-3">
            <KenoBoard />
            <HowItWorks />
          </div>
          <div className="space-y-4">
            <TicketBuilder
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              cooldownActive={cooldownActive}
              spendingLimitReached={spendingLimitReached}
            />
            <Tabs
              value={activePanel}
              onValueChange={(v) => setActivePanel(v as typeof activePanel)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="lab" className="text-xs gap-1">
                  <Beaker className="size-3" />
                  <span>Lab</span>
                </TabsTrigger>
                <TabsTrigger value="paytable" className="text-xs gap-1">
                  <Trophy className="size-3" />
                  <span>Paytable</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs gap-1">
                  <HistoryIcon className="size-3" />
                  <span>History</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="lab" className="mt-3">
                <KenoLabPanel />
              </TabsContent>
              <TabsContent value="paytable" className="mt-3">
                <PaytablePanel />
              </TabsContent>
              <TabsContent value="history" className="mt-3">
                <HistoryPanel onViewDetails={setDetailTicketId} />
              </TabsContent>
            </Tabs>

            {/* Link to the separate Number History page */}
            <Link
              href="/number-history"
              className="block rounded-lg border border-border/40 bg-card/60 backdrop-blur p-3 hover:border-accent/50 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Flame className="size-4 keno-amber-text" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">
                    Hot & Cold Numbers
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Full number-frequency history with hot/cold heatmap
                  </div>
                </div>
                <span className="text-xs text-muted-foreground group-hover:translate-x-0.5 transition-transform">
                  →
                </span>
              </div>
            </Link>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-border/40 bg-background/60">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 keno-emerald-text" />
            <span>
              Results are server-authoritative. The browser only animates
              numbers that the backend already persisted.
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono">
            {config && (
              <span className="flex items-center gap-1">
                <Cpu className="size-3" />
                {config.drawAlgorithmVersion}
              </span>
            )}
            <span>v1 paytable</span>
          </div>
        </div>
      </footer>

      <RoundDetailDialog
        ticketId={detailTicketId}
        onClose={() => setDetailTicketId(null)}
      />

      {cooldownActive && <CooldownOverlay />}
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur p-3 sm:p-4 text-xs text-muted-foreground leading-relaxed">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles className="size-3.5 keno-amber-text" />
        <span className="font-semibold text-foreground">How this works</span>
      </div>
      <p>
        Each round runs on a fixed server-driven schedule:{" "}
        <span className="font-semibold text-foreground">30s</span> for picking numbers,{" "}
        <span className="font-semibold text-foreground">20s</span> for revealing 20 drawn numbers (one per second),{" "}
        <span className="font-semibold text-foreground">30s</span> showing final results + countdown to next round.
        Submit your ticket before betting closes — the draw and settlement happen on the server on the round's own clock, independent of when you submit.
      </p>
      <p className="mt-2">
        <span className="font-semibold text-foreground">Keyboard:</span>{" "}
        <kbd className="px-1 py-0.5 rounded bg-background/60 border border-border/40 font-mono text-[10px]">Q</kbd> quick pick,{" "}
        <kbd className="px-1 py-0.5 rounded bg-background/60 border border-border/40 font-mono text-[10px]">C</kbd> clear,{" "}
        <kbd className="px-1 py-0.5 rounded bg-background/60 border border-border/40 font-mono text-[10px]">Ctrl+Z</kbd> undo,{" "}
        <kbd className="px-1 py-0.5 rounded bg-background/60 border border-border/40 font-mono text-[10px]">Ctrl+Shift+Z</kbd> redo.
      </p>
    </div>
  );
}
