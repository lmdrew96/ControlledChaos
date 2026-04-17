"use client";

import Link from "next/link";
import { formatForDisplay, DISPLAY_TIME } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { MirrorEntry } from "@/types";
import { MIRROR_KIND_META } from "./mirror-constants";
import { MOMENT_COPY } from "@/components/features/moments/moment-constants";

interface MirrorEntryRowProps {
  entry: MirrorEntry;
  timezone: string;
}

/**
 * Single row of the Mirror timeline. Dispatches on `kind` for the label
 * and snippet copy, then wraps in a Link if the kind has a source page
 * (moments have no source in v1 and render as non-interactive rows).
 */
export function MirrorEntryRow({ entry, timezone }: MirrorEntryRowProps) {
  const meta = MIRROR_KIND_META[entry.kind];
  const Icon = meta.icon;
  const time = formatForDisplay(new Date(entry.at), timezone, DISPLAY_TIME);
  const href = meta.href?.(entry) ?? null;

  const { label, snippet } = describe(entry, timezone);

  const content = (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        meta.tintClassName,
        href && "hover:brightness-110"
      )}
    >
      <div className="mt-0.5 shrink-0">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {snippet && (
          <p className="mt-0.5 truncate text-xs opacity-80">{snippet}</p>
        )}
      </div>
      <time
        className="mt-0.5 shrink-0 text-xs tabular-nums opacity-70"
        dateTime={entry.at}
      >
        {time}
      </time>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={`${meta.label}: ${label} at ${time}`}
        className="block"
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      aria-label={`${meta.label}: ${label} at ${time}`}
      className="block"
    >
      {content}
    </div>
  );
}

function describe(
  entry: MirrorEntry,
  timezone: string
): { label: string; snippet: string | null } {
  switch (entry.kind) {
    case "task":
      return { label: entry.title, snippet: entry.category };
    case "event": {
      const end = formatForDisplay(
        new Date(entry.endAt),
        timezone,
        DISPLAY_TIME
      );
      return {
        label: entry.title,
        snippet: entry.isAllDay
          ? "All day"
          : entry.location
            ? `ends ${end} · ${entry.location}`
            : `ends ${end}`,
      };
    }
    case "dump":
      return {
        label: entry.summary ?? "Brain dump",
        snippet: inputTypeLabel(entry.inputType),
      };
    case "journal": {
      const base = inputTypeLabel(entry.inputType);
      const photos =
        entry.mediaCount > 0
          ? `${entry.mediaCount} photo${entry.mediaCount !== 1 ? "s" : ""}`
          : null;
      const snippet = photos ? `${base} · ${photos}` : base;
      return {
        label: entry.summary ?? "Journal entry",
        snippet,
      };
    }
    case "moment": {
      const copy = MOMENT_COPY[entry.type];
      const intensity =
        typeof entry.intensity === "number" ? ` · ${entry.intensity}/5` : "";
      return {
        label: `${copy.label}${intensity}`,
        snippet: entry.note,
      };
    }
    case "med":
      return {
        label: entry.medicationName,
        snippet: entry.dosage,
      };
  }
}

function inputTypeLabel(inputType: string): string {
  switch (inputType) {
    case "voice":
      return "voice";
    case "photo":
      return "photo";
    default:
      return "text";
  }
}
