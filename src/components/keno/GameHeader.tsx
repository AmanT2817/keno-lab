"use client";

import { useKenoStore } from "@/lib/keno/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  RotateCcw,
  Hash,
  Layers,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { ResponsiblePlayButton } from "./ResponsiblePlay";

interface GameHeaderProps {
  onReset: () => Promise<void>;
  isResetting: boolean;
}

export function GameHeader({ onReset, isResetting }: GameHeaderProps) {
  const balanceMinor = useKenoStore((s) => s.playerBalanceMinor);
  const totalRounds = useKenoStore((s) => s.totalRounds);
  const totalTickets = useKenoStore((s) => s.totalTickets);

  const balance = balanceMinor != null ? (balanceMinor / 100).toFixed(2) : "—";

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border/40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className={cn(
              "size-9 sm:size-10 rounded-xl flex items-center justify-center shrink-0",
              "bg-gradient-to-br from-primary to-accent text-primary-foreground",
              "shadow-lg shadow-primary/30"
            )}
          >
            <span className="text-lg font-black tracking-tighter">K</span>
          </div>
          <div className="leading-none min-w-0">
            <div className="text-base sm:text-lg font-bold keno-gold tracking-tight truncate">
              Keno Lab
            </div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground font-mono truncate">
              server-authoritative · v1
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <Card className="hidden md:flex bg-card/60 border-border/40 py-1 px-2.5">
            <CardContent className="p-0 flex items-center gap-1.5">
              <Layers className="size-3.5 keno-emerald-text" />
              <div className="leading-none">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Rounds
                </div>
                <div className="text-xs font-mono font-semibold">
                  {totalRounds}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hidden md:flex bg-card/60 border-border/40 py-1 px-2.5">
            <CardContent className="p-0 flex items-center gap-1.5">
              <Hash className="size-3.5 keno-emerald-text" />
              <div className="leading-none">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Tickets
                </div>
                <div className="text-xs font-mono font-semibold">
                  {totalTickets}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "bg-card/60 border-border/40 py-1 px-2.5",
              "border-accent/40"
            )}
          >
            <CardContent className="p-0 flex items-center gap-1.5">
              <Wallet className="size-3.5 keno-amber-text" />
              <div className="leading-none">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Balance
                </div>
                <div className="text-xs font-mono font-semibold keno-amber-text">
                  ${balance}
                </div>
              </div>
            </CardContent>
          </Card>

          <ResponsiblePlayButton />

          <ThemeSwitcher />

          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              if (
                confirm(
                  "Reset balance to $1,000.00? This is logged as an ADJUSTMENT ledger entry."
                )
              ) {
                onReset().catch((e) => {
                  toast.error("Could not reset balance.");
                  console.error(e);
                });
              }
            }}
            disabled={isResetting}
            title="Reset balance"
            aria-label="Reset balance"
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
