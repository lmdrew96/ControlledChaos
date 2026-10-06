# ControlledChaos — System Architecture Description

**Version:** 3.0
**Last Updated:** October 2026 (app v2.88)

---

## 1. Architecture Overview

ControlledChaos is a Progressive Web App (PWA) built on Next.js and deployed to Cloudflare Workers. The system is designed around a core loop: **Capture → Parse → Recommend → Act → Learn**.

The app has no notion of where the user is. It never reads device location; the only "location" it knows is the free-text place on a calendar event ("Room 204").

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (PWA)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Brain   │  │  Task    │  │ Calendar │  │ Rescue  │ │
│  │  Dump UI │  │  Feed    │  │  View    │  │ (Crisis)│ │
│  └────┬─────┘  └────▲─────┘  └────▲─────┘  └────▲────┘ │
│       ▼             │             │             │       │
│  ┌──────────────────────────────────────────────────┐  │
│  │        Service Worker (public/sw.js)             │  │
│  │  Push notifications + click deep links + offline │  │
│  └──────────────────────┬───────────────────────────┘  │
└─────────────────────────┼──────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│   NEXT.JS APP ROUTER on Cloudflare Workers (OpenNext)    │
│   /api/dump  /api/tasks  /api/calendar  /api/crisis ...  │
│   /api/cron/*  ◄── QStash schedules + exact-minute fires │
└───────┬──────────────┬─────────────┬────────────────────┘
        ▼              ▼             ▼
┌───────────────┐ ┌──────────┐ ┌──────────────────────┐
│  AI Layer     │ │  Neon    │ │  External            │
│  Haiku 4.5 +  │ │ Postgres │ │  Canvas iCal, R2,    │
│  Sonnet +     │ │ (Drizzle)│ │  Resend, Web Push,   │
│  Groq Whisper │ │          │ │  Upstash QStash      │
└───────────────┘ └────▲─────┘ └──────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│  MCP SERVER (mcp/, separate Vercel deploy)               │
│  cc_* tools for Claude and other AI assistants; OAuth    │
│  sign-in through the app's Clerk instance                │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

### Frontend
| Technology | Purpose | Rationale |
|---|---|---|
| **Next.js 16** (App Router) | Framework | SSR + API routes + PWA support |
| **React 19** + React Compiler | UI library | Automatic memoization, concurrent features |
| **TypeScript** (strict) | Language | Type safety, mandatory |
| **Tailwind CSS v4** | Styling | Utility-first, PostCSS-native |
| **shadcn/ui + Radix UI** | Component library | Accessible primitives, fully customizable |
| **next-themes** | Dark/light toggle | Dark by default |
| **Framer Motion** | Animations | Subtle, purposeful micro-interactions |

### Backend / Infrastructure
| Technology | Purpose | Notes |
|---|---|---|
| **Cloudflare Workers** via `@opennextjs/cloudflare` | Hosting for the app | Deployed by Workers Builds on git push. CPU-time limits, not wall-clock |
| **Neon** (Serverless Postgres, `neon-http` driver) | Primary database | No interactive transactions; use `db.batch([...])` for atomic writes |
| **Drizzle ORM** + `drizzle-kit` | Database access + migrations | Schema in `src/lib/db/schema.ts`, migrations in `drizzle/` |
| **Upstash QStash** | Cron schedules + exact-minute reminder fires | Schedules defined in `scripts/sync-qstash-schedules.ts` |
| **Cloudflare R2** | File storage | Brain dump photos and audio; S3-compatible |
| **Vercel** | Hosting for the MCP server only | `mcp/` deploys separately with `vercel --prod`; a git push does not deploy it |

### AI Layer
| Technology | Purpose |
|---|---|
| **Claude Haiku 4.5** (`MODEL_HAIKU` in `src/lib/ai/index.ts`) | Default for everything interactive: brain dump parsing, photo extraction, recommendations, scheduling, task chunking, goal breakdown, rescue plans and chat, snooze duration, push copy |
| **Claude Sonnet** (`MODEL_SONNET`) | Email digests only — one long-form call per user per day, where quality is worth the price (`callSonnet` in `src/lib/notifications/send-email.ts`) |
| **Groq** (Whisper) | Speech-to-text for voice brain dumps |

### Auth & Integrations
| Technology | Purpose |
|---|---|
| **Clerk** | Authentication for the app, and the OAuth authorization server for the MCP server |
| **Canvas iCal** (`node-ical`) | Academic schedule import, URL-based (no auth). No Google Calendar integration |
| **Web Push** (`web-push`, VAPID) | Push notifications via the service worker |
| **Resend** + React Email | Morning and evening digest emails |

### Build Tools
| Script | Purpose |
|---|---|
| `scripts/check-build-env.ts` | Fails the build when a required `NEXT_PUBLIC_*` value is missing (they're inlined at build time) |
| `scripts/check-changelog.ts` | Fails the build when `CHANGELOG[0].version` ≠ package.json |

---

## 3. Database Schema

Source of truth: `src/lib/db/schema.ts`. 18 tables. Abbreviated below (indexes and most defaults omitted). All timestamps are stored in UTC.

```sql
-- Users (synced from Clerk)
users (id TEXT PK /* Clerk user ID */, email, display_name, timezone, created_at, updated_at)

