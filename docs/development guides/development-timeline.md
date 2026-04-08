# ControlledChaos — Development Timeline & Milestones

**Duration:** 4 months (February 2026 → June 2026)
**Developer:** Nae Drew (solo, part-time — school + work + ChaosLimbă)
**Development Style:** Hyperfocus-driven, chaos-method, Claude Code assisted

---

## The 6 Milestones

These are your north star. Order within a month is flexible (follow the hyperfocus), but milestones should be roughly sequential.

| # | Milestone | Target | Status |
|---|---|---|---|
| 1 | Users can sign up, onboard, and set preferences | Month 1 | ✅ Complete |
| 2 | Brain dump (text) → AI parses into structured tasks | Month 1 | ✅ Complete |
| 3 | Voice + photo brain dumps work end-to-end | Month 2 | ✅ Complete |
| 4 | AI recommends tasks based on context (energy, time, location, priority) | Month 2 | ✅ Complete |
| 5 | Calendar integration live (Canvas iCal sync + manual events + AI scheduling) | Month 3 | ✅ Complete |
| 6 | Notifications system complete (push + morning/evening email digests) | Month 3–4 | ✅ Complete |

**All 6 milestones complete! Now in Month 4: Polish + Launch**

---

## Month 1: Foundation + Core Loop (Feb–Mar 2026)

**Theme:** "Dump it and see it work"

### Week 1–2: Project Scaffolding
- [x] Initialize Next.js 16 project with TypeScript + React Compiler
- [x] Configure Tailwind CSS v4 + shadcn/ui (new-york style, neutral)
- [x] Set up Clerk authentication (sign up, sign in, Google OAuth)
- [x] Set up Neon database + Drizzle ORM
- [x] Create initial schema (users, user_settings, goals, brain_dumps, tasks, calendar_events, locations, task_activity, notifications)
- [x] Set up Cloudflare R2 bucket (for media storage)
- [x] Configure Vercel deployment + environment variables
- [x] PWA manifest + basic service worker setup
- [x] CLAUDE.md in `.claude/` directory

### Week 3–4: Text Brain Dump + Task Display
- [x] Brain dump UI: full-screen text input, "just start typing" design
- [x] `/api/dump/text` route: receives text, calls Claude Haiku 4.5
- [x] AI prompt engineering: brain dump → structured tasks (title, priority, energy, category, time estimate, location, deadline)
- [x] Task storage: parsed tasks saved to database
- [x] Task feed UI: clean list of tasks with status indicators
- [x] Task actions: mark complete, edit, snooze, delete
- [x] Task detail modal
- [x] User onboarding flow (name, timezone, energy patterns, Canvas iCal URL)

### Milestone Checks:
- ✅ **Milestone 1:** User can sign up via Clerk, complete onboarding, set preferences
- ✅ **Milestone 2:** User types a messy brain dump → sees structured tasks appear

### Design Targets:
- Dark mode default, clean/minimal aesthetic
- Inter or Geist font family
- Dashboard shell: sidebar nav, main content area
- Brain dump should feel like opening a notes app — zero friction

---

## Month 2: Intelligence Layer (Mar–Apr 2026)

**Theme:** "The AI actually helps"

### Week 5–6: Multi-Modal Brain Dump
- [x] Voice brain dump: record audio in browser → upload to R2 → Groq Whisper STT → transcript to Haiku for parsing
- [x] Photo brain dump: capture/upload photo → R2 → Claude Vision → extracted text to Haiku for parsing
- [x] Brain dump history: view past dumps and their parsed results
- [x] Improve AI parsing: handle messy input, partial thoughts, filler speech, OCR artifacts
- [x] Brain dump → calendar event detection (AI detects classes, meetings, appointments)

### Week 7–8: Task Recommendation Engine
- [x] Context gathering: current time, location (geolocation API), next calendar event, energy profile
- [x] `/api/recommend` route: sends context + pending tasks to Haiku → returns single recommendation with reasoning
- [x] Recommendation UI: prominent "Do This Next" card with reasoning, accept/snooze/alternative buttons
- [x] Feedback loop: log user responses (accepted, snoozed, rejected) to `task_activity` table
- [x] Location setup: saved locations UI (add/edit/delete locations with geofencing radius)
- [x] Location matching: detect current location → match to nearest saved location
- [x] Energy self-report: quick "How's your energy?" prompt (optional, improves recs)

