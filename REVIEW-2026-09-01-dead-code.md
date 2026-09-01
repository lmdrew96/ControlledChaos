# Dead Code Audit — 2026-09-01

Run against `v2.38.0`. Scope: unused exports, unwired props, unreferenced API
routes, unused schema columns.

Nothing in this document has been deleted. Deletion is a judgment call about
whether something is *abandoned* or *staged ahead of a feature*, and that call is
yours. The two **dead wiring** items were fixed, because those are bugs — UI that
can never render — not deletions.

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

### `onDuplicate` — edit-event dialog

Same shape, second instance. `EditEventDialog` renders its "Duplicate" button
behind `{onDuplicate && ...}`, and neither `week-view.tsx` nor `agenda-view.tsx`
passes it — so the Duplicate button has never appeared either.

**Not fixed**, deliberately: wiring it requires deciding what "duplicate" means
(same time? +1h? open the create dialog prefilled?), which is a product call, not
a repair. Filed as its own patch rather than guessed at.

---

## 2. Deletion candidates — recommended

### `src/lib/nudges/messages.ts` (52 lines) — **delete, high confidence**

An entire orphaned module for a "friend nudge" social feature. All four exports
(`NUDGE_MESSAGES`, `MAX_NUDGES_PER_FRIEND_PER_DAY`, `CATEGORY_LABELS`,
`pickRandomMessage`) are referenced only by each other. There is no supporting
schema (no friends table), no API route, and no UI anywhere in the app.

The word "nudge" appears widely elsewhere, but always as the *crisis detection
tier* (`crisisDetectionTier: "nudge"`) or `reNudgeSent` — unrelated to this file.

### `src/lib/ai/prompts.ts` — four legacy prompt constants

`BRAIN_DUMP_SYSTEM_PROMPT`, `TASK_RECOMMENDATION_SYSTEM_PROMPT`,
`SCHEDULING_SYSTEM_PROMPT`, `SINGLE_TASK_SCHEDULING_PROMPT` are each referenced
exactly once — their own declaration. They were superseded by the
`build*SystemPrompt(personalityPrefs)` functions in the same file, which is where
`HARD_SOFT_TIME_RULES` and the personality wiring actually live.

Keeping them is actively risky: they're a stale copy of prompt text that no longer
matches what ships, so anyone reading them learns the wrong rules.

### Unused DB query helpers — **delete or keep as API surface, your call**

Each is referenced only by its own declaration:

| Function | File |
|---|---|
| `getActiveCrisisPlan` | `src/lib/db/queries/crisis.ts` |
| `getGoalById` | `src/lib/db/queries/goals.ts` |
| `getCommuteBetween` | `src/lib/db/queries/locations.ts` |

These are cheap to keep and plausible future needs. Low priority either way.

### `SETTINGS_ENTRIES` — `src/components/features/settings/settings-tabs.tsx`

Exported, never imported. Check whether it's leftover from an earlier settings
layout or intended for a search index that was never built.

### `getSettingsVersion` — `src/lib/settings-cache.ts`

Unused. Note this is part of the settings-cache contract, so it may be deliberate
API surface — worth a look before removing.

### `shouldSendEveningCheckin` — `src/lib/notifications/triggers.ts`

Unused, while its siblings (`shouldSendIdleCheckin`, `shouldSendAfternoonCheckin`)
are both wired into the push-triggers cron. This asymmetry looks like an evening
check-in that was built and never hooked up — worth deciding: wire it, or drop it.

### `taskBadgeColor` — `src/lib/calendar/colors.ts` — **keep**

Unused, but `docs/momentum-data-viz-spec.md` line 468 explicitly says "use
`taskBadgeColor` when ready, but not part of this feature." Documented
build-ahead, not accidental. Leave it.

---

## 3. False positives worth recording

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
