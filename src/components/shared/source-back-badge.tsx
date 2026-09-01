"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceBackBadgeProps {
  sourceDumpId?: string | null;
  sourceEventId?: string | null;
  className?: string;
}

interface DumpInfo {
  kind: "dump";
  date: string;
  snippet: string;
  href: string;
  category: "braindump" | "junk_journal" | string;
}

interface EventInfo {
  kind: "event";
  title: string;
  href: string;
}

type Resolved = DumpInfo | EventInfo;

export function SourceBackBadge({
  sourceDumpId,
  sourceEventId,
  className,
}: SourceBackBadgeProps) {
  // Tag the result with the request it belongs to, so switching sources shows
  // nothing rather than the previous source's badge until the fetch lands.
  const requestKey = sourceDumpId ?? sourceEventId ?? "";
  const [resolved, setResolved] = useState<{
    key: string;
    info: Resolved | null;
    failed: boolean;
  } | null>(null);

  const current = resolved?.key === requestKey ? resolved : null;
  const info = current?.info ?? null;
  const loadFailed = current?.failed ?? false;

  useEffect(() => {
    let cancelled = false;
    const key = sourceDumpId ?? sourceEventId ?? "";
    const setInfo = (value: Resolved) => setResolved({ key, info: value, failed: false });
    const setLoadFailed = (failed: boolean) => setResolved({ key, info: null, failed });

    if (sourceDumpId) {
      fetch(`/api/dump/${sourceDumpId}/source-info`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data) => {
          if (cancelled) return;
          setInfo({
            kind: "dump",
            date: data.date,
            snippet: data.snippet,
            category: data.category,
            href: `/recap?date=${encodeURIComponent(data.date)}`,
          });
        })
        .catch(() => {
          if (!cancelled) setLoadFailed(true);
        });
    } else if (sourceEventId) {
      fetch(
        `/api/calendar/events/by-external?externalId=${encodeURIComponent(sourceEventId)}`
      )
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data) => {
          if (cancelled) return;
          setInfo({
            kind: "event",
            title: data.title,
            href: `/calendar?date=${encodeURIComponent(data.date)}`,
          });
        })
        .catch(() => {
          if (!cancelled) setLoadFailed(true);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [sourceDumpId, sourceEventId]);

  if (!sourceDumpId && !sourceEventId) return null;
  if (loadFailed) return null;
  if (!info) return null;

  const label =
    info.kind === "dump"
      ? `from ${info.category === "junk_journal" ? "journal" : "brain dump"} · "${info.snippet}"`
      : `from event "${info.title}"`;

  return (
    <Link
      href={info.href}
      title={label}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <ArrowLeft className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
