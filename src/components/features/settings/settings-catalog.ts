import {
  Bell,
  Brain,
  Calendar,
  Clock,
  MapPin,
  Siren,
  Sun,
  User,
} from "lucide-react";

/**
 * What settings exist, what they're called, and how to find them.
 *
 * Deliberately holds NO render functions and imports no settings components,
 * so the command palette — which app-shell mounts on every page — can read this
 * list without dragging the entire settings bundle into the global shell.
 * `settings-tabs.tsx` supplies the components by id; this file is the catalog
 * both surfaces agree on, so a new setting can't appear in one and not the other.
 */

export interface SettingMeta {
  /** Also the DOM id of the section on /settings, i.e. the `#anchor` to link to. */
  id: string;
  title: string;
  /** Extra search terms, beyond the title. */
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When true the setting renders its own Card chrome and must not be wrapped. */
  bare?: boolean;
}

export interface SettingGroupMeta {
  id: string;
  title: string;
  settings: SettingMeta[];
}

export const SETTINGS_GROUPS: SettingGroupMeta[] = [
  {
    id: "you",
    title: "You",
    settings: [
      {
        id: "display-name",
        title: "Display Name",
        keywords: "name profile identity",
        icon: User,
      },
      {
        id: "timezone",
        title: "Timezone",
        keywords: "tz time clock region",
        icon: Clock,
      },
      {
        id: "appearance",
        title: "Appearance",
        keywords: "theme dark light celebration density spacing colors",
        icon: Sun,
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
        icon: Brain,
      },
      {
        id: "notifications",
        title: "Notifications",
        keywords: "push email digest reminders quiet hours alerts targets",
        icon: Bell,
      },
      {
        id: "calendar",
        title: "Calendar Integration",
        keywords: "ical canvas sources colors week start",
        icon: Calendar,
      },
      {
        id: "locations",
        title: "Saved Locations",
        keywords: "places geofence map address",
        icon: MapPin,
      },
      {
        id: "commute",
        title: "Commute Times",
        keywords: "travel commute drive transit time estimate",
        icon: Clock,
        bare: true,
      },
    ],
  },
  {
    id: "crisis-care",
    title: "Deadline Rescue & care",
    settings: [
      {
        id: "crisis-detection",
        title: "Rescue Detection",
        keywords: "panic emergency safety triggers detect support rescue deadline",
        icon: Siren,
      },
    ],
  },
];

/** Every setting, flattened, each tagged with the group it belongs to. */
export const SETTINGS_ENTRIES: Array<
  SettingMeta & { groupId: string; groupTitle: string }
> = SETTINGS_GROUPS.flatMap((g) =>
  g.settings.map((s) => ({ ...s, groupId: g.id, groupTitle: g.title }))
);

/** Does this setting match every one of the search terms? */
export function settingMatchesQuery(
  entry: { title: string; keywords: string },
  terms: string[]
): boolean {
  if (terms.length === 0) return true;
  const haystack = `${entry.title} ${entry.keywords}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
