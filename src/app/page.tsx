"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useKenoStore } from "@/lib/keno/store";
import { GameHeader } from "@/components/keno/GameHeader";
import { KenoBoard } from "@/components/keno/KenoBoard";
import { TicketBuilder } from "@/components/keno/TicketBuilder";
import { PaytablePanel } from "@/components/keno/PaytablePanel";
import { HistoryPanel } from "@/components/keno/HistoryPanel";
import { KenoLabPanel } from "@/components/keno/KenoLabPanel";
import { DrawBanner } from "@/components/keno/DrawBanner";
import { RoundDetailDialog } from "@/components/keno/RoundDetailDialog";
import { CooldownOverlay } from "@/components/keno/ResponsiblePlay";
import { toast } from "sonner";
import { Sparkles, ShieldCheck, Cpu, Beaker, Trophy, History as HistoryIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
    paytablePreview: Record<number, { hits: number; multiplier: number }[]>;
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
  lastTicket: null | {
    id: string;
    selectedNumbers: number[];
    spots: number;
    stakeMinor: number;
    status: string;
    createdAt: string;
    winningNumbers: number[];
    matchedNumbers: number[];
    matchCount: number;
    payoutMinor: number;
    isWin: boolean;
  };
}

interface PlayResponse {
  replayed: boolean;
  player: { id: string; name: string; balanceMinor: number };
  ticket: {
    id: string;
    roundId: string;
    selectedNumbers: number[];
    spots: number;
    stakeMinor: number;
    paytableVersion: string;
    status: string;
    createdAt: string;
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
  };
  result: {
    matchedNumbers: number[];
    matchCount: number;
    payoutMinor: number;
    multiplier: number;
    netPayoutMinor: number;
    isWin: boolean;
  };
}

const REVEAL_INTERVAL_MS = 110;

