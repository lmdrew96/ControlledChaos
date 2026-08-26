# ControlledChaos — Full Feature/Route Inventory

**Generated:** 2026-08-04 · **Commits analyzed:** 370 (since 2026-02-12, ~6 months) · **Version:** 2.10.1

**Method note:** Churn = commit count touching that directory (`git log -- <path>`). There is **no analytics/telemetry in this codebase** (checked — nothing beyond the word "analytics" in the privacy policy copy). Every "usage signal" below is inferred from nav placement, schema foreign keys, and cross-component imports, not real user data. Treat usage claims as *educated guesses*, not measurements.

---

## 1. API Routes (66 total, grouped by feature)

### Tasks (4 routes) — churn: 23 commits
- `POST/GET /api/tasks` — list/create tasks
- `GET/PATCH/DELETE /api/tasks/[id]` — single task CRUD
- `PATCH /api/tasks/reorder` — drag-and-drop reorder (batched Neon transaction)
- `POST /api/tasks/[id]/chunk` — AI-powered "chunk it" step breakdown
- `POST /api/tasks/[id]/schedule` — AI schedule suggestion for a task

### Calendar (9 routes) — churn: 30 commits
- `GET/POST /api/calendar/events` — list/create events
- `GET/PATCH/DELETE /api/calendar/events/[id]` — single event CRUD
- `PATCH/DELETE /api/calendar/events/[id]/series` — recurring series edits
- `GET /api/calendar/events/by-external` — lookup by Canvas iCal UID (dedup on sync)
- `GET /api/calendar/export` — generate personal iCal export link
- `GET /api/calendar/export/[token]` — public iCal feed (subscribe-from-other-calendar-app)
- `POST /api/calendar/schedule` — AI "schedule my day" suggestions
- `DELETE /api/calendar/schedule/clear` — clear AI-suggested schedule
- `POST /api/calendar/sync` — manual Canvas iCal re-sync trigger

### Brain Dump / Journal (9 routes) — churn: 19 commits
- `POST /api/dump/text` — parse typed brain dump into tasks/events (AI)
- `POST /api/dump/voice/transcribe` — Groq Whisper audio → text
- `POST /api/dump/voice/parse` — parse transcribed voice dump (AI)
- `POST /api/dump/photo/extract` — OCR/extract text from photo
- `POST /api/dump/photo/parse` — parse photo-extracted text (AI)
- `POST /api/dump/upload-image` — upload dump photo to R2
- `GET /api/dump/history` — list past dumps
- `GET/POST /api/dump/journal` — free-write journal entries
- `GET /api/dump/[id]/source-info` — provenance metadata for a dump-derived item

### Goals (2 routes) — churn: 1 commit
- `GET/POST /api/goals` — list/create goals
- `GET/PATCH/DELETE /api/goals/[id]` — single goal CRUD

### Microtasks (3 routes) — churn: 1 commit
- `GET/POST /api/microtasks` — list/create recurring micro-checklist items
- `PATCH/DELETE /api/microtasks/[id]` — edit/delete
- `POST /api/microtasks/[id]/complete` — mark today's occurrence done

### Momentum / Stats (1 route) — churn: 3 commits
- `GET /api/stats/momentum` — daily momentum score aggregation

### Recommendation Engine "Do This Next" (3 routes) — churn: 23 commits
- `GET /api/recommend` — AI-ranked "what to do next" suggestion
- `POST /api/recommend/feedback` — thumbs up/down on a suggestion
- `POST /api/recommend/snooze` — dismiss/snooze a suggestion

### Moments (2 routes) — churn: 1 commit
- `GET/POST /api/moments` — log a behavioral-state "moment" (mood/energy tag)
- `PATCH/DELETE /api/moments/[id]` — edit/delete a moment

### Daily Recap (1 route) — churn: 1 commit
- `GET /api/recap` — assemble the day's recap (tasks done, moments, momentum)

### Crisis Support (4 routes across 2 subsystems) — churn: 16 + 2 commits
- `GET/POST /api/crisis` — crisis-mode session log
- `POST /api/crisis/[id]/chat` — interactive AI crisis chat (Sonnet)
- `GET /api/crisis-detection/status` — is auto-crisis-detection currently flagging the user
- *(auto-detection logic lives in `src/lib/crisis-detection/`, triggered from the push-triggers cron, not its own route)*

