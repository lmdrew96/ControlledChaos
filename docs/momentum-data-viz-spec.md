# Momentum data viz

> Feature spec for the ControlledChaos daily momentum card redesign and new expanded momentum page.

## Summary

Replace the current `DailyMomentum` card (static tier icon + 8 fill-dots + text counter) with a richer card showing a mini 7-day bar chart, and add a click-through expanded momentum page with detailed data visualizations. Integrate the existing user-configured category color system across tasks and the momentum viz.

---

## Design principles (AuDHD-friendly)

These are non-negotiable. Every data viz decision should be filtered through them.

1. **Celebrate output, not consistency.** Show what was accomplished — never highlight what wasn't. No streaks, no streak counters, no consecutive-day tracking, no "you broke your streak" messaging.
2. **No zero-day shame.** Rest days are valid. Zero-completion days should be visually neutral (blank/minimal), never highlighted, colored red, or called out with a "0" label.
3. **Pattern discovery without judgment.** Surface patterns like "you tend to be productive on weekend afternoons" — never frame them as "you missed 3 weekdays." Insights are observations, not prescriptions.
4. **Energy-aware wins.** Completing a high-energy task is worth celebrating independently of raw count. The viz should surface energy distribution, not just volume.
5. **No comparison pressure.** Avoid "vs last week" or "vs average" framing that implies the user should be doing more. The one exception: "biggest day" as a personal-best celebration (backward-looking, not obligation-creating).

---

## Part 1: Category color system integration

### Current state

Colors are defined in `src/lib/calendar/colors.ts`:

- **5 categories:** `school`, `work`, `personal`, `errands`, `health`
- **8 color options:** `blue`, `purple`, `green`, `orange`, `red`, `pink`, `teal`, `yellow`
- **User prefs stored in:** `userSettings.calendarColors` (JSON) — e.g. `{ school: "blue", work: "purple", personal: "green", errands: "orange", health: "red" }`
- **Existing class maps:** `WEEK_VIEW_CLASSES`, `MONTH_VIEW_CLASSES`, `MONTH_PILL_CLASSES` — all Tailwind class strings
- **Resolver:** `resolveColor(category, colors)` → returns the user's chosen `CalendarColorKey` for a category

### What to add

The momentum viz (and eventually tasks UI) needs **hex values** for Chart.js canvases, SVG fills, heatmap cells, and bar chart fills. Add to `src/lib/calendar/colors.ts`:

```typescript
/** Hex values for data viz contexts (Chart.js, SVG, inline styles) */
export const COLOR_HEX: Record<CalendarColorKey, { solid: string; light: string }> = {
  blue:   { solid: "#3b82f6", light: "rgba(59,130,246,0.15)" },
  purple: { solid: "#a855f7", light: "rgba(168,85,247,0.15)" },
  green:  { solid: "#22c55e", light: "rgba(34,197,94,0.15)" },
  orange: { solid: "#f97316", light: "rgba(249,115,22,0.15)" },
  red:    { solid: "#ef4444", light: "rgba(239,68,68,0.15)" },
  pink:   { solid: "#ec4899", light: "rgba(236,72,153,0.15)" },
  teal:   { solid: "#14b8a6", light: "rgba(20,184,166,0.15)" },
  yellow: { solid: "#eab308", light: "rgba(234,179,8,0.15)" },
};

/** Get hex color for a category, respecting user color prefs */
export function categoryHex(
  category: EventCategory | null | undefined,
  colors?: CalendarColors | null
): { solid: string; light: string } {
  const c = resolveColor(category, colors ?? DEFAULT_CALENDAR_COLORS);
  return COLOR_HEX[c];
}
```

Also add Tailwind class maps for **task pill/badge** usage (same pattern as `MONTH_PILL_CLASSES`):

```typescript
/** Task list: category badge classes */
export const TASK_BADGE_CLASSES: Record<CalendarColorKey, string> = {
  blue:   "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200",
  purple: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200",
  green:  "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-200",
  orange: "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-200",
  red:    "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-200",
  pink:   "bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-200",
  teal:   "bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-200",
  yellow: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-200",
};

export function taskBadgeColor(
  category: EventCategory | null | undefined,
  colors?: CalendarColors | null
): string {
  const c = resolveColor(category, colors ?? DEFAULT_CALENDAR_COLORS);
  return TASK_BADGE_CLASSES[c];
}
```

