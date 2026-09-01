"use client";

import { getHourInTimezone } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { Squiggle } from "@/components/ui/squiggle";

function getGreeting(hour: number): { text: string; emoji: string } {
  if (hour < 5) return { text: "Still up?", emoji: "moon" };
  if (hour < 12) return { text: "Good morning", emoji: "sunrise" };
  if (hour < 17) return { text: "Good afternoon", emoji: "sun" };
  if (hour < 21) return { text: "Good evening", emoji: "sunset" };
  return { text: "Winding down?", emoji: "moon" };
}

export function Greeting() {
  const timezone = useTimezone();
  // The greeting depends on the viewer's local clock, so it can only be
  // resolved after hydration — the server has no idea what time it is for them.
  const mounted = useIsMounted();
  const hour = mounted ? getHourInTimezone(new Date(), timezone) : null;

  if (hour === null) {
    return (
      <div>
        <h1 className="relative inline-block text-2xl font-bold tracking-tight sm:text-3xl">
          Dashboard
          <Squiggle className="absolute -bottom-1 left-0 h-2.5 w-full" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your brain has the ideas. I&apos;ll handle the rest.
        </p>
      </div>
    );
  }

  const { text } = getGreeting(hour);

  return (
    <div>
      <h1 className="relative inline-block text-2xl font-bold tracking-tight sm:text-3xl">
        <span className="greeting-gradient">{text}</span>
        <Squiggle className="absolute -bottom-1 left-0 h-2.5 w-full" />
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your brain has the ideas. I&apos;ll handle the rest.
      </p>
    </div>
  );
}