### Notifications (5 routes) — churn: 13 commits
- `GET/PATCH /api/notifications` — notification preferences
- `POST /api/notifications/snooze` — snooze notifications for a window
- `POST /api/notifications/subscribe` — register push subscription
- `POST /api/notifications/test` — send a test push
- `GET /api/notifications/vapid-key` — public VAPID key for client subscription

### Medications (4 routes) — churn: 1 commit
- `GET/POST /api/medications` — list/create medication reminders
- `GET/PATCH/DELETE /api/medications/[id]` — single medication CRUD
- `GET /api/medications/[id]/adherence` — adherence history for one medication
- `POST /api/medications/taken` — log a dose taken

### Location (6 routes across 2 subsystems) — churn: 2 + 4 commits
- `POST /api/location/update` — live GPS ping (geofence tracking)
- `GET/POST /api/locations` — saved places (home/work/class) CRUD
- `GET/PATCH/DELETE /api/locations/[id]` — single saved location CRUD
- `GET /api/locations/commute-times` — saved commute-time estimates
- `POST /api/locations/commute-times/estimate` — compute a new commute estimate

### Friends & Parallel Play (7 routes) — churn: 2 + 3 commits
- `GET/POST /api/friends` — list/send friend requests
- `PATCH/DELETE /api/friends/[friendshipId]` — accept/decline/remove
- `POST /api/friends/nudge` — send category-based motivational nudge to a friend
- `GET/POST /api/rooms` — list/create parallel-play rooms
- `POST /api/rooms/join` — join a room by code
- `POST /api/rooms/[id]/leave` — leave a room
- `GET /api/rooms/friends` — browse friends' rooms
- *(live presence/sync itself runs through Convex, not these REST routes — see §5)*

### Settings & Onboarding (3 routes) — churn: 18 + 6 commits
- `GET/PATCH /api/settings` — user preferences (quiet hours, timezone, digest opt-in, etc.)
- `POST /api/onboarding` — submit onboarding answers
- `GET /api/onboarding/status` — has this user completed onboarding

### Cron (4 routes) — churn: 37 commits
- `GET /api/cron/calendar-sync` — re-sync all Canvas iCal feeds (every 15 min)
- `GET /api/cron/morning-digest` — send morning digest email/push
- `GET /api/cron/evening-digest` — send evening digest email/push
- `GET /api/cron/push-triggers` — the big one: idle check-ins, medication reminders, crisis-detection sweep, event/deadline reminders, geofence notifications, friend nudges

---

## 2. Pages (19 total, grouped by feature)

### Core loop
- `/dashboard` — home screen: TaskList, DoThisNext, DailyMomentum, ScheduleMyDay, TimeAnchor, Greeting, MicrotasksZone, MomentsBar — churn: 10
- `/tasks` — full task list/board — churn: 3
- `/dump` — brain dump (text/voice/photo input) + history — churn: 9

### Calendar & scheduling
- `/calendar` — churn: 9
- `/goals` — churn: 1
- `/microtasks` — churn: 1 (though the feature lives partly inline on dashboard too)

### Reflection
- `/journal` — free-write journal (separate from `/dump`, shares `journal-compose` component) — churn: 2
- `/recap` — Daily Recap (renamed from "Mirror" per commit `95cddeb`) — churn: 1
- `/momentum` — standalone momentum/stats view — churn: 9 (desktop nav only, not in mobile bottom nav)

### Crisis
- `/crisis` — churn: 9

### Social
- `/friends` — friends list + parallel play room management — churn: 1
- `/join/[code]` — public room-join landing page — churn: 2 (top-level route, outside `(app)`)

### Account
- `/settings` — tabs: general, medications, saved locations, commute times, crisis-detection explainer, notifications — churn: 11
- `/onboarding` — churn: 6

### Auth/legal/marketing
- `/` (landing page)
- `/sign-in`, `/sign-up` (Clerk)
- `/privacy`, `/terms`

---

## 3. Feature Area Deep-Dive

