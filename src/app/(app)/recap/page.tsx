"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { RecapEntry, RecapKind } from "@/types";
import { RECAP_KINDS } from "@/components/features/recap/recap-constants";
import { RecapDayNav } from "@/components/features/recap/recap-day-nav";
import { RecapFilterPills } from "@/components/features/recap/recap-filter-pills";
import { RecapTimeline } from "@/components/features/recap/recap-timeline";
import { useTimezone } from "@/hooks/use-timezone";

function todayInTz(timezone: string): string {
  // en-CA gives YYYY-MM-DD directly
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

function parseKindsParam(raw: string | null): RecapKind[] {
  if (!raw) return [...RECAP_KINDS];
  const parts = raw.split(",").map((s) => s.trim());
  const out = parts.filter((p): p is RecapKind =>
    (RECAP_KINDS as string[]).includes(p)
  );
  return out.length > 0 ? out : [...RECAP_KINDS];
}

export default function RecapPage() {
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
    activeKinds.length < RECAP_KINDS.length ? activeKinds.join(",") : "*";
  const fetchKey = `${date}|${filterKey}`;

  const [resolved, setResolved] = useState<{
    key: string;
    entries: RecapEntry[];
    error: boolean;
  } | null>(null);

  const isLoading = !resolved || resolved.key !== fetchKey;
  const entries = resolved?.key === fetchKey ? resolved.entries : [];
  const loadError = resolved?.key === fetchKey ? resolved.error : false;

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({ date });
    // Only send `types` when filtering to a strict subset.
    if (activeKinds.length < RECAP_KINDS.length) {
      params.set("types", activeKinds.join(","));
    }

    fetch(`/api/recap?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list: RecapEntry[] = Array.isArray(data?.entries)
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
    (next: { date?: string; kinds?: RecapKind[] }) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next.date !== undefined) {
        if (next.date === today) p.delete("date");
        else p.set("date", next.date);
      }
      if (next.kinds !== undefined) {
        if (next.kinds.length === RECAP_KINDS.length) p.delete("types");
        else p.set("types", next.kinds.join(","));
      }
      const qs = p.toString();
      router.replace(qs ? `/recap?${qs}` : "/recap", { scroll: false });
    },
    [router, searchParams, today]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Daily Recap</h1>
        <p className="text-muted-foreground">
          What actually happened. Scroll a day, not a feed.
        </p>
      </div>

      <RecapDayNav
        date={date}
        today={today}
        timezone={timezone}
        onChange={(d) => updateParams({ date: d })}
      />

      <RecapFilterPills
        activeKinds={activeKinds}
        onChange={(kinds) => updateParams({ kinds })}
      />

      <RecapTimeline
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
