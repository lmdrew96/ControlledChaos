"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, ArrowRight, Bot } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EnergyLevel, EnergyProfile, PersonalityPrefs } from "@/types";
import { Logo } from "@/components/ui/logo";
import { LegalFooter } from "@/components/layout/legal-footer";
import { OnboardingLocationStep } from "@/components/features/onboarding/onboarding-location-step";
import { OnboardingNotificationStep } from "@/components/features/onboarding/onboarding-notification-step";

// ============================================================
// Constants
// ============================================================

const TOTAL_STEPS = 6;

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];

const TIME_BLOCKS: { key: keyof EnergyProfile; label: string; desc: string }[] = [
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

const PERSONALITY_AXES = [
  {
    key: "supportive" as const,
    label: "Coaching Style",
    levels: ["Strict", "Balanced", "Supportive"],
    icons: ["💼", "⚖️", "🤗"],
  },
  {
    key: "formality" as const,
    label: "Tone",
    levels: ["Professional", "Friendly", "BFF"],
    icons: ["👔", "😊", "💬"],
  },
  {
    key: "language" as const,
    label: "Language",
    levels: ["Clean", "Casual", "Unfiltered"],
    icons: ["✨", "😄", "🤬"],
  },
];

const STEP_TITLES = [
  "What should I call you?",
  "When do you have the most energy?",
  "How should I talk to you?",
  "Where are you usually?",
  "How do you want to be reminded?",
  "One more thing (optional)",
];

function buildPreview(prefs: PersonalityPrefs): string {
  const s = prefs.supportive;
  const f = prefs.formality;
  const l = prefs.language;
  if (s === 0) {
    if (f === 0) return "Your highest-priority task has a deadline in 4 hours. Begin immediately.";
    if (f === 1) return "That essay is due in 4 hours. You should start now.";
    return l === 2 ? "essay's due in 4h. get on it." : "essay's due in 4 hours. start now.";
  }
  if (s === 2) {
    if (f === 0) return "You've made great progress. The essay is your next opportunity — whenever you're ready.";
    if (f === 1) return "You're doing great! The essay is next — take it at your own pace 🙂";
    return l === 2 ? "omg you're crushing it!! essay next whenever u feel it 💪" : "you're doing awesome! essay's next, no rush 😊";
  }
  if (f === 0) return "Your essay is due in 4 hours. Based on current context, this is the recommended next task.";
  if (f === 1) {
    if (l === 2) return "Bio homework is due in 4 hours — knock it out now, you've got time.";
    return "Bio homework is due in 4 hours. You've got time to knock it out before class.";
  }
  if (l === 2) return "bio hw is due in 4h lol. you got it tho, just start the damn thing.";
  return "bio hw is due in 4 hours! you've totally got this, just start it.";
}

function detectTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIMEZONES.some((tz) => tz.value === detected)) return detected;
  } catch { /* ignore */ }
  return "America/New_York";
}

