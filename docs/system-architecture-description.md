# ControlledChaos — System Architecture Description

**Version:** 1.0
**Last Updated:** February 2026

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
│  │    Push Notifications + Offline      │              │
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
│  Groq + Haiku │ │ Postgres │ │  APIs        │
└───────────────┘ └──────────┘ │ Google Cal   │
                               │ Canvas iCal  │
                               │ Geolocation  │
                               └──────────────┘
```

---

## 2. Tech Stack (Locked)

### Frontend
| Technology | Purpose | Rationale |
|---|---|---|
| **Next.js 15** (App Router) | Framework | Already know it from ChaosLimbă; SSR + API routes + PWA support |
| **TypeScript** | Language | Type safety, better DX, mandatory |
| **Tailwind CSS** | Styling | Utility-first, fast iteration, consistent design |
| **shadcn/ui** | Component library | Beautiful defaults, fully customizable, accessible |
| **next-pwa** | PWA support | Service worker, offline, push notifications |
| **Framer Motion** | Animations | Subtle, purposeful micro-interactions |

### Backend / Infrastructure
| Technology | Purpose | Rationale |
|---|---|---|
| **Neon** (Serverless Postgres) | Primary database | Serverless scale-to-zero, branching for dev, Drizzle support |
| **Drizzle ORM** | Database access | Type-safe queries, migrations, lightweight |
| **Cloudflare R2** | File storage | Photos from brain dumps, audio recordings; S3-compatible, free egress |
| **Vercel** | Hosting + Edge Functions | Seamless Next.js deploy, edge runtime, cron jobs |

### AI Layer
| Technology | Purpose | Cost |
|---|---|---|
| **Groq API** | Speech-to-text (Whisper) | Free |
| **Claude Haiku 4.5** | Task parsing, recommendations, scheduling intelligence | ~$0.001–0.01/call |
| **Tesseract.js** or **Claude Vision** | Photo/OCR brain dump parsing | Free (Tesseract) or bundled with Haiku call |

### Auth & Integrations
| Technology | Purpose | Rationale |
|---|---|---|
| **Clerk** | Authentication | Free tier (10K MAU), Google OAuth (needed for GCal), drop-in Next.js |
| **Google Calendar API** | Read/write calendar events | OAuth via Clerk, full scheduling integration |
| **Canvas iCal** | Import academic schedule | Standard iCal parsing, no auth needed (URL-based) |
| **Web Push API** | Push notifications | Native PWA, free, via service worker |
| **Resend** | Email digests | Free tier (100 emails/day), React Email templates |

---

## 3. Database Schema

### Core Tables

```sql
-- Users (synced from Clerk)
users (
  id              TEXT PRIMARY KEY,     -- Clerk user ID
  email           TEXT NOT NULL,
  display_name    TEXT,
  timezone        TEXT DEFAULT 'America/New_York',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
)

-- User preferences and context
user_settings (
  id              UUID PRIMARY KEY,
  user_id         TEXT REFERENCES users(id),
  energy_profile  JSONB,               -- Typical energy patterns by time of day
  saved_locations  JSONB,              -- Array of {name, lat, lng, radius}
  notification_prefs JSONB,            -- Push/email toggles, quiet hours
  canvas_ical_url TEXT,                -- Canvas calendar feed URL
  google_cal_connected BOOLEAN DEFAULT FALSE,
  onboarding_complete BOOLEAN DEFAULT FALSE
)

-- Tasks (the core entity)
tasks (
  id              UUID PRIMARY KEY,
  user_id         TEXT REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT DEFAULT 'pending',  -- pending, in_progress, completed, snoozed, cancelled
  priority        TEXT DEFAULT 'normal',   -- urgent, important, normal, someday
  energy_level    TEXT DEFAULT 'medium',   -- low, medium, high
  estimated_minutes INTEGER,
  category        TEXT,                    -- school, work, personal, errands, health
  location_tag    TEXT,                    -- home, campus, work, anywhere
  deadline        TIMESTAMP,
  scheduled_for   TIMESTAMP,              -- When AI scheduled this
  completed_at    TIMESTAMP,
  parent_task_id  UUID REFERENCES tasks(id),  -- For subtasks
  source_dump_id  UUID REFERENCES brain_dumps(id),
  goal_id         UUID REFERENCES goals(id),
  sort_order      INTEGER,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
)

