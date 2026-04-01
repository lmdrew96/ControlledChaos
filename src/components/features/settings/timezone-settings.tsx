"use client";

import { useState, useEffect } from "react";
import { Loader2, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Grouped timezone list — start with common US/CA, then world regions
const TIMEZONE_GROUPS = [
  {
    label: "United States & Canada",
    zones: [
      { value: "America/New_York", label: "Eastern — New York (ET)" },
      { value: "America/Chicago", label: "Central — Chicago (CT)" },
      { value: "America/Denver", label: "Mountain — Denver (MT)" },
      { value: "America/Los_Angeles", label: "Pacific — Los Angeles (PT)" },
      { value: "America/Phoenix", label: "Arizona — Phoenix (no DST)" },
      { value: "America/Anchorage", label: "Alaska (AKT)" },
      { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
      { value: "America/Toronto", label: "Eastern — Toronto (ET)" },
      { value: "America/Vancouver", label: "Pacific — Vancouver (PT)" },
    ],
  },
  {
    label: "Europe",
    zones: [
      { value: "Europe/London", label: "London (GMT/BST)" },
      { value: "Europe/Paris", label: "Paris (CET/CEST)" },
      { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
      { value: "Europe/Madrid", label: "Madrid (CET/CEST)" },
      { value: "Europe/Rome", label: "Rome (CET/CEST)" },
      { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)" },
      { value: "Europe/Stockholm", label: "Stockholm (CET/CEST)" },
      { value: "Europe/Warsaw", label: "Warsaw (CET/CEST)" },
      { value: "Europe/Bucharest", label: "Bucharest (EET/EEST)" },
      { value: "Europe/Athens", label: "Athens (EET/EEST)" },
      { value: "Europe/Helsinki", label: "Helsinki (EET/EEST)" },
      { value: "Europe/Kyiv", label: "Kyiv (EET/EEST)" },
      { value: "Europe/Istanbul", label: "Istanbul (TRT)" },
      { value: "Europe/Moscow", label: "Moscow (MSK)" },
    ],
  },
  {
    label: "Latin America",
    zones: [
      { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
      { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (ART)" },
      { value: "America/Bogota", label: "Bogotá (COT)" },
      { value: "America/Lima", label: "Lima (PET)" },
      { value: "America/Mexico_City", label: "Mexico City (CST)" },
      { value: "America/Santiago", label: "Santiago (CLT)" },
    ],
  },
  {
    label: "Asia & Pacific",
    zones: [
      { value: "Asia/Kolkata", label: "India — Mumbai/Delhi (IST)" },
      { value: "Asia/Dubai", label: "Dubai (GST)" },
      { value: "Asia/Singapore", label: "Singapore (SGT)" },
      { value: "Asia/Shanghai", label: "China — Shanghai (CST)" },
      { value: "Asia/Tokyo", label: "Japan — Tokyo (JST)" },
      { value: "Asia/Seoul", label: "South Korea — Seoul (KST)" },
      { value: "Asia/Bangkok", label: "Bangkok (ICT)" },
      { value: "Asia/Jakarta", label: "Jakarta (WIB)" },
      { value: "Asia/Karachi", label: "Pakistan — Karachi (PKT)" },
      { value: "Asia/Dhaka", label: "Bangladesh — Dhaka (BST)" },
      { value: "Asia/Tashkent", label: "Uzbekistan — Tashkent (UZT)" },
      { value: "Australia/Sydney", label: "Australia — Sydney (AEDT)" },
      { value: "Australia/Melbourne", label: "Australia — Melbourne (AEDT)" },
      { value: "Australia/Perth", label: "Australia — Perth (AWST)" },
      { value: "Pacific/Auckland", label: "New Zealand — Auckland (NZST)" },
    ],
  },
  {
    label: "Africa & Middle East",
    zones: [
      { value: "Africa/Cairo", label: "Egypt — Cairo (EET)" },
      { value: "Africa/Lagos", label: "Nigeria — Lagos (WAT)" },
      { value: "Africa/Johannesburg", label: "South Africa (SAST)" },
      { value: "Africa/Nairobi", label: "Kenya — Nairobi (EAT)" },
      { value: "Asia/Riyadh", label: "Saudi Arabia — Riyadh (AST)" },
      { value: "Asia/Tehran", label: "Iran — Tehran (IRST)" },
      { value: "Asia/Jerusalem", label: "Israel — Jerusalem (IST)" },
    ],
  },
];

// Flat list for lookup
const ALL_ZONES = TIMEZONE_GROUPS.flatMap((g) => g.zones);

function labelForZone(value: string): string {
  return ALL_ZONES.find((z) => z.value === value)?.label ?? value;
}

export function TimezoneSettings() {
  const [timezone, setTimezone] = useState("America/New_York");
  const [original, setOriginal] = useState("America/New_York");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = timezone !== original;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.timezone) {
            setTimezone(data.timezone);
            setOriginal(data.timezone);
          }
        }
      } catch {
        // Keep default
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
        body: JSON.stringify({ timezone }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setOriginal(timezone);
      toast.success("Timezone updated!");
    } catch {
      toast.error("Failed to save timezone");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Used for Canvas deadlines, AI scheduling, daily digests, and all displayed times.
      </p>

      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger className="flex-1">
            <SelectValue>{labelForZone(timezone)}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {TIMEZONE_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.zones.map((zone) => (
                  <SelectItem key={zone.value} value={zone.value}>
                    {zone.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isDirty && (
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
      )}
    </div>
  );
}
