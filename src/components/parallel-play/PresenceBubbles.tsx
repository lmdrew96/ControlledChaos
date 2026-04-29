"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { PresenceBubble } from "./PresenceBubble";
import type { PresenceRow, RoomEvent } from "./types";

interface PresenceBubblesProps {
  roomId: string;
  /** Clerk user id of the viewer. Used to mark "me" and to detect encourages directed at me. */
  currentUserId: string | null;
}

/**
 * Subscribes to room presence + recent events and renders a horizontal row of
 * bubbles with reactive animations. Mounting time is captured once so we
 * don't re-animate events that existed before this client joined.
 */
export function PresenceBubbles({ roomId, currentUserId }: PresenceBubblesProps) {
  const mountedAtRef = useRef(Date.now());

  const presence = useQuery(api.presence.getRoomPresence, { roomId }) as
    | PresenceRow[]
    | undefined;

  const events = useQuery(api.presence.getRecentEvents, {
    roomId,
    since: mountedAtRef.current,
  }) as RoomEvent[] | undefined;

  // ---- Animation triggers from events ----
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const [bounceKey, setBounceKey] = useState(0);
  // sparkleKey per clerkUserId — increment when a "completion" event lands for them.
  const [sparkleKeys, setSparkleKeys] = useState<Record<string, number>>({});
  const [warmGlow, setWarmGlow] = useState(0);

  useEffect(() => {
    if (!events) return;
    let bounce = false;
    let glow = false;
    const newSparkles: Record<string, number> = {};

    for (const e of events) {
      if (seenEventIdsRef.current.has(e._id)) continue;
      seenEventIdsRef.current.add(e._id);

      if (e.type === "nudge") bounce = true;
      else if (e.type === "completion") {
        newSparkles[e.fromUserId] = (newSparkles[e.fromUserId] ?? 0) + 1;
      } else if (
        e.type === "encourage" &&
        currentUserId &&
        e.toUserId === currentUserId
      ) {
        glow = true;
      }
    }

    if (bounce) setBounceKey((k) => k + 1);
    if (glow) setWarmGlow((g) => g + 1);
    if (Object.keys(newSparkles).length > 0) {
      setSparkleKeys((prev) => {
        const next = { ...prev };
        for (const [uid, count] of Object.entries(newSparkles)) {
          next[uid] = (prev[uid] ?? 0) + count;
        }
        return next;
      });
    }
  }, [events, currentUserId]);

  // Sort: me first, then active, then idle, then flare last (flares draw the eye anyway).
  const sortedPresence = useMemo(() => {
    if (!presence) return [];
    const order = (p: PresenceRow) => {
      if (p.clerkUserId === currentUserId) return 0;
      if (p.status === "active") return 1;
      if (p.status === "flare") return 2;
      return 3; // idle
    };
    return [...presence].sort(
      (a, b) => order(a) - order(b) || a.sessionStartedAt - b.sessionStartedAt,
    );
  }, [presence, currentUserId]);

  if (!presence) {
    return <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />;
  }

  if (sortedPresence.length === 0) return null;

  return (
    <div className="relative flex items-center gap-1.5">
      {sortedPresence.map((p) => (
        <PresenceBubble
          key={p._id}
          presence={p}
          isMe={p.clerkUserId === currentUserId}
          currentUserId={currentUserId}
          sparkleKey={sparkleKeys[p.clerkUserId] ?? 0}
          bounceKey={bounceKey}
        />
      ))}

      {/* Warm glow on encourage received (toUserId === me) */}
      <AnimatePresence>
        {warmGlow > 0 && (
          <motion.div
            key={`glow-${warmGlow}`}
            className="pointer-events-none absolute -inset-3 rounded-2xl"
            style={{
              boxShadow: "0 0 32px 8px rgb(251 191 36 / 0.5)",
              background: "rgb(251 191 36 / 0.08)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
