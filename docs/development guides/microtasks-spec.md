# ControlledChaos: Microtasks Feature Spec

**Status:** Ready for implementation
**Priority:** Low → Medium (promote when starting)
**Author:** Nae + Coru
**Date:** 2026-04-29

---

## Overview

Microtasks are small, repeatable, non-accumulating prompts — things too small to be "real tasks" but valuable to do regularly. Examples: "5 min Upwork scan," "review CC dashboard," "stretch," "drink water."

They are **fundamentally different from regular tasks**:

| | Regular Tasks | Microtasks |
|---|---|---|
| Nature | Decisions ("should I do this?") | Prompts ("here's a nudge") |
| Missed behavior | Accumulate as overdue | Silently reset — no pile-up |
| Auto-triage | Yes | No |
| Crisis Mode | Visible (core system) | Hidden entirely |
| Completion | Multi-state (open → in_progress → done) | Binary per day (done / not done) |

### Anti-Patterns (DO NOT)

- DO NOT make microtasks appear in the main task list
- DO NOT make streak breaks feel punishing
- DO NOT surface microtasks in Crisis Mode
- DO NOT pile missed microtasks as overdue items
- DO NOT make completion a multi-step ceremony
- DO NOT add auto-triage logic for microtasks

---

## Schema

Microtasks use a **template + daily instance** model. The microtask row is the persistent definition. Completions are logged per calendar date in a separate table — "reset tomorrow" requires zero cron logic.

### `microtasks` table

```sql
CREATE TABLE microtasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  emoji         TEXT,                                          -- optional, for chip display (e.g. "🔍")
  time_of_day   TEXT NOT NULL DEFAULT 'anytime',               -- enum: morning | afternoon | evening | anytime
  days_of_week  INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',  -- 0=Sun, 6=Sat
  active        BOOLEAN NOT NULL DEFAULT true,                 -- soft pause/archive
  sort_order    INTEGER NOT NULL DEFAULT 0,                    -- manual reorder within time slot
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_microtasks_user_active ON microtasks (user_id, active);
```

### `microtask_completions` table

```sql
CREATE TABLE microtask_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  microtask_id    UUID NOT NULL REFERENCES microtasks(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  completed_date  DATE NOT NULL,             -- calendar date for "done today?" queries
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  note            TEXT,                      -- optional quick note
  UNIQUE(microtask_id, completed_date)       -- one completion per microtask per day
);

CREATE INDEX idx_mc_user_date ON microtask_completions (user_id, completed_date);
CREATE INDEX idx_mc_microtask_date ON microtask_completions (microtask_id, completed_date);
```

### Drizzle Schema Notes

- Define these as separate tables in the Drizzle schema (not bolted onto tasks)
- `time_of_day` should be a `pgEnum` with values `['morning', 'afternoon', 'evening', 'anytime']`
- `days_of_week` is a Postgres integer array
- The unique constraint on `(microtask_id, completed_date)` enforces one-completion-per-day at the DB level

---

## API Routes

All routes are authenticated via Clerk. `user_id` comes from the auth session.

### `GET /api/microtasks`

Returns all active microtasks for the authenticated user, enriched with:
- `completedToday: boolean` — whether a completion row exists for today
- `todayNote: string | null` — note from today's completion, if any
- `completionCount7d: number` — count of completions in the last 7 days
- `scheduledToday: boolean` — whether today's day-of-week is in `days_of_week`

Only return microtasks where `active = true`. Sort by `time_of_day` group order (morning → afternoon → evening → anytime), then `sort_order` within group.

### `POST /api/microtasks`

Create a new microtask.

**Body:**
```json
{
  "title": "5 min Upwork scan",
  "emoji": "🔍",
  "time_of_day": "morning",
  "days_of_week": [1, 2, 3, 4, 5]
}
```

Only `title` is required. Everything else has defaults.

### `PATCH /api/microtasks/:id`

Update any combination of: `title`, `emoji`, `time_of_day`, `days_of_week`, `active`, `sort_order`.

