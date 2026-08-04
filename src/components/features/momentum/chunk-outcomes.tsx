"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { MomentumStats } from "@/lib/db/queries";

const MIN_PARENTS_FOR_INSIGHT = 3;

type Props = {
  chunkOutcomes: MomentumStats["chunkOutcomes"];
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function generateSentence(c: MomentumStats["chunkOutcomes"]): string | null {
  if (c.parentsChunked < MIN_PARENTS_FOR_INSIGHT) return null;
  const p = pct(c.parentsCompleted, c.parentsChunked);
  if (p >= 70) return "Chunking is working for you.";
  if (p >= 40) return "Chunking helps sometimes.";
  return "Chunking isn't moving the needle yet.";
}

type BarProps = {
  label: string;
  completed: number;
  total: number;
  color: string; // "R, G, B"
};

function OutcomeBar({ label, completed, total, color }: BarProps) {
  const percent = pct(completed, total);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">
          <span className="font-semibold">{completed}</span>
          <span className="text-muted-foreground"> of {total}</span>
          <span className="ml-2 font-semibold" style={{ color: `rgb(${color})` }}>
            {percent}%
          </span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${percent}%`,
            backgroundColor: `rgb(${color})`,
          }}
        />
      </div>
    </div>
  );
}

export function ChunkOutcomes({ chunkOutcomes }: Props) {
  // Hide entirely if nothing's ever been chunked
  if (chunkOutcomes.parentsChunked === 0) return null;

  const sentence = generateSentence(chunkOutcomes);

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-1 text-sm font-medium">Chunk outcomes</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Does breaking things down help?
        </p>

        <div className="space-y-4">
          <OutcomeBar
            label="Chunked tasks finished"
            completed={chunkOutcomes.parentsCompleted}
            total={chunkOutcomes.parentsChunked}
            color="249, 115, 22"
          />
          <OutcomeBar
            label="Individual chunks completed"
            completed={chunkOutcomes.chunksCompleted}
            total={chunkOutcomes.chunksTotal}
            color="140, 189, 185"
          />
        </div>

        {sentence && (
          <p className="mt-4 text-[13px] text-muted-foreground">{sentence}</p>
        )}
      </CardContent>
    </Card>
  );
}
