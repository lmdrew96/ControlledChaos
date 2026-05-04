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
  const [info, setInfo] = useState<Resolved | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setLoadFailed(false);

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
