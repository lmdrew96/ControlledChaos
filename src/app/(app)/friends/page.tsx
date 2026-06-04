import { FriendsPanel } from "@/components/features/friends/friends-panel";
import { RoomManager } from "@/components/parallel-play/RoomManager";

export default function FriendsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Friends</h1>
        <p className="text-muted-foreground">
          Connect with friends, send nudges, and work alongside them in parallel play rooms.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Friends
        </h2>
        <FriendsPanel />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Parallel Play
        </h2>
        <RoomManager />
      </section>
    </div>
  );
}
