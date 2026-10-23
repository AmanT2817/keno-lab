"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { KENO_MAX_SPOTS, KENO_POOL_SIZE } from "@/lib/keno/engine";

export type TileState =
  | "idle"
  | "selected"
  | "drawn"
  | "matched"
  | "missed";

export type KenoTheme = "midnight" | "emerald" | "slate";

export interface PlayOutcome {
  ticketId: string;
  roundId: string;
  selectedNumbers: number[];
  drawnNumbers: number[];
  matchedNumbers: number[];
  matchCount: number;
  spots: number;
  stakeMinor: number;
  payoutMinor: number;
  multiplier: number;
  netPayoutMinor: number;
  isWin: boolean;
  createdAt: string;
}

export interface HistoryItem extends PlayOutcome {
  winningNumbers: number[];
  status: string;
  rulesVersion: string;
  roundStatus: string;
}

export interface SavedSet {
  id: string;
  name: string;
  numbers: number[];
  createdAt: string;
}

/**
 * Server-authoritative current round state, polled from
 * /api/game/current-round. The browser derives ALL visible game phases
 * from this object — never from a client timer.
 */
export interface CurrentRoundState {
  round: {
    id: string;
    roundNumber: number | null;
    status: string;
    phase: "OPEN" | "DRAWING" | "RESULTS" | "WAITING";
    opensAt: string;
    closesAt: string | null;
    drawnAt: string | null;
    settledAt: string | null;
    scheduledClosesAt: string | null;
    scheduledDrawnAt: string | null;
    scheduledSettledAt: string | null;
    scheduledNextRoundAt: string | null;
    rulesVersion: string;
  };
  draw: {
    winningNumbers: number[];
    revealedCount: number;
    totalCount: number;
    algorithmVersion: string | null;
  };
  serverTime: number;
  countdownMs: number;
  nextPhaseLabel: string;
}

/**
 * The user's submitted ticket for the current round. Persisted only in
 * memory; cleared when the round changes so old tickets can't be re-submitted.
 */
export interface SubmittedTicket {
  ticketId: string;
  roundId: string;
  roundNumber: number | null;
  selectedNumbers: number[];
  spots: number;
  stakeMinor: number;
  status: string;
  createdAt: string;
}

interface KenoState {
  // Player + game state
  playerBalanceMinor: number | null;
  totalRounds: number;
  totalTickets: number;

  // Current scheduled round (server-driven)
  currentRound: CurrentRoundState | null;
  currentRoundLoading: boolean;
  submittedTicket: SubmittedTicket | null; // ticket for the CURRENT round
  lastOutcome: PlayOutcome | null;          // last settled ticket outcome

  // Selection state
  selectedNumbers: number[];

  // Undo / redo stacks (snapshots of selectedNumbers)
  undoStack: number[][];
  redoStack: number[][];

  // Stake
  stakeMinor: number;

  // Error state
  errorMessage: string | null;

  // History
  history: HistoryItem[];
  historyLoading: boolean;

  // Theme + accessibility (persisted)
  theme: KenoTheme;
  reducedMotion: boolean;

  // Responsible play (persisted)
  sessionStartedAt: number | null;
  sessionSeconds: number;
  spendingLimitMinor: number | null;
  sessionSpentMinor: number;
  cooldownUntil: number | null;

  // Saved number sets (persisted)
  savedSets: SavedSet[];

  // Active right-panel view: paytable | history | lab
  activePanel: "paytable" | "history" | "lab";

  // Actions
  setBalance: (n: number) => void;
  setStats: (rounds: number, tickets: number) => void;
  setCurrentRound: (state: CurrentRoundState | null) => void;
  setCurrentRoundLoading: (b: boolean) => void;
  setSubmittedTicket: (t: SubmittedTicket | null) => void;
  setLastOutcome: (o: PlayOutcome | null) => void;
  toggleNumber: (n: number) => void;
  setSelection: (numbers: number[]) => void;
  setStake: (n: number) => void;
  quickPick: (count?: number) => void;
  clearSelection: () => void;
  undo: () => void;
  redo: () => void;
  saveCurrentSet: (name: string) => void;
  loadSavedSet: (id: string) => void;
  deleteSavedSet: (id: string) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
  setHistory: (items: HistoryItem[]) => void;
  setHistoryLoading: (b: boolean) => void;
  setTheme: (t: KenoTheme) => void;
  setReducedMotion: (b: boolean) => void;
  setActivePanel: (p: "paytable" | "history" | "lab") => void;
  tickSession: () => void;
  recordSpending: (amountMinor: number) => void;
  setSpendingLimit: (amountMinor: number | null) => void;
  startCooldown: (seconds: number) => void;
  clearExpiredCooldown: () => void;
  resetSession: () => void;
}

