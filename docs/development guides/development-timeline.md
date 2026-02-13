# ControlledChaos — Development Timeline & Milestones

**Duration:** 4 months (February 2026 → June 2026)
**Developer:** Nae Drew (solo, part-time — school + work + ChaosLimbă)
**Development Style:** Hyperfocus-driven, chaos-method, Claude Code assisted

---

## The 6 Milestones

These are your north star. Order within a month is flexible (follow the hyperfocus), but milestones should be roughly sequential.

| # | Milestone | Target | Status |
|---|---|---|---|
| 1 | Users can sign up, onboard, and set preferences | Month 1 | ⬜ |
| 2 | Brain dump (text) → AI parses into structured tasks | Month 1 | ⬜ |
| 3 | Voice + photo brain dumps work end-to-end | Month 2 | ⬜ |
| 4 | AI recommends tasks based on context (energy, time, location, priority) | Month 2 | ⬜ |
| 5 | Calendar integration live (Canvas iCal + Google Calendar read/write) | Month 3 | ⬜ |
| 6 | Notifications system complete (push + morning/evening email digests) | Month 3–4 | ⬜ |

**When all 6 are checked: 🎉 MVP LAUNCH 🎉**

---

## Month 1: Foundation + Core Loop (Feb–Mar 2026)

**Theme:** "Dump it and see it work"

### Week 1–2: Project Scaffolding
- [ ] Initialize Next.js 15 project with TypeScript
- [ ] Configure Tailwind CSS + shadcn/ui
- [ ] Set up Clerk authentication (sign up, sign in, Google OAuth)
- [ ] Set up Neon database + Drizzle ORM
- [ ] Create initial schema + first migration (users, tasks, brain_dumps, user_settings)
- [ ] Set up Cloudflare R2 bucket (for media storage later)
- [ ] Configure Vercel deployment + environment variables
- [ ] PWA manifest + basic service worker setup
- [ ] CLAUDE.md in repo root

### Week 3–4: Text Brain Dump + Task Display
- [ ] Brain dump UI: full-screen text input, "just start typing" design
- [ ] `/api/dump/text` route: receives text, calls Claude Haiku 4.5
- [ ] AI prompt engineering: brain dump → structured tasks (title, priority, energy, category, time estimate, location, deadline)
- [ ] Task storage: parsed tasks saved to database
- [ ] Task feed UI: clean list of tasks with status indicators
- [ ] Task actions: mark complete, edit, snooze, delete
- [ ] Basic task detail view
- [ ] User onboarding flow (name, timezone, energy patterns, Canvas iCal URL)

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
- [ ] Voice brain dump: record audio in browser → upload to R2 → Groq Whisper STT → transcript to Haiku for parsing
- [ ] Photo brain dump: capture/upload photo → R2 → OCR (Tesseract.js or Claude Vision) → extracted text to Haiku for parsing
- [ ] Brain dump history: view past dumps and their parsed results
- [ ] Improve AI parsing: handle messy input, partial thoughts, mixed languages, abbreviations
- [ ] Batch parsing: handle dumps with 10+ tasks efficiently

### Week 7–8: Task Recommendation Engine
- [ ] Context gathering: current time, location (geolocation API), next calendar event, energy profile
- [ ] `/api/recommend` route: sends context + pending tasks to Haiku → returns single recommendation with reasoning
- [ ] Recommendation UI: prominent "Do This Next" card with reasoning, accept/snooze/alternative buttons
- [ ] Feedback loop: log user responses (accepted, snoozed, rejected) to `task_activity` table
- [ ] Location setup: saved locations UI (add/edit/delete locations with geofencing radius)
- [ ] Location matching: detect current location → match to nearest saved location
- [ ] Energy self-report: quick "How's your energy?" prompt (optional, improves recs)

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
- [ ] Canvas iCal parser: fetch + parse .ics feed → upsert `calendar_events`
- [ ] Vercel cron job: auto-sync Canvas iCal daily (and on-demand)
- [ ] Google Calendar OAuth flow (via Clerk's Google OAuth)
- [ ] Google Calendar read: fetch existing events → store in `calendar_events`
- [ ] Google Calendar write: AI creates time blocks for tasks
- [ ] Unified calendar view UI: all events from all sources
- [ ] AI scheduling: analyze free time blocks → suggest/create task time blocks
- [ ] "Time available" calculation: how long until next event?

### Week 11–12: Notification System
- [ ] Service worker: push notification subscription + handling
- [ ] `/api/notifications/subscribe` route: store push subscription
- [ ] Push notification triggers via Vercel cron:
  - Upcoming deadline (24h, 2h warnings)
  - Scheduled task start time
  - Daily check-in if no activity
- [ ] Location-aware notifications (if location data available)
- [ ] Morning email digest (Resend + React Email):
  - Today's calendar events
  - AI-prioritized task list
  - Upcoming deadlines this week
- [ ] Evening email digest:
  - Completed tasks (celebration!)
  - What shifts to tomorrow
  - Tomorrow's top priority
- [ ] Notification preferences UI: toggle channels, set quiet hours, configure digest times

### Milestone Checks:
- ✅ **Milestone 5:** Canvas deadlines + Google Calendar events visible; AI creates scheduled time blocks
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
- [ ] Offline support: service worker caches app shell + recent data
- [ ] PWA install prompt: encourage installation on mobile
- [ ] Empty states: beautiful, helpful empty states for every view
- [ ] Error handling: graceful failures for AI calls, network issues, API limits
- [ ] Loading states: skeleton loaders, optimistic updates
- [ ] Responsive design audit: works beautifully on mobile + tablet + desktop
- [ ] Accessibility audit: keyboard navigation, screen reader support, color contrast
- [ ] Performance audit: Lighthouse score, bundle size, API response times

### Week 15–16: Testing + Launch
- [ ] End-to-end testing of all core flows
- [ ] Beta testing (invite 3–5 ADHD friends/classmates)
- [ ] Bug fixes from beta feedback
- [ ] Landing page / marketing page
- [ ] README.md with setup instructions
- [ ] Launch on r/ADHD, r/productivity, Product Hunt
- [ ] 🎉 **MVP LAUNCH** 🎉

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

**Document Version:** 1.0
**Created:** February 2026
**Author:** Lanae Drew
