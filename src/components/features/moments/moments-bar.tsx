"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLongPress } from "./use-long-press";
import { MOMENT_COPY } from "./moment-constants";
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
// Shared logging logic — reused by the quick-log FAB and the
// Recap input widget so both get the same toast + undo flow.
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

export function useMomentLogging(onLogged?: () => void): MomentLogging {
  const [detailType, setDetailType] = useState<MomentType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const logQuick = useCallback(async (type: MomentType) => {
    const copy = MOMENT_COPY[type];
    const result = await postMoment({ type });
    if (!result) {
      toast.error(`Couldn't log ${copy.label.toLowerCase()}. Try again.`);
      return;
    }
    onLogged?.();
    toast.success(copy.toastLabel, {
      action: {
        label: "Undo",
        onClick: async () => {
          const ok = await softDeleteMoment(result.id);
          if (ok) {
            toast.success("Undone");
            onLogged?.();
          } else {
            toast.error("Couldn't undo — please check the moments list.");
          }
        },
      },
    });
  }, [onLogged]);

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
      onLogged?.();
      toast.success(copy.toastLabel, {
        action: {
          label: "Undo",
          onClick: async () => {
            const ok = await softDeleteMoment(result.id);
            if (ok) {
              toast.success("Undone");
              onLogged?.();
            }
          },
        },
      });
    },
    [onLogged]
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
// Chip — shared between the FAB popover and the Recap widget.
// layout="grid" = two-column popover cell
// layout="wrap" = flex-wrap row in the Recap widget
// ============================================================

interface MomentChipProps {
  type: MomentType;
  onTap: () => void;
  onLongPress: () => void;
  layout: "grid" | "wrap";
}

export function MomentChip({ type, onTap, onLongPress, layout }: MomentChipProps) {
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
        layout === "grid" && "w-full justify-center px-2 py-1.5",
        layout === "wrap" && "px-3 py-1.5"
      )}
      aria-label={`${copy.label} — tap to log, long-press for details`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="truncate">{copy.label}</span>
    </button>
  );
}
