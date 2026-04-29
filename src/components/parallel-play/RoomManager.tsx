"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Copy, Check, LogIn, LogOut, Plus, Flame } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useParallelPlay } from "@/lib/parallel-play/context";

interface RoomListItem {
  id: string;
  name: string | null;
  type: "personal" | "adhoc";
  inviteCode: string;
  maxCapacity: number | null;
  memberCount: number;
  isOwner: boolean;
  expiresAt: string | null;
}

function inviteUrl(code: string) {
  if (typeof window === "undefined") return `/join/${code}`;
  return `${window.location.origin}/join/${code}`;
}

export function RoomManager() {
  const { enterRoom, isReady } = useParallelPlay();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const [adhocName, setAdhocName] = useState("");
  const [adhocExpiry, setAdhocExpiry] = useState<"never" | "1d" | "1w">("never");
  const [joinCodeInput, setJoinCodeInput] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rooms");
      const data = await res.json();
      setRooms(data.rooms ?? []);
    } catch {
      // Silent — empty state will show.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) void refresh();
  }, [isReady, refresh]);

  const personal = rooms.find((r) => r.type === "personal" && r.isOwner) ?? null;
  const joined = rooms.filter((r) => r !== personal);

  async function handleCreate() {
    if (!adhocName.trim()) return;
    setCreating(true);
    try {
      const expiresAt = (() => {
        if (adhocExpiry === "1d")
          return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        if (adhocExpiry === "1w")
          return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        return null;
      })();
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "adhoc",
          name: adhocName.trim(),
          expiresAt,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Could not create room");
      }
      toast.success(`Room '${adhocName.trim()}' created`);
      setAdhocName("");
      setAdhocExpiry("never");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create room");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join");
      toast.success(
        data.alreadyMember
          ? `You're already in '${data.room.name ?? "that room"}'`
          : `Joined '${data.room.name ?? "the room"}'`,
      );
      setJoinCodeInput("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join");
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave(roomId: string) {
    try {
      const res = await fetch(`/api/rooms/${roomId}/leave`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Could not leave");
      }
      toast.success("Left the room");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not leave");
    }
  }

  return (
    <div className="space-y-6">
      <PersonalRoomCard
        room={personal}
        onRefresh={refresh}
        onEnter={enterRoom}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Joined rooms</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : joined.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other rooms yet. Create an ad-hoc room or join with a code.
            </p>
          ) : (
            <ul className="space-y-2">
              {joined.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {r.name ?? "Room"}
                      {r.isOwner ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (yours)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.memberCount}{" "}
                      {r.memberCount === 1 ? "member" : "members"}
                      {r.expiresAt
                        ? ` · expires ${new Date(r.expiresAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => enterRoom(r.id)}
                    >
                      <LogIn className="mr-1.5 h-3.5 w-3.5" /> Enter
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleLeave(r.id)}
                      aria-label={`Leave ${r.name ?? "room"}`}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create an ad-hoc room</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="adhoc-name">Name</Label>
            <Input
              id="adhoc-name"
              value={adhocName}
              onChange={(e) => setAdhocName(e.target.value)}
              placeholder="e.g. Study Group"
            />
          </div>
          <div className="space-y-2">
            <Label>Expiry</Label>
            <Select
              value={adhocExpiry}
              onValueChange={(v) => setAdhocExpiry(v as typeof adhocExpiry)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">No expiry</SelectItem>
                <SelectItem value="1d">1 day</SelectItem>
                <SelectItem value="1w">1 week</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating || !adhocName.trim()}
          >
            {creating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Create room
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Join with a code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
            placeholder="Invite code"
            className="font-mono uppercase tracking-wider"
            maxLength={12}
          />
          <Button
            onClick={handleJoin}
            disabled={joining || !joinCodeInput.trim()}
          >
            {joining ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogIn className="mr-1.5 h-3.5 w-3.5" />
            )}
            Join room
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PersonalRoomCard({
  room,
  onEnter,
}: {
  room: RoomListItem | null;
  onRefresh: () => void;
  onEnter: (roomId: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);

  if (!room) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your room</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your personal room will be created the first time you open
            Parallel Play.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function copyLink() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(room.inviteCode));
      setCopied(true);
      toast.success("Invite link copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.inviteCode);
      toast.success("Invite code copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Flame className="h-4 w-4 text-amber-500" /> Your room
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Invite code
          </Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm tracking-wider">
              {room.inviteCode}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={copyCode}
              aria-label="Copy invite code"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Invite link
          </Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
              {inviteUrl(room.inviteCode)}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={copyLink}
              aria-label="Copy invite link"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Anyone signed in to ControlledChaos who opens this link is
            auto-added to your room.
          </p>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
          </p>
          <Button size="sm" onClick={() => onEnter(room.id)}>
            <LogIn className="mr-1.5 h-3.5 w-3.5" /> Enter room
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