| Feature | Churn signal | Read | Dependents | Usage signal |
|---|---|---|---|---|
| **Tasks** | 23 commits, steady, feature-additive (chunking, scheduling) | Actively loved | Anchor for Goals (FK), Calendar (scheduled tasks), Recap, Recommend, Momentum | Nav item #1, dashboard-embedded → assume core |
| **Calendar** | 30 commits, steady across 6 months | Actively loved | Canvas sync feeds Tasks (via AI parse), Location (commute times), Notifications | Nav item, dashboard TimeAnchor |
| **Cron** | 37 commits — highest churn in the repo | **Fighting me.** This is the connective tissue for digests, crisis sweeps, medication reminders, geofencing, and nudges all in one handler. High churn here reads as "one route doing too much, needs babysitting every time a notification type is added" | Everything notification-shaped depends on it | No visibility into whether it's ever silently failing — no analytics |
| **AI (`lib/ai`)** | 83 commits — 2nd highest in the repo | Mixed. Some is "actively loved" (chunking, scheduling, crisis chat — real feature growth). A chunk is tuning/prompt-fiddling (haiku vs sonnet swaps, "tighten prompts to one sentence") which reads as **fighting a fuzzy problem** (getting AI tone/cost right), not a design fight | Powers Tasks, Calendar, Dump, Crisis, Notifications, Recommend — this is the most load-bearing subsystem in the app | No AI-quality telemetry (no thumbs-up/down aggregation reporting anywhere except Recommend feedback, which nothing reads back) |
| **DB (`lib/db`)** | 91 commits — highest in the repo, but this is expected: every feature's queries live here. Notably includes a self-correcting commit (`dc595d3`: split a 3103-line queries.ts into per-domain modules) | Healthy churn — grows with every feature, not evidence of thrash | Everything | N/A (infra) |
| **Notifications (`lib/notifications` + routes)** | 46 (lib) + 13 (routes) = 59 commits | **Fighting me, historically.** Long commit trail of "move evening check-in to 6:00pm... 6:30pm... 7:00pm", "collapse triple idle check-in into one window" — visible iteration toward getting notification *timing* right, now looks converged (auto-heal fix v2.10.1 is defensive polish, not thrash) | Depends on Settings (quiet hours), Location (geofence), Crisis-detection | Push subscription table exists but no delivery/open-rate tracking |
| **Brain Dump** | 19 commits | Actively loved — 3 input modalities (text/voice/photo) all still receiving fixes | Feeds Tasks, Calendar, Journal | Nav item #2 |
| **Recommend ("Do This Next")** | 23 commits | Actively loved, still iterating (room-awareness added for parallel play) | Reads Tasks; feedback/snooze write back but nothing reads the feedback signal anywhere (grepped — `do_this_next` feedback events aren't queried by any report or the AI prompt itself) | **Candidate for "orphaned feedback loop"** — see §5 |
| **Moments** | 1 commit (recent) | New feature, low churn because it's young, not because it's stable — it **replaced** an "energy profile" system (`9585efc: add behavioral state logging + retire energy profile`) | Recap reads moments directly; crisis-detection does not currently read moments (checked — no reference) | Rendered as a persistent bar in `app-shell.tsx` on every page — high visual weight for a 1-commit-old feature |
| **Goals** | 1 commit | Shipped once, essentially untouched since | Tasks have an optional `goalId` FK — so goals *can* anchor tasks, but nothing enforces or surfaces that relationship prominently (no "which goal is this task for" prompt in dump/AI parsing that I found) | Nav item, but read as **half-connected**: the FK exists, the UI to exploit it doesn't appear built out |
| **Microtasks** | 1 commit | Shipped once (`9994fd1: add daily prompts with chip zone + manage view`), stable since | **No FK to tasks table** — fully standalone recurring-checklist system, separate from Tasks entirely despite the name suggesting "sub-tasks" | Embedded on dashboard (`MicrotasksZone`) + own page — real estate suggests intended as core, but zero iteration since launch is odd for something meant to be central |
| **Crisis + Crisis-detection** | 16 + 2 = 18 commits | Actively loved, most recent major feature (`2a4feda: auto-crisis detection with tiered Watch/Nudge/Auto-Triage`) | Depends on push-triggers cron, AI | Standalone nav item + persistent badge in nav (`showCrisisBadge`) — high visibility |
| **Medications** | 1 (route) + 1 (lib, via db) commit, but the *feature* commit (`ab545ab`) bundled reminders + push + adherence tracking in one shot | Shipped complete in one pass (v2.1.x era), untouched since except a small bundling fix (`d32a1e5`) | Lives entirely inside Settings tabs — **no dedicated page, no nav item** | Buried 2 tab-clicks deep; command palette has an entry, which is the only other discovery path |
| **Location/Geofencing** | 2 + 4 = 6 commits | Stable, low-churn utility feature | Feeds Notifications (geofence pings), Calendar (commute estimates in event creation) | No dedicated page — lives in Settings (saved locations, commute times) |
| **Friends & Parallel Play** | 2 (friends) + 3 (rooms) + 4 (convex) = 9 commits, but recent (v2.6–v2.10, i.e. the newest major initiative — "surface Friends & Parallel Play as a top-level route" was the *previous* commit before this session, v2.10.0) | New and being actively invested in — just got promoted to a top-level nav item | Runs on a **second backend** (Convex, for realtime presence) alongside the primary Neon/Drizzle stack — the only feature in the app that does this | Room browsing, presence bubbles, nudges — genuinely new social surface, unclear adoption since there's no usage data and it's ~1 day old at v2.10.0 |
| **Onboarding** | 6 commits | Normal — onboarding tunes as the rest of the product changes | Gatekeeps first app entry | N/A |
| **Settings** | 18 (route) + 11 (page) commits | High churn because it's the dumping ground for every feature's config tab (medications, locations, commute, crisis explainer, notifications, general) | Everything with a preference writes here | Nav item |
| **Recap** | 1 commit (page/route) but assembles from Tasks + Moments + Momentum | Stable since the Mirror→Recap rename | Depends on Moments, which is only 1 commit old — Recap's stability may be partly because it hasn't had to absorb Moments' growing pains yet | Nav item |
| **Momentum** | 9 commits | Actively iterated (includes a bug fix for stale FK refs during "marination" — `afe33ab`) | Reads task-completion data; feeds dashboard's `DailyMomentum` widget AND has its own standalone page | **Possible redundancy** — dashboard already surfaces momentum via `DailyMomentum`; the standalone `/momentum` page is desktop-nav-only (not in mobile bottom nav), suggesting even the team was unsure it deserved its own destination |

---

## 4. Cut / Merge Candidates — direct assessment

1. **Medications** — fully-formed feature (reminders, push, adherence tracking) with **zero discoverability**: no nav item, no dashboard surface, buried in a settings tab. Either this is important enough to deserve a real home, or it's scope creep that shipped once and got forgotten. Given zero commits since launch and no visible integration with the rest of the app (doesn't feed Recap, Momentum, or Moments), my honest read: **this was built because it was buildable, not because it was core to the ADHD-executive-function thesis.** Candidate for cutting unless Nae is personally using it — verify usage before deciding, since there's no telemetry to check.

