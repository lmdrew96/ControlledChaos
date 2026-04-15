# Feature Spec: Auto-Crisis Detection

**Project:** ControlledChaos
**Status:** Design complete — ready for implementation scoping
**Date:** April 15, 2026
**Designed by:** Nae + Coru (nd-design framework applied)

---

## Summary

Crisis Mode currently requires manual initiation. Users must recognize they're in crisis, open the feature, and set up triage themselves. This is a fundamental design flaw: the people who most need Crisis Mode are the least likely to initiate it, because the executive function required to recognize and respond to a crisis is exactly what's offline during one.

**This feature adds automatic crisis detection and background triage plan generation.** The app monitors the ratio of available time to required work time and, when a collision is detected, silently builds a triage plan and notifies the user that it's ready.

---

## Problem Statement

ADHD time perception is binary: **now** vs. **not now.** A deadline 22 hours away registers as "not now" until it's 2 hours away and becomes "NOW PANIC." The gap between those two states is where crises are born.

ControlledChaos already has the data to bridge that gap — task deadlines, estimated work times, calendar events. The app can calculate what the user's brain won't: "you think you have 22 hours, but you actually have 6 usable hours and 8 hours of work."

The intervention is making that math visible *before* the user's internal alarm fires.

---

## Design Principles Applied

From the nd-design framework:

| Principle | How it applies |
|-----------|---------------|
| **1. Reduce Decisions** | User doesn't decide to enter crisis mode — the app handles detection and plan creation. User's only decision: review the plan or not. |
| **2. Externalize Executive Function** | The hardest part of crisis management isn't following a plan, it's *making* the plan. Sequencing, time math, and prioritization are pure executive function work. The app does this preemptively. |
| **3. Respect Sensory Boundaries** | No auto-opening modes, no UI hijacking, no alarm-style interruptions. A notification and a quiet badge. |
| **4. Be Predictable** | Detection tiers are user-configurable. The notification voice matches existing nudge personality. Crisis Mode badge is always in the same place. |
| **5. Say What You Mean** | Notifications name the specific conflicts ("your math exam and Streetcar reading are colliding"), not vague warnings ("you have upcoming deadlines"). |
| **7. Make Progress Visible** | The pre-built plan shows the path forward immediately. No "here's your crisis, good luck" — here's step 1, here's the time block, here's why this task goes first. |

**Anti-patterns explicitly avoided:**
- No shame mechanics ("you haven't started yet!")
- No guilt-driven follow-ups if the user ignores the notification
- No "smart" UI reorganization — the plan waits in Crisis Mode, it doesn't rearrange the dashboard
- No punitive countdowns

---

## Detection Logic

### Core Calculation

```
available_time = time_until_first_deadline
                 - scheduled_calendar_blocks
                 - estimated_sleep_blocks
                 - travel/transition_buffers

required_time  = sum(estimated_work_time for each at-risk task)

crisis_ratio   = required_time / available_time
```

### What constitutes a crisis

A crisis is detected when **both** conditions are true:
1. `crisis_ratio > 1.0` (more work than time) OR `crisis_ratio > 0.8` with 2+ conflicting deadlines
2. First deadline is within a configurable window (suggested default: 48 hours)

### Threshold sensitivity

**This is critical.** If detection fires on every busy week, users will ignore it and the real crises get filtered out. The threshold should catch genuine collision courses, not routine workloads.

Suggested calibration approach:
- Start conservative (ratio > 1.0, first deadline < 36 hours)
- Track how often it fires per user over the first few weeks
- If firing more than ~2x/week, the threshold is too sensitive
- Let users adjust sensitivity in settings if needed (see Tier system below)

### Data required

- Task deadlines (already exists)
- Estimated work time per task (already exists — verify coverage/accuracy)
- Calendar events with time blocks (already exists)
- Sleep schedule estimate (may need: could default to 11 PM – 7 AM, or infer from usage patterns)
- Travel/transition buffers between calendar events (nice-to-have, not required for v1)

---

## Tier System

Users choose their detection tier in **Settings → Crisis Detection**.

### Tier 1: Watch (passive)

- A subtle visual indicator appears when a crisis is detected
- Badge/dot on Crisis Mode nav item in sidebar
- Optional: task cards involved in the collision get a visual flag on Dashboard
- **No notifications, no modals, no sound**
- For users who check their dashboard regularly and will notice

### Tier 2: Nudge (active, gentle)

- Everything in Tier 1, plus:
- Push notification in ControlledChaos voice when crisis is detected
- Example: "your math exam and Streetcar reading are about to collide — want to set up triage?"
- Single tap to open Crisis Mode setup, single tap to dismiss
- "Not now" snoozes the nudge — re-nudge in ~2 hours if ratio worsens
- No re-nudge if ratio stays the same or improves
- Maximum 1 re-nudge per detected crisis

### Tier 3: Auto-Triage (background plan + notification) ✨

