"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { DisplayNameSettings } from "./display-name-settings";
import { AppearanceSettings } from "./appearance-settings";
import { TimezoneSettings } from "./timezone-settings";
import { PersonalitySettings } from "./personality-settings";
import { SavedLocations } from "./saved-locations";
import { CommuteTimes } from "./commute-times";
import { CalendarSettings } from "./calendar-settings";
import { NotificationSettings } from "./notification-settings";
import { CrisisDetectionSettings } from "./crisis-detection-settings";
import { FriendsSettings } from "./friends-settings";
import { MedicationSettings } from "./medication-settings";
import { RoomManager } from "@/components/parallel-play/RoomManager";

interface SettingEntry {
  id: string;
  title: string;
  keywords: string;
  render: () => React.ReactNode;
  /** When true, the setting renders its own Card chrome and we should not wrap it. */
  bare?: boolean;
}

interface SettingGroup {
  id: string;
  title: string;
  settings: SettingEntry[];
}

const GROUPS: SettingGroup[] = [
  {
    id: "you",
    title: "You",
    settings: [
      {
        id: "display-name",
        title: "Display Name",
        keywords: "name profile identity",
        render: () => <DisplayNameSettings />,
      },
      {
        id: "timezone",
        title: "Timezone",
        keywords: "tz time clock region",
        render: () => <TimezoneSettings />,
      },
      {
        id: "appearance",
        title: "Appearance",
        keywords: "theme dark light celebration density spacing colors",
        render: () => <AppearanceSettings />,
      },
      {
        id: "friends",
        title: "Friends",
        keywords: "social connect contacts parallel play",
        render: () => <FriendsSettings />,
        bare: true,
      },
      {
        id: "rooms",
        title: "Parallel Play Rooms",
        keywords: "body double focus room session shared",
        render: () => <RoomManager />,
        bare: true,
      },
    ],
  },
  {
    id: "how-cc-works",
    title: "How CC works",
    settings: [
      {
        id: "ai-personality",
        title: "AI Personality",
        keywords: "claude assistant tone voice energy personality",
        render: () => <PersonalitySettings />,
      },
      {
        id: "notifications",
        title: "Notifications",
        keywords: "push email digest reminders quiet hours alerts",
        render: () => <NotificationSettings />,
      },
      {
        id: "calendar",
        title: "Calendar Integration",
        keywords: "ical canvas sources colors week start",
        render: () => <CalendarSettings />,
      },
      {
        id: "locations",
        title: "Saved Locations",
        keywords: "places geofence map address",
        render: () => <SavedLocations />,
      },
      {
        id: "commute",
        title: "Commute Times",
        keywords: "travel commute drive transit time estimate",
        render: () => <CommuteTimes />,
        bare: true,
      },
    ],
  },
  {
    id: "crisis-care",
    title: "Crisis & care",
    settings: [
      {
        id: "crisis-detection",
        title: "Crisis Detection",
        keywords: "panic emergency safety triggers detect support",
        render: () => <CrisisDetectionSettings />,
      },
      {
        id: "medications",
        title: "Medications",
        keywords: "meds pills schedule reminder dose",
        render: () => <MedicationSettings />,
        bare: true,
      },
    ],
  },
];

const ALL_ENTRIES: Array<SettingEntry & { groupId: string; groupTitle: string }> =
  GROUPS.flatMap((g) =>
    g.settings.map((s) => ({ ...s, groupId: g.id, groupTitle: g.title }))
  );

function entryMatchesQuery(
  entry: { title: string; keywords: string },
  terms: string[]
): boolean {
  if (terms.length === 0) return true;
  const haystack = `${entry.title} ${entry.keywords}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function SettingsTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Migration: legacy ?tab= links from cmd+K, push notifications, or
  // bookmarks should redirect to the matching anchor.
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!tab) return;
    const TAB_TO_ANCHOR: Record<string, string> = {
      profile: "display-name",
      "ai-energy": "ai-personality",
      calendar: "calendar",
      locations: "locations",
      notifications: "notifications",
      "crisis-detection": "crisis-detection",
      friends: "friends",
      medications: "medications",
      rooms: "rooms",
    };
    const anchor = TAB_TO_ANCHOR[tab];
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const qs = params.toString();
    const url = `/settings${qs ? `?${qs}` : ""}${anchor ? `#${anchor}` : ""}`;
    router.replace(url, { scroll: false });
    if (anchor) {
      // Defer to next paint so the section is rendered before scrollIntoView.
      requestAnimationFrame(() => {
        document.getElementById(anchor)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, [searchParams, router]);

  const terms = useMemo(
    () =>
      query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0),
    [query]
  );

  const visibleGroups = useMemo(() => {
    if (terms.length === 0) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      settings: g.settings.filter((s) => entryMatchesQuery(s, terms)),
    })).filter((g) => g.settings.length > 0);
  }, [terms]);

  const totalMatches = visibleGroups.reduce((sum, g) => sum + g.settings.length, 0);
  const hasQuery = terms.length > 0;

  const clearQuery = useCallback(() => setQuery(""), []);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings — e.g. 'celebration', 'timezone', 'medication'"
            aria-label="Search settings"
            className="h-10 pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={clearQuery}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {hasQuery && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {totalMatches} match{totalMatches === 1 ? "" : "es"}
          </p>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No settings match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        visibleGroups.map((group) => (
          <section key={group.id} className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </h2>
            <div className="space-y-4">
              {group.settings.map((s) =>
                s.bare ? (
                  <div key={s.id} id={s.id} className="scroll-mt-24">
                    {s.render()}
                  </div>
                ) : (
                  <Card key={s.id} id={s.id} className="scroll-mt-24">
                    <CardHeader>
                      <CardTitle className="text-lg">{s.title}</CardTitle>
                    </CardHeader>
                    <CardContent>{s.render()}</CardContent>
                  </Card>
                )
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

export const SETTINGS_ENTRIES = ALL_ENTRIES;
