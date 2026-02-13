# ControlledChaos — Data Visualization Design

**Status:** Design finalized, pre-implementation
**Last Updated:** February 2026

---

## Guiding Principle

Data visualization in ControlledChaos exists to **externalize self-awareness** (Barkley's EF Model) and **reinforce competence** (Self-Determination Theory) — never to judge, shame, or pressure. Every visual element must pass one test: *does this make the user feel capable, or does it make them feel watched?*

---

## The Chaos Mosaic

The centerpiece data visualization. Lives on a dedicated **Insights** tab.

### Concept

Every brain dump the user creates becomes a **tile** in an organic, growing mosaic. Over time, the mosaic fills with color — a visual record of every idea captured and every task completed. It never resets, never shrinks, never punishes absence.

**Thesis:** Your chaos is becoming something beautiful.

### Visual Language

- **Flat rounded rectangles** — varied sizes, organic (non-grid) layout
- **No 3D.** No spheres, orbs, or depth effects. Flat, warm, tactile — like colored glass or stained glass
- **Color-coded by input type:**
  - Text dumps → cool blue (`rgb(96, 165, 250)`)
  - Voice dumps → warm amber (`rgb(251, 191, 36)`)
  - Photo dumps → soft purple (`rgb(192, 132, 252)`)
- **Tile size = task count** — dumps that spawned more tasks are physically larger. Big brain moments are visually prominent.
- **Brightness = completion** — incomplete dumps are dim, translucent whispers. Completed dumps are vivid, saturated, with a soft backlit glow (like light through stained glass). The dim → radiant spectrum should be **dramatic**, not subtle.
- **Completion dots** — small dots at the bottom of each tile showing individual task progress (filled = done, hollow = pending)
- **✦ sparkle** on fully completed tiles with a gentle pulse animation
- **Connecting arcs** — faint, subtle curved lines between nearby same-type dumps. Completed pairs glow slightly brighter. Gives a sense of constellation/network without being overwhelming.

### Layout

- **Golden-angle spiral** with physics-based collision resolution — tiles arrange organically outward from center
- **No date axis.** Not a calendar. Not a contribution graph. Just accumulation, left to right, outward from center.
- **Zoom/tap interaction** — tap any tile to see the original brain dump text, input type, age, and task completion progress bar

### Progression Over Time

| Timeframe | What It Looks Like |
|---|---|
| Week 1 | A few scattered tiles, mostly dim. A beginning. |
| Month 1 | Rows forming. Some tiles glowing. You can see which dumps led to action. |
| Month 3 | Rich clusters of color. Patterns emerge — text-heavy weeks, voice-dump phases. |
| Month 6+ | A dense, colorful mosaic. The accumulation itself is the reward. |

### What We Tried and Rejected

| Concept | Why It Was Cut |
|---|---|
| **Nebula** (particle cloud forming a star) | Emotionally resonant but technically expensive (WebGL), hard to get right visually on mobile, performance risk |
| **3D orbs/spheres** | Unsettling. Uncanny valley on dark backgrounds. Felt like floating eyeballs, not a mosaic. |
| **Coral reef / mycelium** | Beautiful but thematically disconnected from productivity. Too abstract. |
| **Constellation map** | Could get cluttered at scale. Constellations are inherently abstract — hard for users to parse meaning. |
| **Uniform grid (v1)** | Technically correct but emotionally flat. Felt like a spreadsheet, not something beautiful. |

### Technical Notes

- Rendered via **HTML Canvas** (2D context) — no WebGL, no 3D libraries
- Animation: `requestAnimationFrame` loop for gentle breathing/pulse effects
- Layout computed once via golden-angle placement + iterative collision resolution
- Connections computed between nearest same-type neighbors within a distance threshold
- Mobile-first: canvas scales responsively, touch targets sized for thumbs
- Prototype files: `chaos-mosaic-v3.jsx` (current), `chaos-mosaic-v2.jsx` and `chaos-mosaic-prototype.jsx` (archived iterations)

---

## Home Screen Insight Cards

Rotating insights surfaced on the main dashboard. One or two at a time, refreshed daily.

### Design

- **Single stat + one-line context** — e.g., "You've completed 47 tasks this month. That's 12 more than last month."
- **Small icon/emoji** alongside the text — warm, not corporate
- **Rotates daily** — different insight each visit so it feels fresh, not stale
- No charts, no graphs. Just a sentence that makes you feel something.

### Insight Types

1. **Volume insights** — "142 tasks completed" / "68 brain dumps captured." Cumulative, always growing.
2. **Pattern insights** — "You think in text — 45 typed dumps vs 12 voice." Helps users understand their own behavior.
3. **Completion insights** — "23 brain dumps fully resolved. Every task, done." Reinforces competence.

### Theory Mapping

| Insight Type | Cognitive Principle |
|---|---|
| Volume (cumulative totals) | SDT — Competence. Numbers only go up. No guilt. |
| Patterns (input preferences, timing) | Barkley — Self-Awareness. Externalizing self-monitoring. |
| Completion (resolved dumps) | Delay Aversion — Immediate proof that action leads to results. |

---

## Anti-Patterns (Never Do This)

These are **hard rules** for any data visualization in ControlledChaos:

1. **No streaks.** Ever. Streaks punish absence and create anxiety.
2. **No daily/weekly completion rates.** Percentages that go down are guilt machines.
3. **No comparison to other users.** This is a personal tool, not a leaderboard.
4. **No "you missed yesterday" messaging.** The app is patient. Always.
5. **No red/negative color coding for incomplete items.** Incomplete is neutral, not bad.
6. **No GitHub-style contribution graphs.** Date-axis grids inherently shame empty days.

---

## Post-MVP: Adaptive Intelligence Layer

Once enough user data has accumulated (weeks/months of usage), the visualization system feeds back into the AI recommendation engine:

- **Pattern detection** — "You get more done in 20-minute bursts than 2-hour blocks" → AI adjusts task sizing
- **Energy/time heatmaps** — historical productivity by time of day → AI recommends tasks at optimal windows
- **Input modality trends** — if voice dumps have higher completion rates, AI might nudge toward voice capture
- **Visual proof** — "Based on your patterns, I've adjusted your recommendations" with a simple visual showing why

The viz isn't just for the user to look at — it's proof that the system is learning them.

---

## Context Recommendation Visual (Post-MVP)

When the recommendation engine suggests a task, a simple infographic shows *why*:

📍 Location + ⏰ Time window + 🎯 Priority + 🔋 Energy level = **"Do this now"**

Not a dashboard. A single, clear visual per recommendation. Reduces the cognitive load of "why should I trust this suggestion?"

---

**Document Version:** 1.0
**Created:** February 13, 2026
**Author:** Nae Drew + Claude
**For:** ControlledChaos Development