// ============================================================
// Component
// ============================================================

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();

  // Step state
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Name + Timezone
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");

  // Step 2: Energy
  const [energyProfile, setEnergyProfile] = useState<EnergyProfile>({
    morning: "medium",
    afternoon: "medium",
    evening: "medium",
    night: "medium",
  });

  // Step 3: Personality
  const [personalityPrefs, setPersonalityPrefs] = useState<PersonalityPrefs>({
    supportive: 1,
    formality: 1,
    language: 1,
  });

  // Step 4: Locations
  const [homeLocation, setHomeLocation] = useState<{ name: string; latitude: string; longitude: string } | null>(null);
  const [secondLocation, setSecondLocation] = useState<{ name: string; latitude: string; longitude: string } | null>(null);

  // Step 5: Notifications
  const [pushEnabled, setPushEnabled] = useState(false);
  const [morningDigest, setMorningDigest] = useState(true);
  const [eveningDigest, setEveningDigest] = useState(false);

  // Step 6: Canvas
  const [canvasIcalUrl, setCanvasIcalUrl] = useState("");

  // Auto-detect timezone + prefill name
  useEffect(() => {
    setTimezone(detectTimezone());
    if (user?.firstName) setDisplayName(user.firstName);
  }, [user]);

  // Navigation
  const canGoNext = step === 1 ? displayName.trim().length > 0 : true;

  const handleNext = () => {
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Submit
  const handleSubmit = async () => {
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
          personalityPrefs,
          canvasIcalUrl: canvasIcalUrl.trim() || null,
          notificationPrefs: {
            pushEnabled,
            emailMorningDigest: morningDigest,
            emailEveningDigest: eveningDigest,
          },
          locations: [
            homeLocation,
            secondLocation,
          ].filter(Boolean),
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
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 gap-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="space-y-2 text-center">
          <Logo className="mx-auto h-10 w-10" />
          <h1 className="text-2xl font-bold tracking-tight">
            {STEP_TITLES[step - 1]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Step {step} of {TOTAL_STEPS} — you can change everything later in Settings.
          </p>
        </div>

        {/* Progress bar */}
        <Progress value={(step / TOTAL_STEPS) * 100} className="h-2" />

        {/* Step content */}
        <Card>
          <CardContent className="space-y-6 pt-6">
            {/* Step 1: Name + Timezone */}
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="display-name">Your name</Label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    autoFocus
                  />
                </div>
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
              </>
            )}

            {/* Step 2: Energy Profile */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This helps me recommend the right tasks at the right time.
                </p>
                {TIME_BLOCKS.map((block) => (
                  <div
                    key={block.key}
                    className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{block.label}</p>
                      <p className="text-xs text-muted-foreground">{block.desc}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
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
            )}

            {/* Step 3: Personality Prefs */}
            {step === 3 && (
              <div className="space-y-5">
                {PERSONALITY_AXES.map((axis) => (
                  <div key={axis.key} className="space-y-2">
                    <Label>{axis.label}</Label>
                    <div className="flex gap-1">
                      {axis.levels.map((level, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() =>
                            setPersonalityPrefs((prev) => ({ ...prev, [axis.key]: i }))
                          }
                          className={cn(
                            "flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors text-center",
                            personalityPrefs[axis.key] === i
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-accent"
                          )}
                        >
                          {axis.icons[i]} {level}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Live preview */}
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                    <Bot className="h-3.5 w-3.5" />
                    <span>Preview</span>
                  </div>
                  <p className="text-sm italic">&ldquo;{buildPreview(personalityPrefs)}&rdquo;</p>
                </div>
              </div>
            )}

            {/* Step 4: Locations */}
            {step === 4 && (
              <OnboardingLocationStep
                homeLocation={homeLocation}
                onHomeChange={setHomeLocation}
                secondLocation={secondLocation}
                onSecondChange={setSecondLocation}
              />
            )}

            {/* Step 5: Notifications */}
            {step === 5 && (
              <OnboardingNotificationStep
                pushEnabled={pushEnabled}
                onPushChange={setPushEnabled}
                morningDigest={morningDigest}
                onMorningChange={setMorningDigest}
                eveningDigest={eveningDigest}
                onEveningChange={setEveningDigest}
              />
            )}

            {/* Step 6: Canvas iCal */}
            {step === 6 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  If you use Canvas, paste your calendar feed URL to sync your class schedule.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="canvas-ical">Canvas Calendar URL</Label>
                  <Input
                    id="canvas-ical"
                    value={canvasIcalUrl}
                    onChange={(e) => setCanvasIcalUrl(e.target.value)}
                    placeholder="https://udel.instructure.com/feeds/calendars/..."
                    type="url"
                  />
                  <p className="text-xs text-muted-foreground">
                    Find this in Canvas &rarr; Calendar &rarr; Calendar Feed.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              {step > 1 ? (
                <Button variant="ghost" size="sm" onClick={handleBack}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Back
                </Button>
              ) : (
                <div />
              )}

              <div className="flex gap-2">
                {/* Skip button for optional steps */}
                {(step === 4 || step === 5) && (
                  <Button variant="ghost" size="sm" onClick={handleNext}>
                    Skip
                  </Button>
                )}

                {step < TOTAL_STEPS ? (
                  <Button size="sm" onClick={handleNext} disabled={!canGoNext}>
                    Next
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Let&apos;s go!
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <LegalFooter />
    </div>
  );
}
