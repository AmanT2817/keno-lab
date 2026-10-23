"use client";

import { useEffect, useState } from "react";
import { useKenoStore } from "@/lib/keno/store";
import { KENO_MAX_SPOTS, KENO_MIN_SPOTS } from "@/lib/keno/engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Target, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaytableRow {
  hits: number;
  multiplier: number;
  probability: number;
  probabilityLabel: string;
  expectedContribution: number;
}

interface PaytableResponse {
  spots: number;
  rows: PaytableRow[];
  anyWinProbability: number;
  anyWinLabel: string;
  expectedReturnMultiplier: number;
  houseEdgePercent: number;
}

export function PaytablePanel() {
  const selectedNumbers = useKenoStore((s) => s.selectedNumbers);
  const stakeMinor = useKenoStore((s) => s.stakeMinor);
  const spots = Math.max(
    KENO_MIN_SPOTS,
    Math.min(KENO_MAX_SPOTS, selectedNumbers.length || 4)
  );

  const [data, setData] = useState<PaytableResponse | null>(null);
  const [fetchedSpots, setFetchedSpots] = useState<number | null>(null);
  const loading = fetchedSpots !== spots || data === null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/game/paytable?spots=${spots}`)
      .then((r) => r.json())
      .then((d: PaytableResponse) => {
        if (!cancelled) {
          setData(d);
          setFetchedSpots(spots);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [spots]);

  return (
    <Card className="bg-card/80 backdrop-blur border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="size-4 keno-amber-text" />
            Paytable
          </span>
          <span className="text-xs font-mono text-muted-foreground">
            {spots}-spot
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary stats */}
        {data && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-background/60 border border-border/40 p-2">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Target className="size-3" />
                Any Win
              </div>
              <div className="text-sm font-semibold keno-emerald-text">
                {data.anyWinLabel}
              </div>
            </div>
            <div className="rounded-md bg-background/60 border border-border/40 p-2">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Percent className="size-3" />
                Expected
              </div>
              <div className="text-sm font-semibold keno-amber-text">
                {data.expectedReturnMultiplier.toFixed(3)}x
              </div>
            </div>
            <div className="rounded-md bg-background/60 border border-border/40 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                House Edge
              </div>
              <div className="text-sm font-semibold keno-rose-text">
                {data.houseEdgePercent.toFixed(1)}%
              </div>
            </div>
          </div>
        )}

        <ScrollArea className="h-44 rounded-md border border-border/40 bg-background/40">
          <Table>
            <TableHeader className="sticky top-0 bg-card/95 backdrop-blur">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="h-8 text-[11px]">Hits</TableHead>
                <TableHead className="h-8 text-[11px] text-right">
                  Mult
                </TableHead>
                <TableHead className="h-8 text-[11px] text-right">
                  On this stake
                </TableHead>
                <TableHead className="h-8 text-[11px] text-right">
                  1 in
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">
                    Loading paytable...
                  </TableCell>
                </TableRow>
              )}
              {data?.rows
                .slice()
                .reverse()
                .map((row) => {
                  const isWinning = row.multiplier > 0;
                  const payout = (stakeMinor * row.multiplier) / 100;
                  return (
                    <TableRow
                      key={row.hits}
                      className={cn(
                        "border-border/30",
                        isWinning ? "bg-primary/5" : "opacity-50"
                      )}
                    >
                      <TableCell className="py-1.5 text-xs font-semibold">
                        {row.hits}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-right font-mono">
                        {row.multiplier > 0 ? `${row.multiplier}x` : "—"}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-right font-mono keno-amber-text">
                        {payout > 0 ? `$${payout.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-right font-mono text-muted-foreground">
                        {row.probabilityLabel.replace("1 in ", "")}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </ScrollArea>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Probabilities follow the hypergeometric distribution: P(X = r) =
          C(n,r) · C(80−n, 20−r) / C(80,20). The displayed multipliers come
          from the versioned paytable snapshot stored on each ticket — the
          browser does not decide payouts.
        </p>
      </CardContent>
    </Card>
  );
}
