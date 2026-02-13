"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EnergyLevel, EnergyProfile } from "@/types";
import { Logo } from "@/components/ui/logo";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];

const TIME_BLOCKS: {
  key: keyof EnergyProfile;
  label: string;
  desc: string;
}[] = [
  { key: "morning", label: "Morning", desc: "6am – 12pm" },
  { key: "afternoon", label: "Afternoon", desc: "12pm – 5pm" },
  { key: "evening", label: "Evening", desc: "5pm – 9pm" },
  { key: "night", label: "Night", desc: "9pm – 12am" },
];

const ENERGY_LEVELS: { value: EnergyLevel; label: string; emoji: string }[] = [
  { value: "low", label: "Low", emoji: "🔋" },
  { value: "medium", label: "Medium", emoji: "⚡" },
  { value: "high", label: "High", emoji: "🔥" },
];

function detectTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIMEZONES.some((tz) => tz.value === detected)) {
      return detected;
    }
  } catch {
    // ignore
  }
  return "America/New_York";
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();

  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [energyProfile, setEnergyProfile] = useState<EnergyProfile>({
    morning: "medium",
    afternoon: "medium",
    evening: "medium",
    night: "medium",
  });
  const [canvasIcalUrl, setCanvasIcalUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-detect timezone and pre-fill name from Clerk
  useEffect(() => {
    setTimezone(detectTimezone());
    if (user?.firstName) {
      setDisplayName(user.firstName);
    }
  }, [user]);

  async function handleSubmit() {
    if (!displayName.trim()) {
      toast.error("Please enter your name");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          timezone,
          energyProfile,
          canvasIcalUrl: canvasIcalUrl.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      toast.success("You're all set!");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <Logo className="mx-auto h-10 w-10" />
          <h1 className="text-2xl font-bold tracking-tight">
            Let&apos;s get you set up
          </h1>
          <p className="text-sm text-muted-foreground">
            This takes about 2 minutes. You can change everything later in
            Settings.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-6 pt-6">
            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display-name">What should I call you?</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label>Your timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Energy Profile */}
            <div className="space-y-3">
              <div>
                <Label>When do you have the most energy?</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  This helps me recommend the right tasks at the right time.
                </p>
              </div>

              <div className="space-y-3">
                {TIME_BLOCKS.map((block) => (
                  <div
                    key={block.key}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{block.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {block.desc}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {ENERGY_LEVELS.map((level) => (
                        <button
                          key={level.value}
                          type="button"
                          onClick={() =>
                            setEnergyProfile((prev) => ({
                              ...prev,
                              [block.key]: level.value,
                            }))
                          }
                          className={cn(
                            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            energyProfile[block.key] === level.value
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-accent"
                          )}
                        >
                          {level.emoji} {level.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Canvas iCal URL */}
            <div className="space-y-2">
              <Label htmlFor="canvas-ical">
                Canvas Calendar URL{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="canvas-ical"
                value={canvasIcalUrl}
                onChange={(e) => setCanvasIcalUrl(e.target.value)}
                placeholder="https://udel.instructure.com/feeds/calendars/..."
                type="url"
              />
              <p className="text-xs text-muted-foreground">
                Find this in Canvas → Calendar → Calendar Feed. We&apos;ll
                sync your class schedule automatically.
              </p>
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={isSubmitting || !displayName.trim()}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Let&apos;s go
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              You can change all of these in Settings anytime.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
