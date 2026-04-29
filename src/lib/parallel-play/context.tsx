"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMutation } from "convex/react";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";

const LAST_ROOM_KEY = "cc-pp-last-room";

interface ParallelPlayState {
  activeRoomId: string | null;
  isOverlayVisible: boolean;
  /** Set after Clerk + Convex are both ready and we know the user can issue mutations. */
  isReady: boolean;
  /** Tells the toggle whether to show 🔥 or ○. Distinct from isOverlayVisible. */
  isInRoom: boolean;
  /** Stable Clerk user id, or null if signed-out / loading. */
  currentUserId: string | null;
  enterRoom: (roomId: string) => Promise<void>;
  exitRoom: () => Promise<void>;
  toggleOverlay: () => void;
  setOverlayVisible: (v: boolean) => void;
}

const Ctx = createContext<ParallelPlayState | null>(null);

export function ParallelPlayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const enterRoomMut = useMutation(api.presence.enterRoom);
  const exitRoomMut = useMutation(api.presence.exitRoom);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isOverlayVisible, setOverlayVisible] = useState(false);

  // Auto-rejoin last room from localStorage on first signed-in mount.
  // Note: we don't call enterRoom mutation here — that fires only when the
  // toggle is tapped (or when a deep link auto-enters). The "last room" is
  // just where the picker pre-selects. Rationale: silently re-entering on
  // every page load would burn presence rows and confuse the room.
  useEffect(() => {
    if (!authLoaded || !isSignedIn) return;
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(LAST_ROOM_KEY);
    if (stored) setActiveRoomId(stored);
  }, [authLoaded, isSignedIn]);

  const enterRoom = useCallback(
    async (roomId: string) => {
      if (!user?.id) return;
      const displayName =
        user.fullName?.trim() ||
        user.firstName?.trim() ||
        user.username?.trim() ||
        user.primaryEmailAddress?.emailAddress.split("@")[0] ||
        "Someone";
      await enterRoomMut({ roomId, displayName, clerkUserId: user.id });
      setActiveRoomId(roomId);
      setOverlayVisible(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_ROOM_KEY, roomId);
      }
    },
    [user, enterRoomMut],
  );

  const exitRoom = useCallback(async () => {
    if (!user?.id) {
      setActiveRoomId(null);
      setOverlayVisible(false);
      return;
    }
    try {
      await exitRoomMut({ clerkUserId: user.id });
    } finally {
      setActiveRoomId(null);
      setOverlayVisible(false);
    }
  }, [user, exitRoomMut]);

  const toggleOverlay = useCallback(() => {
    setOverlayVisible((v) => !v);
  }, []);

  // Best-effort exit on tab close. Convex's idle cron will catch the rest.
  useEffect(() => {
    if (!activeRoomId || !user?.id) return;
    const handler = () => {
      // navigator.sendBeacon would be cleaner but Convex doesn't expose it.
      // We rely on the idle cron (>30 min stale → delete) for this case.
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [activeRoomId, user]);

  const value: ParallelPlayState = useMemo(
    () => ({
      activeRoomId,
      isOverlayVisible: isOverlayVisible && !!activeRoomId,
      isReady: authLoaded && !!isSignedIn,
      isInRoom: !!activeRoomId,
      currentUserId: user?.id ?? null,
      enterRoom,
      exitRoom,
      toggleOverlay,
      setOverlayVisible,
    }),
    [
      activeRoomId,
      isOverlayVisible,
      authLoaded,
      isSignedIn,
      user?.id,
      enterRoom,
      exitRoom,
      toggleOverlay,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useParallelPlay(): ParallelPlayState {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Outside the provider (e.g., signed-out routes) — return inert defaults
    // so callers don't need null checks. Mutations are no-ops.
    return {
      activeRoomId: null,
      isOverlayVisible: false,
      isReady: false,
      isInRoom: false,
      currentUserId: null,
      enterRoom: async () => {},
      exitRoom: async () => {},
      toggleOverlay: () => {},
      setOverlayVisible: () => {},
    };
  }
  return ctx;
}
