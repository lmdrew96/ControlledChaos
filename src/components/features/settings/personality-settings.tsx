"use client";

import { useState, useEffect } from "react";
import { Loader2, Bot } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PersonalityPrefs } from "@/types";

// -------------------------------------------------------
// Axis definitions
// -------------------------------------------------------

interface AxisDef {
  key: keyof PersonalityPrefs;
  label: string;
  description: string;
  levels: [string, string, string]; // labels for 0, 1, 2
  icons: [string, string, string];
}

const AXES: AxisDef[] = [
  {
    key: "supportive",
    label: "Coaching Style",
    description: "How Haiku encourages you",
    levels: ["Strict", "Balanced", "Supportive"],
    icons: ["💼", "⚖️", "🤗"],
  },
  {
    key: "formality",
    label: "Tone",
    description: "How Haiku talks to you",
    levels: ["Professional", "Friendly", "BFF"],
    icons: ["👔", "😊", "💬"],
  },
  {
    key: "language",
    label: "Language",
    description: "How unfiltered Haiku gets",
    levels: ["Clean", "Casual", "Unfiltered"],
    icons: ["✨", "😄", "🤬"],
  },
];

// -------------------------------------------------------
// Live preview samples — indexed by [supportive][formality][language]
// Just a representatitve set; we pick the closest match.
// -------------------------------------------------------

function buildPreview(prefs: PersonalityPrefs): string {
  const s = prefs.supportive;
  const f = prefs.formality;
  const l = prefs.language;

  // Coaching style drives the core message
  // Formality drives sentence structure
  // Language adds flavor

  if (s === 0) {
    // Strict
    if (f === 0) return "Your highest-priority task has a deadline in 4 hours. Begin immediately.";
    if (f === 1) return "That essay is due in 4 hours. You should start now.";
    return l === 2
      ? "essay's due in 4h. get on it."
      : "essay's due in 4 hours. start now.";
  }

  if (s === 2) {
    // Supportive
    if (f === 0)
      return "You've made great progress. The essay is your next opportunity — whenever you're ready.";
    if (f === 1)
      return "You're doing great! The essay is next — take it at your own pace 🙂";
    return l === 2
      ? "omg you're crushing it!! essay next whenever u feel it 💪"
      : "you're doing awesome! essay's next, no rush 😊";
  }

  // Balanced (s === 1) — the default
  if (f === 0)
    return "Your essay is due in 4 hours. Based on current context, this is the recommended next task.";
  if (f === 1) {
    if (l === 2)
      return "Bio homework is due in 4 hours — knock it out now, you've got time.";
    return "Bio homework is due in 4 hours. You've got time to knock it out before class.";
  }
  // BFF
  if (l === 2)
    return "bio hw is due in 4h lol. you got it tho, just start the damn thing.";
  return "bio hw is due in 4 hours! you've totally got this, just start it.";
}

// -------------------------------------------------------
// Default prefs
// -------------------------------------------------------

const DEFAULT_PREFS: PersonalityPrefs = {
  supportive: 1,
  formality: 1,
  language: 1,
};

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function PersonalitySettings() {
  const [prefs, setPrefs] = useState<PersonalityPrefs>(DEFAULT_PREFS);
  const [original, setOriginal] = useState<PersonalityPrefs>(DEFAULT_PREFS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = JSON.stringify(prefs) !== JSON.stringify(original);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.personalityPrefs) {
            setPrefs(data.personalityPrefs);
            setOriginal(data.personalityPrefs);
          }
        }
      } catch {
        // Use defaults
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalityPrefs: prefs }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setOriginal(prefs);
      toast.success("Haiku personality updated!");
    } catch {
      toast.error("Failed to save personality settings");
    } finally {
      setIsSaving(false);
    }
  }

  function setAxis(key: keyof PersonalityPrefs, value: 0 | 1 | 2) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const preview = buildPreview(prefs);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Tune how Haiku talks to you. Changes apply to task recommendations, daily digests, and nudges.
      </p>

      {/* Axis controls */}
      <div className="space-y-4">
        {AXES.map((axis) => (
          <div key={axis.key} className="space-y-2">
            <div>
              <p className="text-sm font-medium">{axis.label}</p>
              <p className="text-xs text-muted-foreground">{axis.description}</p>
            </div>
            <div className="flex gap-1.5">
              {axis.levels.map((label, idx) => {
                const val = idx as 0 | 1 | 2;
                const active = prefs[axis.key] === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAxis(axis.key, val)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-all",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <span>{axis.icons[idx]}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Live preview */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          Preview
        </div>
        <p className="text-sm italic text-foreground/80 leading-relaxed">
          &ldquo;{preview}&rdquo;
        </p>
      </div>

      {isDirty && (
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save Changes
        </Button>
      )}
    </div>
  );
}
