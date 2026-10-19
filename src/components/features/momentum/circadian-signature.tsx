"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { DAY_NAMES, heatmapInsight, type HeatmapCell } from "@/lib/momentum";

type HeatmapEntry = HeatmapCell;

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function hourLabel(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

function hourRangeLabel(startHour: number): string {
  return `${hourLabel(startHour)}–${hourLabel((startHour + 2) % 24)}`;
}

// Build a dense 7×24 grid from sparse rows
function buildGrid(hourly: HeatmapEntry[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const { dayOfWeek, hour, count } of hourly) {
    if (dayOfWeek >= 0 && dayOfWeek < 7 && hour >= 0 && hour < 24) {
      grid[dayOfWeek][hour] = count;
    }
  }
  return grid;
}

// Aggregate 24 columns into 12 (pairs of hours)
function aggregateTo12(grid: number[][]): number[][] {
  return grid.map((row) => {
    const out: number[] = [];
    for (let i = 0; i < 24; i += 2) {
      out.push(row[i] + row[i + 1]);
    }
    return out;
  });
}

// Log-scale opacity: compresses peaks so low counts stay readable
function opacityFor(count: number, max: number): number {
  if (count === 0) return 0.08;
  if (max <= 0) return 0.08;
  const t = Math.log(count + 1) / Math.log(max + 1);
  return 0.18 + t * 0.75;
}

const LEGEND_STEPS = [0, 1, 3, 6, 10];

export function CircadianSignature({
  hourlyHeatmap,
  periodPhrase,
}: {
  hourlyHeatmap: HeatmapEntry[];
  /** "this week", "in the last 4 weeks", "all time" */
  periodPhrase: string;
}) {
  const grid24 = buildGrid(hourlyHeatmap);
  const grid12 = aggregateTo12(grid24);
  const max24 = Math.max(...grid24.flat(), 1);
  const max12 = Math.max(...grid12.flat(), 1);

  const sentence = heatmapInsight(hourlyHeatmap);
  const totalCompletions = hourlyHeatmap.reduce((s, c) => s + c.count, 0);

  if (totalCompletions === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-1 text-sm font-medium">When do I actually work?</h2>
          <p className="text-xs text-muted-foreground">
            Nothing done {periodPhrase} yet, so there&apos;s no shape to show.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Cardinal hour label positions (as % left) for desktop (24-col)
  const cardinals24 = [
    { hour: 0, label: "12a" },
    { hour: 6, label: "6a" },
    { hour: 12, label: "12p" },
    { hour: 18, label: "6p" },
  ];
  // For 12-col (2-hour blocks): position by aggregate column index
  const cardinals12 = [
    { col: 0, label: "12a" },
    { col: 3, label: "6a" },
    { col: 6, label: "12p" },
    { col: 9, label: "6p" },
  ];

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-medium">When do I actually work?</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Tasks finished and sittings done, by hour and weekday &middot; {periodPhrase}
        </p>

        {/* Mobile: 12 cols (2-hour blocks) */}
        <div className="md:hidden">
          <div className="grid grid-cols-[18px_1fr] gap-1.5">
            <div aria-hidden="true" />
            <div className="relative h-3">
              {cardinals12.map(({ col, label }) => (
                <span
                  key={label}
                  className="absolute top-0 text-[10px] text-muted-foreground"
                  style={{ left: `calc(${(col + 0.5) * (100 / 12)}% - 10px)` }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="grid gap-[2px]" style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}>
              {DAY_LETTERS.map((letter, i) => (
                <div
                  key={i}
                  className="flex items-center justify-end pr-1 text-[10px] text-muted-foreground"
                  style={{ height: 20 }}
                >
                  {letter}
                </div>
              ))}
            </div>
            <div
              className="grid grid-cols-12 gap-[2px]"
              role="img"
              aria-label={`Heatmap of tasks and sittings done ${periodPhrase}, ${totalCompletions} across 7 days and 12 two-hour blocks`}
            >
              {grid12.map((row, dayIdx) =>
                row.map((count, blockIdx) => (
                  <div
                    key={`${dayIdx}-${blockIdx}`}
                    className="rounded-sm"
                    style={{
                      height: 20,
                      backgroundColor: `rgba(249, 115, 22, ${opacityFor(count, max12)})`,
                    }}
                    title={`${DAY_NAMES[dayIdx]} ${hourRangeLabel(blockIdx * 2)} — ${count} done`}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Desktop: 24 cols (1-hour resolution) */}
        <div className="hidden md:block">
          <div className="grid grid-cols-[20px_1fr] gap-1.5">
            <div aria-hidden="true" />
            <div className="relative h-3">
              {cardinals24.map(({ hour, label }) => (
                <span
                  key={label}
                  className="absolute top-0 text-[10px] text-muted-foreground"
                  style={{ left: `calc(${(hour + 0.5) * (100 / 24)}% - 10px)` }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="grid gap-[2px]" style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}>
              {DAY_LETTERS.map((letter, i) => (
                <div
                  key={i}
                  className="flex items-center justify-end pr-1 text-[10px] text-muted-foreground"
                  style={{ height: 30 }}
                >
                  {letter}
                </div>
              ))}
            </div>
            <div
              className="grid gap-[2px]"
              style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
              role="img"
              aria-label={`Heatmap of tasks and sittings done ${periodPhrase}, ${totalCompletions} across 7 days and 24 hours`}
            >
              {grid24.map((row, dayIdx) =>
                row.map((count, hour) => (
                  <div
                    key={`${dayIdx}-${hour}`}
                    className="rounded-sm transition-transform hover:scale-[1.25]"
                    style={{
                      height: 30,
                      backgroundColor: `rgba(249, 115, 22, ${opacityFor(count, max24)})`,
                    }}
                    title={`${DAY_NAMES[dayIdx]} ${hourLabel(hour)} — ${count} done`}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Legend: what a darker cell means */}
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          <span>Fewer</span>
          {LEGEND_STEPS.map((n) => (
            <span
              key={n}
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: `rgba(249, 115, 22, ${opacityFor(n, 10)})` }}
            />
          ))}
          <span>More</span>
        </div>

        <p className="mt-3 text-[13px] text-muted-foreground">
          <Markdown inline>{sentence}</Markdown>
        </p>
      </CardContent>
    </Card>
  );
}
