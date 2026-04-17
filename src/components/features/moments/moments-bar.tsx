"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLongPress } from "./use-long-press";
import { MomentDetailSheet } from "./moment-detail-sheet";
import { MOMENT_COPY, MOMENT_TYPES } from "./moment-constants";
import type { MomentType } from "@/types";

interface LogMomentPayload {
  type: MomentType;
  intensity?: number | null;
  note?: string | null;
  occurredAt?: string; // ISO
}

async function postMoment(
  payload: LogMomentPayload
): Promise<{ id: string } | null> {
  const res = await fetch("/api/moments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { moment?: { id: string } };
  return data.moment ?? null;
}

async function softDeleteMoment(id: string): Promise<boolean> {
  const res = await fetch(`/api/moments/${id}`, { method: "DELETE" });
  return res.ok;
}

export function MomentsBar() {
  const [detailType, setDetailType] = useState<MomentType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const logQuick = useCallback(async (type: MomentType) => {
    const copy = MOMENT_COPY[type];
    // Optimistic toast — literal confirmation (ND principle: "say what you mean")
    const result = await postMoment({ type });
    if (!result) {
      toast.error(`Couldn't log ${copy.label.toLowerCase()}. Try again.`);
      return;
    }

    toast.success(copy.toastLabel, {
      action: {
        label: "Undo",
        onClick: async () => {
          const ok = await softDeleteMoment(result.id);
          if (ok) {
            toast.success("Undone");
          } else {
            toast.error("Couldn't undo — please check the moments list.");
          }
        },
      },
    });
  }, []);

  const openDetail = useCallback((type: MomentType) => {
    setDetailType(type);
    setDetailOpen(true);
  }, []);

  return (
    <>
      {/* Mobile variant — positioned above the bottom nav (5rem + safe-area inset) */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl md:hidden">
        <MomentsBarInner onTap={logQuick} onLongPress={openDetail} />
      </div>
      {/* Desktop variant — pinned to viewport bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 hidden border-t border-border bg-card/95 backdrop-blur-xl md:block">
        <MomentsBarInner onTap={logQuick} onLongPress={openDetail} />
      </div>

      <MomentDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        type={detailType}
        onSave={async ({ type, intensity, note, occurredAt }) => {
          const copy = MOMENT_COPY[type];
          const result = await postMoment({
            type,
            intensity,
            note,
            occurredAt: occurredAt.toISOString(),
          });
          if (!result) {
            toast.error(`Couldn't log ${copy.label.toLowerCase()}. Try again.`);
            return;
          }
          toast.success(copy.toastLabel, {
            action: {
              label: "Undo",
              onClick: async () => {
                const ok = await softDeleteMoment(result.id);
                if (ok) toast.success("Undone");
              },
            },
          });
        }}
      />
    </>
  );
}

interface MomentsBarInnerProps {
  onTap: (type: MomentType) => void;
  onLongPress: (type: MomentType) => void;
}

function MomentsBarInner({ onTap, onLongPress }: MomentsBarInnerProps) {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto px-3 py-2"
      role="toolbar"
      aria-label="Log a moment"
    >
      {MOMENT_TYPES.map((type) => (
        <MomentChip
          key={type}
          type={type}
          onTap={() => onTap(type)}
          onLongPress={() => onLongPress(type)}
        />
      ))}
    </div>
  );
}

interface MomentChipProps {
  type: MomentType;
  onTap: () => void;
  onLongPress: () => void;
}

function MomentChip({ type, onTap, onLongPress }: MomentChipProps) {
  const copy = MOMENT_COPY[type];
  const Icon = copy.icon;
  const handlers = useLongPress({
    onShortPress: onTap,
    onLongPress,
    thresholdMs: 500,
  });

  return (
    <button
      type="button"
      {...handlers}
      className={cn(
        "flex shrink-0 select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-transform active:scale-95",
        copy.tintClassName
      )}
      aria-label={`${copy.label} — tap to log, long-press for details`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{copy.label}</span>
    </button>
  );
}
