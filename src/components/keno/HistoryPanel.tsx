"use client";

import { useCallback, useEffect } from "react";
import { useKenoStore, type HistoryItem } from "@/lib/keno/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { History, Coins, Hash, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryPanelProps {
  onViewDetails?: (ticketId: string) => void;
}

function HistoryRow({
  item,
  onViewDetails,
}: {
  item: HistoryItem;
  onViewDetails?: (ticketId: string) => void;
}) {
  const stakeMajor = (item.stakeMinor / 100).toFixed(2);
  const payoutMajor = (item.payoutMinor / 100).toFixed(2);
  const netMajor = ((item.payoutMinor - item.stakeMinor) / 100).toFixed(2);
  const isWin = item.isWin;

  const time = new Date(item.createdAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 text-xs space-y-1.5",
        isWin
          ? "bg-accent/5 border-accent/30"
          : "bg-background/40 border-border/30"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-muted-foreground">{time}</span>
        <span
          className={cn(
            "font-semibold font-mono",
            isWin ? "keno-amber-text" : "keno-rose-text"
          )}
        >
          {netMajor.startsWith("-") ? "−" : "+"}${netMajor.replace("-", "")}
        </span>
      </div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="flex items-center gap-1">
          <Hash className="size-3" />
          {item.spots}-spot · ${stakeMajor}
        </span>
        <span className="flex items-center gap-1">
          <Coins className="size-3" />
          {item.matchCount}/{item.spots} · ${payoutMajor}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {item.selectedNumbers.map((n) => {
          const isMatch = item.matchedNumbers.includes(n);
          return (
            <span
              key={n}
              className={cn(
                "inline-flex items-center justify-center size-5 rounded text-[10px] font-mono",
                isMatch
                  ? "bg-accent text-accent-foreground border border-accent"
                  : "bg-muted/40 text-muted-foreground border border-border/30"
              )}
            >
              {n}
            </span>
          );
        })}
      </div>
      {onViewDetails && (
        <div className="pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 w-full text-[10px] gap-1"
            onClick={() => onViewDetails(item.id)}
          >
            <ShieldCheck className="size-3" />
            Transparency report
          </Button>
        </div>
      )}
    </div>
  );
}

export function HistoryPanel({ onViewDetails }: HistoryPanelProps) {
  const history = useKenoStore((s) => s.history);
  const setHistory = useKenoStore((s) => s.setHistory);
  const historyLoading = useKenoStore((s) => s.historyLoading);
  const setHistoryLoading = useKenoStore((s) => s.setHistoryLoading);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch("/api/game/history");
      const d = await r.json();
      setHistory((d.items as HistoryItem[]) ?? []);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [setHistory, setHistoryLoading]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <Card className="bg-card/80 backdrop-blur border-border/60">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <History className="size-4 keno-emerald-text" />
          Round History
        </CardTitle>
        <button
          onClick={loadHistory}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          disabled={historyLoading}
        >
          {historyLoading ? "Refreshing…" : "Refresh"}
        </button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 sm:h-72 rounded-md border border-border/40 bg-background/40 keno-scrollbar">
          <div className="p-2 space-y-2">
            {history.length === 0 && !historyLoading ? (
              <div className="text-center text-xs text-muted-foreground py-8">
                No rounds played yet.
                <br />
                Pick some numbers and hit Play to start.
              </div>
            ) : (
              history.map((item) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  onViewDetails={onViewDetails}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
