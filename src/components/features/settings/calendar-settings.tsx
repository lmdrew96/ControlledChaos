"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  Loader2,
  RefreshCw,
  X,
  Link2,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export function CalendarSettings() {
  // Canvas state
  const [canvasUrl, setCanvasUrl] = useState("");
  const [original, setOriginal] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    total: number;
    syncedAt: string;
  } | null>(null);

  // iCal export state
  const [subscribeUrl, setSubscribeUrl] = useState<string | null>(null);
  const [isLoadingExport, setIsLoadingExport] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Calendar display hours + week start
  const [calendarStartHour, setCalendarStartHour] = useState(7);
  const [calendarEndHour, setCalendarEndHour] = useState(22);
  const [savedCalendarStartHour, setSavedCalendarStartHour] = useState(7);
  const [savedCalendarEndHour, setSavedCalendarEndHour] = useState(22);
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [savedWeekStartDay, setSavedWeekStartDay] = useState(1);
  const [isSavingCalendar, setIsSavingCalendar] = useState(false);

  // AI scheduling window
  const [wakeTime, setWakeTime] = useState(7);
  const [sleepTime, setSleepTime] = useState(22);
  const [savedWakeTime, setSavedWakeTime] = useState(7);
  const [savedSleepTime, setSavedSleepTime] = useState(22);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const isDirty = canvasUrl !== original;
  const hasUrl = original.trim().length > 0;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.canvasIcalUrl) {
            setCanvasUrl(data.canvasIcalUrl);
            setOriginal(data.canvasIcalUrl);
          }
          if (data.calendarStartHour != null) {
            setCalendarStartHour(data.calendarStartHour);
            setSavedCalendarStartHour(data.calendarStartHour);
          }
          if (data.calendarEndHour != null) {
            setCalendarEndHour(data.calendarEndHour);
            setSavedCalendarEndHour(data.calendarEndHour);
          }
          if (data.wakeTime != null) {
            setWakeTime(data.wakeTime);
            setSavedWakeTime(data.wakeTime);
          }
          if (data.sleepTime != null) {
            setSleepTime(data.sleepTime);
            setSavedSleepTime(data.sleepTime);
          }
          if (data.weekStartDay != null) {
            setWeekStartDay(data.weekStartDay);
            setSavedWeekStartDay(data.weekStartDay);
          }
        }
      } catch {
        // defaults
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Load the iCal export URL on mount
  useEffect(() => {
    if (isLoading) return;
    setIsLoadingExport(true);
    fetch("/api/calendar/export", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.subscribeUrl) setSubscribeUrl(data.subscribeUrl);
      })
      .catch(() => {})
      .finally(() => setIsLoadingExport(false));
  }, [isLoading]);

  // ── Calendar display handlers ────────────────────────────────
  const calendarDirty =
    calendarStartHour !== savedCalendarStartHour ||
    calendarEndHour !== savedCalendarEndHour ||
    weekStartDay !== savedWeekStartDay;

  async function handleSaveCalendar() {
    setIsSavingCalendar(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarStartHour, calendarEndHour, weekStartDay }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSavedCalendarStartHour(calendarStartHour);
      setSavedCalendarEndHour(calendarEndHour);
      setSavedWeekStartDay(weekStartDay);
      toast.success("Calendar view updated!");
    } catch {
      toast.error("Failed to save calendar view settings");
    } finally {
      setIsSavingCalendar(false);
    }
  }

  // ── AI scheduling window handlers ────────────────────────────
  const scheduleDirty =
    wakeTime !== savedWakeTime || sleepTime !== savedSleepTime;

  async function handleSaveSchedule() {
    setIsSavingSchedule(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wakeTime, sleepTime }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSavedWakeTime(wakeTime);
      setSavedSleepTime(sleepTime);
      toast.success("Scheduling window updated!");
    } catch {
      toast.error("Failed to save scheduling window");
    } finally {
      setIsSavingSchedule(false);
    }
  }

  // ── Canvas handlers ──────────────────────────────────────────
  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasIcalUrl: canvasUrl.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setOriginal(canvasUrl.trim());
      toast.success("Canvas iCal URL saved!");
    } catch {
      toast.error("Failed to save Canvas URL");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCanvasSync() {
    if (isDirty) await handleSave();

    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");

      const canvasTotal = data.canvas?.total ?? 0;
      setSyncResult({ total: canvasTotal, syncedAt: data.syncedAt });
      toast.success(
        canvasTotal > 0 ? `Synced ${canvasTotal} Canvas events!` : "Sync complete!"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDisconnectCanvas() {
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasIcalUrl: null }),
      });
      setCanvasUrl("");
      setOriginal("");
      setSyncResult(null);
      toast.success("Canvas calendar disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
  }

  // ── iCal export handlers ────────────────────────────────────
  async function handleCopyUrl() {
    if (!subscribeUrl) return;
    try {
      await navigator.clipboard.writeText(subscribeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }

  async function handleRegenerateToken() {
    if (!confirm("Regenerate your calendar link? The old link will stop working.")) return;
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/calendar/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to regenerate");
      setSubscribeUrl(data.subscribeUrl);
      toast.success("Calendar link regenerated. Update your subscriptions.");
    } catch {
      toast.error("Failed to regenerate link");
    } finally {
      setIsRegenerating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  const formatHour = (h: number) => {
    if (h === 0) return "12 AM";
    if (h === 12) return "12 PM";
    if (h === 24) return "Midnight";
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
  };

  return (
    <div className="space-y-6">
      {/* ── Calendar View ───────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Calendar View</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Controls which hours are visible in the calendar grid.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full space-y-1.5 sm:w-auto">
            <label htmlFor="week-start" className="text-xs text-muted-foreground">
              Week starts on
            </label>
            <select
              id="week-start"
              value={weekStartDay}
              onChange={(e) => setWeekStartDay(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-[120px]"
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </div>
          <div className="w-full space-y-1.5 sm:w-auto">
            <label htmlFor="calendar-start" className="text-xs text-muted-foreground">
              Show from
            </label>
            <select
              id="calendar-start"
              value={calendarStartHour}
              onChange={(e) => setCalendarStartHour(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-[120px]"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
          </div>
          <div className="w-full space-y-1.5 sm:w-auto">
            <label htmlFor="calendar-end" className="text-xs text-muted-foreground">
              Show until
            </label>
            <select
              id="calendar-end"
              value={calendarEndHour}
              onChange={(e) => setCalendarEndHour(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-[120px]"
            >
              {Array.from({ length: 25 }, (_, h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
          </div>
          {calendarDirty && (
            <Button
              onClick={handleSaveCalendar}
              disabled={isSavingCalendar || calendarStartHour >= calendarEndHour}
              size="sm"
            >
              {isSavingCalendar && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Save
            </Button>
          )}
        </div>
        {calendarStartHour >= calendarEndHour && (
          <p className="text-xs text-destructive">Start must be before end.</p>
        )}
      </div>

      <Separator />

      {/* ── AI Scheduling Window ─────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">AI Scheduling Window</span>
        </div>
        <p className="text-xs text-muted-foreground">
          The AI will only schedule tasks within this window. Set it to your waking hours.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full space-y-1.5 sm:w-auto">
            <label htmlFor="wake-time" className="text-xs text-muted-foreground">
              Earliest
            </label>
            <select
              id="wake-time"
              value={wakeTime}
              onChange={(e) => setWakeTime(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-[120px]"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
          </div>
          <div className="w-full space-y-1.5 sm:w-auto">
            <label htmlFor="sleep-time" className="text-xs text-muted-foreground">
              Latest
            </label>
            <select
              id="sleep-time"
              value={sleepTime}
              onChange={(e) => setSleepTime(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-[120px]"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
          </div>
          {scheduleDirty && (
            <Button
              onClick={handleSaveSchedule}
              disabled={isSavingSchedule || wakeTime >= sleepTime}
              size="sm"
            >
              {isSavingSchedule && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Save
            </Button>
          )}
        </div>
        {wakeTime >= sleepTime && (
          <p className="text-xs text-destructive">Earliest must be before latest.</p>
        )}
      </div>

      <Separator />

      {/* ── Canvas Calendar ───────────────────────────────── */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <label htmlFor="canvas-url" className="text-sm font-medium">
              Canvas Calendar
            </label>
          </div>
          <Input
            id="canvas-url"
            value={canvasUrl}
            onChange={(e) => setCanvasUrl(e.target.value)}
            placeholder="https://udel.instructure.com/feeds/calendars/..."
            type="url"
          />
          <p className="text-xs text-muted-foreground">
            Find this in Canvas &rarr; Calendar &rarr; Calendar Feed
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDirty && (
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving && (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              )}
              Save
            </Button>
          )}

          {(hasUrl || canvasUrl.trim()) && (
            <Button
              onClick={handleCanvasSync}
              disabled={isSyncing || !canvasUrl.trim()}
              variant="outline"
              size="sm"
            >
              {isSyncing ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3 w-3" />
              )}
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          )}

          {hasUrl && (
            <Button
              onClick={handleDisconnectCanvas}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="mr-2 h-3 w-3" />
              Disconnect
            </Button>
          )}
        </div>

        {syncResult && (
          <p className="text-xs text-muted-foreground">
            Last synced: {syncResult.total} events &middot;{" "}
            {new Date(syncResult.syncedAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      <Separator />

      {/* ── iCal Export ──────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Your Calendar Feed</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Subscribe to your ControlledChaos calendar from any app — Apple
          Calendar, Google Calendar, Outlook, or anything that supports iCal.
        </p>

        {isLoadingExport ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating your link...
          </div>
        ) : subscribeUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={subscribeUrl}
                readOnly
                className="font-mono text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyUrl}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste this URL as a &ldquo;calendar subscription&rdquo; or &ldquo;Add calendar from URL&rdquo; in your calendar app.
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRegenerateToken}
              disabled={isRegenerating}
              className="text-muted-foreground text-xs h-7"
            >
              {isRegenerating ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3 w-3" />
              )}
              Regenerate link
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