-- Brain dumps (raw input before parsing)
brain_dumps (
  id              UUID PRIMARY KEY,
  user_id         TEXT REFERENCES users(id),
  input_type      TEXT NOT NULL,          -- text, voice, photo
  raw_content     TEXT,                   -- Text content or STT transcript
  media_url       TEXT,                   -- R2 URL for audio/photo
  parsed          BOOLEAN DEFAULT FALSE,
  ai_response     JSONB,                 -- Full AI parsing response
  created_at      TIMESTAMP DEFAULT NOW()
)

-- Goals (what tasks connect to)
goals (
  id              UUID PRIMARY KEY,
  user_id         TEXT REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT,
  target_date     TIMESTAMP,
  status          TEXT DEFAULT 'active',  -- active, completed, paused
  created_at      TIMESTAMP DEFAULT NOW()
)

-- Calendar events (unified from Canvas + Google)
calendar_events (
  id              UUID PRIMARY KEY,
  user_id         TEXT REFERENCES users(id),
  source          TEXT NOT NULL,          -- canvas, google, controlledchaos
  external_id     TEXT,                   -- Google Calendar event ID
  title           TEXT NOT NULL,
  description     TEXT,
  start_time      TIMESTAMP NOT NULL,
  end_time        TIMESTAMP NOT NULL,
  location        TEXT,
  is_all_day      BOOLEAN DEFAULT FALSE,
  synced_at       TIMESTAMP DEFAULT NOW()
)

-- Saved locations
locations (
  id              UUID PRIMARY KEY,
  user_id         TEXT REFERENCES users(id),
  name            TEXT NOT NULL,          -- "Home", "Georgetown Campus", "American Eagle"
  latitude        DECIMAL(10, 8),
  longitude       DECIMAL(11, 8),
  radius_meters   INTEGER DEFAULT 200,   -- Geofence radius
  created_at      TIMESTAMP DEFAULT NOW()
)

-- Task activity log (for AI learning)
task_activity (
  id              UUID PRIMARY KEY,
  user_id         TEXT REFERENCES users(id),
  task_id         UUID REFERENCES tasks(id),
  action          TEXT NOT NULL,          -- recommended, accepted, snoozed, rejected, completed, skipped
  context         JSONB,                 -- {energy, location, time_of_day, time_available}
  created_at      TIMESTAMP DEFAULT NOW()
)

-- Notification log
notifications (
  id              UUID PRIMARY KEY,
  user_id         TEXT REFERENCES users(id),
  type            TEXT NOT NULL,          -- push, email_morning, email_evening
  content         JSONB,
  sent_at         TIMESTAMP,
  opened_at       TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
)
```

### Key Indexes
```sql
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_user_deadline ON tasks(user_id, deadline);
CREATE INDEX idx_tasks_user_scheduled ON tasks(user_id, scheduled_for);
CREATE INDEX idx_brain_dumps_user ON brain_dumps(user_id, created_at DESC);
CREATE INDEX idx_calendar_events_user_time ON calendar_events(user_id, start_time);
CREATE INDEX idx_task_activity_user ON task_activity(user_id, created_at DESC);
```

---

## 4. Data Flows

### 4.1 Brain Dump → Structured Tasks

```
User Input (text/voice/photo)
        │
        ▼
┌─ Input Processing ─────────────────────────────┐
│                                                  │
│  TEXT: Pass directly to AI                       │
│  VOICE: Upload to R2 → Groq Whisper STT →       │
│         transcript to AI                         │
│  PHOTO: Upload to R2 → Claude Vision or          │
│         Tesseract.js OCR → extracted text to AI  │
│                                                  │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌─ AI Parsing (Claude Haiku 4.5) ─────────────────┐
│                                                   │
│  System prompt: "You are a task extraction AI     │
│  for an ADHD user. Parse this brain dump into     │
│  structured tasks. Be generous in interpretation  │
│  — messy input is expected."                      │
│                                                   │
│  Input: Raw text/transcript                       │
│  + User's existing goals (context)                │
│  + User's saved locations (context)               │
│  + Current calendar events (context)              │
│                                                   │
│  Output: JSON array of tasks with all fields      │
│                                                   │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌─ Storage & Feedback ────────────────────────────┐
│                                                  │
│  1. Save brain_dump record with ai_response      │
│  2. Create task records from parsed output        │
│  3. Return structured tasks to UI                 │
│  4. User can edit/adjust (optional)               │
│  5. AI schedules tasks on calendar                │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 4.2 Task Recommendation Engine