- Everything in Tier 1, plus:
- App runs triage **silently in the background** — builds the sequenced plan, calculates time blocks, identifies the "do this first" task
- Sends notification: "your math exam and Streetcar reading are about to collide. I built a triage plan — it's ready when you are."
- Tapping opens Crisis Mode with the plan **pre-loaded as a proposal**
- The plan is editable — user can reorder, modify, dismiss. "Done, next task" and "Stuck — help me" still work as normal.
- If user doesn't tap: the plan sits quietly. Badge on Crisis Mode shows it's there. **No guilt follow-up.**
- One gentle re-nudge only if the ratio gets significantly worse (e.g., a new conflicting deadline appears or available time drops sharply)

### Default: **Tier 2 (Nudge)**

Nudge is the sweet spot — active enough to break through ADHD inertia, respectful enough not to override autonomy. Users who want more help opt up to Tier 3. Users who find it overwhelming opt down to Tier 1 or Off.

### Off

Crisis Detection disabled entirely. User initiates Crisis Mode manually as today.

---

## UX Flow: Tier 3 (Auto-Triage)

This is the most complex flow. Tiers 1 and 2 are subsets of this.

```
1. Detection engine identifies crisis_ratio threshold crossed
         ↓
2. Background triage runs:
   - Identifies conflicting deadlines
   - Calculates available time blocks (minus sleep, calendar, transitions)
   - Sequences tasks by true urgency (closest-to-being-missed, not just due-first)
   - Identifies "do this right now" task based on current time and next calendar block
   - Generates the full Crisis Mode plan
         ↓
3. Plan saved to Crisis Mode (not yet visible to user as active)
         ↓
4. Badge appears on Crisis Mode nav item (always visible, no interaction required)
         ↓
5. Push notification sent:
   "[specific conflicting tasks] are on a collision course.
    I built a triage plan — it's ready when you are."
         ↓
6a. User taps notification → Crisis Mode opens with pre-loaded plan
6b. User ignores notification → plan waits, badge persists
6c. User dismisses notification → plan still accessible via badge
         ↓
7. In Crisis Mode, plan is a PROPOSAL:
   - User can accept and start working through it
   - User can reorder tasks
   - User can dismiss the plan entirely
   - "Stuck — help me" breaks current task down further
   - "Done, next task" progresses through the sequence
```

---

## Notification Voice

Notifications should match the existing ControlledChaos nudge personality: direct, specific, a little sassy, never mean. They should name the actual tasks in conflict, not use vague language.

**Good:**
- "your math exam and Streetcar reading are about to collide. I built a triage plan — it's ready when you are."
- "you've got about 6 hours of real work time before your exam and you haven't started. there's a plan in Crisis Mode if you want it."

**Bad:**
- "You have upcoming deadlines! Tap to review." (vague, corporate)
- "⚠️ CRISIS DETECTED — open Crisis Mode now!" (alarm-style, shame-inducing)
- "You still haven't looked at your triage plan." (guilt follow-up)

---

## Settings UI

**Location:** Settings → Crisis Detection

**Controls:**
- **Detection level:** Off / Watch / Nudge / Auto-Triage (radio or segmented control)
- **Brief description under each option** explaining what it does in plain language
- Suggested descriptions:
  - Off: "I'll open Crisis Mode myself when I need it."
  - Watch: "Show a badge when deadlines are colliding. No notifications."
  - Nudge: "Notify me when things are getting tight, and let me decide."
  - Auto-Triage: "Build a plan for me in the background and let me know it's ready."

**Nice-to-have (v2):**
- Detection window slider (how far ahead to look — default 48 hours)
- Sensitivity adjustment (crisis_ratio threshold)
- Quiet hours for crisis notifications
- Per-crisis-type preferences (academic vs. work vs. personal)

---

## Open Questions for Implementation

1. **Where does background triage run?** Client-side on app open? Server-side on a cron? Real-time via Convex subscription when task/calendar data changes?
2. **Sleep schedule estimation:** Hardcode a default? Let user set it? Infer from usage patterns? (Default + user override seems simplest for v1.)
3. **Estimated work time coverage:** How many tasks currently have time estimates? If coverage is low, detection accuracy suffers. May need a prompt flow: "how long do you think this will take?" at task creation.
4. **Plan staleness:** If the user doesn't look at the plan for hours and their schedule changes, does the plan auto-update? Or regenerate on open? (Suggest: regenerate on open if underlying data changed, with a note: "updated since you last checked.")
5. **Multiple simultaneous crises:** Can there be 2+ auto-generated plans at once? Or does the system merge overlapping crises into one triage session?
6. **Notification delivery:** Are push notifications already implemented for nudges? If so, this piggybacks on existing infra. If not, that's a prerequisite.

---

## Implementation Priority

**Suggested build order:**

1. Detection engine (the math) — this is the foundation
2. Tier 1 (Watch) — badge on nav, visual flags — lowest lift, proves detection works
3. Tier 2 (Nudge) — notification integration — builds on existing nudge system
4. Tier 3 (Auto-Triage) — background plan generation — most complex, highest value
5. Settings UI — once tiers are working, expose the controls
6. v2 refinements — sensitivity tuning, quiet hours, per-type preferences
