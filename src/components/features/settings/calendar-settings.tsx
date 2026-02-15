"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Calendar,
  Loader2,
  RefreshCw,
  X,
  CheckCircle2,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export function CalendarSettings() {
  const { user } = useUser();

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

  // Google state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [googleSyncResult, setGoogleSyncResult] = useState<{
    total: number;
  } | null>(null);

  const isDirty = canvasUrl !== original;
  const hasUrl = original.trim().length > 0;

  const googleAccounts = useMemo(
    () =>
      user?.externalAccounts?.filter((ea) => ea.provider === "google") ?? [],
    [user?.externalAccounts]
  );

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
          setGoogleConnected(data.googleCalConnected ?? false);
        }
      } catch {
        // defaults
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Auto-connect after Google OAuth redirect
  useEffect(() => {
    if (googleAccounts.length > 0 && !googleConnected && !isLoading) {
      const url = new URL(window.location.href);
      if (url.searchParams.has("__clerk_status")) {
        handleConnectGoogle();
        url.searchParams.delete("__clerk_status");
        url.searchParams.delete("__clerk_created_session");
        window.history.replaceState({}, "", url.pathname);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAccounts.length, googleConnected, isLoading]);

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
      const googleTotal = data.google?.total ?? 0;

      setSyncResult({ total: canvasTotal, syncedAt: data.syncedAt });
      if (googleTotal > 0) {
        setGoogleSyncResult({ total: googleTotal });
      }

      const parts: string[] = [];
      if (canvasTotal > 0) parts.push(`${canvasTotal} Canvas`);
      if (googleTotal > 0) parts.push(`${googleTotal} Google`);
      toast.success(
        parts.length > 0
          ? `Synced ${parts.join(" + ")} events!`
          : "Sync complete!"
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

  // ── Google handlers ──────────────────────────────────────────
  async function handleAddGoogleAccount() {
    if (!user) return;

    try {
      const result = await user.createExternalAccount({
        strategy: "oauth_google",
        redirectUrl: window.location.href,
        additionalScopes: GOOGLE_CALENDAR_SCOPES,
      });

      const url = result.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
      }
    } catch (err) {
      console.error("[Settings] Google link error:", err);
      toast.error("Failed to start Google sign-in");
    }
  }

  async function handleConnectGoogle() {
    setIsConnecting(true);
    try {
      const res = await fetch("/api/calendar/google/connect", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setGoogleConnected(true);
      setGoogleSyncResult({ total: data.total ?? 0 });
      toast.success(
        `Google Calendar connected! Synced ${data.total ?? 0} events.`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to connect"
      );
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleDisconnectGoogle() {
    setIsDisconnecting(true);
    try {
      const res = await fetch("/api/calendar/google/disconnect", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      setGoogleConnected(false);
      setGoogleSyncResult(null);
      toast.success("Google Calendar disconnected.");
    } catch {
      toast.error("Failed to disconnect Google Calendar");
    } finally {
      setIsDisconnecting(false);
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
    <div className="space-y-6">
      {/* ── Canvas Calendar ───────────────────────────────── */}
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

      {/* ── Google Calendar ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM0 5.684h5.684V24H0V5.684zM5.684 0v5.684H24V0H5.684z" />
          </svg>
          <span className="text-sm font-medium">Google Calendar</span>
        </div>

        {googleConnected ? (
          <div className="space-y-3">
            {/* Show connected Google account */}
            {googleAccounts.length > 0 ? (
              <div className="space-y-2">
                {googleAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                    <span className="text-muted-foreground">
                      {account.emailAddress}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Google Calendar connected
              </div>
            )}

            {googleSyncResult && (
              <p className="text-xs text-muted-foreground">
                {googleSyncResult.total} events synced
              </p>
            )}

            <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/30 p-3">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                To see events from another Google account (e.g. school), open{" "}
                <a
                  href="https://calendar.google.com/calendar/r/settings/addcalendar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Google Calendar settings
                </a>{" "}
                and subscribe to it. Synced calendars show up here automatically.
              </p>
            </div>

            <Button
              onClick={handleDisconnectGoogle}
              disabled={isDisconnecting}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
            >
              {isDisconnecting ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <X className="mr-2 h-3 w-3" />
              )}
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect Google Calendar to see your events and let AI schedule
              tasks into free time blocks.
            </p>

            {googleAccounts.length > 0 ? (
              <Button
                onClick={handleConnectGoogle}
                disabled={isConnecting}
                size="sm"
              >
                {isConnecting ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-3 w-3" />
                )}
                Connect Google Calendar
              </Button>
            ) : (
              <Button onClick={handleAddGoogleAccount} size="sm">
                <ExternalLink className="mr-2 h-3 w-3" />
                Sign in with Google
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