### Milestone Checks:
- ✅ **Milestone 3:** User can voice-record or photograph a brain dump → gets structured tasks
- ✅ **Milestone 4:** User opens app → sees intelligent task recommendation based on their context

### Design Targets:
- Voice recording UI: big record button, waveform visualization, clean
- Photo capture: camera integration or file upload, preview before submitting
- Recommendation card: the hero of the dashboard, impossible to miss
- Location management: simple list with map pins

---

## Month 3: Calendar + Notifications (Apr–May 2026)

**Theme:** "It knows your schedule and reaches out to you"

### Week 9–10: Calendar Integration
- [x] Canvas iCal parser: fetch + parse .ics feed → upsert `calendar_events`
- [x] Vercel cron job: auto-sync Canvas iCal every 15 minutes (and on-demand)
- [x] Unified calendar view UI: week + month views with all events
- [x] AI scheduling: analyze free time blocks → create task time blocks
- [x] "Time available" calculation: how long until next event?
- [x] Manual event creation with recurrence support (daily/weekly)
- [x] Calendar event colors by category (school, work, personal, errands, health)
- [x] Personal iCal export/subscribe URL for external calendar apps
- [x] Recurring event series management (edit/delete all instances)

### Week 11–12: Notification System
- [x] Service worker: push notification subscription + handling
- [x] `/api/notifications/subscribe` route: store push subscription
- [x] Push notification triggers via Vercel cron:
  - Upcoming deadline (24h, 2h, 30min warnings)
  - Scheduled task start time
  - Daily check-in if no activity
- [x] Morning email digest (Resend + React Email):
  - Today's calendar events
  - AI-prioritized task list
  - Upcoming deadlines this week
- [x] Evening email digest:
  - Completed tasks (celebration!)
  - Tomorrow's top priority
- [x] Notification preferences UI: toggle channels, set quiet hours, configure digest times
- [x] Notification bell with unread count + popover
- [x] AI prompt redesign: anti-hallucination rules across all prompts

### Milestone Checks:
- ✅ **Milestone 5:** Canvas deadlines visible; AI creates scheduled time blocks; manual events with recurrence
- ✅ **Milestone 6:** User receives push notifications + morning/evening email digests

### Design Targets:
- Calendar view: week view default, clean event rendering
- AI-scheduled blocks visually distinct from manual events
- Email templates: beautiful, branded, scannable in 10 seconds
- Notification preferences: simple toggles, not overwhelming

---

## Month 4: Polish + Launch (May–Jun 2026)

**Theme:** "Make it shine"

### Week 13–14: Polish & Edge Cases
- [x] Offline support: service worker caches app shell, network-first with cache fallback for navigation
- [x] PWA install prompt: mobile install banner with localStorage persistence, iOS Safari fallback instructions
- [x] PWA icons: generated 192px + 512px PNGs from logo, stable manifest id
- [x] Empty states: DumpHistory first-use message, all major views covered
- [x] Error handling: TaskCard surfaces toast on failure, global-error.tsx root boundary
- [x] Loading states: skeleton loading.tsx for all 5 routes, DumpHistory shimmer + error state
- [x] Accessibility: aria-label on all icon-only buttons, aria-pressed on mode toggles, aria-live regions for dynamic content (task count, recommendations, notification badge)
- [x] Production bug fixes: manifest.json 404 (middleware blocking), calendar API 500 (Neon timestamp string → Date conversion, dynamic imports for sync modules)
- [ ] Performance audit: Lighthouse score, bundle size, API response times

### Week 15–16: Testing + Launch
- [ ] End-to-end testing of all core flows
- [ ] Beta testing (invite 3–5 ADHD friends/classmates)
- [ ] Bug fixes from beta feedback
- [x] Landing page with animated brain dump demo
- [x] README.md with setup instructions
- [ ] Launch on r/ADHD, r/productivity, Product Hunt
- [ ] 🎉 **MVP LAUNCH** 🎉

