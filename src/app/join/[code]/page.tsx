import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getRoomByInviteCode,
  isRoomMember,
  joinRoom,
} from "@/lib/db/queries";

interface PageProps {
  params: Promise<{ code: string }>;
}

/**
 * /join/[code] — auto-join an invite link.
 *
 * - Signed out → bounce to sign-in with this URL as the redirect target.
 * - Code invalid → /settings?tab=rooms&join_error=invalid
 * - Code expired → /settings?tab=rooms&join_error=expired
 * - Already a member → /tasks (silent, just enter the app)
 * - Newly added → /tasks?room_joined=<id> (the client can pick this up to
 *   surface a small toast and pre-select the room).
 *
 * Drizzle membership is added here. Convex presence is NOT entered — the
 * user explicitly taps the campfire toggle to enter, so they don't get
 * silently teleported into someone else's room view.
 */
export default async function JoinRoomPage({ params }: PageProps) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase();

  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/join/${normalized}`)}`);
  }

  const room = await getRoomByInviteCode(normalized);
  if (!room) {
    redirect("/settings?tab=rooms&join_error=invalid");
  }

  if (room.expiresAt && room.expiresAt.getTime() < Date.now()) {
    redirect("/settings?tab=rooms&join_error=expired");
  }

  const already = await isRoomMember(room.id, userId);
  if (already) {
    redirect(`/tasks?room_joined=${room.id}`);
  }

  try {
    await joinRoom(room.id, userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "join_failed";
    const reason = /capacity/i.test(msg) ? "capacity" : "failed";
    redirect(`/settings?tab=rooms&join_error=${reason}`);
  }

  redirect(`/tasks?room_joined=${room.id}`);
}