```
User Opens App / Notification Fires
        │
        ▼
┌─ Context Gathering ─────────────────────────────┐
│                                                  │
│  1. Current time + timezone                      │
│  2. Current location (geolocation API)           │
│  3. Next calendar event (time available)          │
│  4. User's energy profile for this time of day   │
│  5. Recent task activity (momentum/fatigue)       │
│  6. Pending tasks sorted by priority + deadline   │
│                                                  │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌─ AI Recommendation (Claude Haiku 4.5) ──────────┐
│                                                   │
│  System prompt: "Recommend the single best task   │
│  for this user right now. Consider energy, time,  │
│  location, priority, deadlines, and momentum.     │
│  Explain your reasoning in one sentence."         │
│                                                   │
│  Input: Context bundle + task list                │
│  Output: { taskId, reasoning, alternatives: [] }  │
│                                                   │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌─ Presentation ──────────────────────────────────┐
│                                                  │
│  "Do this next: [Task Title]"                    │
│  "Why: You have 45 min before class, you're at   │
│   campus, and this Bio reading is due tomorrow."  │
│                                                  │
│  [Start] [Not Now] [Something Else]              │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 4.3 Calendar Sync Flow

```
┌─ Canvas iCal ──────────────┐     ┌─ Google Calendar ──────────┐
│                             │     │                             │
│  User provides iCal URL     │     │  OAuth via Clerk            │
│  Vercel cron fetches daily   │     │  API read: existing events  │
│  Parse .ics → events        │     │  API write: AI-scheduled    │
│  Upsert calendar_events     │     │  time blocks                │
│                             │     │                             │
└──────────────┬──────────────┘     └──────────────┬──────────────┘
               │                                    │
               ▼                                    ▼
        ┌──────────────────────────────────────────────┐
        │          Unified Calendar View               │
        │   All events from all sources in one place   │
        │   AI identifies free time blocks             │
        │   AI schedules tasks into gaps               │
        └──────────────────────────────────────────────┘
```

### 4.4 Notification System

```
┌─ Push Notifications ────────────────────────────┐
│                                                  │
│  Service Worker registered on PWA install         │
│  Vercel cron job evaluates triggers:              │
│  - Upcoming deadline (24h, 2h, 30min)            │
│  - Scheduled task start time                     │
│  - Location-based opportunity                    │
│  - Idle reminder ("Haven't checked in today")    │
│                                                  │
│  Web Push API → Service Worker → Notification    │
│                                                  │
└──────────────────────────────────────────────────┘

┌─ Email Digests ─────────────────────────────────┐
│                                                  │
│  Morning (configurable, default 7:30 AM):        │
│  - Today's calendar events                       │
│  - AI-prioritized task list for the day          │
│  - Upcoming deadlines this week                  │
│  - Encouraging note                              │
│                                                  │
│  Evening (configurable, default 9:00 PM):        │
│  - Tasks completed today (celebration!)          │
│  - What shifts to tomorrow                       │
│  - Brief reflection prompt                       │
│  - Tomorrow's first priority                     │
│                                                  │
│  Sent via Resend + React Email templates         │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 5. API Routes

