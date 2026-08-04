"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { MomentumStats } from "@/lib/db/queries";

type HeatmapEntry = MomentumStats["hourlyHeatmap"][number];

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function hourLabel(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

function hourRangeLabel(startHour: number): string {
  return `${hourLabel(startHour)}–${hourLabel((startHour + 2) % 24)}`;
}

// Coarse time-of-day names for the insight sentence
function timeOfDayName(hour: number): string {
  if (hour < 6) return "late nights";
  if (hour < 9) return "early mornings";
  if (hour < 12) return "mornings";
  if (hour < 17) return "afternoons";
  if (hour < 21) return "evenings";
  return "late evenings";
}

function generateCircadianSentence(
  hourly: HeatmapEntry[]
): string | null {
  if (hourly.length === 0) return null;
  const total = hourly.reduce((sum, c) => sum + c.count, 0);
  if (total < 20) return null; // not enough signal

  const peak = hourly.reduce((best, cell) =>
    cell.count > best.count ? cell : best
  );
  if (peak.count === 0) return null;

  // Flat-ish distribution: no clear peak
  const avg = total / hourly.length;
  if (peak.count < avg * 2.5) {
    return "Your weeks are pretty spread out — no single peak.";
  }

  const day = DAY_NAMES[peak.dayOfWeek];
  const time = timeOfDayName(peak.hour);
  return `Most of your weeks happen on **${day} ${time}**.`;
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

export function CircadianSignature({
  hourlyHeatmap,
}: {
  hourlyHeatmap: HeatmapEntry[];
}) {
  const grid24 = buildGrid(hourlyHeatmap);
  const grid12 = aggregateTo12(grid24);
  const max24 = Math.max(...grid24.flat(), 1);
  const max12 = Math.max(...grid12.flat(), 1);

  const sentence = generateCircadianSentence(hourlyHeatmap);
  const totalCompletions = hourlyHeatmap.reduce((s, c) => s + c.count, 0);

  if (totalCompletions === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-1 text-sm font-medium">Your shape</h3>
          <p className="text-xs text-muted-foreground">
            Your shape is still forming — complete a few tasks and check back.
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
        <h3 className="mb-1 text-sm font-medium">Your shape</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          When your weeks actually happen &middot; all time
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
              aria-label={`All-time task completion heatmap, ${totalCompletions} tasks across 7 days and 12 two-hour blocks`}
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
                    title={`${DAY_NAMES[dayIdx]} ${hourRangeLabel(blockIdx * 2)} — ${count} task${count === 1 ? "" : "s"}`}
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
              aria-label={`All-time task completion heatmap, ${totalCompletions} tasks across 7 days and 24 hours`}
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
                    title={`${DAY_NAMES[dayIdx]} ${hourLabel(hour)} — ${count} task${count === 1 ? "" : "s"}`}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {sentence && (
          <p
            className="mt-4 text-[13px] text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: sentence.replace(
                /\*\*(.*?)\*\*/g,
                '<strong class="text-foreground">$1</strong>'
              ),
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
