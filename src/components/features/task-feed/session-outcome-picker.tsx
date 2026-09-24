"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, SkipForward, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionOutcome } from "@/lib/calendar/session-minutes";

interface SessionOutcomePickerProps {
  taskId: string;
  sessionId: string;
  /** The sitting's planned length, used to suggest a "partly" amount. */
  plannedMinutes?: number | null;
  /** Called after a successful write so the parent can refetch. */
  onLogged?: (status: SessionOutcome) => void;
}

/**
 * One tap to say how a sitting went. What gets logged comes off the task's
 * estimate, and the remaining sittings split what's left.
 *
 * Deliberately a set of buttons rather than a timer or a percent slider: it
 * asks about something that already happened, in the moment you notice it.
 * Leaving it unanswered is fine.
 */
export function SessionOutcomePicker({
  taskId,
  sessionId,
  plannedMinutes,
  onLogged,
}: SessionOutcomePickerProps) {
  const [busy, setBusy] = useState<SessionOutcome | null>(null);
  const [askingMinutes, setAskingMinutes] = useState(false);
  const [minutes, setMinutes] = useState("");

  async function log(status: SessionOutcome, partial?: number) {
    setBusy(status);
    try {
      const res = await fetch(`/api/tasks/${taskId}/sessions/${sessionId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, minutes: partial }),
      });
      if (!res.ok) throw new Error();
      setAskingMinutes(false);
      onLogged?.(status);
    } catch {
      toast.error("Couldn't log that sitting");
    } finally {
      setBusy(null);
    }
  }

  if (askingMinutes) {
    const parsed = Math.round(Number(minutes));
    const valid = minutes.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void log("partial", parsed);
        }}
      >
        <span className="text-xs text-muted-foreground">About how long?</span>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          autoFocus
          value={minutes}
          placeholder={plannedMinutes ? String(Math.round(plannedMinutes / 2)) : "20"}
          onChange={(e) => setMinutes(e.target.value)}
          className="h-8 w-16 px-2 tabular-nums"
          aria-label="Minutes worked in this sitting"
        />
        <span className="text-xs text-muted-foreground">min</span>
        <Button type="submit" size="sm" disabled={!valid || busy !== null}>
          {busy === "partial" ? <Loader2 className="animate-spin" /> : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAskingMinutes(false)}>
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy !== null}
        onClick={() => void log("done")}
      >
        {busy === "done" ? <Loader2 className="animate-spin" /> : <Check />}
        Done
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy !== null}
        onClick={() => setAskingMinutes(true)}
      >
        <Timer />
        Partly
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy !== null}
        onClick={() => void log("skipped")}
      >
        {busy === "skipped" ? <Loader2 className="animate-spin" /> : <SkipForward />}
        Skipped
      </Button>
    </div>
  );
}
