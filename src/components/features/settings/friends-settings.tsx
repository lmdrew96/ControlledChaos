"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  GraduationCap,
  Briefcase,
  Heart,
  ShoppingBag,
  Activity,
  Loader2,
  Check,
  X,
  Trash2,
  VolumeX,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { FriendWithProfile, PendingRequest, TaskCategory, NotificationPrefs } from "@/types";
import { CATEGORY_LABELS, MAX_NUDGES_PER_FRIEND_PER_DAY } from "@/lib/nudges/messages";

const CATEGORY_ICONS: Record<TaskCategory, typeof GraduationCap> = {
  school: GraduationCap,
  work: Briefcase,
  personal: Heart,
  errands: ShoppingBag,
  health: Activity,
};

const CATEGORIES: TaskCategory[] = ["school", "work", "personal", "errands", "health"];

export function FriendsSettings() {
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [nudgingState, setNudgingState] = useState<Record<string, string | null>>({});
  const [nudgesRemaining, setNudgesRemaining] = useState<Record<string, number>>({});

  // Notification prefs for friend nudge toggle + mute
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);

  const fetchFriends = useCallback(async () => {
    try {
      const res = await fetch("/api/friends");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFriends(data.friends ?? []);
      setPendingRequests(data.pendingRequests ?? []);
    } catch {
      toast.error("Failed to load friends");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchNotifPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const prefs = data?.notificationPrefs ?? {};
      setNotifPrefs({
        pushEnabled: false,
        locationNotificationsEnabled: false,
        emailMorningDigest: false,
        emailEveningDigest: false,
        morningDigestTime: "07:30",
        eveningDigestTime: "21:00",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        assertivenessMode: "balanced",
        friendNudgesEnabled: true,
        mutedFriendIds: [],
        ...prefs,
      });
    } catch {
      // Settings will fall back to defaults
    }
  }, []);

  useEffect(() => {
    fetchFriends();
    fetchNotifPrefs();
  }, [fetchFriends, fetchNotifPrefs]);

  const handleSendRequest = async () => {
    if (!email.trim()) return;
    setIsSending(true);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send friend request");
        return;
      }
      toast.success("Friend request sent!");
      setEmail("");
      fetchFriends();
    } catch {
      toast.error("Failed to send friend request");
    } finally {
      setIsSending(false);
    }
  };

  const handleRespond = async (friendshipId: string, status: "accepted" | "declined") => {
    setRespondingId(friendshipId);
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error("Failed to respond to request");
        return;
      }
      toast.success(status === "accepted" ? "Friend request accepted!" : "Request declined");
      fetchFriends();
    } catch {
      toast.error("Failed to respond to request");
    } finally {
      setRespondingId(null);
    }
  };

  const handleRemove = async (friendshipId: string) => {
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to remove friend");
        return;
      }
      toast.success("Friend removed");
      fetchFriends();
    } catch {
      toast.error("Failed to remove friend");
    }
  };

  const handleNudge = async (friendId: string, category: TaskCategory) => {
    const key = `${friendId}-${category}`;
    setNudgingState((prev) => ({ ...prev, [key]: "sending" }));
    try {
      const res = await fetch("/api/friends/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: friendId, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send nudge");
        setNudgingState((prev) => ({ ...prev, [key]: null }));
        return;
      }
      toast.success(`${CATEGORY_LABELS[category]} nudge sent!`);
      setNudgingState((prev) => ({ ...prev, [key]: "sent" }));
      setNudgesRemaining((prev) => ({ ...prev, [friendId]: data.nudgesRemaining }));
      // Reset the sent state after 2s
      setTimeout(() => {
        setNudgingState((prev) => ({ ...prev, [key]: null }));
      }, 2000);
    } catch {
      toast.error("Failed to send nudge");
      setNudgingState((prev) => ({ ...prev, [key]: null }));
    }
  };

  const handleToggleNudges = async (enabled: boolean) => {
    const newPrefs = { ...notifPrefs!, friendNudgesEnabled: enabled };
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPrefs: newPrefs }),
      });
      if (!res.ok) throw new Error();
      setNotifPrefs(newPrefs);
      toast.success(enabled ? "Friend nudges enabled" : "Friend nudges disabled");
    } catch {
      toast.error("Failed to update preference");
    }
  };

  const handleToggleMute = async (friendId: string) => {
    if (!notifPrefs) return;
    const muted = notifPrefs.mutedFriendIds ?? [];
    const isMuted = muted.includes(friendId);
    const newMuted = isMuted ? muted.filter((id) => id !== friendId) : [...muted, friendId];
    const newPrefs = { ...notifPrefs, mutedFriendIds: newMuted };
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPrefs: newPrefs }),
      });
      if (!res.ok) throw new Error();
      setNotifPrefs(newPrefs);
      toast.success(isMuted ? "Unmuted friend" : "Muted friend");
    } catch {
      toast.error("Failed to update mute setting");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading friends...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global Toggle */}
      {notifPrefs && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Friend Nudges</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Allow friend nudges</p>
                <p className="text-xs text-muted-foreground">
                  Let friends send you motivational nudges via push notification
                </p>
              </div>
              <Switch
                checked={notifPrefs.friendNudgesEnabled}
                onCheckedChange={handleToggleNudges}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Friend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Friend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter their email..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendRequest();
              }}
              disabled={isSending}
            />
            <Button onClick={handleSendRequest} disabled={isSending || !email.trim()} size="sm">
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            They must have a ControlledChaos account to connect.
          </p>
        </CardContent>
      </Card>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.friendshipId}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {req.displayName || req.email}
                  </p>
                  {req.displayName && (
                    <p className="text-xs text-muted-foreground">{req.email}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRespond(req.friendshipId, "accepted")}
                    disabled={respondingId === req.friendshipId}
                  >
                    {respondingId === req.friendshipId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRespond(req.friendshipId, "declined")}
                    disabled={respondingId === req.friendshipId}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Friends List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Friends
            {friends.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({friends.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {friends.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>No friends yet. Add someone above!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {friends.map((friend) => {
                const isMuted = notifPrefs?.mutedFriendIds?.includes(friend.friendId);
                const remaining = nudgesRemaining[friend.friendId] ?? MAX_NUDGES_PER_FRIEND_PER_DAY;

                return (
                  <div
                    key={friend.friendshipId}
                    className="rounded-lg border p-4 space-y-3"
                  >
                    {/* Name + actions row */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {friend.displayName || friend.email}
                        </p>
                        {friend.displayName && (
                          <p className="text-xs text-muted-foreground">{friend.email}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleMute(friend.friendId)}
                          title={isMuted ? "Unmute" : "Mute nudges from this friend"}
                        >
                          {isMuted ? (
                            <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove friend?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove {friend.displayName || friend.email} from your friends list.
                                You can always send a new request later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRemove(friend.friendshipId)}>
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {/* Nudge category buttons */}
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground mr-1">Nudge:</p>
                      {CATEGORIES.map((cat) => {
                        const Icon = CATEGORY_ICONS[cat];
                        const key = `${friend.friendId}-${cat}`;
                        const state = nudgingState[key];
                        return (
                          <Button
                            key={cat}
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            title={`Send ${CATEGORY_LABELS[cat]} nudge`}
                            disabled={state === "sending" || remaining <= 0}
                            onClick={() => handleNudge(friend.friendId, cat)}
                          >
                            {state === "sending" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : state === "sent" ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Icon className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        );
                      })}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {remaining}/{MAX_NUDGES_PER_FRIEND_PER_DAY} left
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