-- User preferences
user_settings (
  user_id                 TEXT UNIQUE → users,
  energy_profile          JSONB,     -- energy by time of day
  notification_prefs      JSONB,     -- push/email toggles, quiet hours, assertiveness, reminder intervals
  personality_prefs       JSONB,     -- {supportive, formality, language}, each 0|1|2
  canvas_ical_url         TEXT,
  canvas_selected_courses JSONB,     -- course codes to sync; null = all
  auto_add_canvas_tasks   BOOLEAN,   -- create prep tasks from Canvas assessments
  onboarding_complete     BOOLEAN,
  wake_time / sleep_time  INTEGER,   -- AI scheduling window, local hours
  calendar_start_hour / calendar_end_hour INTEGER,  -- calendar display range (end may be 24)
  week_start_day          INTEGER,   -- 0=Sun, 1=Mon
  calendar_export_token   TEXT,      -- personal iCal subscribe URL
  calendar_colors         JSONB,
  crisis_detection_tier   TEXT       -- off | watch | nudge | auto_triage
)

-- Goals
goals (id, user_id, title, description, target_date /* a calendar day */, status /* active|completed|paused */,
       completed_at, reflection, sort_order, deleted_at /* soft delete */, created_at, updated_at)

-- Brain dumps (raw input before parsing)
brain_dumps (id, user_id, input_type /* text|voice|photo */, raw_content, media_url, media_urls JSONB,
             category /* braindump|junk_journal */, ai_response JSONB, created_at)

-- Moments (quick energy/focus/feelings logs)
moments (id, user_id, type /* energy_high|energy_low|energy_crash|focus_start|focus_end|tough_moment */,
         intensity /* 1-5 */, note, occurred_at, source, created_at, deleted_at)

-- Tasks (the core entity)
tasks (
  id, user_id, title, description,
  status            TEXT,   -- pending | in_progress | completed | snoozed | cancelled
  priority          TEXT,   -- urgent | important | normal | someday
  energy_level      TEXT,   -- low | medium | high
  estimated_minutes INTEGER,
  category          TEXT,   -- school | work | personal | errands | health
  deadline          TIMESTAMP,  -- HARD, externally imposed
  target_date       TIMESTAMP,  -- SOFT, self-set; never urgent
  scheduled_for     TIMESTAMP,
  completed_at, snoozed_until,
  source_dump_id    → brain_dumps,
  source_event_id   TEXT,   -- Canvas externalId for auto-generated prep tasks
  goal_id           → goals,
  sort_order, progress_steps JSONB, current_step_index,
  deleted_at /* soft delete */, created_at, updated_at
)

