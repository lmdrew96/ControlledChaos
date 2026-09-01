"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
import {
  SETTINGS_GROUPS,
  settingMatchesQuery,
} from "./settings-catalog";

/**
 * Which component renders each setting. The catalog owns the ids, titles and
 * keywords (see settings-catalog.ts); this map owns the components, so the
 * command palette can read the catalog without importing all of these.
 */
const RENDERERS: Record<string, () => React.ReactNode> = {
  "display-name": () => <DisplayNameSettings />,
  timezone: () => <TimezoneSettings />,
  appearance: () => <AppearanceSettings />,
  "ai-personality": () => <PersonalitySettings />,
  notifications: () => <NotificationSettings />,
  calendar: () => <CalendarSettings />,
  locations: () => <SavedLocations />,
  commute: () => <CommuteTimes />,
  "crisis-detection": () => <CrisisDetectionSettings />,
};

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

  /**
   * Scroll to the `#anchor` in the URL.
   *
   * This page renders inside a <Suspense> boundary, so when a link like
   * /settings#notifications arrives, Next finishes the navigation and makes its
   * own scroll attempt while the fallback is still showing — the target element
   * does not exist yet, the scroll silently no-ops, and the visitor lands at the
   * top of the page. Nothing re-tried it once the sections mounted, which is why
   * the legacy ?tab= path (which has always done this explicitly) worked and
   * every #anchor link did not.
   *
   * No dependency array: this runs after every render and is guarded by a ref,
   * so it also catches a hash-only push (/settings#a → /settings#b), which
   * changes neither the pathname nor the search params.
   */
  const handledHash = useRef<string | null>(null);
  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);
      if (!id || id === handledHash.current) return;
      handledHash.current = id;
      // Defer a frame so the section is painted before we scroll to it.
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    };

    scrollToHash();

    // Covers back/forward and hand-edited URLs, which don't re-render this tree.
    const onHashChange = () => {
      handledHash.current = null;
      scrollToHash();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  });

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
    if (terms.length === 0) return SETTINGS_GROUPS;
    return SETTINGS_GROUPS.map((g) => ({
      ...g,
      settings: g.settings.filter((s) => settingMatchesQuery(s, terms)),
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
            placeholder="Search settings — e.g. 'celebration', 'timezone', 'notifications'"
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
                    {RENDERERS[s.id]?.()}
                  </div>
                ) : (
                  <Card key={s.id} id={s.id} className="scroll-mt-24">
                    <CardHeader>
                      <CardTitle className="text-lg">{s.title}</CardTitle>
                    </CardHeader>
                    <CardContent>{RENDERERS[s.id]?.()}</CardContent>
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
