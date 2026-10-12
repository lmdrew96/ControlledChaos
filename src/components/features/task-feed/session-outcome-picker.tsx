"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, SkipForward, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SessionOutcome } from "@/lib/calendar/session-minutes";

/** What the Done button says for a moment after it lands. Add freely. */
const DONE_PHRASES = [
  "Nice! 😎",
  "Nailed it 🎯",
  "Look at you go ✨",
  "Done and done 🙌",
  "Brain: 1, Chaos: 0 🧠",
];

/** How long the celebration holds before the row settles into "Done". */
const CELEBRATE_MS = 1500;

// Module-level so back-to-back sittings (even in different rows) never repeat.
let lastPhrase: string | null = null;

const pickPhrase = (): string => {
  const pool = DONE_PHRASES.filter((p) => p !== lastPhrase);
  lastPhrase = pool[Math.floor(Math.random() * pool.length)];
  return lastPhrase;
};

interface SessionOutcomePickerProps {
  taskId: string;
  sessionId: string;
  /** The sitting's planned length, used to suggest a "partly" amount. */
  plannedMinutes?: number | null;
  /** Called after a successful write so the parent can refetch. */
  onLogged?: (status: SessionOutcome) => void;
  /**
   * Start as a small link with this label that opens the buttons. For a
   * sitting that hasn't ended: the option should be there without asking.
   */
  collapsedLabel?: string;
}

/**
 * One tap to say how a sitting went. What gets logged comes off the task's
 * estimate, and the remaining sittings split what's left.
 *
 * Deliberately a set of buttons rather than a timer or a percent slider: it
 * asks about something that already happened, in the moment you notice it.
 * Leaving it unanswered is fine. It can be answered early too: finishing
 * before the planned end shouldn't mean coming back later to say so.
 */
export function SessionOutcomePicker({
  taskId,
  sessionId,
  plannedMinutes,
  onLogged,
  collapsedLabel,
}: SessionOutcomePickerProps) {
  const [expanded, setExpanded] = useState(!collapsedLabel);
  const [busy, setBusy] = useState<SessionOutcome | null>(null);
  const [askingMinutes, setAskingMinutes] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [celebrating, setCelebrating] = useState<string | null>(null);

  // Telling the parent swaps this picker out for the logged row, so a Done
  // holds the celebration first and reports when it settles. If the picker
  // goes away mid-celebration (dialog closed), report then so nothing's stale.
  const onLoggedRef = useRef(onLogged);
  onLoggedRef.current = onLogged;
  useEffect(() => {
    if (!celebrating) return;
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      onLoggedRef.current?.("done");
    };
    const timer = setTimeout(report, CELEBRATE_MS);
    return () => {
      clearTimeout(timer);
      report();
    };
  }, [celebrating]);

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
      if (status === "done") setCelebrating(pickPhrase());
      else onLogged?.(status);
    } catch {
      toast.error("Couldn't log that session");
    } finally {
      setBusy(null);
    }
  }

  if (celebrating) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          size="sm"
          tabIndex={-1}
          aria-live="polite"
          className="done-pop pointer-events-none border border-success bg-success text-success-foreground"
        >
          <Check />
          {celebrating}
        </Button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
        }}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {collapsedLabel}
      </button>
    );
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
          aria-label="Minutes worked in this session"
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
      {collapsedLabel && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => setExpanded(false)}
        >
          Not yet
        </Button>
      )}
    </div>
  );
}