### Settings UI rename

In `src/components/features/settings/calendar-settings.tsx`, rename the "Event Colors" section header to **"Category Colors"** and update the description to: "Choose a color for each category. Used for calendar events, tasks, and stats."

---

## Part 2: Backend — new `/api/stats/momentum` endpoint

### Why a new endpoint

The existing `/api/stats/daily` returns only three numbers (`completedToday`, `completedThisWeek`, `completedAllTime`). The momentum page needs richer breakdowns. Keep the existing endpoint as-is (other things may depend on it) and add a new one.

### Route

`GET /api/stats/momentum`

### Response shape

```typescript
interface MomentumStats {
  // === Summary ===
  completedToday: number;
  completedThisWeek: number;
  completedAllTime: number;
  biggestDay: { count: number; date: string } | null; // ISO date string, all-time personal best
  avgPerActiveDay: number; // average per day, excluding zero days

  // === Daily breakdown (last 14 days, ordered chronologically) ===
  daily: Array<{
    date: string; // ISO date "2026-04-12"
    count: number;
  }>;

  // === Time-of-day × day-of-week heatmap (current week) ===
  // Buckets: morning (6-12), afternoon (12-17), evening (17-21), night (21-6)
  heatmap: Array<{
    dayOfWeek: number; // 0=Mon, 1=Tue, ... 6=Sun
    timeBlock: "morning" | "afternoon" | "evening" | "night";
    count: number;
  }>;

  // === Category breakdown (current week) ===
  byCategory: Array<{
    category: string; // "school" | "work" | "personal" | "errands" | "health" | null
    count: number;
  }>;

  // === Energy breakdown (current week) ===
  byEnergy: {
    low: number;
    medium: number;
    high: number;
  };

  // === Wins (current week, computed server-side) ===
  wins: Array<{
    icon: string; // emoji
    title: string;
    subtitle: string;
  }>;
}
```

### Query implementation

Add a new function `getMomentumStats(userId: string, timezone: string)` in `src/lib/db/queries.ts`.

All queries hit the existing `tasks` table — no schema changes. Use `completedAt` for time grouping, `category` for category breakdown, `energyLevel` for energy breakdown.

#### Daily breakdown

```sql
SELECT
  DATE(completed_at AT TIME ZONE $timezone) AS date,
  COUNT(*)::int AS count
FROM tasks
WHERE user_id = $userId
  AND status = 'completed'
  AND completed_at >= NOW() - INTERVAL '14 days'
GROUP BY date
ORDER BY date ASC
```

#### Heatmap

```sql
SELECT
  EXTRACT(ISODOW FROM completed_at AT TIME ZONE $timezone)::int - 1 AS day_of_week,
  CASE
    WHEN EXTRACT(HOUR FROM completed_at AT TIME ZONE $timezone) BETWEEN 6 AND 11 THEN 'morning'
    WHEN EXTRACT(HOUR FROM completed_at AT TIME ZONE $timezone) BETWEEN 12 AND 16 THEN 'afternoon'
    WHEN EXTRACT(HOUR FROM completed_at AT TIME ZONE $timezone) BETWEEN 17 AND 20 THEN 'evening'
    ELSE 'night'
  END AS time_block,
  COUNT(*)::int AS count
FROM tasks
WHERE user_id = $userId
  AND status = 'completed'
  AND completed_at >= $startOfWeek
GROUP BY day_of_week, time_block
```

#### Category breakdown

```sql
SELECT category, COUNT(*)::int AS count
FROM tasks
WHERE user_id = $userId
  AND status = 'completed'
  AND completed_at >= $startOfWeek
GROUP BY category
ORDER BY count DESC
```

#### Energy breakdown

```sql
SELECT energy_level, COUNT(*)::int AS count
FROM tasks
WHERE user_id = $userId
  AND status = 'completed'
  AND completed_at >= $startOfWeek
GROUP BY energy_level
```

#### Biggest day (all-time personal best)

```sql
SELECT
  DATE(completed_at AT TIME ZONE $timezone) AS date,
  COUNT(*)::int AS count
FROM tasks
WHERE user_id = $userId AND status = 'completed'
GROUP BY date
ORDER BY count DESC
LIMIT 1
```

#### Average per active day

