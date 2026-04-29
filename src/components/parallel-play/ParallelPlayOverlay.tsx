"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hand, Flame, X, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useParallelPlay } from "@/lib/parallel-play/context";
import { PresenceBubbles } from "./PresenceBubbles";
import { formatSessionDuration, type PresenceRow } from "./types";

const NUDGE_COOLDOWN_MS = 30_000;
const HEARTBEAT_VISIBLE_MS = 60_000;
const HEARTBEAT_HIDDEN_MS = 5 * 60_000;

/**
 * Top-of-page overlay shown when the user has entered a parallel-play room
 * AND the overlay is toggled visible. Presence stays alive even when the
 * overlay is hidden — see useParallelPlay state.
 *
 * Layout (fixed-position, non-blocking outside its hit areas):
 *   - top-left:  session timer + my-flare toggle
 *   - top-right: presence bubbles
 *   - bottom:    nudge button (mobile-friendly position)
 */
export function ParallelPlayOverlay() {
  const {
    activeRoomId,
    isOverlayVisible,
    isInRoom,
    currentUserId,
    exitRoom,
  } = useParallelPlay();

  const sendNudge = useMutation(api.presence.sendNudge);
  const setFlare = useMutation(api.presence.setFlare);
  const clearFlare = useMutation(api.presence.clearFlare);
  const heartbeat = useMutation(api.presence.heartbeat);

  // My own presence row, used to show flare state on the toggle.
  const myPresence = useQuery(
    api.presence.getMyPresence,
    currentUserId ? { clerkUserId: currentUserId } : "skip",
  ) as PresenceRow | null | undefined;

  const [now, setNow] = useState(() => Date.now());
  const [nudgeCooldownUntil, setNudgeCooldownUntil] = useState(0);
  const [nudging, setNudging] = useState(false);

  // Live ticker for the session timer + cooldown countdown.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Heartbeat loop — keeps lastActiveAt fresh so the idle cron doesn't
  // demote us. Slows down when the overlay is hidden, pauses entirely when
  // the tab is hidden (we'll naturally go idle, which is correct behavior).
  useEffect(() => {
    if (!isInRoom || !currentUserId) return;
    let cancelled = false;
    let timer: number | null = null;

    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        // Skip ping — we want to go idle when the user looks away.
      } else {
        heartbeat({ clerkUserId: currentUserId }).catch(() => {});
      }
      const interval = isOverlayVisible
        ? HEARTBEAT_VISIBLE_MS
        : HEARTBEAT_HIDDEN_MS;
      timer = window.setTimeout(tick, interval);
    };
    timer = window.setTimeout(tick, isOverlayVisible ? HEARTBEAT_VISIBLE_MS : HEARTBEAT_HIDDEN_MS);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isInRoom, isOverlayVisible, currentUserId, heartbeat]);

  if (!isInRoom || !activeRoomId || !currentUserId) return null;

  const sessionStart = myPresence?.sessionStartedAt ?? now;
  const cooldownRemaining = Math.max(0, nudgeCooldownUntil - now);
  const isFlaring = myPresence?.status === "flare";

  async function handleNudge() {
    if (cooldownRemaining > 0 || nudging) return;
    try {
      setNudging(true);
      await sendNudge({ roomId: activeRoomId!, fromUserId: currentUserId! });
      setNudgeCooldownUntil(Date.now() + NUDGE_COOLDOWN_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not nudge";
      toast.error(msg);
    } finally {
      setNudging(false);
    }
  }

  async function handleFlareToggle() {
    if (!currentUserId) return;
    try {
      if (isFlaring) await clearFlare({ clerkUserId: currentUserId });
      else await setFlare({ clerkUserId: currentUserId });
    } catch {
      // Silent — bubble state will reconcile from the next query tick.
    }
  }

  return (
    <AnimatePresence>
      {isOverlayVisible && (
        <motion.div
          key="pp-overlay"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between px-4 py-3 sm:px-6"
        >
          {/* Top-left: session timer + flare toggle + leave */}
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 text-xs shadow-sm backdrop-blur">
            <Flame className="h-3.5 w-3.5 text-amber-500" fill="currentColor" />
            <span className="font-medium tabular-nums">
              {formatSessionDuration(sessionStart, now)}
            </span>
            <button
              type="button"
              onClick={handleFlareToggle}
              className={
                isFlaring
                  ? "ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                  : "ml-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/50"
              }
              aria-label={isFlaring ? "Cancel flare" : "Send a flare"}
            >
              {isFlaring ? "Flaring" : "Flare"}
            </button>
            <button
              type="button"
              onClick={exitRoom}
              className="ml-0.5 rounded-full p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              aria-label="Leave room"
              title="Leave room"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Top-right: presence bubbles */}
          <div className="pointer-events-auto rounded-full border border-border bg-card/90 px-2 py-1 shadow-sm backdrop-blur">
            <PresenceBubbles roomId={activeRoomId} currentUserId={currentUserId} />
          </div>
        </motion.div>
      )}

      {/* Bottom-floating nudge — separate motion key so it animates independently */}
      {isOverlayVisible && (
        <motion.div
          key="pp-nudge"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 sm:bottom-8"
        >
          <Button
            type="button"
            onClick={handleNudge}
            disabled={cooldownRemaining > 0 || nudging}
            variant="secondary"
            className="pointer-events-auto rounded-full shadow-lg"
          >
            {nudging ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Hand className="mr-1.5 h-4 w-4" />
            )}
            {cooldownRemaining > 0
              ? `Nudge (${Math.ceil(cooldownRemaining / 1000)}s)`
              : "Nudge"}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