Validate ownership (`user_id` match).

### `DELETE /api/microtasks/:id`

Soft delete — sets `active = false`. Does NOT delete the row or its completion history (preserves data for Patterns feature).

### `POST /api/microtasks/:id/complete`

Log a completion for today.

**Body (optional):**
```json
{
  "note": "Found 2 promising listings"
}
```

- Insert into `microtask_completions` with `completed_date = CURRENT_DATE`
- If a row already exists for today (unique constraint violation), return 409 or silently succeed (idempotent)
- Validate ownership

### `DELETE /api/microtasks/:id/complete`

Undo today's completion.

- Delete from `microtask_completions` where `microtask_id` and `completed_date = CURRENT_DATE`
- Validate ownership

---

## MCP Tools

Add to the existing ControlledChaos MCP server with `cc_` prefix:

| Tool | Params | Returns |
|---|---|---|
| `cc_list_microtasks` | none | All active microtasks + today's status + 7-day count |
| `cc_create_microtask` | `title`, `emoji?`, `time_of_day?`, `days_of_week?` | Created microtask |
| `cc_complete_microtask` | `microtask_id`, `note?` | Completion record |
| `cc_uncomplete_microtask` | `microtask_id` | Success/failure |
| `cc_update_microtask` | `microtask_id`, `...fields` | Updated microtask |
| `cc_deactivate_microtask` | `microtask_id` | Updated microtask (active=false) |

---

## Dashboard UI

### Layout

Microtasks render in a **dedicated zone above the main task list** — visually separated, not mixed in.

Chips are grouped by `time_of_day` and displayed as a **horizontal scrollable row** per group:

```
┌──────────────────────────────────────────────────┐
│ ☀️ Morning                                        │
│ [🔍 Upwork scan  ✓ 5/7]  [💧 Water  · 3/7]       │
│                                                  │
│ 🕐 Anytime                                        │
│ [🧘 Stretch  · 6/7]  [📋 CC dashboard  · 4/7]     │
└──────────────────────────────────────────────────┘
```

### Chip States

- **Not completed today**: Muted/outline style. Tap → complete (one tap).
- **Completed today**: Filled/checked style with ✓. Tap → undo.
- **Not scheduled today**: Do not render. (If today is Saturday and microtask is weekdays-only, it doesn't appear.)

### 7-Day Indicator

Display as `X/7` in small muted text on the chip. This is a **rolling 7-day window**, not a consecutive streak.

- If 0/7, show nothing (no "0/7" — that's shaming)
- No flame emoji, no streak language, no "you broke your streak" messaging
- Just a quiet ratio: observational, not motivational

### Quick Note

- On completion tap: immediate check mark, no modal
- Long press or expand interaction: reveals optional note input + "X of 7 days" detail
- Note field is a single text input, not a form

### Crisis Mode

**The entire microtask zone is hidden when Crisis Mode is active.** No exceptions. Check the existing crisis mode detection flag and conditionally render.

---

## Manage View

In addition to the dashboard chips, add a **/microtasks** route (or modal/drawer) for managing microtask definitions:

- List all microtasks (active + inactive)
- Create new microtask
- Edit title, emoji, schedule, time-of-day
- Toggle active/inactive (pause without deleting)
- Reorder via drag or arrows
- Inactive microtasks shown muted with a "Reactivate" option

---

## Out of Scope (v1)

- Contextual triggers (location, app-open events)
- Push notifications / reminders
- Microtask categories or grouping beyond time-of-day
- Haiku AI recommendations for microtasks
- Patterns feature integration (that's its own patch)
- Completion history view / analytics (future)
- Sharing or template marketplace

---

## Implementation Order

1. **Schema** — Drizzle migration for both tables + enum
2. **API routes** — CRUD + complete/uncomplete
3. **MCP tools** — wire into existing CC MCP server
4. **Dashboard UI** — chip row component with completion toggle
5. **Manage view** — create/edit/reorder/deactivate
6. **Crisis Mode guard** — hide microtask zone when active
