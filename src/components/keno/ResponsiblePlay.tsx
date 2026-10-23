"use client";

import { useEffect, useState } from "react";
import { useKenoStore } from "@/lib/keno/store";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Timer,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}

export function ResponsiblePlayButton() {
  const sessionSeconds = useKenoStore((s) => s.sessionSeconds);
  const tickSession = useKenoStore((s) => s.tickSession);
  const sessionSpentMinor = useKenoStore((s) => s.sessionSpentMinor);
  const spendingLimitMinor = useKenoStore((s) => s.spendingLimitMinor);
  const setSpendingLimit = useKenoStore((s) => s.setSpendingLimit);
  const startCooldown = useKenoStore((s) => s.startCooldown);
  const resetSession = useKenoStore((s) => s.resetSession);
  const reducedMotion = useKenoStore((s) => s.reducedMotion);
  const setReducedMotion = useKenoStore((s) => s.setReducedMotion);

  const [limitInput, setLimitInput] = useState<string>(
    spendingLimitMinor != null ? (spendingLimitMinor / 100).toFixed(2) : ""
  );

  // tick every second
  useEffect(() => {
    const id = setInterval(() => tickSession(), 1000);
    return () => clearInterval(id);
  }, [tickSession]);

  const spent = (sessionSpentMinor / 100).toFixed(2);
  const limitReached =
    spendingLimitMinor != null && sessionSpentMinor >= spendingLimitMinor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 font-mono",
            limitReached && "border-destructive/60 text-destructive"
          )}
          title="Session timer & responsible play"
        >
          <Timer className="size-3.5" />
          <span className="hidden sm:inline">
            {formatHMS(sessionSeconds)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-primary" />
          Responsible Play
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Session time */}
        <div className="px-2 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Session time</span>
            <span className="font-mono font-semibold">
              {formatHMS(sessionSeconds)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Spent this session</span>
            <span className="font-mono font-semibold">${spent}</span>
          </div>
          {spendingLimitMinor != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Spending limit</span>
              <span
                className={cn(
                  "font-mono font-semibold",
                  limitReached ? "text-destructive" : "text-primary"
                )}
              >
                ${(spendingLimitMinor / 100).toFixed(2)}
              </span>
            </div>
          )}
          {limitReached && (
            <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-1.5">
              <AlertTriangle className="size-3 shrink-0" />
              Limit reached — take a break.
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* Spending limit */}
        <div className="px-2 py-2 space-y-2">
          <Label htmlFor="limit-input" className="text-xs">
            Spending limit ($)
          </Label>
          <div className="flex gap-1.5">
            <Input
              id="limit-input"
              type="number"
              min="0"
              step="1"
              placeholder="no limit"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={() => {
                const v = parseFloat(limitInput);
                if (isNaN(v) || v <= 0) {
                  setSpendingLimit(null);
                  toast.success("Spending limit cleared.");
                } else {
                  setSpendingLimit(Math.round(v * 100));
                  toast.success(`Limit set to $${v.toFixed(2)}.`);
                }
              }}
            >
              Set
            </Button>
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Reduced motion */}
        <div className="px-2 py-2 flex items-center justify-between">
          <div className="flex flex-col">
            <Label htmlFor="rm-toggle" className="text-xs">
              Reduced motion
            </Label>
            <span className="text-[10px] text-muted-foreground">
              Kill animations
            </span>
          </div>
          <Switch
            id="rm-toggle"
            checked={reducedMotion}
            onCheckedChange={setReducedMotion}
          />
        </div>

        <DropdownMenuSeparator />

        {/* Take a break */}
        <div className="px-2 py-2 space-y-1.5">
          <Label className="text-xs">Take a break</Label>
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                startCooldown(60);
                toast.info("Cooling off for 1 minute.");
              }}
            >
              1m
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                startCooldown(5 * 60);
                toast.info("Cooling off for 5 minutes.");
              }}
            >
              5m
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                startCooldown(15 * 60);
                toast.info("Cooling off for 15 minutes.");
              }}
            >
              15m
            </Button>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            resetSession();
            toast.success("Session timer reset.");
          }}
          className="text-xs cursor-pointer"
        >
          <RotateCcw className="size-3.5" />
          Reset session timer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Full-screen blocker shown when the player is in a self-imposed
 * cooldown. Cannot be dismissed until the cooldown expires.
 */
export function CooldownOverlay() {
  const cooldownUntil = useKenoStore((s) => s.cooldownUntil);
  const clearExpiredCooldown = useKenoStore((s) => s.clearExpiredCooldown);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      clearExpiredCooldown();
    }, 500);
    return () => clearInterval(id);
  }, [cooldownUntil, clearExpiredCooldown]);

  if (!cooldownUntil) return null;
  const remaining = Math.max(0, cooldownUntil - Date.now());
  if (remaining === 0) return null;
  const seconds = Math.ceil(remaining / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Pause className="size-12 text-primary" />
      <div>
        <div className="text-lg font-semibold">Taking a break</div>
        <p className="text-sm text-muted-foreground max-w-xs mt-1">
          You asked for a cooldown. The game will resume automatically when the
          timer ends.
        </p>
      </div>
      <div className="font-mono text-3xl font-bold tabular-nums keno-gold">
        {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => clearExpiredCooldown()}
      >
        <Play className="size-3.5" />
        Check timer
      </Button>
    </div>
  );
}
