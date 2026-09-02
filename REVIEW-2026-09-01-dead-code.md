# Dead Code Audit — 2026-09-01

**RESOLVED 2026-09-01 in v2.46.0.** Nae's decisions are recorded inline below,
marked ✅ done / ⏸ kept / ⚠️ correction. Section 2 is the only part with anything
left outstanding.

Run against `v2.38.0`. Scope: unused exports, unwired props, unreferenced API
routes, unused schema columns.

Original framing: nothing here had been deleted, because deletion is a judgment
call about whether something is *abandoned* or *staged ahead of a feature*, and
that call is Nae's. She has now made those calls — see the markers above each
item. Two things remain undecided, both in section 2.

---

## 1. Fixed in this pass

### `onPlanMyDay` — command palette (the one that prompted this audit)

`CommandPalette` gated its "Plan my day" row on an `onPlanMyDay` prop that no
call site passed, so the row had never rendered for anyone.

Fixed by lifting the planner's dialog state into `app-shell`, as expected:

- `ScheduleMyDay` gained an optional controlled mode (`open` / `onOpenChange` /
  `hideTrigger`). Proposing is now triggered by the dialog opening rather than by
  the button's click handler, so both entry points behave identically.
- `app-shell` hosts a hidden-trigger instance and passes
  `onPlanMyDay={() => setShowPlanner(true)}`.

Known limitation: the app-shell instance calls `router.refresh()` on commit.
On the dashboard specifically, `TimeAnchor` and the task feed refetch on a
client-side `planVersion` key that `router.refresh()` doesn't bump, so planning
from the palette *while on the dashboard* may leave those two panels stale until
the next fetch. The dashboard's own button is unaffected.

### ✅ `onDuplicate` — edit-event dialog — REMOVED in v2.46.0

Nae: "yeah, we can remove the duplicate button code. it seems rather
unnecessary." Prop, handler, gated button and the `Copy` icon import are gone.

Original finding: same shape as `onPlanMyDay`. `EditEventDialog` rendered its
"Duplicate" button behind `{onDuplicate && ...}`, and neither `week-view.tsx` nor
`agenda-view.tsx` passed it — so the button had never appeared for anyone.

---

## 2. Deletion candidates — recommended

### `src/lib/nudges/messages.ts` (52 lines) — **delete, high confidence** — still open

An entire orphaned module for a "friend nudge" social feature. All four exports
(`NUDGE_MESSAGES`, `MAX_NUDGES_PER_FRIEND_PER_DAY`, `CATEGORY_LABELS`,
`pickRandomMessage`) are referenced only by each other. There is no supporting
schema (no friends table), no API route, and no UI anywhere in the app.

The word "nudge" appears widely elsewhere, but always as the *crisis detection
tier* (`crisisDetectionTier: "nudge"`) or `reNudgeSent` — unrelated to this file.

### `src/lib/ai/prompts.ts` — four legacy prompt constants — still open

`BRAIN_DUMP_SYSTEM_PROMPT`, `TASK_RECOMMENDATION_SYSTEM_PROMPT`,
`SCHEDULING_SYSTEM_PROMPT`, `SINGLE_TASK_SCHEDULING_PROMPT` are each referenced
exactly once — their own declaration. They were superseded by the
`build*SystemPrompt(personalityPrefs)` functions in the same file, which is where
`HARD_SOFT_TIME_RULES` and the personality wiring actually live.

Keeping them is actively risky: they're a stale copy of prompt text that no longer
matches what ships, so anyone reading them learns the wrong rules.

### ⏸ Unused DB query helpers — KEPT (Nae: "we can keep the DB query helpers")

Each is referenced only by its own declaration:

| Function | File |
|---|---|
| `getActiveCrisisPlan` | `src/lib/db/queries/crisis.ts` |
| `getGoalById` | `src/lib/db/queries/goals.ts` |
| `getCommuteBetween` | `src/lib/db/queries/locations.ts` |

These are cheap to keep and plausible future needs. Low priority either way.

### ✅ `SETTINGS_ENTRIES` — RESOLVED in v2.46.0, and it uncovered a real bug

Nae flagged this as possibly explaining why the sidebar search (the command
palette) navigates to a settings section but lands at the top of the page.

**It was not the cause.** The cause: `SettingsTabs` renders inside a `<Suspense>`
boundary, so when the palette pushes `/settings#notifications`, Next completes
the navigation and makes its own scroll attempt while the fallback is still
showing. The target element does not exist yet, the scroll silently no-ops, and
you land at the top — and nothing re-tries once the sections mount. The legacy
`?tab=` path always worked because it has an explicit `requestAnimationFrame` +
`scrollIntoView`; the `#anchor` path never got one. Fixed, plus a `hashchange`
listener and a ref guard so a hash-only push (`#a` → `#b`) also scrolls.

**But the export did have a purpose**, and it is now real. It was meant to be the
palette's source of settings shortcuts — the palette had its own hardcoded copy
of the same nine settings. Wiring it as it stood would have pulled every settings
component into the palette's bundle, and app-shell mounts the palette on every
page. So the metadata is now split into `settings-catalog.ts` (no render
functions, no component imports), which both surfaces read. The two lists can no
longer disagree about an anchor id.