export default function Home() {
  const store = useKenoStore;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [config, setConfig] = useState<GameStateResponse["config"] | null>(null);
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);

  const animationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pull state values we need for the play flow + responsible play.
  const selectedNumbers = useKenoStore((s) => s.selectedNumbers);
  const stakeMinor = useKenoStore((s) => s.stakeMinor);
  const cooldownUntil = useKenoStore((s) => s.cooldownUntil);
  const spendingLimitMinor = useKenoStore((s) => s.spendingLimitMinor);
  const sessionSpentMinor = useKenoStore((s) => s.sessionSpentMinor);
  const recordSpending = useKenoStore((s) => s.recordSpending);
  const clearExpiredCooldown = useKenoStore((s) => s.clearExpiredCooldown);
  const activePanel = useKenoStore((s) => s.activePanel);
  const setActivePanel = useKenoStore((s) => s.setActivePanel);
  const reducedMotion = useKenoStore((s) => s.reducedMotion);
  const toggleNumber = useKenoStore((s) => s.toggleNumber);
  const undo = useKenoStore((s) => s.undo);
  const redo = useKenoStore((s) => s.redo);
  const quickPick = useKenoStore((s) => s.quickPick);
  const clearSelection = useKenoStore((s) => s.clearSelection);

  const cooldownActive = !!cooldownUntil && cooldownUntil > Date.now();
  const spendingLimitReached =
    spendingLimitMinor != null && sessionSpentMinor >= spendingLimitMinor;

  // --- Initial load: fetch game state -----------------------------------
  const loadState = useCallback(async () => {
    try {
      const r = await fetch("/api/game/state");
      const d: GameStateResponse = await r.json();
      setConfig(d.config);
      store.getState().setBalance(d.player.balanceMinor);
      store.getState().setStats(d.stats.totalRounds, d.stats.totalTickets);
      if (d.lastTicket) {
        const last = d.lastTicket;
        store.getState().finishPlay({
          ticketId: last.id,
          roundId: "",
          selectedNumbers: last.selectedNumbers,
          drawnNumbers: last.winningNumbers,
          matchedNumbers: last.matchedNumbers,
          matchCount: last.matchCount,
          spots: last.spots,
          stakeMinor: last.stakeMinor,
          payoutMinor: last.payoutMinor,
          multiplier: 0,
          netPayoutMinor: last.payoutMinor - last.stakeMinor,
          isWin: last.isWin,
          createdAt: last.createdAt,
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not load game state.");
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Cleanup animation timer on unmount
  useEffect(() => {
    return () => {
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
      }
    };
  }, []);

  // Poll for cooldown expiry (in case the user has the tab open)
  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => clearExpiredCooldown(), 500);
    return () => clearInterval(id);
  }, [cooldownUntil, clearExpiredCooldown]);

  // --- Keyboard navigation ----------------------------------------------
  // 1-9 0  (top row of keyboard) → select 1..10
  // Type 2-digit number 01..80 then Enter → toggle that number
  // Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo
  // Q = quick pick, C = clear, Esc = clear typed buffer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? "";
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }

      // Undo/Redo
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
        typedBufferRef.current = "";
        return;
      }
      if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        quickPick();
        return;
      }
      if (e.key.toLowerCase() === "c") {
        clearSelection();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, quickPick, clearSelection]);

  // Separate typed-digit buffer ref (avoids re-subscribing the effect each render).
  const typedBufferRef = useRef<string>("");

  // --- Play: submit ticket, then animate the server-authoritative draw ---
  const handlePlay = async () => {
    const { selectedNumbers: sel, stakeMinor: stake } = store.getState();

    if (cooldownActive) {
      toast.error("You’re in a cooldown — wait for the timer to end.");
      return;
    }
    if (spendingLimitReached) {
      toast.error("Session spending limit reached. Adjust it in the menu to continue.");
      return;
    }
    if (sel.length === 0) {
      toast.error("Pick at least one number first.");
      return;
    }

    setIsSubmitting(true);
    const idempotencyKey = `play-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    try {
      const r = await fetch("/api/game/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedNumbers: sel,
          stakeMinor: stake,
          idempotencyKey,
        }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Request failed." }));
        toast.error(err.error ?? "Could not play the round.");
        return;
      }

      const d: PlayResponse = await r.json();

      // Update player balance immediately (server-authoritative).
      store.getState().setBalance(d.player.balanceMinor);
      store.getState().setStats(
        store.getState().totalRounds + 1,
        store.getState().totalTickets + 1
      );
      recordSpending(stake);

      // Begin the draw animation with the server's authoritative numbers.
      store.getState().startPlay();
      store.getState().setDrawn(d.draw.winningNumbers);

      // Animate the 20 numbers one by one. Reduced-motion → instant.
      if (reducedMotion) {
        store.getState().revealNext(); // jump to 1
        for (let i = 0; i < 19; i++) store.getState().revealNext();
        finishPlayFlow(d);
        return;
      }

      let tick = 0;
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
      }
      animationTimerRef.current = setInterval(() => {
        tick += 1;
        store.getState().revealNext();
        if (tick >= 20 && animationTimerRef.current) {
          clearInterval(animationTimerRef.current);
          animationTimerRef.current = null;
          finishPlayFlow(d);
        }
      }, REVEAL_INTERVAL_MS);
    } catch (e) {
      console.error(e);
      toast.error("Network error while playing.");
      store.getState().setError("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const finishPlayFlow = (d: PlayResponse) => {
    const outcome = {
      ticketId: d.ticket.id,
      roundId: d.round.id,
      selectedNumbers: d.ticket.selectedNumbers,
      drawnNumbers: d.draw.winningNumbers,
      matchedNumbers: d.result.matchedNumbers,
      matchCount: d.result.matchCount,
      spots: d.ticket.spots,
      stakeMinor: d.ticket.stakeMinor,
      payoutMinor: d.result.payoutMinor,
      multiplier: d.result.multiplier,
      netPayoutMinor: d.result.netPayoutMinor,
      isWin: d.result.isWin,
      createdAt: d.ticket.createdAt,
    };
    store.getState().finishPlay(outcome);

    setTimeout(() => {
      fetch("/api/game/history")
        .then((r) => r.json())
        .then((h) => {
          useKenoStore.getState().setHistory(h.items ?? []);
        })
        .catch(() => {});
    }, 200);

    if (d.replayed) {
      toast.info("Replayed idempotent ticket.");
    } else if (d.result.isWin) {
      const net = (d.result.netPayoutMinor / 100).toFixed(2);
      toast.success(
        `Winner! ${d.result.matchCount}/${d.ticket.spots} hits · ${d.result.multiplier}x · +$${net}`
      );
    } else {
      toast.warning(
        `${d.result.matchCount}/${d.ticket.spots} hits — no payout this round.`
      );
    }
  };

  // --- Reset balance ----------------------------------------------------
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

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <GameHeader onReset={handleReset} isResetting={isResetting} />

      <main className="flex-1 w-full mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Draw banner (only shown while playing or after settle) */}
        <DrawBanner />

        {/* Board + Side panel */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 sm:gap-6">
          <div className="space-y-3">
            <KenoBoard />
            <HowItWorks />
          </div>
          <div className="space-y-4">
            <TicketBuilder
              onPlay={handlePlay}
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
        Pick 1–10 numbers from the 80-number board above, choose a stake, and
        hit <span className="font-semibold text-foreground">Play Round</span>.
        The server submits your ticket, debits your stake, draws 20 unique
        numbers with a CSPRNG Fisher–Yates shuffle, persists the draw
        immutably, counts your matches, and credits any payout — all inside
        one idempotent transaction. The animation you see afterwards is purely
        cosmetic; the authoritative result is already saved.
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