```sql
SELECT AVG(daily_count)::float AS avg
FROM (
  SELECT COUNT(*)::int AS daily_count
  FROM tasks
  WHERE user_id = $userId AND status = 'completed'
  GROUP BY DATE(completed_at AT TIME ZONE $timezone)
) AS daily_counts
```

#### Wins heuristics

Compute server-side after fetching the week's data. Rules:

| Condition | Icon | Title template |
|-----------|------|----------------|
| Any day this week >= `biggestDay.count` (new PB) | ⚡ | "New personal best: {n} in a day" |
| `byEnergy.high >= 3` this week | 💪 | "Knocked out {n} high-energy tasks" |
| Any category where all tasks with deadlines this week were completed before deadline | 🎯 | "All {category} tasks done early" |
| `completedThisWeek >= 10` | 🔥 | "Double digits this week" |
| Any single day with completions across 3+ categories | 🌈 | "Tackled {n} categories in one day" |

Return at most 3 wins, prioritized in the order above.

### Route file

Create `src/app/api/stats/momentum/route.ts` — same auth pattern as the existing daily route:

```typescript
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUser, getMomentumStats } from "@/lib/db/queries";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUser(userId);
  const timezone = user?.timezone ?? "America/New_York";
  const stats = await getMomentumStats(userId, timezone);

  return NextResponse.json(stats);
}
```

---

## Part 3: Dashboard card redesign

### File

`src/components/features/dashboard/daily-momentum.tsx`

### Current behavior (keep)

- Tier system: Coffee (0) → Sparkles (1+) → Flame (3+) → Zap (6+) — keep exactly as-is
- Tier icon, accent color, and message — keep
- Fetch from `/api/stats/daily` — switch to `/api/stats/momentum`

### Changes

1. **Replace the 8 fill-dots** with a **mini 7-day bar chart** showing the last 7 entries from `daily[]`. Each bar is proportional to the day's count relative to the max count that week. Use the tier's accent color for filled bars and a neutral muted color for the current day (to distinguish "today" visually without using a shame color).

2. **Keep the text counter** below: `"{completedToday} today · {completedThisWeek} this week"` — unchanged.

3. **Make the card clickable** — wrap in a `<Link href="/momentum">` (or use `router.push`). Add a subtle hover state (border color transition, already exists via the group hover class).

4. **No streak badge, no streak indicator, nothing streak-related.**

### Visual spec

```
┌─────────────────────────────────────┐
│  🔥  On fire!                       │
│      5 today · 14 this week         │
│                                     │
│  ▂  █  ▄  ▆  ·  █▇ ▅              │
│  M  T  W  T  F  S  S               │
└─────────────────────────────────────┘
```

- Bar height: `(count / maxCountThisWeek) * 36px`, minimum 3px for days with completions
- Zero days: 3px neutral bar (muted-foreground/15), no label
- Today: distinguished by label weight (font-weight 500) and slightly different bar color (tier accent at higher opacity), not by a contrasting/alarming color
- Day labels: single letter, 9px, muted

---

## Part 4: Expanded momentum page

### Route

Create `src/app/(app)/momentum/page.tsx`

### Layout

Top to bottom:

#### 1. Page header

```
Your momentum                        This week · Apr 7–13
```

Title left, date range right.

#### 2. Insight bar (optional)

A gentle, pattern-based observation generated from the heatmap data. Light background, 13px text.

Examples:
- "You've been most productive on **weekend afternoons** lately."
- "**Mornings** are your power zone this week."
- "You've been spreading tasks across the whole week — nice balance."

Logic: find the heatmap cell(s) with the highest count, generate a natural-language observation. If no clear pattern (all cells roughly equal), use the "balance" variant. **Never frame negatively.**

Only display if there's enough data to be meaningful (at least 5 completions this week).

#### 3. Metric cards (4-up grid)

| Label | Value | Subtitle |
|-------|-------|----------|
| Today | `completedToday` | "Nice momentum" / "Getting started" / contextual, never judgmental |
| This week | `completedThisWeek` | "{completedAllTime} all time" |
| Biggest day | `biggestDay.count` | "{biggestDay.date}" formatted as "Last Saturday" etc. |
| Avg/day | `avgPerActiveDay` rounded to 1 decimal | "On active days" (this qualifier is critical — excludes zero days) |

#### 4. Daily completions bar chart

Full-width bar chart of the last 7 days (current week). Each bar colored with the tier accent color at varying opacity based on count.

