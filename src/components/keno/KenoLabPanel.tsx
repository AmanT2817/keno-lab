"use client";

import { useEffect, useState } from "react";
import { useKenoStore } from "@/lib/keno/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Beaker,
  Target,
  TrendingUp,
  TrendingDown,
  Sigma,
  Info,
  AlertTriangle,
} from "lucide-react";
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

interface FrequencyResponse {
  totalDraws: number;
  theoreticalPercentagePerNumber: number;
  numbers: { number: number; count: number; percentage: number }[];
  hottest: { number: number; count: number; percentage: number }[];
  coldest: { number: number; count: number; percentage: number }[];
  disclaimer: string;
}

export function KenoLabPanel() {
  const selectedNumbers = useKenoStore((s) => s.selectedNumbers);

  // `manualSpots` is set when the user explicitly picks via the dropdown.
  // Otherwise the panel tracks the board's selection count (1..10).
  const [manualSpots, setManualSpots] = useState<number | null>(null);
  const autoSpots =
    selectedNumbers.length >= 1 && selectedNumbers.length <= 10
      ? selectedNumbers.length
      : 6;
  const spots = manualSpots ?? autoSpots;

  const [paytable, setPaytable] = useState<PaytableResponse | null>(null);
  const [fetchedSpots, setFetchedSpots] = useState<number | null>(null);
  const [freq, setFreq] = useState<FrequencyResponse | null>(null);
  const [freqLoaded, setFreqLoaded] = useState(false);

  // Fetch paytable/probability data for the current spot count.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/game/paytable?spots=${spots}`)
      .then((r) => r.json())
      .then((d: PaytableResponse) => {
        if (!cancelled) {
          setPaytable(d);
          setFetchedSpots(spots);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [spots]);

  // Fetch historical frequency once on mount.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/game/frequency")
      .then((r) => r.json())
      .then((d: FrequencyResponse) => {
        if (!cancelled) setFreq(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFreqLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const paytableLoading = fetchedSpots !== spots || !paytable;
  const chartData =
    paytable?.rows.map((r) => ({
      hits: `${r.hits}`,
      probability: r.probability * 100,
      multiplier: r.multiplier,
      isWin: r.multiplier > 0,
    })) ?? [];

  return (
    <Card className="bg-card/80 backdrop-blur border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Beaker className="size-4 keno-emerald-text" />
            Keno Lab
          </span>
          <Select value={String(spots)} onValueChange={(v) => setManualSpots(Number(v))}>
            <SelectTrigger className="h-7 w-[5.5rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n}-spot
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary stats */}
        {paytable && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-background/60 border border-border/40 p-2">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Target className="size-3" />
                Any Win
              </div>
              <div className="text-sm font-semibold keno-emerald-text">
                {paytable.anyWinLabel}
              </div>
            </div>
            <div className="rounded-md bg-background/60 border border-border/40 p-2">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="size-3" />
                Expected
              </div>
              <div className="text-sm font-semibold keno-amber-text">
                {paytable.expectedReturnMultiplier.toFixed(3)}x
              </div>
            </div>
            <div className="rounded-md bg-background/60 border border-border/40 p-2">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <TrendingDown className="size-3" />
                House Edge
              </div>
              <div className="text-sm font-semibold keno-rose-text">
                {paytable.houseEdgePercent.toFixed(1)}%
              </div>
            </div>
          </div>
        )}

        {/* Probability distribution chart */}
        <div className="rounded-md border border-border/40 bg-background/40 p-2">
          <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sigma className="size-3" />
              Probability distribution (P(X = r) as %)
            </span>
            <span>{spots}-spot · 20 of 80 drawn</span>
          </div>
          <div className="h-40 w-full">
            {paytableLoading || chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
                  <XAxis
                    dataKey="hits"
                    tick={{ fill: "oklch(0.7 0 0)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: "oklch(1 0 0 / 8%)" }}
                    label={{ value: "hits", position: "insideBottom", offset: -2, fontSize: 9, fill: "oklch(0.6 0 0)" }}
                  />
                  <YAxis
                    tick={{ fill: "oklch(0.7 0 0)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    cursor={{ fill: "oklch(1 0 0 / 4%)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(value: number, _name, item) => {
                      const m = (item?.payload as { multiplier?: number })?.multiplier ?? 0;
                      return [`${value.toFixed(3)}% · ${m}x`, `${item?.payload?.hits ?? ""} hits`];
                    }}
                  />
                  <Bar dataKey="probability" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.isWin ? "var(--keno-emerald)" : "oklch(0.4 0.02 200 / 0.5)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Hypergeometric explainer */}
        <div className="rounded-md bg-background/40 border border-border/40 p-2 text-[11px] leading-relaxed">
          <div className="flex items-center gap-1 text-foreground font-medium mb-1">
            <Info className="size-3 keno-emerald-text" />
            How the math works
          </div>
          <p className="text-muted-foreground">
            Keno draws 20 numbers without replacement from 1–80. If you pick{" "}
            <span className="font-mono text-foreground">{spots}</span>, the
            chance of matching exactly r is the hypergeometric PMF:
          </p>
          <div className="font-mono text-[10px] mt-1.5 p-1.5 rounded bg-card/60 border border-border/30 text-center">
            P(X = r) = C({spots}, r) · C({80 - spots}, 20 − r) / C(80, 20)
          </div>
          <p className="text-muted-foreground mt-1.5">
            Bars highlighted in emerald are payout tiers; grey bars lose. The
            sum of all bars equals 1.0 (modulo rounding).
          </p>
        </div>

        {/* Historical frequency */}
        <div className="rounded-md border border-border/40 bg-background/40 p-2">
          <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <TrendingDown className="size-3" />
              Historical frequency
            </span>
            <span className="font-mono">
              {freq ? `${freq.totalDraws} draws` : "—"}
            </span>
          </div>
          {!freqLoaded ? (
            <div className="text-[11px] text-muted-foreground py-3 text-center">
              Loading…
            </div>
          ) : !freq || freq.totalDraws === 0 ? (
            <div className="text-[11px] text-muted-foreground py-3 text-center">
              No draws yet — play a round to populate this.
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="rounded bg-card/60 border border-border/30 p-1.5">
                  <div className="text-muted-foreground uppercase tracking-wider">
                    Hottest
                  </div>
                  <div className="font-mono leading-tight mt-0.5">
                    {freq.hottest
                      .slice(0, 5)
                      .map(
                        (n) =>
                          `${n.number}(${n.percentage.toFixed(1)}%)`
                      )
                      .join("  ")}
                  </div>
                </div>
                <div className="rounded bg-card/60 border border-border/30 p-1.5">
                  <div className="text-muted-foreground uppercase tracking-wider">
                    Coldest
                  </div>
                  <div className="font-mono leading-tight mt-0.5">
                    {freq.coldest
                      .slice(0, 5)
                      .map(
                        (n) =>
                          `${n.number}(${n.percentage.toFixed(1)}%)`
                      )
                      .join("  ")}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Theoretical: each number appears in{" "}
                <span className="font-mono">
                  {freq.theoreticalPercentagePerNumber.toFixed(1)}%
                </span>{" "}
                of draws on average. Deviations in past data are normal
                statistical noise and do NOT influence future draws.
              </div>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div
          className={cn(
            "rounded-md bg-amber-500/5 border border-amber-500/30 p-2",
            "flex items-start gap-1.5 text-[10px] text-amber-200"
          )}
        >
          <AlertTriangle className="size-3 shrink-0 mt-0.5" />
          <span>
            Keno Lab is educational. Past draw frequency does not predict
            future results. Each round is an independent uniformly random
            draw — no number is ever “due”.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
