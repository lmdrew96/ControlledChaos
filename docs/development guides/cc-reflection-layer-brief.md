# ControlledChaos: Reflection Layer Implementation Brief

> **For Cody.** This document gives you the big-picture context for four ChaosPatch entries in the `controlledchaos` project. Read this before starting any of them. The patches are the *what*; this brief is the *why* and the *together*.

> **Status:** Spec'd 2026-04-17. Targets June 2026 public launch. ND-design rigor applies throughout.

---

## TL;DR

ControlledChaos is gaining a **reflection layer** — four interconnected features that turn CC from "what should I do next?" into "what should I do next, *and what actually happened today, and what patterns are emerging in my behavior*?" 

The four patches are:

1. **Moments entity** — typed one-tap behavioral state logging (foundation)
2. **Mirror view** — chronological timeline of all activity types
3. **Apple Health XML import** — backfill passive health data via user-initiated upload
4. **Patterns surface** — opt-in observation-style patterns ("you tend to X")

These were originally a separate planned app called ChaosStream. We killed the standalone app and merged the concept into CC because (a) the data needs overlap massively with CC's existing entities, (b) the integration is free if it lives in one app, and (c) one-app-with-better-features beats two-apps-with-context-switching for ADHD users.

---

## The vision in one paragraph

ADHD brains often can't see what they actually did today — task completion alone doesn't capture the shape of a real day. The reflection layer makes the invisible visible: explicit state-logging via Moments, a chronological mirror of all activity, optional health data, and honest pattern observations. This turns CC from a forward-only task system into a forward-and-backward executive function prosthetic. The Mirror view is the emotional payoff ("look — I did do things today"). The Patterns surface is the longitudinal payoff ("here's what your weeks actually look like"). Crisis Mode and AI Recommendations get sharper because they consume explicit user-reported state instead of inferring from task completion alone.

---

## Architectural constraints (don't re-litigate)

These are settled. Don't propose alternatives unless explicitly asked.

- **No native iOS.** Nae will not pay Apple's $99/yr Developer Program fee. CC stays a PWA. This is why HealthKit can't be live-accessed and why XML import is the workaround.
- **No new dependencies without strong justification.** CC already has a deep stack. Use what's there before reaching for new libs.
- **Convex is for ScribeCat.** CC uses **Neon Postgres + Drizzle ORM**. Don't get them confused.
- **MCP tools follow the `cc_` prefix convention.** New tools added in this work all start with `cc_`.
- **Match existing CC patterns** — soft delete, timezone helpers in `lib/timezone.ts`, Clerk for auth, etc. Don't invent parallel patterns.

---

## The four patches at a glance

