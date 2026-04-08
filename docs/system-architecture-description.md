# ControlledChaos — System Architecture Description

**Version:** 2.0
**Last Updated:** April 2026

---

## 1. Architecture Overview

ControlledChaos is a Progressive Web App (PWA) built on Next.js with a serverless architecture. The system is designed around a core loop: **Capture → Parse → Recommend → Act → Learn**.

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (PWA)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Brain    │  │  Task    │  │ Calendar │             │
│  │  Dump UI  │  │  Feed    │  │  View    │             │
│  └────┬─────┘  └────▲─────┘  └────▲─────┘             │
│       │              │             │                    │
│       ▼              │             │                    │
│  ┌──────────────────────────────────────┐              │
│  │         Service Worker (PWA)         │              │
│  │  Push Notifications + Offline +      │              │
│  │  Geofence Position Tracker           │              │
│  └──────────────────┬───────────────────┘              │
└─────────────────────┼───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                 NEXT.JS API ROUTES                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  /api/    │  │  /api/    │  │  /api/    │             │
│  │  dump     │  │  tasks    │  │  calendar │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
└───────┼──────────────┼─────────────┼────────────────────┘
        │              │             │
        ▼              ▼             ▼
┌───────────────┐ ┌──────────┐ ┌──────────────┐
│  AI Layer     │ │  Neon    │ │  External    │
│  Haiku +      │ │ Postgres │ │  APIs        │
│  Sonnet +     │ │          │ │ Canvas iCal  │
│  Groq         │ │          │ │ Geolocation  │
└───────────────┘ └──────────┘ └──────────────┘
```

---

## 2. Tech Stack (Locked)

### Frontend
| Technology | Purpose | Rationale |
|---|---|---|
| **Next.js 16** (App Router) | Framework | SSR + API routes + PWA support |
| **React 19** + React Compiler | UI library | Automatic memoization, concurrent features |
| **TypeScript** | Language | Type safety, better DX, mandatory |
| **Tailwind CSS v4** | Styling | Utility-first, fast iteration, PostCSS-native |
| **shadcn/ui** | Component library | Beautiful defaults, fully customizable, accessible |
| **Framer Motion** | Animations | Subtle, purposeful micro-interactions |

### Backend / Infrastructure
| Technology | Purpose | Rationale |
|---|---|---|
| **Neon** (Serverless Postgres) | Primary database | Serverless scale-to-zero, branching for dev, Drizzle support |
| **Drizzle ORM** | Database access | Type-safe queries, migrations, lightweight |
| **Cloudflare R2** | File storage | Photos from brain dumps, audio recordings; S3-compatible, free egress |
| **Vercel** | Hosting + Cron Jobs | Seamless Next.js deploy, cron for calendar sync + notifications |

### AI Layer
| Technology | Purpose | Cost |
|---|---|---|
| **Groq API** | Speech-to-text (Whisper) | Free |
| **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) | Task parsing, recommendations, scheduling, breakdowns, auto-notes | ~$0.001–0.01/call |
| **Claude Sonnet 4.6** (`claude-sonnet-4-6`) | Push notifications, email digests, nudges (better personality/sass) | ~$0.01–0.03/call |
| **Claude Vision** (via Haiku) | Photo/OCR brain dump extraction | Bundled with Haiku call |

### Auth & Integrations
| Technology | Purpose | Rationale |
|---|---|---|
| **Clerk** | Authentication | Free tier (10K MAU), Google OAuth, drop-in Next.js |
| **Canvas iCal** | Import academic schedule | Standard iCal parsing, no auth needed (URL-based) |
| **Web Push API** | Push notifications | Native PWA, free, via service worker + VAPID |
| **Resend** | Email digests | Free tier (100 emails/day), React Email templates |
| **Leaflet + OpenStreetMap** | Location map display | Free, no API key needed |
| **Nominatim** | Address search | Free OpenStreetMap geocoding API |

---

## 3. Database Schema

### Core Tables (14 total)

```sql
-- Users (synced from Clerk)
users (
  id              TEXT PRIMARY KEY,     -- Clerk user ID
  email           TEXT NOT NULL,
  display_name    TEXT,
  timezone        TEXT DEFAULT 'America/New_York',
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP
)

