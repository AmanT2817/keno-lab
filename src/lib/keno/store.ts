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

interface KenoState {
  // Player + game state
  playerBalanceMinor: number | null;
  totalRounds: number;
  totalTickets: number;

  // Selection state
  selectedNumbers: number[];

  // Undo / redo stacks (snapshots of selectedNumbers)
  undoStack: number[][];
  redoStack: number[][];

  // Stake
  stakeMinor: number;

  // Drawing/animation state
  isPlaying: boolean;
  drawnNumbers: number[];
  revealedCount: number;
  lastOutcome: PlayOutcome | null;
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
  startPlay: () => void;
  setDrawn: (drawn: number[]) => void;
  revealNext: () => void;
  finishPlay: (outcome: PlayOutcome) => void;
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

      selectedNumbers: [],
      undoStack: [],
      redoStack: [],

      stakeMinor: 1000,

      isPlaying: false,
      drawnNumbers: [],
      revealedCount: 0,
      lastOutcome: null,
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

      toggleNumber: (n) => {
        const state = get();
        if (state.isPlaying) return;
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
        if (state.isPlaying) return;
        const n = count ?? Math.max(1, state.selectedNumbers.length || 6);
        const picked = randomUniqueIntegers(n, KENO_POOL_SIZE);
        set({
          selectedNumbers: picked,
          ...pushUndo(state),
        });
      },

      clearSelection: () => {
        const state = get();
        if (state.isPlaying) return;
        if (state.selectedNumbers.length === 0) return;
        set({
          selectedNumbers: [],
          ...pushUndo(state),
        });
      },

      undo: () => {
        const state = get();
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

      startPlay: () =>
        set({
          isPlaying: true,
          drawnNumbers: [],
          revealedCount: 0,
          lastOutcome: null,
          errorMessage: null,
          sessionStartedAt:
            get().sessionStartedAt ?? Date.now(),
        }),

      setDrawn: (drawn) => set({ drawnNumbers: drawn }),

      revealNext: () => {
        const state = get();
        if (!state.isPlaying) return;
        if (state.revealedCount >= state.drawnNumbers.length) return;
        set({ revealedCount: state.revealedCount + 1 });
      },

      finishPlay: (outcome) =>
        set({
          isPlaying: false,
          revealedCount: 20,
          lastOutcome: outcome,
        }),

      setError: (msg) => set({ errorMessage: msg, isPlaying: false }),

      reset: () =>
        set({
          selectedNumbers: [],
          undoStack: [],
          redoStack: [],
          isPlaying: false,
          drawnNumbers: [],
          revealedCount: 0,
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
