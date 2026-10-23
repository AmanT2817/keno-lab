"use client";

import { useState } from "react";
import { useKenoStore } from "@/lib/keno/store";
import { KENO_MAX_SPOTS, KENO_MIN_SPOTS } from "@/lib/keno/engine";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dices,
  Eraser,
  Sparkles,
  Play,
  Loader2,
  Undo2,
  Redo2,
  Save,
  Star,
  X,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STAKE_PRESETS = [
  { label: "1", value: 100 },
  { label: "5", value: 500 },
  { label: "10", value: 1000 },
  { label: "25", value: 2500 },
  { label: "50", value: 5000 },
];

interface TicketBuilderProps {
  onSubmit: () => void;
  isSubmitting: boolean;
  cooldownActive?: boolean;
  spendingLimitReached?: boolean;
}

export function TicketBuilder({
  onSubmit,
  isSubmitting,
  cooldownActive = false,
  spendingLimitReached = false,
}: TicketBuilderProps) {
  const currentRound = useKenoStore((s) => s.currentRound);
  const submittedTicket = useKenoStore((s) => s.submittedTicket);
  const phase = currentRound?.round.phase;
  const isBettingOpen = phase === "OPEN";
  const hasSubmitted = !!submittedTicket;
  const selectedNumbers = useKenoStore((s) => s.selectedNumbers);
  const stakeMinor = useKenoStore((s) => s.stakeMinor);
  const setStake = useKenoStore((s) => s.setStake);
  const quickPick = useKenoStore((s) => s.quickPick);
  const clearSelection = useKenoStore((s) => s.clearSelection);
  const undo = useKenoStore((s) => s.undo);
  const redo = useKenoStore((s) => s.redo);
  const undoStack = useKenoStore((s) => s.undoStack);
  const redoStack = useKenoStore((s) => s.redoStack);
  const savedSets = useKenoStore((s) => s.savedSets);
  const saveCurrentSet = useKenoStore((s) => s.saveCurrentSet);
  const loadSavedSet = useKenoStore((s) => s.loadSavedSet);
  const deleteSavedSet = useKenoStore((s) => s.deleteSavedSet);

  const [saveName, setSaveName] = useState("");

  const spotCount = selectedNumbers.length;
  // Block ALL selection interactions while betting is closed OR a ticket
  // is already submitted for this round OR a cooldown is active.
  const bettingClosed = !isBettingOpen || hasSubmitted;
  const blocked =
    bettingClosed ||
    isSubmitting ||
    cooldownActive ||
    (spendingLimitReached && spotCount > 0);

  // Submit is allowed only when round is OPEN, no ticket yet submitted,
  // at least MIN_SPOTS selected, no cooldown, no spending-limit breach.
  const canSubmit =
    isBettingOpen &&
    !hasSubmitted &&
    spotCount >= KENO_MIN_SPOTS &&
    spotCount <= KENO_MAX_SPOTS &&
    !isSubmitting &&
    !cooldownActive &&
    !spendingLimitReached;

  const spotsRemaining = Math.max(0, KENO_MAX_SPOTS - spotCount);
  const stakeMajor = (stakeMinor / 100).toFixed(2);

  return (
    <Card className="bg-card/80 backdrop-blur border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="size-4 keno-amber-text" />
          Ticket Studio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {/* Selected chips */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Your picks</span>
            <span>
              <span
                className={cn(
                  "font-semibold",
                  spotCount >= KENO_MIN_SPOTS
                    ? "keno-emerald-text"
                    : "keno-rose-text"
                )}
              >
                {spotCount}
              </span>{" "}
              / {KENO_MAX_SPOTS} spots
              {spotsRemaining === 0 && spotCount > 0 && " (full)"}
            </span>
          </div>
          <div
            className={cn(
              "min-h-[2.5rem] flex flex-wrap gap-1.5 p-2 rounded-md",
              "bg-background/60 border border-border/40 keno-scrollbar",
              "max-h-24 overflow-y-auto"
            )}
          >
            {selectedNumbers.length === 0 ? (
              <span className="text-xs text-muted-foreground self-center pl-1">
                Click numbers on the board, hit Quick Pick, or use a saved set.
              </span>
            ) : (
              selectedNumbers.map((n) => (
                <span
                  key={n}
                  className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold border border-primary/30"
                >
                  {n}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Action row: Quick Pick / Undo / Redo / Clear */}
        <div className="grid grid-cols-4 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => quickPick(spotCount || 6)}
            disabled={blocked}
            title="Quick Pick"
          >
            <Dices className="size-4" />
            <span className="hidden xs:inline">Pick</span>
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={undo}
                  disabled={blocked || undoStack.length === 0}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={redo}
                  disabled={blocked || redoStack.length === 0}
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <Redo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="outline"
            size="sm"
            onClick={clearSelection}
            disabled={blocked || selectedNumbers.length === 0}
            title="Clear all"
          >
            <Eraser className="size-4" />
            <span className="hidden xs:inline">Clear</span>
          </Button>
        </div>

        {/* Saved sets */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Save current set as…"
              className="flex-1 h-8 rounded-md border border-border/40 bg-background/60 px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={20}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={() => {
                saveCurrentSet(saveName);
                setSaveName("");
              }}
              disabled={blocked || spotCount === 0}
            >
              <Save className="size-3.5" />
              Save
            </Button>
          </div>
          {savedSets.length > 0 && (
            <div
              className={cn(
                "max-h-24 overflow-y-auto keno-scrollbar rounded-md",
                "bg-background/40 border border-border/30 p-1.5 space-y-1"
              )}
            >
              {savedSets.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-1.5 text-[11px] group"
                >
                  <button
                    onClick={() => loadSavedSet(s.id)}
                    disabled={blocked}
                    className={cn(
                      "flex-1 flex items-center gap-1.5 text-left rounded px-1 py-0.5",
                      "hover:bg-accent/10 transition-colors disabled:opacity-50"
                    )}
                  >
                    <Star className="size-3 keno-amber-text shrink-0" />
                    <span className="font-medium truncate">{s.name}</span>
                    <span className="text-muted-foreground font-mono truncate">
                      ({s.numbers.length}) {s.numbers.slice(0, 4).join(",")}
                      {s.numbers.length > 4 && "…"}
                    </span>
                  </button>
                  <button
                    onClick={() => deleteSavedSet(s.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-0.5"
                    aria-label={`Delete ${s.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stake */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Stake</span>
            <span className="font-mono keno-amber-text font-semibold">
              ${stakeMajor}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {STAKE_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                size="sm"
                variant={stakeMinor === preset.value ? "default" : "outline"}
                onClick={() => setStake(preset.value)}
                disabled={blocked}
                className="h-9 px-0"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Cooldown / limit banner */}
        {cooldownActive && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-[11px] text-destructive flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            You’re in a self-imposed cooldown. Play resumes when the timer ends.
          </div>
        )}
        {!cooldownActive &&
          spendingLimitReached &&
          spotCount > 0 && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-[11px] text-destructive">
              Session spending limit reached. Adjust the limit in the
              responsible-play menu to play more.
            </div>
          )}

        {/* Betting-closed banner */}
        {bettingClosed && !cooldownActive && !hasSubmitted && (
          <div className="rounded-md bg-muted/30 border border-border/40 p-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Lock className="size-3" />
            {phase === "DRAWING"
              ? "Round is being drawn — wait for the next round."
              : phase === "RESULTS"
                ? "Round complete — wait for the next round."
                : phase === "WAITING"
                  ? "Next round opening soon…"
                  : "Betting is closed for this round."}
          </div>
        )}

        {/* Already-submitted banner */}
        {hasSubmitted && (
          <div className="rounded-md bg-primary/10 border border-primary/30 p-2 text-[11px] text-primary flex items-center gap-1.5">
            <CheckCircle2 className="size-3" />
            Ticket submitted for round #{submittedTicket?.roundNumber ?? "?"}.
            Wait for the draw and the next round to open.
          </div>
        )}

        {/* Submit */}
        <Button
          size="lg"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(
            "w-full text-base font-semibold tracking-wide",
            "bg-gradient-to-r from-primary to-accent text-primary-foreground",
            "shadow-lg shadow-primary/20 hover:shadow-primary/40",
            "transition-all"
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting…
            </>
          ) : hasSubmitted ? (
            <>Ticket submitted</>
          ) : !isBettingOpen ? (
            <>Betting closed</>
          ) : cooldownActive ? (
            <>Cooling off…</>
          ) : (
            <>
              <Play className="size-4" />
              Submit Ticket
            </>
          )}
        </Button>
        {!canSubmit &&
          spotCount < KENO_MIN_SPOTS &&
          isBettingOpen &&
          !hasSubmitted &&
          !cooldownActive && (
            <p className="text-[11px] text-muted-foreground text-center">
              Select at least {KENO_MIN_SPOTS} number to submit a ticket.
            </p>
          )}
      </CardContent>
    </Card>
  );
}