2. **Moments vs. Microtasks vs. Momentum vs. Recap — four overlapping "how am I doing" surfaces.** Moments logs behavioral state, Microtasks tracks recurring habit-check chips, Momentum scores the day, Recap summarizes the day. All four are small, all four render on or near the dashboard, and there's real conceptual overlap (Moments + Recap especially — Moments literally feeds Recap and nothing else). This smells like four separate attempts at the same underlying need ("show me how today went") built incrementally instead of once. Worth asking: could Moments simply be a Recap input widget instead of a persistent app-shell bar? The bar's visual weight (rendered on every single page via `app-shell.tsx`) is disproportionate to its 1-commit maturity and its currently-single dependent.

3. **`/momentum` as a standalone page is likely redundant** with `DailyMomentum` already on the dashboard. It's already been demoted to desktop-only nav. Candidate to fold into the dashboard/Recap and drop the standalone route + page.

4. **Recommend ("Do This Next") feedback loop is a dead end.** `/api/recommend/feedback` writes thumbs-up/down but nothing reads it back — not the AI prompt, not an analytics view, nothing. Either wire the feedback into the recommendation prompt (the actual point of collecting it) or cut the feedback UI — right now it's asking users for signal and throwing it away.

5. **Goals is underbuilt relative to its nav placement.** It has a real FK relationship to Tasks but the UI doesn't appear to exploit it (no visible "assign to goal" flow surfaced in brain dump parsing or task creation, based on what feeds Tasks). One commit total since launch. Either invest in making Goals a real organizing structure over Tasks, or fold it into Tasks as a tag/filter rather than a top-level nav destination.

