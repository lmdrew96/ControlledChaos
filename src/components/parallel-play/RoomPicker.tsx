"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useParallelPlay } from "@/lib/parallel-play/context";
import { cn } from "@/lib/utils";

interface RoomListItem {
  id: string;
  name: string | null;
  type: string;
  inviteCode: string;
  memberCount: number;
  isOwner: boolean;
}

interface RoomPickerProps {
  open: boolean;
  onClose: () => void;
}

export function RoomPicker({ open, onClose }: RoomPickerProps) {
  const { enterRoom, currentUserId } = useParallelPlay();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/rooms")
      .then((r) => (r.ok ? r.json() : { rooms: [] }))
      .then((d) => setRooms(d.rooms ?? []))
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open || !currentUserId) return null;

  async function handleEnter(roomId: string) {
    try {
      setEntering(roomId);
      await enterRoom(roomId);
      onClose();
    } finally {
      setEntering(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl border border-border bg-card p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Flame className="h-5 w-5 text-amber-500" />
          <h2 className="font-semibold">Pick a room</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : rooms.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No rooms yet. Create one or join with an invite code.
          </p>
        ) : (
          <div className="space-y-1">
            {rooms.map((r) => {
              const label = r.name ?? (r.type === "personal" ? "Your room" : "Room");
              return (
                <button
                  key={r.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors",
                    "hover:bg-accent/50",
                  )}
                  onClick={() => handleEnter(r.id)}
                  disabled={entering !== null}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.memberCount} {r.memberCount === 1 ? "member" : "members"}
                      {r.isOwner ? " · you own this" : ""}
                    </span>
                  </span>
                  {entering === r.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <Separator className="my-3" />

        <div className="flex justify-between gap-2">
          <Button variant="outline" size="sm" asChild className="flex-1">
            <Link href="/settings?tab=rooms" onClick={onClose}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Manage rooms
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