-- Task sessions ("sittings": planned blocks of work on a task)
task_sessions (id, task_id → tasks, user_id, starts_at, minutes, status, actual_minutes, created_at)

-- Calendar events (Canvas + manual)
calendar_events (
  id, user_id, source /* canvas|controlledchaos */, external_id, title, description,
  start_time, end_time, location /* the event's own place, free text */,
  is_all_day, category, series_id /* recurring instances */, badge /* per-occurrence label */,
  is_tentative /* time counts as free */, source_dump_id, synced_at
)

-- Task activity log (for AI learning)
task_activity (id, user_id, task_id, action /* recommended|accepted|snoozed|rejected|completed|skipped */, context JSONB, created_at)

-- Notification log (also the push dedup record)
notifications (id, user_id, type, content JSONB, sent_at, opened_at, created_at)

-- Rescue plans
crisis_plans (
  id, user_id, task_name, task_id → tasks /* null for multi-task or free-text plans */,
  deadline /* hard, nullable */, target_date /* soft */, completion_pct,
  panic_level /* fine|tight|damage-control */, panic_label, summary, tasks JSONB /* CrisisTask[] */,
  current_task_index, completed_at, source /* manual|auto */, data_hash, created_at, updated_at
)
crisis_messages (id, crisis_plan_id → crisis_plans, user_id, role, content, created_at)  -- rescue chat

-- Auto-detected deadline collisions
crisis_detections (
  id, user_id, crisis_ratio, involved_task_ids JSONB, involved_task_names JSONB,
  first_deadline, available_minutes, required_minutes,
  crisis_plan_id → crisis_plans /* auto-triage plan */,
  re_nudge_sent, dismissed_at /* hides the banner only */,
  engaged_at /* user said "Yes, I'm on it"; escalation stops */,
  resolved_at, created_at, updated_at
)

-- Push
push_subscriptions (id, user_id, endpoint, keys_p256dh, keys_auth, created_at)   -- one per device
snoozed_pushes (id, user_id, payload JSONB, send_after, sent_at, created_at)

-- Microtasks (small recurring habits shown as chips)
microtasks (id, user_id, title, emoji, time_of_day, days_of_week JSONB, active, sort_order, created_at, updated_at)
microtask_completions (id, microtask_id, user_id, completed_date /* YYYY-MM-DD */, completed_at, note)

-- Reference cards (pinned markdown cards on the dashboard)
reference_cards (id, user_id, title, content /* markdown; "- [ ]" lines are tickable */, collapsed,
                 days_of_week, show_from, show_until, checklist_reset /* daily|manual */,
                 checked_items JSONB, checked_on, sort_order, created_at, updated_at)
```

---

## 4. Data Flows

### 4.1 Brain Dump → Structured Tasks + Calendar Events

```
User Input (text / voice / photo / junk journal)
        │
        ▼
┌─ Input Processing ─────────────────────────────┐
│  TEXT: passed directly to AI                    │
│  VOICE: upload to R2 → Groq Whisper → transcript│
│  PHOTO: upload to R2 → Haiku vision extraction  │
│  JUNK JOURNAL: stored as-is (text + images)     │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─ AI Parsing (Haiku, src/lib/ai/parse-dump.ts) ──┐
│  Context: current date/time + timezone, goals,   │
│  pending tasks (dedup), today's calendar         │
│                                                  │
│  Output: tasks + calendar events + summary       │
│  - Tasks: title, priority, energyLevel, category,│
│    estimatedMinutes, deadline / targetDate,      │
│    goalConnection                                │
│  - Events: title, start/end, recurrence          │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─ Validation & Storage ──────────────────────────┐
│  1. Validate ISO dates (discard hallucinations)  │
│  2. Validate goalConnection against real goals   │
│  3. Convert local times to UTC                   │
│  4. Expand recurring events into instances       │
│  5. Save brain_dump + tasks + events             │
└──────────────────────────────────────────────────┘
```

### 4.2 Task Recommendation Engine

```
User asks "What should I do?"
        │
        ▼
