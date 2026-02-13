# ControlledChaos — Vision & Development Guide

**The ADHD Executive Function Companion**
*"Your brain has the ideas. I'll handle the rest."*

---

## Part I: The Why

### The Problem

Every productivity app on the market was designed by and for neurotypical brains. They assume you can:
- Break your own tasks into steps (executive function)
- Decide what to do next on your own (prioritization)
- Remember to check the app (working memory)
- Maintain motivation without immediate feedback (delay tolerance)
- Organize information as it comes in (cognitive load management)

For ADHD brains, every one of these assumptions is wrong. Not because of laziness or lack of intelligence — because of a measurably different cognitive architecture (see: Theoretical Framework document).

The result: ADHD individuals accumulate productivity apps like a graveyard. Todoist, Notion, Things, Reminders, sticky notes, random text files. Each one requires the very executive function it's supposed to replace.

### The Solution

**ControlledChaos is an AI-powered executive function companion.** It doesn't ask you to organize — it organizes for you. It doesn't show you a list and say "pick one" — it tells you what to do right now, based on your energy, your location, your schedule, and your priorities.

The core interaction is:
1. **Dump** — throw thoughts, tasks, deadlines, and chaos at the app in whatever form they come (typing, talking, snapping a photo of a handwritten list)
2. **Trust** — the AI parses, categorizes, prioritizes, and schedules everything
3. **Do** — the app tells you exactly what to work on, right now, and nudges you when it's time to switch

### Core Thesis

**ControlledChaos serves as the external regulatory scaffold that Barkley's model identifies as essential for ADHD self-regulation.** It replaces the internal executive functions that ADHD brains can't reliably generate — working memory, self-regulation of motivation, internalization of speech, and reconstitution — with external, AI-driven equivalents.

This is not a crutch. It is a cognitive prosthetic for a real neurological difference.

---

## Part II: Theory → Features

Every feature in ControlledChaos maps to a cognitive science principle from the Theoretical Framework. If a feature can't be traced to theory, it's probably feature creep.

### Barkley's EF Model → External Scaffolding

| EF Deficit | ControlledChaos Response |
|---|---|
| Working memory | Brain dump captures everything instantly; nothing lives only in your head |
| Self-regulation of motivation | AI recommends tasks matched to current energy; morning/evening email digests |
| Internalization of speech | Push notifications serve as externalized self-talk ("You have 45 min before class — enough for your Bio reading") |
| Reconstitution | AI decomposes brain dump chaos into structured, actionable tasks |

### Attention Dysregulation → Channel, Don't Fight

- The app never punishes you for not checking it (no streaks, no guilt)
- Notifications are context-aware: right task, right time, right place
- If you're in a flow state, the app doesn't interrupt — it queues

### Cognitive Load Theory → Minimal Decisions

- Brain dump requires zero organization from the user — just input
- Task recommendation is singular: "Do this next." Not "Here are your 47 tasks, pick one."
- Interface is clean, calm, minimal — every pixel earns its place
- Progressive disclosure: details available on demand, never forced

### Hyperfocus & Flow → Facilitate, Then Exit

- Quick-capture brain dump removes friction (voice/photo = instant)
- Focus mode: when you're working on a task, the app goes quiet
- Gentle transition cues when schedule demands a shift
- No abrupt interruptions — queued notifications with grace periods

### Self-Determination Theory → Autonomy + Competence + Relatedness

- **Autonomy:** User can always override AI recommendations; "not now" is always an option
- **Competence:** Completed task tracking, daily/weekly summaries showing real progress
- **Relatedness:** Tasks connected to meaningful goals ("This Bio reading is for your Linguistics degree path")

### Delay Aversion → Immediate Feedback Everywhere

- Brain dump → parsed tasks: happens in seconds, visibly
- Task completion: instant visual feedback, satisfying micro-interaction
- Progress is always visible — never hidden behind navigation
- Morning email shows the day's plan; evening email shows what you accomplished
- No waiting states without visible progress indicators

---

## Part III: The Product

### Core Features (MVP)

#### 1. Multi-Modal Brain Dump
The entry point. Users capture tasks/thoughts in whatever form is most natural:
- **Text:** Free-form typing — messy, incomplete, stream-of-consciousness is fine
- **Voice:** Speak your thoughts, Groq STT transcribes, AI parses into tasks
- **Photo:** Snap a picture of a handwritten list, whiteboard, or sticky notes — AI extracts and parses via OCR

