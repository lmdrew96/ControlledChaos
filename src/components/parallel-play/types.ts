// Display-side types for the parallel-play UI.
// Source-of-truth shapes live in convex/schema.ts (presence, roomEvents).

export type PresenceStatus = "active" | "idle" | "flare";

export interface PresenceRow {
  _id: string;
  clerkUserId: string;
  roomId: string;
  displayName: string;
  status: PresenceStatus;
  displayCategory?: string;
  displayTitle?: string;
  displayEnergy?: string;
  sessionStartedAt: number;
  lastActiveAt: number;
}

export type RoomEventType = "nudge" | "encourage" | "completion";

export interface RoomEvent {
  _id: string;
  roomId: string;
  type: RoomEventType;
  fromUserId: string;
  toUserId?: string;
  createdAt: number;
}

/**
 * Renders the human-readable status sentence shown when a presence bubble is
 * expanded. Falls back to "is working!" for "none" visibility.
 */
export function presenceStatusText(p: PresenceRow): string {
  if (p.displayTitle) return `${p.displayName} is working on ${p.displayTitle}!`;
  if (p.displayCategory)
    return `${p.displayName} is working on ${p.displayCategory} stuff!`;
  return `${p.displayName} is working!`;
}

export function formatSessionDuration(startedAt: number, now = Date.now()): string {
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