---

## Beyond Milestones: Features Built During Polish

These features weren't in the original milestones but emerged from real usage and testing:

### Crisis Mode
- Emergency task breakdown for hard deadlines
- AI assesses panic level (fine / tight / damage-control)
- Generates 5-8 concrete micro-tasks with stuck hints
- Supports file attachments (rubrics, assignment PDFs)
- Multiple concurrent crisis plans, individually deletable

### Personality System
- Three-axis AI personality tuning: supportive↔strict, professional↔BFF, clean↔unfiltered
- Affects all notifications, digests, and recommendation reasoning
- Unfiltered mode actively uses casual swearing for authenticity

### Multi-Model AI Strategy
- **Haiku** for heavy lifting (parsing, scheduling, recommendations, breakdowns)
- **Sonnet** for personality-heavy outputs (notifications, digests, nudges)
- Pre-computed temporal values prevent date hallucinations across all prompts

### Location-Aware Geofence Notifications
- Foreground watchPosition tracker (battery-friendly, 100m debounce)
- Server-side geofence detection with hysteresis buffer (GPS bounce prevention)
- Arrival notifications: "You're at CVS — pick up your prescription"
- Departure notifications: nearby locations with pending tasks
- 3-layer dedup: client distance, server state machine, 2-hour cooldown

### Advanced Notification Intelligence
- AI-determined snooze durations (not fixed intervals)
- Assertiveness modes: gentle / balanced / assertive
- Daily push caps per assertiveness level
- Inactivity nudges at 72h / 96h / 120h tiers
- Morning (11am) + afternoon (3pm) + evening (7pm) idle check-ins
- Push action buttons (Start, Snooze) on notifications

### Recommendation Persistence
- Recommendations survive page navigation and reload (localStorage)
- Auto-expire after 4 hours to prevent stale recommendations
- Cleared only on explicit user action (Done / Not Now / Something Else)

### Auto AI Notes
- Haiku generates prep notes for manually created tasks and events
- "Bring your insurance card" for pharmacy tasks, "Check course site for readings" for classes
- Fires in background after creation, surfaces on delayed refetch

---

## Post-MVP Ideas (Parking Lot)

These are explicitly **not** in scope for MVP. GitHub issues tagged `post-mvp`.

- Recurring tasks (AI-managed)
- Task templates ("weekly review" bundles)
- Habit tracking (only if theory-grounded)
- Focus mode / Pomodoro-style timer
- Weekly/monthly progress reports
- Shared task lists (for group projects)
- Siri/Google Assistant integration
- Apple Watch / wearable notifications
- AI learning from long-term patterns (preference tuning)
- Spaced repetition for task follow-up
- Integration with Notion, Todoist (import)

---

## Budget Tracking

| Month | Projected Spend | Notes |
|---|---|---|
| Month 1 | $0–1 | Mostly free tiers; minimal Haiku usage during dev |
| Month 2 | $1–3 | More Haiku calls as recommendation engine develops |
| Month 3 | $2–5 | Email sending begins, more AI calls |
| Month 4 | $3–5 | Full feature set running |
| **Ongoing** | **$3–5/month** | Sustainable on student budget |

---

## Realistic Pacing Notes

You're juggling:
- UD coursework (World History, Biology, Beatles, US Politics)
- American Eagle shifts (back of house)
- ChaosLimbă (near MVP completion)
- Hen & Ink Society (VP + Editor-in-Chief)
- Life

**Realistic dev time:** ~10–15 hours/week on ControlledChaos

**That's fine.** The milestones are designed for this pace. Follow the hyperfocus. Some weeks you'll do 20 hours and crush a whole milestone. Some weeks you'll do 2 hours and that's okay too.

**The chaos is the method.**

---

**Document Version:** 3.0
**Created:** February 2026
**Updated:** April 8, 2026
**Author:** Lanae Drew