-- User preferences and context
user_settings (
  id                  UUID PRIMARY KEY,
  user_id             TEXT REFERENCES users(id),
  energy_profile      JSONB,             -- {morning, afternoon, evening, night} energy levels
  saved_locations     JSONB,             -- LEGACY — use locations table instead
  notification_prefs  JSONB,             -- Push/email toggles, quiet hours, assertiveness, location notifications
  personality_prefs   JSONB,             -- AI personality: {supportive, formality, language} each 0|1|2
  canvas_ical_url     TEXT,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  wake_time           INTEGER DEFAULT 7,  -- Hour 0-23, AI scheduling window
  sleep_time          INTEGER DEFAULT 22,
  calendar_start_hour INTEGER DEFAULT 7,  -- Calendar display start
  calendar_end_hour   INTEGER DEFAULT 22,
  week_start_day      INTEGER DEFAULT 1,  -- 0=Sunday, 1=Monday
  calendar_export_token TEXT,             -- UUID for personal iCal subscribe URL
  calendar_colors     JSONB              -- Per-category event colors
)

-- Tasks (the core entity)
tasks (
  id                UUID PRIMARY KEY,
  user_id           TEXT REFERENCES users(id),
  title             TEXT NOT NULL,
  description       TEXT,
  status            TEXT DEFAULT 'pending',  -- pending, in_progress, completed, snoozed, cancelled
  priority          TEXT DEFAULT 'normal',   -- urgent, important, normal, someday
  energy_level      TEXT DEFAULT 'medium',   -- low, medium, high
  estimated_minutes INTEGER,
  category          TEXT,                    -- school, work, personal, errands, health
  location_tags     JSONB,                   -- ["Home", "Campus"] — null or [] = anywhere
  deadline          TIMESTAMP,
  scheduled_for     TIMESTAMP,
  completed_at      TIMESTAMP,
  parent_task_id    UUID REFERENCES tasks(id),
  source_dump_id    UUID REFERENCES brain_dumps(id),
  goal_id           UUID REFERENCES goals(id),
  sort_order        INTEGER,
  snoozed_until     TIMESTAMP,
  created_at        TIMESTAMP,
  updated_at        TIMESTAMP
)

-- Brain dumps (raw input before parsing)
brain_dumps (
  id            UUID PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  input_type    TEXT NOT NULL,          -- text, voice, photo
  raw_content   TEXT,
  media_url     TEXT,                   -- R2 URL for audio/photo
  parsed        BOOLEAN DEFAULT FALSE,
  ai_response   JSONB,
  created_at    TIMESTAMP
)

-- Goals
goals (
  id            UUID PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  title         TEXT NOT NULL,
  description   TEXT,
  target_date   TIMESTAMP,
  status        TEXT DEFAULT 'active',  -- active, completed, paused
  created_at    TIMESTAMP
)

-- Calendar events (unified from Canvas + manual)
calendar_events (
  id            UUID PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  source        TEXT NOT NULL,          -- canvas, controlledchaos
  external_id   TEXT,
  title         TEXT NOT NULL,
  description   TEXT,
  start_time    TIMESTAMP NOT NULL,
  end_time      TIMESTAMP NOT NULL,
  location      TEXT,
  is_all_day    BOOLEAN DEFAULT FALSE,
  category      TEXT,                   -- school, work, personal, errands, health
  series_id     TEXT,                   -- UUID linking recurring event instances
  source_dump_id UUID REFERENCES brain_dumps(id),
  synced_at     TIMESTAMP
)

-- Saved locations (geofencing)
locations (
  id            UUID PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  name          TEXT NOT NULL,
  latitude      DECIMAL(10, 8),
  longitude     DECIMAL(11, 8),
  radius_meters INTEGER DEFAULT 200,
  created_at    TIMESTAMP
)

-- User locations (last known position for geofence notifications)
user_locations (
  id                    UUID PRIMARY KEY,
  user_id               TEXT REFERENCES users(id) UNIQUE,
  latitude              DECIMAL(10, 8) NOT NULL,
  longitude             DECIMAL(11, 8) NOT NULL,
  matched_location_id   UUID REFERENCES locations(id),
  matched_location_name TEXT,
  updated_at            TIMESTAMP
)

-- Location notification log (dedup for geofence triggers)
location_notification_log (
  id            UUID PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  location_id   UUID REFERENCES locations(id),
  task_id       UUID REFERENCES tasks(id),
  event         TEXT NOT NULL,          -- "arrival" | "departure"
  created_at    TIMESTAMP
)

-- Task activity log (for AI learning)
task_activity (
  id            UUID PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  task_id       UUID REFERENCES tasks(id),
  action        TEXT NOT NULL,          -- recommended, accepted, snoozed, rejected, completed, skipped
  context       JSONB,                 -- {energy, location, time_of_day, time_available}
  created_at    TIMESTAMP
)

