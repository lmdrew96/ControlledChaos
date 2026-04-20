"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { MarinationBuckets, MomentumStats } from "@/lib/db/queries";

const BUCKET_KEYS: Array<keyof MarinationBuckets> = [
  "fresh",
  "week",
  "marinating",
  "aging",
];

const BUCKET_LABELS: Record<keyof MarinationBuckets, { title: string; range: string }> = {
  fresh: { title: "Fresh", range: "< 1 day" },
  week: { title: "This week", range: "1–7 days" },
  marinating: { title: "Marinating", range: "1–4 weeks" },
  aging: { title: "Aging gracefully", range: "30+ days" },
};

const HISTORICAL_MIN = 5;

function bucketTotal(b: MarinationBuckets): number {
  return b.fresh + b.week + b.marinating + b.aging;
}

// Log-scale opacity within a row — keeps low counts visible
function opacityFor(count: number, max: number): number {
  if (count === 0) return 0.08;
  if (max <= 0) return 0.08;
  const t = Math.log(count + 1) / Math.log(max + 1);
  return 0.2 + t * 0.7;
}

function generateMarinationSentence(
  marination: MomentumStats["marination"]
): string | null {
  const activeTotal = bucketTotal(marination.active);
  const histTotal = bucketTotal(marination.historical);
  const activeOld = marination.active.marinating + marination.active.aging;

  if (activeTotal === 0) return null;

  if (histTotal >= HISTORICAL_MIN) {
    const histFast = marination.historical.fresh + marination.historical.week;
    const fastRatio = histFast / histTotal;
    if (fastRatio >= 0.7 && activeOld > 0) {
      return `Most tasks finish within a week. You have **${activeOld}** sitting longer — not overdue, just marinating.`;
    }
    if (fastRatio >= 0.7) {
      return "Most tasks finish within a week. Everything active is still fresh.";
    }
    if (activeOld > 0) {
      return `**${activeOld}** tasks have been sitting a while — that's normal for how you work.`;
    }
  }

  if (activeOld === 0 && activeTotal > 0) {
    return "Everything here is fresh.";
  }
  return null;
}

type RowProps = {
  label: string;
  buckets: MarinationBuckets;
  color: string; // "R, G, B"
};

function MarinationRow({ label, buckets, color }: RowProps) {
  const max = Math.max(buckets.fresh, buckets.week, buckets.marinating, buckets.aging, 1);
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr] sm:gap-4">
      <div className="text-right text-xs text-muted-foreground">{label}</div>
      <div className="grid grid-cols-4 gap-[3px] overflow-hidden rounded-md">
        {BUCKET_KEYS.map((k) => {
          const count = buckets[k];
          const intensity = count / max;
          const textColor =
            intensity > 0.5 ? "text-foreground" : "text-muted-foreground";
          return (
            <div
              key={k}
              className={`flex h-10 items-center justify-center rounded-sm text-sm font-semibold tabular-nums ${textColor}`}
              style={{
                backgroundColor: `rgba(${color}, ${opacityFor(count, max)})`,
              }}
              title={`${BUCKET_LABELS[k].title} · ${BUCKET_LABELS[k].range} · ${count} task${count === 1 ? "" : "s"}`}
            >
              {count}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TaskMarination({
  marination,
}: {
  marination: MomentumStats["marination"];
}) {
  const activeTotal = bucketTotal(marination.active);
  const histTotal = bucketTotal(marination.historical);

  // Hide the card entirely if user has nothing at all
  if (activeTotal === 0 && histTotal === 0) return null;

  const sentence = generateMarinationSentence(marination);
  const showHistorical = histTotal >= HISTORICAL_MIN;

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-1 text-sm font-medium">Task marination</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          How long things tend to live here
        </p>

        <div className="space-y-2">
          <MarinationRow
            label="Active now"
            buckets={marination.active}
            color="249, 115, 22"
          />
          {showHistorical && (
            <MarinationRow
              label="Usually finish within"
              buckets={marination.historical}
              color="140, 189, 185"
            />
          )}
        </div>

        {/* Bucket axis labels */}
        <div className="mt-3 grid grid-cols-[90px_1fr] gap-3 sm:grid-cols-[110px_1fr] sm:gap-4">
          <div aria-hidden="true" />
          <div className="grid grid-cols-4 gap-[3px] text-center">
            {BUCKET_KEYS.map((k) => (
              <div key={k}>
                <div className="text-[11px] font-medium text-foreground">
                  {BUCKET_LABELS[k].title}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {BUCKET_LABELS[k].range}
                </div>
              </div>
            ))}
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