### ✅ `getSettingsVersion` — REMOVED in v2.46.0

Genuinely vestigial, and so was the `version` counter behind it. `settings-cache`
notifies via `subscribeToSettings`, and both `useTimezone` and
`useCalendarSettings` respond by re-reading — neither ever observed the counter.
Removed both.

(Clarifying my own vague phrasing in the first draft: "the settings-cache
contract" just meant its public API. And this cache is **not** localStorage — it
is an in-memory module-level cache of one `/api/settings` response, alive for the
page session and gone on reload. The localStorage-backed thing is
`useStoredPreference`, added separately in v2.35.0.)

### ⚠️ `shouldSendEveningCheckin` — MY FIRST READ WAS WRONG

I reported this as "an evening check-in built and never hooked up," and Nae
reasonably said to wire it up. It did not need wiring — **the evening check-in
already works.** `push-triggers/route.ts:451` calls `getEveningCheckinStatus()`
directly, evening is a selectable `dailyCheckInTime` in notification settings,
and the whole path fires.

`shouldSendEveningCheckin()` is only a thin boolean wrapper around
`getEveningCheckinStatus()` that nothing calls. The asymmetry is cosmetic: the
two siblings return `{shouldSend, activityLevel}` and the cron consumes them
directly, so the evening one never needed a wrapper. Removed the wrapper in
v2.46.0. No behavior change.

### ⏸ `taskBadgeColor` — KEPT. Here is what that doc line actually meant.

Fair question — the doc line was cryptic out of context. Chased it down:

`docs/momentum-data-viz-spec.md` is the spec for the momentum card redesign. It
built the whole category-colour pipeline (`resolveColor` → `categoryHex`,
`categoryColor`, `categoryDotColor`, `categoryPillColor`, `taskBadgeColor`) and
lists `taskBadgeColor()` under "Modified files" as something that feature ADDED.

Its "Out of scope (for now)" list then says:

> Task list UI color-coding by category (use `taskBadgeColor` when ready, but not
> part of this feature)

So: **"ready for"** = colour-coding task cards in the task list by category.
**"not part of what feature"** = not part of the momentum data-viz work that
built the pipeline. The helper was built alongside its siblings because they all
come off the same `resolveColor` call; the surface that would consume it was
deferred.

Concrete and still unbuilt, so it is a real deferred feature rather than debris.
Filed as its own patch so it either gets used or gets deleted, instead of sitting
here forever.

---

## 3. False positives worth recording

Also saved as a standing Tangle note (`01M1F0TH05WM6239ZAJH6TZ0TB`) so a future
audit doesn't re-litigate them.

A naive "exported but not imported elsewhere" scan flags a lot that isn't dead.
If you re-run this audit, filter these out:

- **Used only within its own file.** `COLOR_HEX` and `TASK_BADGE_CLASSES` are
  consumed by `categoryHex()` / `taskBadgeColor()` in the same module;
  `emailColors` has 18 in-file references. They're exported unnecessarily, but
  they are not dead.
- **Used only by tests.** `findFreeBlocks`, `isAssignmentEvent`,
  `deriveEnergyFromMoment`, `getTimezoneOffsetMs`, `CLUSTER_WINDOW_MINUTES`,
  `DEFAULT_PLAN_BLOCK_MINUTES`, `getTaskTimes`, `getSoonestTaskTime`. Exported
  for testability — correct as-is.
- **Used only by `scripts/`.** `repointUserId` is imported by
  `scripts/remap-clerk-ids.ts` and `scripts/dedupe-users-by-email.ts`.
- **Type-only exports.** ~35 of them. Types used solely for local annotation
  read as unused to a name-based scan.

---

## 4. Clean — checked, nothing found

- **Schema columns.** Every column in `src/lib/db/schema.ts` is referenced
  outside the schema file. No dead columns.
- **API routes.** Every route resolves to a caller. The six that look
  unreferenced from `src/` are legitimately external:
  - `/api/notifications/snooze` and `/api/notifications/vapid-key` → called from
    `public/sw.js` (the service worker).
  - The four `/api/cron/*` routes → triggered by
    `.github/workflows/cron-triggers.yml`, per the README.

---

## Method

Scripts used are in this session's scratchpad, not committed. Roughly:

1. Collect every `export` of a value from `src/**/*.{ts,tsx}`; for each, search
   every other file for the identifier.
2. Re-check survivors for in-file, test-only, and `scripts/` references before
   calling anything dead.
3. Prop scan: `on[A-Z]*` props declared in an interface, cross-checked against
   JSX attribute usage. (Note: a naive regex here breaks on `=>` inside an
   earlier prop — the candidates were verified by hand.)
4. Route scan: `src/app/api/**/route.ts` → literal path searched across the repo
   plus `public/` and `.github/`.
5. Schema scan: camelCase column names from `schema.ts` searched across the repo.
