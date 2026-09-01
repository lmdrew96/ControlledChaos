"use client";

import { useEffect, useState } from "react";

/**
 * useAppVersion — stale-tab update notification.
 *
 * CANONICAL IMPLEMENTATION. Other ADHDesigns repos vendor a copy of this file;
 * changes propagate by copy-paste, not by npm. Keep the returned shape stable:
 * `{ updateReady, applyUpdate, dismiss }`.
 *
 * This is the Next.js variant of the pattern. The reference spec was written
 * for Vite (a build-time version.json emitted by a plugin, `import.meta.env`);
 * here the version is inlined via next.config.ts `env` and served back by
 * /api/version, which is rebuilt on every deploy.
 *
 * WHY NO SERVICE-WORKER PATH: ControlledChaos ships a hand-written
 * /public/sw.js that deliberately never calls skipWaiting() or clients.claim()
 * — on iOS standalone PWAs an in-session SW swap demotes the window to Safari.
 * The SW also only intercepts `navigate` requests, so JS chunks always come
 * from the network. A plain location.reload() therefore gets the new build,
 * and we must NOT try to activate a waiting worker to make it happen.
 *
 * NEVER auto-reload on a version change. This app holds in-progress brain
 * dumps, half-filled task forms and live crisis-plan state; a silent refresh
 * mid-task destroys unsaved work.
 */

const POLL_MS = 5 * 60_000;
const DISMISS_KEY = "cc-update-toast-dismissed";

function isDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Private mode / storage blocked — treat as not dismissed rather than
    // suppressing the notice entirely.
    return false;
  }
}

export function useAppVersion(): {
  updateReady: boolean;
  applyUpdate: () => void;
  dismiss: () => void;
} {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (updateReady) return;

    const current = process.env.NEXT_PUBLIC_APP_VERSION;
    if (!current || current === "dev") return;

    let cancelled = false;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      if (isDismissed()) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!cancelled && version && version !== current) setUpdateReady(true);
      } catch {
        // Offline or transient. Stay quiet — a failed version check is not
        // something to interrupt anyone about.
      }
    };

    const onVisibilityChange = () => void check();

    void check();
    const id = setInterval(onVisibilityChange, POLL_MS);
    // The highest-value listener: a tab backgrounded for two days catches the
    // update the moment it's refocused instead of waiting out the interval.
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [updateReady]);

  return {
    updateReady,
    applyUpdate: () => window.location.reload(),
    dismiss: () => {
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {
        // Non-fatal: the toast still hides for this mount.
      }
      setUpdateReady(false);
    },
  };
}

// ── ChunkLoadError recovery ─────────────────────────────────────────────────
// Separate from the toast. A missing chunk hash kills the page BEFORE any
// polite notice can land, so it gets its own one-shot reload.

const RELOAD_KEY = "cc-chunk-reload-attempted";

export function isChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ChunkLoadError|Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    msg
  );
}

/**
 * Reload once for a chunk error. Returns true if a reload was started.
 *
 * The sessionStorage guard is essential: without it a genuinely broken build
 * becomes an infinite reload loop.
 */
export function recoverFromChunkError(err: unknown): boolean {
  if (!isChunkError(err)) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    // Can't guard against a loop, so don't start one.
    return false;
  }
  window.location.reload();
  return true;
}

/** Clear the one-shot guard once the app has mounted successfully. */
export function clearChunkReloadGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // Nothing to clear.
  }
}