┌─ Context Gathering (server-side) ───────────────┐
│  1. Time of day                                  │
│  2. Next calendar event + available time         │
│     (pre-computed, not derived by AI)            │
│  3. Energy profile + recent Moments              │
│  4. Recent task activity (momentum/fatigue)      │
│  5. Pending tasks with pre-computed deadline     │
│     distances ("3 hours", "OVERDUE")             │
│  6. Upcoming calendar grouped TODAY / TOMORROW   │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─ AI Recommendation (Haiku) ─────────────────────┐
│  { taskId, reasoning, alternatives: [] }         │
│  All temporal values are pre-computed; the AI    │
│  never does date math.                           │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─ Presentation ──────────────────────────────────┐
│  Persisted to localStorage, survives reloads,    │
│  expires after 4 hours. [Done] [Not Now]         │
│  [Something Else] → /api/recommend/feedback,     │
│  /api/recommend/snooze                           │
└──────────────────────────────────────────────────┘
```

### 4.3 Planning (Sittings)

`/api/plan/propose` asks the AI to place sittings for chosen tasks into free time between wake and sleep, avoiding committed (non-tentative) events. The user accepts or retries per row (`/api/plan/retry`), and `/api/plan/commit` writes `task_sessions`. `DELETE /api/plan` clears what's still ahead today. The Daily Recap (`/api/recap`, `/api/recap/sittings`) asks how ended sittings went and records actual minutes, which crisis detection subtracts from a task's estimate.

### 4.4 Calendar Sync Flow

```
┌─ Canvas iCal ──────────────────────────────┐
│  User provides iCal URL, picks courses      │
│  QStash cron every 30 min → calendar-sync   │
│  Parse .ics (node-ical) → upsert events     │
│  Optional prep tasks for assessments        │
│  (skipped when the due date already passed) │
└──────────────┬──────────────────────────────┘
               ▼
┌──────────────────────────────────────────────┐
│  Unified Calendar View                        │
│  Canvas + manual events; colored by category  │
│  Tentative events dashed, counted as free     │
│  Recurrence expansion                         │
│  Personal iCal export/subscribe URL           │
└──────────────────────────────────────────────┘
```

Canvas rejects requests without a User-Agent, so the sync sends one.

### 4.5 Notification System

```
┌─ Push Notifications (Haiku-written copy) ───────┐
│  QStash cron every 10 min → push-triggers:       │
│  - Upcoming deadlines, soft targets, and events  │
│    at the user's reminder intervals, clustered   │
│    into one push when they describe the same     │
│    moment                                        │
│  - Scheduled sitting start times                 │
│  - Wake-up summary                               │
│  - Daily idle check-in (in the chosen window)    │
│  - Inactivity nudges                             │
│  - Crisis detection (see 4.6)                    │
│  - Snoozed pushes whose time has come            │
│                                                  │
│  Exact-minute fires: each tick schedules QStash  │
│  callbacks for alert bands opening in the next   │
│  12 min (src/lib/notifications/exact-fire.ts)    │
│                                                  │
│  App-initiated pushes count toward a daily cap   │
│  set by assertiveness (gentle/balanced/assertive)│
│  and respect quiet hours. Reminders the user     │
│  asked for don't count toward the cap.           │
│                                                  │
│  Web Push → service worker → notification;       │
│  notificationclick opens the push's URL          │
└──────────────────────────────────────────────────┘

