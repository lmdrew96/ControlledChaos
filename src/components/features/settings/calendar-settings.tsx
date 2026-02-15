"use client";

import { useState, useEffect } from "react";
import { Calendar, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CalendarSettings() {
  const [canvasUrl, setCanvasUrl] = useState("");
  const [original, setOriginal] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    total: number;
    syncedAt: string;
  } | null>(null);

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
        }
      } catch {
        // defaults
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

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

  async function handleSync() {
    // Save first if URL changed
    if (isDirty) {
      await handleSave();
    }

    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSyncResult({ total: data.total, syncedAt: data.syncedAt });
      toast.success(`Synced ${data.total} events from Canvas!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleDisconnect() {
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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <label htmlFor="canvas-url" className="text-sm font-medium">
            Canvas Calendar URL
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
            {isSaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Save
          </Button>
        )}

        {(hasUrl || canvasUrl.trim()) && (
          <Button
            onClick={handleSync}
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
            onClick={handleDisconnect}
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
  );
}
