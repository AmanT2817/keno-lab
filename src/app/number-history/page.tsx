"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
} from "recharts";
import {
  Flame,
  Snowflake,
  Activity,
  TrendingUp,
  TrendingDown,
  Info,
  AlertTriangle,
  ArrowLeft,
  Sigma,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { KENO_POOL_SIZE, KENO_DRAW_SIZE } from "@/lib/keno/engine";

interface FreqNumber {
  number: number;
  count: number;
  percentage: number;
  zScore: number;
  classification: "hot" | "cold" | "neutral";
  roundsSinceLastAppearance: number;
}

interface FrequencyResponse {
  period: string | number;
  totalDraws: number;
  theoreticalPercentagePerNumber: number;
  averageAppearancesPerNumber: number;
  hotThreshold: number;
  coldThreshold: number;
  classificationMethod: string;
  numbers: FreqNumber[];
  hottest: FreqNumber[];
  coldest: FreqNumber[];
  disclaimer: string;
}

const PERIOD_OPTIONS: { label: string; value: string }[] = [
  { label: "Last 20", value: "20" },
  { label: "Last 50", value: "50" },
  { label: "Last 100", value: "100" },
  { label: "All time", value: "all" },
];

/**
 * Color mapping for the heatmap. The shade scales with z-score:
 *   - hot   (z > 1): orange-to-red gradient
 *   - cold  (z < -1): cyan-to-blue gradient
 *   - neutral: muted slate
 */
function tileColor(z: number, classification: FreqNumber["classification"]): string {
  if (classification === "hot") {
    const intensity = Math.min(1, (z - 1) / 2);
    // orange → red as z grows
    return `oklch(${0.65 + 0.1 * intensity} ${0.18 + 0.05 * intensity} ${30 - 10 * intensity})`;
  }
  if (classification === "cold") {
    const intensity = Math.min(1, (-z - 1) / 2);
    // cyan → blue as z shrinks
    return `oklch(${0.65 + 0.1 * intensity} ${0.15 + 0.05 * intensity} ${220 + 10 * intensity})`;
  }
  return "oklch(0.45 0.012 200)";
}

export default function NumberHistoryPage() {
  const [period, setPeriod] = useState<string>("all");
  const [data, setData] = useState<FrequencyResponse | null>(null);
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFrequency = useCallback(async () => {
    try {
      const r = await fetch(`/api/game/frequency?period=${period}`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: "Request failed." }));
        setError(e.error ?? "Failed to load frequency data.");
        return;
      }
      const d: FrequencyResponse = await r.json();
      setData(d);
      setLoadedPeriod(period);
    } catch (e) {
      console.error(e);
      setError("Network error while loading frequency data.");
    }
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/game/frequency?period=${period}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: FrequencyResponse) => {
        if (!cancelled) {
          setData(d);
          setLoadedPeriod(period);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Network error while loading frequency data.");
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  // Keep `loadFrequency` for the manual refresh button below.
  void loadFrequency;

  const loading = loadedPeriod !== period || !data;
  const totalDraws = data?.totalDraws ?? 0;
  const hasData = totalDraws > 0;

  // Build chart data — number on X, count on Y
  const chartData =
    data?.numbers.map((n) => ({
      number: n.number,
      count: n.count,
      classification: n.classification,
    })) ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 w-full border-b border-border/40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="size-9 sm:size-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 transition-transform"
              aria-label="Back to game"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="leading-none min-w-0">
              <div className="text-base sm:text-lg font-bold keno-gold tracking-tight truncate">
                Number History
              </div>
              <div className="text-[10px] sm:text-[11px] text-muted-foreground font-mono truncate">
                Hot & Cold · frequency analysis
              </div>
            </div>
          </div>
          <a
            href="/"
            className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to game
          </a>
        </div>
      </header>

      <main className="flex-1 w-full mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Title + explanation */}
        <Card className="bg-card/80 backdrop-blur border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <Flame className="size-5 keno-amber-text" />
              Hot & Cold Numbers
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed space-y-2">
            <p>
              This page shows how often each Keno number (1–80) has appeared
              in completed draws. <span className="keno-amber-text font-semibold">Hot numbers</span>{" "}
              appeared more than 15% above the expected average;{" "}
              <span className="keno-emerald-text font-semibold">cold numbers</span>{" "}
              appeared less than 85% of the expected average; the rest are neutral.
            </p>
            <p>
              <strong className="text-foreground">Important:</strong> in a fair
              independent draw, historical frequency does NOT influence future
              results. Each round is uniformly random without replacement —
              no number is ever "due" to appear.
            </p>
          </CardContent>
        </Card>

        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">
            Period:
          </span>
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={period === opt.value ? "default" : "outline"}
              onClick={() => setPeriod(opt.value)}
              disabled={loading}
              className="h-8"
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !hasData && (
          <Card className="bg-card/80 backdrop-blur border-border/60">
            <CardContent className="py-12 text-center">
              <Activity className="size-10 mx-auto text-muted-foreground mb-3" />
              <div className="text-sm font-semibold mb-1">
                No completed draws yet
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Once at least one round has been drawn on the game page,
                frequency statistics will appear here. We never fabricate
                historical data — only real persisted draws are counted.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-1 mt-4 text-xs text-primary hover:underline"
              >
                <ArrowLeft className="size-3" />
                Go to the game
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Summary stats */}
        {!loading && !error && hasData && data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <Card className="bg-card/80 backdrop-blur border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <Sigma className="size-3" />
                Rounds analyzed
              </div>
              <div className="text-xl font-mono font-bold keno-emerald-text">
                {totalDraws}
              </div>
            </Card>
            <Card className="bg-card/80 backdrop-blur border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <Activity className="size-3" />
                Avg appearances/number
              </div>
              <div className="text-xl font-mono font-bold">
                {data.averageAppearancesPerNumber}
              </div>
            </Card>
            <Card className="bg-card/80 backdrop-blur border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <TrendingUp className="size-3 keno-amber-text" />
                Hottest
              </div>
              <div className="text-sm font-mono font-bold keno-amber-text truncate">
                {data.hottest.slice(0, 3).map((n) => n.number).join(", ")}
                {data.hottest.length > 3 ? "…" : ""}
              </div>
            </Card>
            <Card className="bg-card/80 backdrop-blur border-border/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <TrendingDown className="size-3 keno-emerald-text" />
                Coldest
              </div>
              <div className="text-sm font-mono font-bold keno-emerald-text truncate">
                {data.coldest.slice(0, 3).map((n) => n.number).join(", ")}
                {data.coldest.length > 3 ? "…" : ""}
              </div>
            </Card>
          </div>
        )}

        {/* Heatmap of 80 numbers */}
        {!loading && !error && hasData && data && (
          <Card className="bg-card/80 backdrop-blur border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="size-4 keno-emerald-text" />
                  Frequency heatmap (1–80)
                </span>
                <div className="flex items-center gap-2 text-[10px] sm:text-xs">
                  <span className="flex items-center gap-1">
                    <span
                      className="size-3 rounded-sm"
                      style={{ background: "oklch(0.65 0.18 30)" }}
                    />
                    Hot
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="size-3 rounded-sm"
                      style={{ background: "oklch(0.45 0.012 200)" }}
                    />
                    Neutral
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="size-3 rounded-sm"
                      style={{ background: "oklch(0.65 0.15 230)" }}
                    />
                    Cold
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TooltipProvider delayDuration={150}>
                <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
                  {data.numbers.map((n) => (
                    <Tooltip key={n.number}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "aspect-square rounded-md flex items-center justify-center text-xs sm:text-sm font-mono font-semibold cursor-default transition-transform hover:scale-110",
                            "border border-border/20"
                          )}
                          style={{
                            background: tileColor(n.zScore, n.classification),
                            color: "oklch(0.98 0 0)",
                          }}
                        >
                          {n.number}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="text-xs"
                      >
                        <div className="font-mono">
                          <div>
                            <strong>#{n.number}</strong>
                          </div>
                          <div>Appeared: {n.count}×</div>
                          <div>Frequency: {n.percentage.toFixed(2)}%</div>
                          <div>
                            Class:{" "}
                            <span
                              className={
                                n.classification === "hot"
                                  ? "keno-amber-text"
                                  : n.classification === "cold"
                                    ? "keno-emerald-text"
                                    : "text-muted-foreground"
                              }
                            >
                              {n.classification}
                            </span>
                          </div>
                          <div>
                            Rounds since last:{" "}
                            {n.roundsSinceLastAppearance === totalDraws
                              ? "never"
                              : n.roundsSinceLastAppearance}
                          </div>
                          <div className="text-muted-foreground text-[10px] mt-1">
                            z-score: {n.zScore}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>

              {/* Theoretical baseline */}
              <div className="mt-3 text-[11px] text-muted-foreground">
                Theoretical: each number should appear in{" "}
                <span className="font-mono">
                  {data.theoreticalPercentagePerNumber.toFixed(1)}%
                </span>{" "}
                of draws ({" "}
                {KENO_DRAW_SIZE}/{KENO_POOL_SIZE} numbers drawn per round).
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bar chart of counts per number */}
        {!loading && !error && hasData && data && (
          <Card className="bg-card/80 backdrop-blur border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Trophy className="size-4 keno-amber-text" />
                Appearance count by number
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 sm:h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 4, right: 8, bottom: 4, left: -20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(1 0 0 / 6%)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="number"
                      tick={{ fill: "oklch(0.7 0 0)", fontSize: 9 }}
                      tickLine={false}
                      axisLine={{ stroke: "oklch(1 0 0 / 8%)" }}
                      interval={3}
                    />
                    <YAxis
                      tick={{ fill: "oklch(0.7 0 0)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <RTooltip
                      cursor={{ fill: "oklch(1 0 0 / 4%)" }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "var(--popover-foreground)",
                      }}
                      formatter={(value: number, _name, item) => {
                        const c = (item?.payload as { classification?: string })?.classification ?? "neutral";
                        return [`${value} appearances`, `#${item?.payload?.number ?? ""} · ${c}`];
                      }}
                    />
                    <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                      {chartData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={
                            d.classification === "hot"
                              ? "oklch(0.7 0.18 30)"
                              : d.classification === "cold"
                                ? "oklch(0.7 0.15 230)"
                                : "oklch(0.5 0.02 200)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top hot / cold lists */}
        {!loading && !error && hasData && data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Card className="bg-card/80 backdrop-blur border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Flame className="size-4 keno-amber-text" />
                  Top 10 Hottest Numbers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-56 rounded-md border border-border/40 bg-background/40 keno-scrollbar">
                  <div className="p-2 space-y-1">
                    {data.hottest.map((n, i) => (
                      <div
                        key={n.number}
                        className="flex items-center justify-between text-xs border-b border-border/20 py-1 last:border-0"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground font-mono w-4">
                            {i + 1}.
                          </span>
                          <span
                            className="size-6 rounded-md flex items-center justify-center font-mono font-bold"
                            style={{
                              background: tileColor(n.zScore, n.classification),
                              color: "oklch(0.98 0 0)",
                            }}
                          >
                            {n.number}
                          </span>
                        </span>
                        <span className="font-mono">
                          {n.count}× ({n.percentage.toFixed(2)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="bg-card/80 backdrop-blur border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Snowflake className="size-4 keno-emerald-text" />
                  Top 10 Coldest Numbers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-56 rounded-md border border-border/40 bg-background/40 keno-scrollbar">
                  <div className="p-2 space-y-1">
                    {data.coldest.map((n, i) => (
                      <div
                        key={n.number}
                        className="flex items-center justify-between text-xs border-b border-border/20 py-1 last:border-0"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground font-mono w-4">
                            {i + 1}.
                          </span>
                          <span
                            className="size-6 rounded-md flex items-center justify-center font-mono font-bold"
                            style={{
                              background: tileColor(n.zScore, n.classification),
                              color: "oklch(0.98 0 0)",
                            }}
                          >
                            {n.number}
                          </span>
                        </span>
                        <span className="font-mono">
                          {n.count}× ({n.percentage.toFixed(2)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Classification method + disclaimer */}
        {!loading && !error && hasData && data && (
          <>
            <Card className="bg-card/60 backdrop-blur border-border/40">
              <CardContent className="p-3 sm:p-4 text-xs leading-relaxed">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Info className="size-3.5 keno-emerald-text" />
                  <span className="font-semibold text-foreground">
                    How hot/cold is calculated
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {data.classificationMethod} For example, with {totalDraws}{" "}
                  draws in this period, the expected count per number is{" "}
                  <span className="font-mono text-foreground">
                    {data.averageAppearancesPerNumber}
                  </span>{" "}
                  appearances. Numbers above{" "}
                  <span className="font-mono text-foreground">
                    {data.hotThreshold}
                  </span>{" "}
                  are classified as hot; below{" "}
                  <span className="font-mono text-foreground">
                    {data.coldThreshold}
                  </span>{" "}
                  as cold. The color intensity scales with the z-score
                  (standard deviations from the mean).
                </p>
              </CardContent>
            </Card>

            <div className="rounded-md bg-amber-500/5 border border-amber-500/30 p-3 sm:p-4 flex items-start gap-2 text-[11px] sm:text-xs text-amber-200">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block mb-0.5">Disclaimer</strong>
                {data.disclaimer} Hot/cold numbers describe past observations
                only — they have <em>no</em> predictive power for the next
                round. Treat this page as informational, not strategic.
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-border/40 bg-background/60">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 py-4 text-xs text-muted-foreground text-center">
          <Link href="/" className="hover:text-foreground transition-colors">
            ← Back to the game
          </Link>
        </div>
      </footer>
    </div>
  );
}
