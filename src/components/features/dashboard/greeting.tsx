"use client";

import { useEffect, useState } from "react";
import { getHourInTimezone } from "@/lib/timezone";
import { useTimezone } from "@/hooks/use-timezone";

function getGreeting(hour: number): { text: string; emoji: string } {
  if (hour < 5) return { text: "Still up?", emoji: "moon" };
  if (hour < 12) return { text: "Good morning", emoji: "sunrise" };
  if (hour < 17) return { text: "Good afternoon", emoji: "sun" };
  if (hour < 21) return { text: "Good evening", emoji: "sunset" };
  return { text: "Winding down?", emoji: "moon" };
}

export function Greeting() {
  const timezone = useTimezone();
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    setHour(getHourInTimezone(new Date(), timezone));
  }, [timezone]);

  if (hour === null) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Your brain has the ideas. I&apos;ll handle the rest.
        </p>
      </div>
    );
  }

  const { text } = getGreeting(hour);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        <span className="greeting-gradient">{text}</span>
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Your brain has the ideas. I&apos;ll handle the rest.
      </p>
    </div>
  );
}