6. **Cron's `push-triggers` route has become a monolith** — idle check-ins, medication reminders, crisis-detection, event/deadline reminders, geofence notifications, and friend nudges all fire from one handler (37 commits touching `cron/`, 46 touching `lib/notifications`). This isn't a feature to cut, but it's the highest-risk piece of infrastructure in the app: no analytics mean a silent failure here (a bad deploy, a timeout, one bug in one trigger type) could quietly break notifications for every feature at once, and you wouldn't know. Worth a dedicated pass on error isolation (one trigger type failing shouldn't block the others) even if scope elsewhere gets cut.

7. **Friends & Parallel Play's second backend (Convex) is a real architectural cost** for a feature that's ~1 day old at top-level nav status (v2.10.0 → v2.10.1 in this session's git log). It's the only part of the app not on Neon/Drizzle. Not a "cut" candidate on merit — it's clearly the newest investment — but flag the maintenance cost: two databases, two ORMs/clients, two mental models, for one feature. If Parallel Play doesn't show clear adoption, the Convex dependency is the single most expensive thing to unwind later, so it's worth deciding *now*, not after another six months of building on it.

8. **Journal vs. Dump — bordering on the same feature.** Journal is a free-write compose surface; Dump is structured multi-modal capture (text/voice/photo) that gets AI-parsed into tasks/events. They share the `journal-compose` component and sit one commit apart in churn. If the distinction ("dump = things to extract into tasks" vs "journal = just write") isn't crisply felt by users, these are candidates to merge into one screen with a mode toggle rather than two nav items.

---

## 5. The Core Loop

The smallest set of features that would still make this a coherent, usable ADHD executive-function tool if everything else were cut:

1. **Brain Dump** (`/dump`, text input at minimum) — the low-friction capture surface. ADHD tools live or die on "can I get this out of my head with zero setup cost."
2. **Tasks** (`/tasks`, dashboard `TaskList`) — the resulting structured list. Anchor entity everything else (Goals, Calendar, Momentum, Recommend) references via FK or read.
3. **Dashboard** (`/dashboard`) — the single "what now" surface: `DoThisNext` + `TaskList` + `TimeAnchor`.
4. **Calendar** (`/calendar` + Canvas sync) — external-deadline awareness is non-negotiable for the target user (student-facing, given Canvas integration); without it the tool is guessing at urgency.
5. **Notifications** (push, quiet hours, idle check-ins) — the nudge mechanism that gets a user with executive dysfunction back into the app without them having to remember to open it.
6. **Settings → quiet hours/timezone** — not a feature, but the config that makes #5 not actively harmful (wrong-timezone notifications are worse than none).

Everything else in the app — Goals, Microtasks, Moments, Momentum, Recap, Crisis/Crisis-detection, Medications, Location/Geofencing, Friends/Parallel Play, Journal — is a layer on top of that loop, not part of it. That's not automatically a reason to cut them (Crisis support in particular is a defensible exception on ethical grounds, not usage grounds — it's cheap to keep and high-stakes to lose). But if the goal is finding what's load-bearing versus what's accretion, the six items above are the skeleton; everything else is where the scope-cutting conversation with Coru should actually happen.

---

## 6. Open questions to bring to Coru (not answered here — no data exists to answer them)

- Is Medications actually used? (No telemetry — only a Nae self-report can answer this.)
- Is the Moments/Momentum/Recap trio solving three different problems or one problem three times?
- Does Parallel Play's early traction justify the Convex dependency, or should it be reconsidered before more is built on it?
- Should Goals be promoted (real integration with task creation/AI parsing) or demoted (folded into Tasks as a filter)?
