"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Heart, Sparkles, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatSessionDuration,
  getInitials,
  presenceStatusText,
  type PresenceRow,
} from "./types";

interface PresenceBubbleProps {
  presence: PresenceRow;
  isMe: boolean;
  currentUserId: string | null;
  /** Increments when a "completion" event for this user arrives, triggering a sparkle. */
  sparkleKey: number;
  /** Increments when a room-wide "nudge" event arrives, triggering a bounce. */
  bounceKey: number;
}

const ENERGY_RING: Record<string, string> = {
  low: "ring-sky-400/70",
  medium: "ring-foreground/40",
  high: "ring-amber-400/80",
};

export function PresenceBubble({
  presence,
  isMe,
  currentUserId,
  sparkleKey,
  bounceKey,
}: PresenceBubbleProps) {
  const sendEncourage = useMutation(api.presence.sendEncourage);
  const [encouraging, setEncouraging] = useState(false);
  const [encouraged, setEncouraged] = useState(false);

  const isFlare = presence.status === "flare";

  // Reset the "already encouraged" gate whenever the target stops flaring,
  // so a re-flare gets a fresh acknowledgement window. Spec: "one encourage
  // per sender per flare session".
  useEffect(() => {
    if (!isFlare && encouraged) setEncouraged(false);
  }, [isFlare, encouraged]);

  // Live duration ticker
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const isIdle = presence.status === "idle";
  const energyRing =
    (presence.displayEnergy && ENERGY_RING[presence.displayEnergy]) ??
    "ring-foreground/20";

  async function handleEncourage() {
    if (!currentUserId || encouraging || encouraged) return;
    try {
      setEncouraging(true);
      await sendEncourage({
        roomId: presence.roomId,
        fromUserId: currentUserId,
        toUserId: presence.clerkUserId,
      });
      setEncouraged(true);
    } catch {
      // No-op: server-side validation handles bad calls. Surface via toast later if needed.
    } finally {
      setEncouraging(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          aria-label={`${presence.displayName} — ${presence.status}`}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium ring-2 transition-opacity",
            "bg-card text-foreground",
            energyRing,
            isIdle && "opacity-50",
            isMe && "ring-offset-2 ring-offset-background",
          )}
          // Bounce on room-wide nudge.
          animate={
            isFlare
              ? { scale: [1, 1.06, 1] }
              : bounceKey > 0
                ? { y: [0, -6, 0] }
                : { y: 0, scale: 1 }
          }
          transition={
            isFlare
              ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.4, ease: "easeOut" }
          }
          key={`bubble-${presence._id}-${bounceKey}`}
          style={
            isFlare
              ? {
                  background:
                    "linear-gradient(135deg, rgb(251 191 36 / 0.25), rgb(244 114 182 / 0.2))",
                }
              : undefined
          }
        >
          {getInitials(presence.displayName)}

          {/* Per-user completion sparkle */}
          <AnimatePresence>
            {sparkleKey > 0 && (
              <motion.span
                key={`sparkle-${sparkleKey}`}
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-amber-400"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 0], scale: [0.4, 1.4, 1.8] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9 }}
              >
                <Sparkles className="h-5 w-5" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </PopoverTrigger>

      <PopoverContent className="w-64" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium leading-tight">{presence.displayName}</p>
            {presence.displayEnergy && (
              <Flame
                className={cn(
                  "h-4 w-4",
                  presence.displayEnergy === "high" && "text-amber-500",
                  presence.displayEnergy === "medium" && "text-foreground/60",
                  presence.displayEnergy === "low" && "text-sky-500/70",
                )}
              />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {presenceStatusText(presence)}
          </p>
          <p className="text-xs text-muted-foreground">
            Here for {formatSessionDuration(presence.sessionStartedAt, now)}
            {isIdle && " · idle"}
          </p>

          {isFlare && !isMe && (
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={handleEncourage}
              disabled={encouraging || encouraged}
            >
              <Heart className="mr-1.5 h-4 w-4" />
              {encouraged ? "Sent" : "Encourage"}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