The AI (Claude Haiku 4.5) processes all inputs and produces structured tasks with:
- Title (clear, actionable)
- Estimated time
- Energy level required (low / medium / high)
- Category/label (school, work, personal, errands, health)
- Priority (urgent, important, normal, someday)
- Location relevance (home, campus, work, anywhere)
- Deadline (if detectable)
- Connection to goals (if identifiable)

#### 2. Intelligent Task Recommendations
The heart of the app. When the user opens ControlledChaos (or gets a notification), the AI considers:
- **Energy:** Time of day patterns + user self-report ("How are you feeling?")
- **Time available:** What's the gap before your next calendar event?
- **Location:** Where are you right now? What tasks make sense here?
- **Priority:** Deadlines approaching, importance weighting
- **Variety:** Avoid task fatigue — mix task types when possible
- **Momentum:** If you just completed something, suggest a related task (ride the wave)

Output: **"Do this next"** — a single, clear recommendation with reasoning. User can accept, snooze, or ask for an alternative.

#### 3. Calendar Integration
- **Canvas iCal import:** Syncs class schedule, assignment deadlines, exam dates automatically
- **Google Calendar read:** Sees existing commitments, meetings, events
- **Google Calendar write:** AI creates time blocks for tasks, study sessions, breaks
- Unified timeline view: everything in one place

#### 4. Notification System
- **Push notifications (PWA):** Context-aware nudges ("You're near campus — 30 min before class, want to review your notes?")
- **Morning email digest:** Today's plan — prioritized tasks, calendar events, weather-appropriate suggestions
- **Evening email digest:** What you accomplished, what shifts to tomorrow, encouragement

#### 5. Location Awareness
- Browser geolocation API for auto-detect
- Saved locations: Home, Georgetown campus, American Eagle, etc.
- Tasks tagged with location relevance
- Recommendations filtered by current location

### Design Philosophy

**The Linear Aesthetic:**
- Clean, confident, calm
- Generous whitespace
- Beautiful typography (Inter or similar)
- Subtle, purposeful animations
- Dark mode default, light mode available
- High contrast, accessibility-first
- The app should feel like a quiet, organized room — not a cluttered dashboard

**ADHD-Native Principles:**
- Zero guilt mechanics (no streaks, no "you missed yesterday!")
- Instant gratification on task completion
- Forgiving input (messy brain dumps are fine, AI handles it)
- Single-action-forward design (always one clear next step)
- Escapable at any point (never trapped in a flow)

---

## Part IV: Decision Compass

### When Building a Feature, Ask:

```
1. Does this reduce decisions for the user?
   YES → Proceed
   NO  → Reconsider

2. Does it map to a theory in the Theoretical Framework?
   YES → Proceed
   NO  → Is it infrastructure? If yes, proceed. If no, it's feature creep.

3. Does it increase cognitive load on the interface?
   YES → Can it be progressive disclosure? If yes, redesign. If no, cut it.
   NO  → Proceed

4. Would a neurotypical productivity app have this feature?
   YES → Why? Make sure we're doing it differently.
   NO  → Good. We're probably on the right track.
```

### Feature Creep Red Flags
- "What if we added a habit tracker?" (No. Different problem.)
- "What about social features?" (No. Not for MVP, maybe not ever.)
- "Can we add a Pomodoro timer?" (No. We're not prescribing time management techniques.)
- "What about recurring tasks?" (Yes — but only if AI handles the recurrence, user doesn't configure it.)

---

## Part V: For Future Nae

### When You're Stuck
1. Re-read Part II (Theory → Features). Every feature has a "why."
2. Open the Theoretical Framework document. Read one section. Remember what you're building and why it matters.
3. Pick the smallest possible task that moves MVP forward.
4. Brain dump your stuck-ness into the app itself. Let the AI help you.

### When You Want to Add Features
Check the Decision Compass (Part IV). If it passes all four questions, create a GitHub issue tagged `post-mvp` and keep moving.

### When It Feels Like Too Much
You built ChaosLimbă — a 10-component AI ensemble, SLA-theory-grounded language learning platform — in 7 months, solo, while going to school and working retail. You can absolutely build this.

The chaos is the method. Trust it.

---

**Document Version:** 1.0
**Created:** February 2026
**Author:** Lanae Drew
**For:** ControlledChaos Development
