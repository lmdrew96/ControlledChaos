"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MirrorEntry, MirrorKind } from "@/types";
import { MIRROR_KINDS } from "@/components/features/mirror/mirror-constants";
import { MirrorDayNav } from "@/components/features/mirror/mirror-day-nav";
import { MirrorFilterPills } from "@/components/features/mirror/mirror-filter-pills";
import { MirrorTimeline } from "@/components/features/mirror/mirror-timeline";
import { useTimezone } from "@/hooks/use-timezone";

function todayInTz(timezone: string): string {
  // en-CA gives YYYY-MM-DD directly
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

function parseKindsParam(raw: string | null): MirrorKind[] {
  if (!raw) return [...MIRROR_KINDS];
  const parts = raw.split(",").map((s) => s.trim());
  const out = parts.filter((p): p is MirrorKind =>
    (MIRROR_KINDS as string[]).includes(p)
  );
  return out.length > 0 ? out : [...MIRROR_KINDS];
}

export default function MirrorPage() {
  const timezone = useTimezone();
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = todayInTz(timezone);
  const dateParam = searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : today;
  const activeKinds = useMemo(
    () => parseKindsParam(searchParams.get("types")),
    [searchParams]
  );

  // Fetch key — changes whenever date or filters change. isLoading is
  // derived at render time by comparing against the most-recent resolved
  // key, so we never call setState synchronously inside useEffect.
  const filterKey =
    activeKinds.length < MIRROR_KINDS.length ? activeKinds.join(",") : "*";
  const fetchKey = `${date}|${filterKey}`;

  const [resolved, setResolved] = useState<{
    key: string;
    entries: MirrorEntry[];
    error: boolean;
  } | null>(null);

  const isLoading = !resolved || resolved.key !== fetchKey;
  const entries = resolved?.key === fetchKey ? resolved.entries : [];
  const loadError = resolved?.key === fetchKey ? resolved.error : false;

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({ date });
    // Only send `types` when filtering to a strict subset.
    if (activeKinds.length < MIRROR_KINDS.length) {
      params.set("types", activeKinds.join(","));
    }

    fetch(`/api/mirror?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list: MirrorEntry[] = Array.isArray(data?.entries)
          ? data.entries
          : [];
        setResolved({ key: fetchKey, entries: list, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setResolved({ key: fetchKey, entries: [], error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [date, activeKinds, fetchKey]);

  const updateParams = useCallback(
    (next: { date?: string; kinds?: MirrorKind[] }) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next.date !== undefined) {
        if (next.date === today) p.delete("date");
        else p.set("date", next.date);
      }
      if (next.kinds !== undefined) {
        if (next.kinds.length === MIRROR_KINDS.length) p.delete("types");
        else p.set("types", next.kinds.join(","));
      }
      const qs = p.toString();
      router.replace(qs ? `/mirror?${qs}` : "/mirror", { scroll: false });
    },
    [router, searchParams, today]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mirror</h1>
        <p className="text-muted-foreground">
          What actually happened. Scroll a day, not a feed.
        </p>
      </div>

      <MirrorDayNav
        date={date}
        today={today}
        timezone={timezone}
        onChange={(d) => updateParams({ date: d })}
      />

      <MirrorFilterPills
        activeKinds={activeKinds}
        onChange={(kinds) => updateParams({ kinds })}
      />

      <MirrorTimeline
        entries={entries}
        timezone={timezone}
        isLoading={isLoading}
        loadError={loadError}
        date={date}
        today={today}
      />
    </div>
  );
}