-- Notification log
notifications (
  id            UUID PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  type          TEXT NOT NULL,          -- push, email_morning, email_evening
  content       JSONB,
  sent_at       TIMESTAMP,
  opened_at     TIMESTAMP,
  created_at    TIMESTAMP
)

-- Crisis plans (emergency task breakdown)
crisis_plans (
  id                 UUID PRIMARY KEY,
  user_id            TEXT REFERENCES users(id),
  task_name          TEXT NOT NULL,
  deadline           TIMESTAMP NOT NULL,
  completion_pct     INTEGER NOT NULL,
  panic_level        TEXT NOT NULL,       -- fine | tight | damage-control
  panic_label        TEXT NOT NULL,
  summary            TEXT NOT NULL,
  tasks              JSONB NOT NULL,      -- CrisisTask[]
  current_task_index INTEGER DEFAULT 0,
  completed_at       TIMESTAMP,
  created_at         TIMESTAMP,
  updated_at         TIMESTAMP
)

-- Push subscriptions (one per device per user)
push_subscriptions (
  id            UUID PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  endpoint      TEXT NOT NULL,
  keys_p256dh   TEXT NOT NULL,
  keys_auth     TEXT NOT NULL,
  created_at    TIMESTAMP
)

-- Snoozed pushes (re-queue notifications for later)
snoozed_pushes (
  id            UUID PRIMARY KEY,
  user_id       TEXT REFERENCES users(id),
  payload       JSONB NOT NULL,          -- { title, body, url, tag }
  send_after    TIMESTAMP NOT NULL,
  sent_at       TIMESTAMP,
  created_at    TIMESTAMP
)
```

---

## 4. Data Flows

### 4.1 Brain Dump → Structured Tasks + Calendar Events

```
User Input (text/voice/photo)
        │
        ▼
┌─ Input Processing ─────────────────────────────┐
│                                                  │
│  TEXT: Pass directly to AI                       │
│  VOICE: Upload to R2 → Groq Whisper STT →       │
│         transcript to AI                         │
│  PHOTO: Upload to R2 → Claude Vision extraction  │
│         → extracted text to AI                   │
│                                                  │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌─ AI Parsing (Claude Haiku) ─────────────────────┐
│                                                   │
│  Context provided:                                │
│  - Current date/time + timezone                   │
│  - User's existing goals                          │
│  - User's pending tasks (dedup)                   │
│  - User's saved location names                    │
│  - Today's calendar (avoid duplicates)            │
│                                                   │
│  Output: Tasks + Calendar Events + Summary        │
│  - Tasks: title, priority, energy, category,      │
│    estimatedMinutes, locationTags, deadline        │
│  - Events: title, startTime, endTime, recurrence  │
│                                                   │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌─ Validation & Storage ──────────────────────────┐
│                                                  │
│  1. Validate ISO dates (discard hallucinations)  │
│  2. Validate goalConnection against real goals   │
│  3. Validate locationTags against saved locations│
│  4. Convert local times to UTC                   │
│  5. Expand recurring events into instances       │
│  6. Save brain_dump + tasks + events to DB       │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 4.2 Task Recommendation Engine

