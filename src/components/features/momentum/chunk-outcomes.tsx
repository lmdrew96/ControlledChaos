"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { MomentumStats } from "@/lib/db/queries";
import { chunkingInsight } from "@/lib/momentum";

type Props = {
  chunking: MomentumStats["chunking"];
  periodPhrase: string;
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
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

export function ChunkOutcomes({ chunking, periodPhrase }: Props) {
  const { chunked, unchunked } = chunking;

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-medium">Does chunking help?</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          How often tasks added {periodPhrase} got finished, with and without steps
        </p>

        {chunked.total + unchunked.total === 0 ? (
          <p className="text-xs text-muted-foreground">No tasks added {periodPhrase}.</p>
        ) : (
          <div className="space-y-4">
            <OutcomeBar
              label="Chunked tasks finished"
              completed={chunked.finished}
              total={chunked.total}
              color="249, 115, 22"
            />
            <OutcomeBar
              label="Unchunked tasks finished"
              completed={unchunked.finished}
              total={unchunked.total}
              color="140, 189, 185"
            />
            {chunking.chunksTotal > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="tabular-nums">{chunking.chunksCompleted}</span> of{" "}
                <span className="tabular-nums">{chunking.chunksTotal}</span> individual steps done
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-[13px] text-muted-foreground">
          {chunkingInsight(chunked, unchunked)}
        </p>
      </CardContent>
    </Card>
  );
}