┌─ Email Digests (Sonnet) ────────────────────────┐
│  Morning: today's events, prioritized tasks,     │
│  encouraging note. Evening: what got done,       │
│  tomorrow's top priority, wrap-up.               │
│  QStash crons every 15 min inside UTC windows;   │
│  each user's configured local time decides.      │
│  Sent via Resend + React Email.                  │
└──────────────────────────────────────────────────┘
```

### 4.6 Rescue (Crisis Mode)

```
┌─ Manual rescue (/api/crisis) ───────────────────┐
│  Input: task, deadline (hard, optional) or soft  │
│  target, completion %, optional file attachments │
│  Time budget = minutes until deadline minus the  │
│  UNION of sleep and committed events             │
│  (getBlockedMinutes in time-math.ts)             │
│  AI → panic level (fine | tight | damage-control)│
│  + concrete steps with stuck hints, or 2-3       │
│  strategies when other rescues are active        │
│  War room: step-through + chat (/[id]/chat),     │
│  which can correct the deadline back into the row│
└──────────────────────────────────────────────────┘

┌─ Automatic detection (cron + /status) ──────────┐
│  detectCrisis(): required vs available minutes   │
│  over 48h. Busy time always built by toBusyRows()│
│  so the cron and the status check agree.         │
│  Logged sitting minutes come off estimates.      │
│  Tiers: watch (badge only), nudge (push),        │
│  auto_triage (push; "Not yet" builds a plan on   │
│  request via /api/crisis-detection/plan).        │
│  Soft-target-only overload = "drift": one calm   │
│  push, never crisis-styled.                      │
│                                                  │
│  Crisis pushes ask "Already working on this?" —  │
│  the app can't see off-app work. They deep-link  │
│  to /crisis?checkin=<detectionId>. Only "Yes,    │
│  I'm on it" (or checking off a rescue step) sets │
│  engaged_at; then escalation stops and one       │
│  supportive heads-up goes out ≤15 min before the │
│  deadline. Unengaged: at most one re-nudge.      │
└──────────────────────────────────────────────────┘
```

### 4.7 In-App Changelog (What's New)

Hand-written, user-facing entries in `src/lib/changelog.ts`, one entry per batch of releases (`added` / `improved` / `fixed`). Every version bump updates `CHANGELOG[0]`, and `scripts/check-changelog.ts` fails the build if its version doesn't match package.json. (It used to be generated from `git log`, but Workers Builds clones shallow, so the build only ever saw one commit.)

### 4.8 Notification Bell

The bell popover lists logged notifications. Clicking one expands it in place to the full text with an "Open →" link and marks it read; closing the popover collapses it.

### 4.9 MCP Server

`mcp/` is a separate package and deployment (Vercel) that exposes `cc_*` tools — tasks, calendar, goals, brain dumps, microtasks, reference cards, moments, journal, settings, stats, rescue status — to Claude and other AI assistants. It talks to the same Neon database directly. Sign-in is OAuth with the app's Clerk production instance as the authorization server (see `mcp/README.md`). It is not deployed by a git push.

---

## 5. API Routes

Source of truth: `src/app/api/**/route.ts`. Every route except the cron routes, the iCal export feed and the snooze endpoint is behind Clerk auth.

```
/api/dump/
  POST /text  /voice/transcribe  /voice/parse  /photo/extract  /photo/parse
  POST /upload-image  /journal
  GET  /history  /:id/source-info

/api/tasks/
  GET, POST          /api/tasks
  PATCH, DELETE      /api/tasks/:id
  POST               /api/tasks/:id/chunk       → AI breakdown into steps
  POST               /api/tasks/:id/schedule    → AI schedule one task
  GET, POST          /api/tasks/:id/sessions
  PATCH, DELETE      /api/tasks/:id/sessions/:sessionId
  POST               /api/tasks/:id/sessions/:sessionId/outcome
  POST               /api/tasks/reorder

/api/plan/           POST /propose  /retry  /commit;  DELETE /api/plan
/api/recap/          GET /api/recap?date=  /sittings
/api/recommend/      POST /api/recommend  /feedback  /snooze

/api/goals/
  GET, POST          /api/goals
  GET, PATCH, DELETE /api/goals/:id
  POST               /api/goals/:id/breakdown
  POST               /api/goals/reorder