```
User clicks "What should I do?"
        │
        ▼
┌─ Context Gathering ─────────────────────────────┐
│                                                  │
│  1. Time of day (no full date — prevents         │
│     hallucinations)                              │
│  2. Current location (geolocation API)           │
│  3. Next calendar event + available time         │
│     (pre-computed, not derived by AI)            │
│  4. Energy profile for this time of day          │
│  5. Recent task activity (momentum/fatigue)       │
│  6. Pending tasks with pre-computed deadlineIn   │
│     ("3 hours", "OVERDUE") — no raw dates        │
│  7. Upcoming calendar grouped by TODAY/TOMORROW  │
│                                                  │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌─ AI Recommendation (Claude Haiku) ──────────────┐
│                                                   │
│  Scratchpad reasoning → JSON output               │
│  { taskId, reasoning, alternatives: [] }          │
│                                                   │
│  Anti-hallucination: all temporal values are       │
│  pre-computed server-side. AI never does date math.│
│                                                   │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌─ Presentation + Persistence ────────────────────┐
│                                                  │
│  Recommendation persisted to localStorage.       │
│  Survives page navigation and reload.            │
│  Cleared only on user action (Done/Snooze/Skip). │
│  Auto-expires after 4 hours.                     │
│                                                  │
│  [Done] [Not Now] [Something Else]               │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 4.3 Calendar Sync Flow

```
┌─ Canvas iCal ──────────────┐
│                             │
│  User provides iCal URL     │
│  Vercel cron every 15 min   │
│  Parse .ics → events        │
│  Upsert calendar_events     │
│  Timezone-aware conversion  │
│                             │
└──────────────┬──────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│          Unified Calendar View               │
│   Canvas + manual events in one place        │
│   Events colored by category                 │
│   AI identifies free time blocks             │
│   AI schedules tasks into gaps               │
│   Recurring event expansion (daily/weekly)   │
│   Personal iCal export/subscribe URL         │
└──────────────────────────────────────────────┘
```

### 4.4 Notification System

```
┌─ Push Notifications (Sonnet-powered) ───────────┐
│                                                  │
│  Service Worker registered on PWA install         │
│  Vercel cron (every 15 min) evaluates triggers:   │
│  - Deadline warnings (24h, 2h, 30min)            │
│  - Scheduled task start time                     │
│  - Missed scheduled tasks (20-120min overdue)    │
│  - Morning idle check-in (11am)                  │
│  - Afternoon idle check-in (3pm)                 │
│  - Evening check-in (7pm)                        │
│  - Inactivity nudges (72h/96h/120h tiers)        │
│                                                  │
│  Assertiveness modes: gentle / balanced / assertive│
│  Daily push caps: 4 / 6 / 8 per mode            │
│  Quiet hours respected (configurable)            │
│  Snooze with AI-determined duration              │
│                                                  │
│  Web Push API → Service Worker → Notification    │
│                                                  │
└──────────────────────────────────────────────────┘

┌─ Location-Aware Notifications ──────────────────┐
│                                                  │
│  Foreground geofence tracker (watchPosition)     │
│  Client reports position on 100m movement        │
│  Server detects geofence entry/exit:             │
│  - Arrival: tasks matching this location → push  │
│  - Departure: nearby locations with tasks → push │
│  Hysteresis buffer (radius × 1.25) prevents      │
│  GPS bounce. 2-hour dedup cooldown per location. │
│                                                  │
└──────────────────────────────────────────────────┘

┌─ Email Digests (Sonnet-powered) ────────────────┐
│                                                  │
│  Morning (configurable, default 7:30 AM):        │
│  - Today's calendar events                       │
│  - AI-prioritized task list                      │
│  - Encouraging note (personality-aware)          │
│                                                  │
│  Evening (configurable, default 9:00 PM):        │
│  - Tasks completed today (celebration!)          │
│  - Tomorrow's top priority                       │
│  - Warm wrap-up (personality-aware)              │
│                                                  │
│  Sent via Resend + React Email templates         │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 4.5 Crisis Mode

```
User has a deadline and is behind
        │
        ▼
┌─ Crisis Assessment ─────────────────────────────┐
│                                                  │
│  Input: task name, deadline, completion %,        │
│  time remaining, upcoming events (interruptions)  │
│  Optional: file attachments (rubrics, assignment  │
│  instructions — sent to AI as images/PDFs)        │
│                                                  │
│  AI assesses panic level:                         │
│  - fine: ample time, high completion              │
│  - tight: feasible with focused work              │
│  - damage-control: mathematically can't finish    │
│                                                  │
│  Output: 5-8 concrete micro-tasks (≤30 min each) │
│  Each with: title, instruction, stuckHint         │
│  All tasks must sum to ≤ minutes until deadline   │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 5. API Routes

```
/api/auth/               → Clerk webhooks (user sync)

/api/dump/
  POST /api/dump/text           → Parse text brain dump
  POST /api/dump/voice/transcribe → Upload audio → Groq STT
  POST /api/dump/voice/parse    → Parse voice transcript
  POST /api/dump/photo/extract  → Claude Vision text extraction
  POST /api/dump/photo/parse    → Parse extracted photo text
  GET  /api/dump/history        → Brain dump history

/api/tasks/
  GET    /api/tasks             → List user's tasks (filterable)
  POST   /api/tasks             → Create task (+ auto AI note)
  PATCH  /api/tasks/:id         → Update task
  DELETE /api/tasks/:id         → Delete task
  POST   /api/tasks/:id/breakdown → AI task breakdown (subtasks)
  POST   /api/tasks/:id/schedule  → AI schedule single task

/api/recommend/
  POST /api/recommend           → Get AI task recommendation
  POST /api/recommend/feedback  → Log accept/snooze/reject
  POST /api/recommend/snooze    → AI-determined snooze duration