| # | Patch | Priority | Type | Phase |
|---|---|---|---|---|
| 1 | **Moments entity** | high | Build | 1 — Foundation (ship first) |
| 2 | **Mirror view** | medium | Build | 2 — Surface |
| 3 | **Apple Health XML import** | medium | Build | 2 — Surface (parallel with #2) |
| 4 | **Patterns surface** | low | Enhance | 3 — Depth (last) |

### Patch 1 — Moments entity

A new lightweight, typed entity for one-tap behavioral state logging. Think "log a moment" not "write a journal entry." Seven initial types: `energy_high`, `energy_low`, `energy_crash`, `focus_start`, `focus_end`, `tough_moment`, `meds_taken`. UI is a chip-bar — tap = log with `now` timestamp; long-press = open detail (intensity 1–5, optional note, edit time).

**This is the foundation patch.** The other three either depend on it directly or get dramatically more useful with it.

### Patch 2 — Mirror view

A new chronological day view that interleaves completed tasks, calendar events, brain dumps, moments, and (post-Patch 3) health metrics. Read-only. Day-by-day navigation, no infinite scroll. Type-filter pills at top. The "what actually happened today" surface.

### Patch 3 — Apple Health XML import

Settings-page upload flow. User exports their Apple Health data on iPhone, drops the `export.xml` file into CC, we parse it client-side (streaming — files can be 100MB+), extract a focused subset (sleep, steps, mindfulness, workouts, optional HRV), dedupe on `(user_id, metric_type, occurred_at)`, persist to Neon. Surfaces in Mirror view + feeds Patterns.

### Patch 4 — Patterns surface

The most sensitive feature. Add observation-style rendering on top of CC's existing stats + new cross-entity patterns enabled by Moments and Health data. Strict ND-safe framing rules (see below). Opt-in per pattern type. Locked behind a 30-day data threshold per pattern. Every pattern has a "this isn't right" button.

---

## Dependency graph

```
Patch 1 (Moments)  ────────┬──────► Patch 2 (Mirror)
                           │
                           ├──────► Patch 4 (Patterns)
                           │
Patch 3 (Health import)  ──┴──────► Patch 4 (Patterns)
                            │
                            └─────► Patch 2 (Mirror — adds Health entries)
```

**Implications:**
- Patch 1 must ship before Patches 2 and 4 are fully meaningful.
- Patches 2 and 3 are independent and can ship in parallel.
- Patch 4 depends on data accumulation (~30 days of Moments minimum) — natural fit for late phase.

**Recommended execution order:** 1 → (2 ‖ 3) → 4.

---

## Integration with existing CC features

This work doesn't live in isolation. Two existing features get meaningfully better when Moments lands:

### Crisis Mode (`lib/crisis-detection/`)
Currently auto-detects overwhelm states from inferred signals. **Update it to consume Moments as explicit signals.** When the user logs `energy_crash` or `tough_moment`, that's a higher-signal input than anything inferred from task patterns. Earlier detection, fewer false positives. Specifically:
- A `tough_moment` with intensity ≥ 4 should likely trigger a crisis check
- An `energy_crash` should weight the existing detection logic toward triggering
- Consecutive `tough_moment` events within a short window are stronger than isolated ones

Don't replace the existing detection — *augment* it with explicit signals.

### AI Recommendations (`lib/ai/`)
Currently uses Claude Haiku to pick next-best task and explains why. **Update the prompt context to include recent Moments (last 2 hours).** If the user logged `energy_crash` 22 minutes ago, that's the single most relevant input for recommending the next task. The "why this task" explanation should reference the recent moment when applicable ("Suggested because you logged energy_low 30 min ago — this is a low-effort task.").

### Brain dumps
**Already complete.** Text + voice (Groq Whisper) + photo. Don't touch the capture flow. The Mirror view will consume `brain_dumps` as one of its data sources.

### Momentum
Currently a "no streaks, no guilt" progress visualization. **Don't add streak mechanics or comparison to Patterns.** Patterns can optionally surface in Momentum-adjacent ways but the no-shame principle is sacred.

---

## ND-design principles (the rules of engagement)

These come from `nd-design.skill` and apply to every UI decision in this work. Internalize them before writing any user-facing copy or component.

1. **Reduce decisions, don't add them.** Smart defaults. One primary action per screen. Curate aggressively.
2. **Externalize executive function.** Auto-save everything. Show progress. Make actions reversible.
3. **Respect sensory boundaries.** No autoplay. Motion is purposeful. Color is never the *sole* signal.
4. **Be predictable, not rigid.** Same component, same behavior, every time. But allow density/layout customization.
5. **Say what you mean.** No idioms. Confirmations confirm the actual thing ("Energy crash logged" not "Done!"). Errors are actionable.
6. **Support non-linear thinking.** Multiple entry points. Search works. Backtracking has no penalty.
7. **Make progress visible and rewarding** — but never punitive. No streaks. No "you missed a day."

**For this work specifically:**
- Moment chips never animate jarringly. Tap = subtle state change, no celebration.
- Mirror view's empty state is warm and explanatory, never blank or guilt-inducing.
- Patterns are observations, never verdicts. Never predictions. Never comparisons.
- Health import shows progress determinately during parse — never indeterminate spinners.

---

## Anti-patterns to actively avoid

These are patterns neurotypical designers reach for that *actively harm* ND users. Don't build any of these:

- ❌ **Streaks on Moment-logging.** "5 days in a row of mood logging!" → instant shame trigger when broken
- ❌ **Weekly/monthly summaries that read as report cards.** "You had 4 focus blocks this week (down from 6 last week)"
- ❌ **Notifications about logging itself.** "You haven't logged a moment today" — never
- ❌ **Predictive patterns.** "You'll probably crash at 3 PM today" — patterns are observational only
- ❌ **Comparison to other users or population norms.** "Most people log moments 3x per day"
- ❌ **Forced onboarding tours for new features.** Offer, don't force. Always re-accessible from help.
- ❌ **Smart reordering of Mirror entries.** Strict chronological. Don't algorithmically rerank.
- ❌ **Confetti/celebration on "good" moments.** Subtle acknowledgment only. Patronizing celebration is corrosive.
- ❌ **Color as the sole signal.** Every typed entity needs an icon AND a text label, not just a color.
- ❌ **Tooltips as the only documentation.** Hover-to-discover is hostile on touch and to keyboard users.

---

## Out of scope (don't build)

For the v1 of this entire layer:

- Custom user-defined Moment types (start with the 7-type vocabulary, expand based on usage data)
- Multi-modal Moments (no photo/voice attachments — that's what brain_dumps are for)
- Live HealthKit sync (architecturally impossible without native iOS — declined)
- Other health platforms (Garmin, Fitbit, Oura, Google Fit) — Apple Health XML only
- Editing entries from within Mirror view (read-only — tap to navigate to source)
- Search within Mirror view
- Week/month aggregate Mirror views
- Sharing or exporting any of this data
- ML-based pattern detection (deterministic statistical correlations only)
- LLM-generated pattern observations (use templates — testable and predictable)
- Notifications when new patterns detected (must be pull-based)
- Cross-user pattern aggregation
- Importing medical-grade data types (BP, glucose, ECG) — explicitly excluded for liability

---

## Success criteria for the whole effort

Beyond per-patch criteria (which live in each ChaosPatch entry), the overall reflection layer succeeds if:

1. **A typical CC user can log a moment in under 2 seconds** from any screen
2. **Mirror view loads a full day** (up to ~50 entries) **in under 200ms**
3. **Apple Health import handles a 100MB XML file** without crashing the browser
4. **Crisis Mode detection accuracy improves** measurably with Moment signals (existing telemetry should show this)
5. **AI Recommendations feel meaningfully more contextual** when recent moments exist (subjective but real)
6. **Patterns surface defaults to zero visible patterns** until user opts into types
7. **No pattern appears before its data threshold is met** — strict enforcement
8. **Every pattern can be dismissed in one tap** with feedback persisted

---

## Reference materials

- `nd-design.skill` — full ND-design principles
- `docs/development guides/vision-and-development-guide.md` — broader CC vision
- `docs/system-architecture-description.md` — existing architecture
- `docs/ControlledChaos_Theoretical_Framework.md` — theoretical grounding
- ChaosPatch project `controlledchaos` — the four patches with detailed spec notes
- ChaosPatch project `chaosstream` — archived, contains the reasoning history for the merger

---

## A note on the "why" of all this

CC is already an excellent ADHD task manager. The reflection layer is what makes it a *complete* executive function companion. Tasks alone tell you what to do; reflection tells you who you are over time. For neurodivergent users especially, having an honest mirror — one that doesn't shame, doesn't predict, doesn't compare — is a rare and valuable thing.

Build it like that matters, because it does.

— Spec'd by Coru and Nae, 2026-04-17.