/api/calendar/
  GET, POST          /events
  PATCH, DELETE      /events/:id  /events/:id/series
  GET                /events/by-external  /canvas-courses
  POST               /sync  /export (rotate token)
  GET                /export/:token          → personal iCal feed (token auth)

/api/crisis/
  GET, POST, PUT, PATCH, DELETE /api/crisis   → list, create, reassess, progress, abandon
  GET, POST          /api/crisis/:id/chat
/api/crisis-detection/
  GET  /status   POST /dismiss   POST /engage   POST /plan

/api/microtasks/     GET, POST;  PATCH /:id;  POST, DELETE /:id/complete
/api/moments/        POST;  DELETE /:id
/api/reference-cards/ GET, POST;  PATCH, DELETE /:id;  POST /:id/check
/api/stats/momentum  GET

/api/notifications/
  GET, PATCH, PUT    /api/notifications   → bell list, mark read
  POST, DELETE       /subscribe
  POST               /snooze  (signed token, no session)  /test
  GET                /vapid-key

/api/settings        GET, PATCH
/api/onboarding      POST;  GET /status
/api/version         GET  → deployed version, for the update toast

/api/cron/           POST, QStash-signed (src/lib/cron-auth.ts)
  push-triggers  */10 * * * *
  calendar-sync  */30 * * * *
  morning-digest */15 6-16 * * *       (UTC)
  evening-digest */15 22-23,0-4 * * *  (UTC)
```

---

## 6. AI Model Strategy

| Model | Used For | Why |
|---|---|---|
| **Haiku 4.5** | Brain dump parsing, photo extraction, recommendations, scheduling, task chunking, goal breakdown, rescue plans and chat, snooze duration, push notification copy | Fast and cheap; the workhorse. Push copy has hardcoded fallbacks if a call fails |
| **Sonnet** | Morning and evening digest emails | One long-form call per user per day; quality is worth the price. Deliberate, don't downgrade |
| **Groq Whisper** | Voice transcription | Free, fast |

`@/lib/ai` loads the Anthropic SDK, so cron and background routes import it lazily at the call site (`loadAi()` in `src/lib/notifications/triggers.ts`) to keep it out of cold starts.

### Personality System
Three axes, each 0-2:
- **Supportive** (0=strict, 1=balanced, 2=supportive)
- **Formality** (0=professional, 1=friendly, 2=BFF)
- **Language** (0=clean, 1=casual, 2=unfiltered/swearing)

Composed into a personality block injected into push and digest prompts.

---

## 7. Security & Privacy

### Data Handling
- All user data stored in Neon (encrypted at rest)
- Media files (audio, photos) stored in R2
- No user location is collected or stored. Event locations are text the user (or Canvas) typed onto an event
- Brain dump content is processed by AI providers but not used for training

### Authentication
- Clerk handles all app auth (no custom password storage)
- API routes check the Clerk session and scope every query to the user
- Cron routes verify the QStash signature; the push-snooze endpoint trusts only a signed token
- Calendar export tokens are separate from auth (UUID-based, regeneratable)
- MCP server: OAuth via Clerk; user scope is per request

### AI Privacy
- Groq: audio sent for transcription only
- Anthropic: task content sent for parsing/recommendations under standard API data handling; no training on API data

---

## 8. Cost Notes

| Service | Notes |
|---|---|
| **Cloudflare Workers** | App hosting; billed on CPU time, so waiting on Neon/Anthropic is free |
| **Vercel** | MCP server only |
| **Neon** | Serverless Postgres |
| **Cloudflare R2** | Media storage, free egress |
| **Upstash QStash** | Cron schedules and exact-minute fires |
| **Clerk** | Auth |
| **Groq** | Free tier |
| **Anthropic** | Haiku for nearly everything; Sonnet for one digest per user per day |
| **Resend** | Digest emails |

The push-triggers route is the most expensive per tick (per-user AI generation), which is why it runs every 10 minutes rather than every 2 (see `scripts/sync-qstash-schedules.ts`).

---

**Document Version:** 3.0
**Last Updated:** October 2026