/api/calendar/
  GET  /api/calendar/events     → Unified calendar view
  POST /api/calendar/events     → Create manual event (+ auto AI note, + recurrence)
  PATCH /api/calendar/events/:id → Update event
  DELETE /api/calendar/events/:id → Delete event
  PATCH /api/calendar/events/:id/series → Update/delete event series
  POST /api/calendar/sync       → Trigger Canvas iCal sync
  POST /api/calendar/schedule   → AI batch schedule tasks
  GET  /api/calendar/export/:token → Personal iCal subscription feed

/api/locations/
  GET    /api/locations         → List saved locations
  POST   /api/locations         → Create saved location
  PATCH  /api/locations/:id     → Update location
  DELETE /api/locations/:id     → Delete location

/api/location/
  POST /api/location/update     → Report position (geofence detection + notifications)

/api/crisis/
  POST   /api/crisis            → Generate crisis plan
  GET    /api/crisis            → List user's crisis plans
  PATCH  /api/crisis/:id        → Update crisis plan progress
  DELETE /api/crisis/:id        → Delete crisis plan

/api/notifications/
  POST   /api/notifications/subscribe    → Register push subscription
  DELETE /api/notifications/subscribe    → Unsubscribe
  POST   /api/notifications/snooze       → Snooze a notification (re-queue)
  POST   /api/notifications/test         → Send test notification
  GET    /api/notifications              → List notifications (for bell)
  PATCH  /api/notifications/read         → Mark notifications as read

/api/settings/
  GET  /api/settings            → Get all user settings
  PATCH /api/settings           → Update settings (partial)

/api/onboarding/
  POST /api/onboarding          → Save onboarding data
  GET  /api/onboarding/status   → Check onboarding completion

/api/cron/
  GET /api/cron/push-triggers   → Evaluate all push notification triggers
  GET /api/cron/morning-digest  → Send morning email digests
  GET /api/cron/evening-digest  → Send evening email digests
  GET /api/cron/calendar-sync   → Auto-sync Canvas calendars
```

---

## 6. AI Model Strategy

| Model | Used For | Why |
|---|---|---|
| **Haiku** (`claude-haiku-4-5-20251001`) | Brain dump parsing, task recommendations, scheduling, task breakdown, crisis mode, auto-notes, snooze duration | Fast, cheap — the workhorse for structured output |
| **Sonnet** (`claude-sonnet-4-6`) | Push notifications, email digests, inactivity nudges | Better personality, sass, and natural language. Handles the unfiltered/BFF language setting well |
| **Groq Whisper** | Voice brain dump transcription | Free, fast, handles accents well |
| **Claude Vision** (via Haiku) | Photo brain dump text extraction | Reads handwriting, sticky notes, screenshots |

### Personality System
Three axes, each 0-2:
- **Supportive** (0=strict, 1=balanced, 2=supportive)
- **Formality** (0=professional, 1=friendly, 2=BFF)
- **Language** (0=clean, 1=casual, 2=unfiltered/swearing)

Composed into a personality block injected into every Sonnet notification call.

---

## 7. Security & Privacy

### Data Handling
- All user data stored in Neon (encrypted at rest)
- Media files (audio, photos) stored in R2 (private buckets, signed URLs)
- Brain dump content processed by AI but not stored by AI providers
- User location data stays in the app — never shared with third parties
- Location tracking only when app is open (foreground only, no background GPS)

### Authentication
- Clerk handles all auth (no custom password storage)
- API routes protected by Clerk middleware
- Row-level access control: users can only access their own data
- Calendar export tokens are separate from auth (UUID-based, regeneratable)

### AI Privacy
- Groq: Audio sent for transcription only, not stored
- Claude: Task content sent for parsing/recommendations, Anthropic's standard data handling applies
- No user data used for model training (Anthropic API policy)

---

## 8. Cost Projections (Monthly)

| Service | Free Tier | Estimated Cost |
|---|---|---|
| **Vercel** | Hobby (free) | $0 (MVP) |
| **Neon** | Free tier (0.5 GB) | $0 (MVP) |
| **Cloudflare R2** | 10 GB free | $0 (MVP) |
| **Clerk** | 10K MAU free | $0 (MVP) |
| **Groq** | Free tier | $0 |
| **Claude Haiku** | Pay per use | ~$1–3/month |
| **Claude Sonnet** | Pay per use | ~$1–3/month (notifications are tiny outputs) |
| **Resend** | 100 emails/day free | $0 (MVP) |
| **Total** | | **$2–6/month** |

---

**Document Version:** 2.0
**Last Updated:** April 2026
