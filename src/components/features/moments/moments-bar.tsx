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

// ============================================================
// Shared logging logic — kept separate so both the mobile bar
// and the sidebar group can reuse the same toast + undo flow.
// ============================================================

interface MomentLogging {
  logQuick: (type: MomentType) => Promise<void>;
  openDetail: (type: MomentType) => void;
  detailOpen: boolean;
  setDetailOpen: (open: boolean) => void;
  detailType: MomentType | null;
  handleDetailSave: (data: {
    type: MomentType;
    intensity: number | null;
    note: string | null;
    occurredAt: Date;
  }) => Promise<void>;
}

function useMomentLogging(): MomentLogging {
  const [detailType, setDetailType] = useState<MomentType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const logQuick = useCallback(async (type: MomentType) => {
    const copy = MOMENT_COPY[type];
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
          if (ok) toast.success("Undone");
          else toast.error("Couldn't undo — please check the moments list.");
        },
      },
    });
  }, []);

  const openDetail = useCallback((type: MomentType) => {
    setDetailType(type);
    setDetailOpen(true);
  }, []);

  const handleDetailSave = useCallback(
    async ({
      type,
      intensity,
      note,
      occurredAt,
    }: {
      type: MomentType;
      intensity: number | null;
      note: string | null;
      occurredAt: Date;
    }) => {
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
    },
    []
  );

  return {
    logQuick,
    openDetail,
    detailOpen,
    setDetailOpen,
    detailType,
    handleDetailSave,
  };
}

// ============================================================
// Mobile variant — fixed strip above the bottom nav (md:hidden).
// Horizontally scrollable row of chips with touch-action: pan-x so
// swipes pan the list rather than getting intercepted by chip taps.
// ============================================================

export function MomentsBar() {
  const logging = useMomentLogging();

  return (
    <>
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl md:hidden">
        <div
          className="flex items-center gap-2 overflow-x-auto px-3 py-2 [touch-action:pan-x]"
          role="toolbar"
          aria-label="Log a moment"
        >
          {MOMENT_TYPES.map((type) => (
            <MomentChip
              key={type}
              type={type}
              onTap={() => logging.logQuick(type)}
              onLongPress={() => logging.openDetail(type)}
              layout="row"
            />
          ))}
        </div>
      </div>

      <MomentDetailSheet
        open={logging.detailOpen}
        onOpenChange={logging.setDetailOpen}
        type={logging.detailType}
        onSave={logging.handleDetailSave}
      />
    </>
  );
}

// ============================================================
// Desktop variant — inline group for the sidebar.
// Compact two-per-row grid so the sidebar stays narrow (w-64).
// ============================================================

export function MomentsSidebarGroup() {
  const logging = useMomentLogging();

  return (
    <>
      <div
        className="border-t border-border px-3 py-3"
        role="toolbar"
        aria-label="Log a moment"
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Log a moment
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {MOMENT_TYPES.map((type) => (
            <MomentChip
              key={type}
              type={type}
              onTap={() => logging.logQuick(type)}
              onLongPress={() => logging.openDetail(type)}
              layout="grid"
            />
          ))}
        </div>
      </div>

      <MomentDetailSheet
        open={logging.detailOpen}
        onOpenChange={logging.setDetailOpen}
        type={logging.detailType}
        onSave={logging.handleDetailSave}
      />
    </>
  );
}

// ============================================================
// Chip — shared between variants.
// layout="row" = mobile-bar pill
// layout="grid" = sidebar cell (full-width within its grid column)
// ============================================================

interface MomentChipProps {
  type: MomentType;
  onTap: () => void;
  onLongPress: () => void;
  layout: "row" | "grid";
}

function MomentChip({ type, onTap, onLongPress, layout }: MomentChipProps) {
  const copy = MOMENT_COPY[type];
  const Icon = copy.icon;
  const handlers = useLongPress({
    onShortPress: onTap,
    onLongPress,
    thresholdMs: 500,
    moveToleranceInPx: 10,
  });

  return (
    <button
      type="button"
      {...handlers}
      className={cn(
        "flex select-none items-center gap-1.5 rounded-full border text-xs font-medium transition-transform active:scale-95",
        copy.tintClassName,
        layout === "row" && "shrink-0 px-3 py-1.5",
        layout === "grid" && "w-full justify-center px-2 py-1.5"
      )}
      aria-label={`${copy.label} — tap to log, long-press for details`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="truncate">{copy.label}</span>
    </button>
  );
}