- Zero days: minimal 4px bar with `bg-secondary`, no count label
- Active days: bar height proportional to max, count label above bar
- Today: labeled "Today" instead of day name, font-weight 500

#### 5. Two-column section

**Left column:**

**"When you get stuff done"** — time-of-day × day-of-week heatmap grid.

- Rows: Morning, Afternoon, Evening, Night
- Columns: M, T, W, T, F, S, S
- Cell color: 5 intensity stops from neutral (0 completions) to the momentum accent color (3+ completions). Use orange ramp: `rgba(249,115,22, 0/0.12/0.25/0.45/0.7)` for 0/1/2/3/4+ completions.
- Show count in cell only at highest intensity (4+)

**"Energy spent"** — three chips showing low/medium/high energy task counts.

- Low: green-tinted chip
- Medium: orange-tinted chip
- High: red-tinted chip
- Each shows count prominently with energy label below

**Right column:**

**"By category"** — horizontal bar chart.

- One row per category that has completions this week
- Bar fill color: use `categoryHex(category, userColors).solid`
- Category label left, count right, proportional bar in between
- Sorted by count descending
- Categories with 0 completions this week are omitted (not shown as empty rows)

**"This week's wins"** — list of 1-3 win items from `wins[]`.

- Each item: emoji icon + title + subtitle
- Light background cards, stacked vertically
- If no wins qualify, don't show the section at all (don't show "No wins yet" — that's shame)

### Data fetching

The page should fetch from `/api/stats/momentum` on mount. Also fetch user settings (for `calendarColors`) to pass into `categoryHex()`. Can reuse the existing settings fetch pattern or get colors from the momentum endpoint response (see below).

**Consider:** Include `calendarColors` in the momentum endpoint response to avoid a second fetch:

```typescript
interface MomentumStats {
  // ... existing fields ...
  calendarColors: CalendarColors; // user's color prefs for rendering
}
```

---

## Part 5: Data flow summary

```
userSettings.calendarColors
        │
        ▼
resolveColor(category, colors) → CalendarColorKey ("blue", "purple", etc.)
        │
        ├──→ categoryHex()        → { solid, light }   → momentum viz bars, heatmap, charts
        ├──→ categoryColor()      → Tailwind classes    → calendar week view (existing)
        ├──→ categoryDotColor()   → Tailwind classes    → calendar month dots (existing)
        ├──→ categoryPillColor()  → Tailwind classes    → calendar month pills (existing)
        └──→ taskBadgeColor()     → Tailwind classes    → task list badges (new)
```

---

## Files to create/modify

### New files

| File | Purpose |
|------|---------|
| `src/app/api/stats/momentum/route.ts` | API endpoint |
| `src/app/(app)/momentum/page.tsx` | Expanded momentum page |

### Modified files

| File | Changes |
|------|---------|
| `src/lib/calendar/colors.ts` | Add `COLOR_HEX`, `categoryHex()`, `TASK_BADGE_CLASSES`, `taskBadgeColor()` |
| `src/lib/db/queries.ts` | Add `getMomentumStats()` |
| `src/components/features/dashboard/daily-momentum.tsx` | Replace dots with mini bar chart, make card clickable, fetch from new endpoint |
| `src/components/features/settings/calendar-settings.tsx` | Rename "Event Colors" → "Category Colors", update description |

### No changes needed

| File | Why |
|------|-----|
| `src/lib/db/schema.ts` | All data already exists in the tasks table |
| `src/app/api/stats/daily/route.ts` | Keep existing endpoint, don't break other consumers |

---

## Implementation order

1. **Color system additions** (`colors.ts`) — foundation, no dependencies
2. **Database query** (`queries.ts` — `getMomentumStats`) — can test independently
3. **API route** (`/api/stats/momentum`) — wire query to endpoint
4. **Card redesign** (`daily-momentum.tsx`) — swap to new endpoint + mini bar chart
5. **Momentum page** (`momentum/page.tsx`) — full expanded view
6. **Settings rename** (`calendar-settings.tsx`) — cosmetic, do whenever

---

## Out of scope (for now)

- Task list UI color-coding by category (use `taskBadgeColor` when ready, but not part of this feature)
- Time range selector on momentum page (default to current week, add later)
- Historical week comparison ("last week vs this week")
- Export/share momentum stats