function randomUniqueIntegers(count: number, max: number): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  // Use Math.random here for client-side quick pick; the actual game
  // outcome is server-authoritative (CSPRNG Fisher-Yates on the server).
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

function pushUndo(state: KenoState): Partial<KenoState> {
  return {
    undoStack: [...state.undoStack, state.selectedNumbers].slice(-50),
    redoStack: [],
  };
}

export const useKenoStore = create<KenoState>()(
  persist(
    (set, get) => ({
      playerBalanceMinor: null,
      totalRounds: 0,
      totalTickets: 0,

      currentRound: null,
      currentRoundLoading: false,
      submittedTicket: null,
      lastOutcome: null,

      selectedNumbers: [],
      undoStack: [],
      redoStack: [],

      stakeMinor: 1000,

      errorMessage: null,

      history: [],
      historyLoading: false,

      theme: "midnight",
      reducedMotion: false,

      sessionStartedAt: null,
      sessionSeconds: 0,
      spendingLimitMinor: null,
      sessionSpentMinor: 0,
      cooldownUntil: null,

      savedSets: [],

      activePanel: "paytable",

      setBalance: (n) => set({ playerBalanceMinor: n }),
      setStats: (rounds, tickets) =>
        set({ totalRounds: rounds, totalTickets: tickets }),

      /**
       * Update the current round state from the server. If the round ID
       * has changed (meaning a new round opened), reset the per-round
       * selection state and clear the in-progress ticket so the user
       * starts fresh in the new round. This is the SOLE place where
       * cross-round selection reset happens — never do it on draw
       * animation start.
       *
       * IMPORTANT: savedSets, theme, balance, history, and all
       * persisted/responsible-play state are explicitly NOT cleared
       * — only the round-scoped selection state.
       */
      setCurrentRound: (next) => {
        const state = get();
        const prevId = state.currentRound?.round.id;
        const nextId = next?.round.id;
        if (prevId === nextId) {
          // Same round, just refresh state (countdown tick etc.).
          set({ currentRound: next });
          return;
        }
        // Round ID changed (or first load / null → round).
        // Reset per-round state so the user starts fresh.
        set({
          currentRound: next,
          selectedNumbers: [],
          undoStack: [],
          redoStack: [],
          submittedTicket: null,
          lastOutcome: null,
          errorMessage: null,
        });
      },

      setCurrentRoundLoading: (b) => set({ currentRoundLoading: b }),
      setSubmittedTicket: (t) => set({ submittedTicket: t }),
      setLastOutcome: (o) => set({ lastOutcome: o }),

      toggleNumber: (n) => {
        const state = get();
        // Block selection while not in OPEN phase (betting closed).
        const phase = state.currentRound?.round.phase;
        if (phase && phase !== "OPEN") return;
        if (state.submittedTicket) return; // already submitted this round
        const has = state.selectedNumbers.includes(n);
        const next = has
          ? state.selectedNumbers.filter((x) => x !== n)
          : state.selectedNumbers.length >= KENO_MAX_SPOTS
            ? state.selectedNumbers
            : [...state.selectedNumbers, n].sort((a, b) => a - b);
        if (next === state.selectedNumbers) return;
        set({
          selectedNumbers: next,
          ...pushUndo(state),
        });
      },

      setSelection: (numbers) => {
        const state = get();
        const phase = state.currentRound?.round.phase;
        if (phase && phase !== "OPEN") return;
        if (state.submittedTicket) return;
        const sorted = [...numbers].sort((a, b) => a - b);
        if (
          sorted.length === state.selectedNumbers.length &&
          sorted.every((v, i) => v === state.selectedNumbers[i])
        )
          return;
        set({
          selectedNumbers: sorted,
          ...pushUndo(state),
        });
      },

      setStake: (n) => set({ stakeMinor: n }),

      quickPick: (count) => {
        const state = get();
        const phase = state.currentRound?.round.phase;
        if (phase && phase !== "OPEN") return;
        if (state.submittedTicket) return;
        const n = count ?? Math.max(1, state.selectedNumbers.length || 6);
        const picked = randomUniqueIntegers(n, KENO_POOL_SIZE);
        set({
          selectedNumbers: picked,
          ...pushUndo(state),
        });
      },

      clearSelection: () => {
        const state = get();
        const phase = state.currentRound?.round.phase;
        if (phase && phase !== "OPEN") return;
        if (state.submittedTicket) return;
        if (state.selectedNumbers.length === 0) return;
        set({
          selectedNumbers: [],
          ...pushUndo(state),
        });
      },

      undo: () => {
        const state = get();
        const phase = state.currentRound?.round.phase;
        if (phase && phase !== "OPEN") return;
        if (state.submittedTicket) return;
        if (state.undoStack.length === 0) return;
        const prev = state.undoStack[state.undoStack.length - 1];
        set({
          selectedNumbers: prev,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, state.selectedNumbers].slice(-50),
        });
      },

      redo: () => {
        const state = get();
        const phase = state.currentRound?.round.phase;
        if (phase && phase !== "OPEN") return;
        if (state.submittedTicket) return;
        if (state.redoStack.length === 0) return;
        const next = state.redoStack[state.redoStack.length - 1];
        set({
          selectedNumbers: next,
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack, state.selectedNumbers].slice(-50),
        });
      },

      saveCurrentSet: (name) => {
        const state = get();
        if (state.selectedNumbers.length === 0) return;
        const newSet: SavedSet = {
          id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim() || `Set ${state.savedSets.length + 1}`,
          numbers: [...state.selectedNumbers].sort((a, b) => a - b),
          createdAt: new Date().toISOString(),
        };
        set({ savedSets: [newSet, ...state.savedSets].slice(0, 12) });
      },

      loadSavedSet: (id) => {
        const state = get();
        const phase = state.currentRound?.round.phase;
        if (phase && phase !== "OPEN") return;
        if (state.submittedTicket) return;
        const found = state.savedSets.find((s) => s.id === id);
        if (!found) return;
        set({
          selectedNumbers: [...found.numbers].sort((a, b) => a - b),
          ...pushUndo(state),
        });
      },

      deleteSavedSet: (id) => {
        set((s) => ({ savedSets: s.savedSets.filter((x) => x.id !== id) }));
      },

      setError: (msg) => set({ errorMessage: msg }),

      reset: () =>
        set({
          selectedNumbers: [],
          undoStack: [],
          redoStack: [],
          submittedTicket: null,
          lastOutcome: null,
          errorMessage: null,
        }),

      setHistory: (items) => set({ history: items }),
      setHistoryLoading: (b) => set({ historyLoading: b }),

      setTheme: (t) => {
        set({ theme: t });
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-keno-theme", t);
          try {
            localStorage.setItem("keno-theme", t);
          } catch {}
        }
      },

      setReducedMotion: (b) => {
        set({ reducedMotion: b });
        if (typeof document !== "undefined") {
          if (b) document.documentElement.classList.add("reduce-motion");
          else document.documentElement.classList.remove("reduce-motion");
          try {
            localStorage.setItem("keno-reduced-motion", b ? "1" : "0");
          } catch {}
        }
      },

      setActivePanel: (p) => set({ activePanel: p }),

      tickSession: () => {
        const s = get();
        if (!s.sessionStartedAt) {
          set({ sessionStartedAt: Date.now(), sessionSeconds: 1 });
          return;
        }
        set({ sessionSeconds: Math.floor((Date.now() - s.sessionStartedAt) / 1000) });
      },

      recordSpending: (amountMinor) => {
        set((s) => ({
          sessionSpentMinor: s.sessionSpentMinor + amountMinor,
        }));
      },

      setSpendingLimit: (amountMinor) =>
        set({ spendingLimitMinor: amountMinor }),

      startCooldown: (seconds) => {
        set({ cooldownUntil: Date.now() + seconds * 1000 });
      },

      clearExpiredCooldown: () => {
        const s = get();
        if (s.cooldownUntil && Date.now() >= s.cooldownUntil) {
          set({ cooldownUntil: null });
        }
      },

      resetSession: () =>
        set({
          sessionStartedAt: Date.now(),
          sessionSeconds: 0,
          sessionSpentMinor: 0,
          cooldownUntil: null,
        }),
    }),
    {
      name: "keno-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        theme: s.theme,
        reducedMotion: s.reducedMotion,
        savedSets: s.savedSets,
        spendingLimitMinor: s.spendingLimitMinor,
        sessionStartedAt: s.sessionStartedAt,
        sessionSeconds: s.sessionSeconds,
        sessionSpentMinor: s.sessionSpentMinor,
        cooldownUntil: s.cooldownUntil,
      }),
    }
  )
);
