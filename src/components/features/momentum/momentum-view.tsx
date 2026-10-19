"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { LoadErrorStrip } from "@/components/ui/load-error-strip";
import { cn } from "@/lib/utils";
import { categoryHex, categoryLabel } from "@/lib/calendar/colors";
import type { EventCategory } from "@/types";
import type { MomentumStats } from "@/lib/db/queries";
import { MOMENTUM_PERIODS, PERIOD_LABELS, parsePeriod, type MomentumPeriod } from "@/lib/momentum";
import { CircadianSignature } from "./circadian-signature";
import { ChunkOutcomes } from "./chunk-outcomes";
import { TaskMarination } from "./task-marination";
import { DeadlineOutcomes, PlanOutcomes } from "./deadlines-and-plans";

const PERIOD_STORAGE_KEY = "cc:momentum-period";

/** Date keys name calendar days, so format them in UTC to keep the day. */
const formatKey = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));

const HERO_TITLES: Record<MomentumPeriod, string> = {
  week: "How's this week going?",
  "4w": "How have the last 4 weeks gone?",
  all: "How's it going overall?",
};

export function MomentumView() {
  const [period, setPeriod] = useState<MomentumPeriod>("week");
  const [stats, setStats] = useState<MomentumStats | null>(null);
  const [loadError, setLoadError] = useState(false);
  // The latest request wins: switching periods quickly mustn't let a slow
  // earlier response paint over the newer one.
  const requestId = useRef(0);

  useEffect(() => {
    try {
      setPeriod(parsePeriod(localStorage.getItem(PERIOD_STORAGE_KEY)));
    } catch {
      // Storage blocked: the default period is fine.
    }
  }, []);

  const choosePeriod = (value: string) => {
    const next = parsePeriod(value);
    setPeriod(next);
    try {
      localStorage.setItem(PERIOD_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice just won't stick across visits.
    }
  };

  const fetchStats = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const res = await fetch(`/api/stats/momentum?period=${period}`);
      if (!res.ok) throw new Error(`GET /api/stats/momentum ${res.status}`);
      const data = (await res.json()) as MomentumStats;
      if (id !== requestId.current) return;
      setStats(data);
      setLoadError(false);
    } catch (error) {
      console.error("Momentum: failed to load stats:", error);
      if (id === requestId.current) setLoadError(true);
    }
  }, [period]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const phrase = PERIOD_LABELS[period].phrase;
  // Until the new period's numbers land, the old ones stay up, dimmed.
  const isStale = stats !== null && stats.period !== period;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Momentum"
        description="What you've been getting done, and how."
        action={
          <Tabs value={period} onValueChange={choosePeriod}>
            <TabsList>
              {MOMENTUM_PERIODS.map((p) => (
                <TabsTrigger key={p} value={p}>
                  {PERIOD_LABELS[p].tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {loadError && !stats ? (
        <LoadErrorStrip message="Couldn't load your momentum." onRetry={fetchStats} />
      ) : !stats ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      ) : (
        <div className={cn("space-y-4 transition-opacity", isStale && "opacity-60")}>
          {/* 1 */}
          <HowItsGoing stats={stats} />
          {/* 2 */}
          <DeadlineOutcomes deadlines={stats.deadlines} periodPhrase={phrase} />
          {/* 3 */}
          <PlanOutcomes plans={stats.plans} periodPhrase={phrase} />
          {/* 4 */}
          <CircadianSignature hourlyHeatmap={stats.hourlyHeatmap} periodPhrase={phrase} />
          {/* 5 */}
          <ChunkOutcomes chunking={stats.chunking} periodPhrase={phrase} />
          {/* 6 */}
          <TaskMarination
            marination={stats.marination}
            periodPhrase={phrase}
            onChanged={() => void fetchStats()}
          />
          {/* 7 */}
          <EffortMix stats={stats} periodPhrase={phrase} />
          <RecordsFooter records={stats.records} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// 1. How's it going?
// ============================================================

function HowItsGoing({ stats }: { stats: MomentumStats }) {
  const { period, periodCount, typicalWeek } = stats;
  const typical = typicalWeek !== null ? Math.round(typicalWeek) : null;

  let comparison: string;
  if (period === "all") {
    comparison = stats.firstActiveWeek
      ? `Since the week of ${formatKey(stats.firstActiveWeek, { month: "short", day: "numeric", year: "numeric" })}.`
      : "Nothing done yet.";
  } else {
    const perWeek = period === "4w" ? `About ${Math.round(periodCount / 4)} a week. ` : "";
    comparison =
      typical !== null
        ? `${perWeek}Your typical week is about ${typical}.`
        : `${perWeek}Not enough past weeks to compare with yet.`;
  }

  const max = Math.max(...stats.bars.map((b) => b.count), 1);
  const showCounts = stats.bars.length <= 7;

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <h2 className="mb-2 text-sm font-medium">{HERO_TITLES[period]}</h2>
          <p className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums">{periodCount}</span>
            <span className="text-sm text-muted-foreground">done</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{comparison}</p>
        </div>

        {/* Bars: a day each (a week each on all time). A day's bar opens its recap. */}
        <div>
          <div
            className={cn("flex items-end", showCounts ? "gap-2" : "gap-[3px]")}
            style={{ height: 128 }}
          >
            {stats.bars.map((b) => {
              const height = b.count > 0 ? Math.max((b.count / max) * 104, 4) : 4;
              const bar = (
                <>
                  {showCounts && b.count > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground">{b.count}</span>
                  )}
                  <div
                    className={cn(
                      "w-full rounded-sm transition-all",
                      showCounts && "max-w-10 rounded-md",
                      b.count > 0 ? "bg-coral/80" : b.isFuture ? "bg-secondary/40" : "bg-secondary",
                      b.isCurrent && b.count > 0 && "bg-coral"
                    )}
                    style={{ height }}
                  />
                </>
              );
              const title = `${period === "all" ? `Week of ${formatKey(b.key, { month: "short", day: "numeric" })}` : formatKey(b.key, { weekday: "short", month: "short", day: "numeric" })}: ${b.count} done`;
              return b.recapDate ? (
                <Link
                  key={b.key}
                  href={`/recap?date=${b.recapDate}`}
                  title={title}
                  aria-label={`${title}. Open that day's recap`}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1 rounded-sm outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {bar}
                </Link>
              ) : (
                <div
                  key={b.key}
                  title={title}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                >
                  {bar}
                </div>
              );
            })}
          </div>
          {/* Labels in their own row, so sparse ones (4 weeks, all time) don't squeeze the bars */}
          <div className={cn("mt-1 flex", showCounts ? "gap-2" : "gap-[3px]")}>
            {stats.bars.map((b) => (
              <span
                key={b.key}
                className={cn(
                  "min-w-0 flex-1 overflow-visible whitespace-nowrap text-[11px] text-muted-foreground",
                  showCounts ? "text-center" : "text-left",
                  b.isCurrent && "font-medium text-foreground"
                )}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {stats.wins.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Wins</h3>
            <div className="space-y-2">
              {stats.wins.map((win, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                  <span className="text-lg">{win.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{win.title}</p>
                    <p className="text-xs text-muted-foreground">{win.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// 7. What kind of effort?
// ============================================================

function EffortMix({ stats, periodPhrase }: { stats: MomentumStats; periodPhrase: string }) {
  const { byEnergy, byCategory, periodCount } = stats;
  const nameOf = (category: string | null) =>
    category === null ? "Unlabeled" : (categoryLabel(category) ?? category);
  const maxCategory = Math.max(...byCategory.map((c) => c.count), 1);

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-medium">What kind of effort?</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          The {periodCount} done {periodPhrase}, by energy and by area. Sittings count with their
          task&apos;s labels.
        </p>

        {periodCount === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing done {periodPhrase} yet.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex gap-3">
              {(
                [
                  { key: "low", label: "Low", box: "bg-salmon/15", text: "text-deep-purple dark:text-salmon" },
                  { key: "medium", label: "Medium", box: "bg-coral/15", text: "text-coral" },
                  { key: "high", label: "High", box: "bg-rose/15", text: "text-rose" },
                ] as const
              ).map((e) => (
                <div key={e.key} className={cn("flex-1 rounded-lg p-3 text-center", e.box)}>
                  <p className={cn("text-xl font-bold tabular-nums", e.text)}>{byEnergy[e.key]}</p>
                  <p className="text-xs text-muted-foreground">{e.label} energy</p>
                </div>
              ))}
            </div>

            {/* One area carries no comparison, so it's a sentence, not a chart. */}
            {byCategory.length === 1 ? (
              <p className="text-xs text-muted-foreground">
                {byCategory[0].category === null
                  ? `None of these had an area set.`
                  : `All ${periodCount} were ${nameOf(byCategory[0].category)}.`}
              </p>
            ) : (
              <div className="space-y-2.5">
                {byCategory.map((cat) => {
                  const hex = categoryHex(cat.category as EventCategory | null, stats.calendarColors);
                  return (
                    <div key={cat.category ?? "none"} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{nameOf(cat.category)}</span>
                        <span className="font-medium tabular-nums">{cat.count}</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-secondary">
                        <div
                          className={cn("h-full rounded-full", cat.category === null && "bg-muted-foreground/40")}
                          style={{
                            width: `${(cat.count / maxCategory) * 100}%`,
                            backgroundColor: cat.category === null ? undefined : hex.solid,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Footer: all-time records
// ============================================================

function RecordsFooter({ records }: { records: MomentumStats["records"] }) {
  if (records.completedAllTime === 0) return null;
  return (
    <p className="px-1 text-xs text-muted-foreground">
      <span className="font-medium">All time:</span>{" "}
      <span className="tabular-nums">{records.completedAllTime}</span> done
      {records.biggestDay && (
        <>
          {" · "}biggest day <span className="tabular-nums">{records.biggestDay.count}</span> (
          {formatKey(records.biggestDay.date, { month: "short", day: "numeric", year: "numeric" })})
        </>
      )}
      {" · "}
      <span className="tabular-nums">{records.avgPerActiveDay.toFixed(1)}</span> a day on days you
      get something done
    </p>
  );
}
