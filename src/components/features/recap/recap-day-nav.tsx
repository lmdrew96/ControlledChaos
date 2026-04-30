"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatForDisplay } from "@/lib/timezone";

interface RecapDayNavProps {
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DD representing "today" in the user's timezone (for the Today button). */
  today: string;
  onChange: (date: string) => void;
  timezone: string;
}

/**
 * Prev-day / Next-day / Today / date picker. No infinite scroll — each
 * jump is an explicit action. Matches ND anti-pattern #2 (predictability).
 */
export function RecapDayNav({
  date,
  today,
  onChange,
  timezone,
}: RecapDayNavProps) {
  const addDays = (baseYmd: string, delta: number): string => {
    // Anchor at UTC midday so DST at the user's timezone doesn't skew the
    // arithmetic on ±1 day jumps.
    const d = new Date(`${baseYmd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };

  const isToday = date === today;
  const longLabel = formatForDisplay(new Date(`${date}T12:00:00Z`), timezone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">{longLabel}</p>
        {!isToday && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange(today)}
          >
            Today
          </Button>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(addDays(date, 1))}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Input
        type="date"
        value={date}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="ml-auto h-9 w-auto"
        aria-label="Jump to date"
      />
    </div>
  );
}