```
/api/auth/              → Clerk webhooks (user sync)

/api/dump/
  POST /api/dump/text   → Parse text brain dump
  POST /api/dump/voice  → Upload audio → STT → parse
  POST /api/dump/photo  → Upload photo → OCR → parse

/api/tasks/
  GET  /api/tasks       → List user's tasks (filterable)
  POST /api/tasks       → Create task manually
  PATCH /api/tasks/:id  → Update task (status, details)
  DELETE /api/tasks/:id → Delete task

/api/recommend/
  GET /api/recommend    → Get AI task recommendation (with context)
  POST /api/recommend/feedback → Log accept/snooze/reject

/api/calendar/
  GET  /api/calendar/events    → Unified calendar view
  POST /api/calendar/sync      → Trigger Canvas iCal sync
  POST /api/calendar/schedule  → AI schedules tasks on GCal

/api/locations/
  GET  /api/locations          → List saved locations
  POST /api/locations          → Save new location
  POST /api/locations/detect   → Detect current location → match

/api/notifications/
  POST /api/notifications/subscribe   → Register push subscription
  POST /api/notifications/send        → Trigger notification

/api/goals/
  GET  /api/goals       → List user's goals
  POST /api/goals       → Create goal
  PATCH /api/goals/:id  → Update goal
```

---

## 6. File Structure

```
controlledchaos/
├── CLAUDE.md                          # Claude Code operating instructions
├── README.md
├── docs/
│   ├── vision-and-development-guide.md
│   ├── system-architecture-description.md
│   ├── development-timeline.md
│   └── theoretical-framework.md       # Cognitive science foundations
├── public/
│   ├── manifest.json                  # PWA manifest
│   ├── sw.js                          # Service worker
│   └── icons/                         # PWA icons
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout with Clerk provider
│   │   ├── page.tsx                   # Landing / marketing page
│   │   ├── (auth)/
│   │   │   ├── sign-in/
│   │   │   └── sign-up/
│   │   ├── (app)/                     # Authenticated app routes
│   │   │   ├── layout.tsx             # App shell (sidebar, nav)
│   │   │   ├── dashboard/             # Main view — recommendation + task feed
│   │   │   ├── dump/                  # Brain dump interface
│   │   │   ├── tasks/                 # Full task list / management
│   │   │   ├── calendar/              # Calendar view
│   │   │   └── settings/              # Preferences, locations, integrations
│   │   └── api/                       # API routes (see Section 5)
│   ├── components/
│   │   ├── ui/                        # shadcn/ui components
│   │   ├── features/
│   │   │   ├── brain-dump/            # Dump input components
│   │   │   ├── task-feed/             # Task list and cards
│   │   │   ├── recommendation/        # AI recommendation display
│   │   │   ├── calendar/              # Calendar components
│   │   │   └── notifications/         # Notification UI
│   │   └── layout/                    # Shell, sidebar, nav components
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── parse-dump.ts          # Brain dump → structured tasks
│   │   │   ├── recommend.ts           # Task recommendation engine
│   │   │   ├── schedule.ts            # AI scheduling logic
│   │   │   └── prompts.ts             # System prompts (centralized)
│   │   ├── db/
│   │   │   ├── schema.ts              # Drizzle schema
│   │   │   ├── queries.ts             # Reusable query functions
│   │   │   └── index.ts               # DB connection
│   │   ├── calendar/
│   │   │   ├── ical-parser.ts         # Canvas iCal parsing
│   │   │   └── google-calendar.ts     # Google Calendar API wrapper
│   │   ├── notifications/
│   │   │   ├── push.ts                # Web Push utilities
│   │   │   └── email.ts               # Resend email digest functions
│   │   ├── location/
│   │   │   └── geolocation.ts         # Location detection + matching
│   │   └── utils.ts
│   ├── hooks/                         # Custom React hooks
│   └── types/                         # Shared TypeScript types
├── drizzle/                           # Migrations
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 7. Security & Privacy

### Data Handling
- All user data stored in Neon (encrypted at rest)
- Media files (audio, photos) stored in R2 (private buckets, signed URLs)
- Brain dump content is processed by AI but not stored by AI providers
- User location data stays in the app — never shared with third parties

### Authentication
- Clerk handles all auth (no custom password storage)
- Google OAuth scopes limited to calendar read/write only
- API routes protected by Clerk middleware
- Row-level access control: users can only access their own data

### AI Privacy
- Groq: Audio sent for transcription only, not stored
- Claude Haiku: Task content sent for parsing, Anthropic's standard data handling applies
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
| **Claude Haiku 4.5** | Pay per use | ~$1–5/month (depending on usage) |
| **Resend** | 100 emails/day free | $0 (MVP) |
| **Total** | | **$1–5/month** |

---

**Document Version:** 1.0
**Last Updated:** February 2026
