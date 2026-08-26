# ControlledChaos — Combined AI-Prompt / Timezone Audit

**Generated:** 2026-08-24 · **Version at audit time:** 2.15.1

**Method:** Read every file in `src/lib/ai/` (prompts, callers, validators) alongside `src/lib/timezone.ts`, then traced every date/time value that crosses the AI prompt boundary — from creation, through prompt injection, to how the AI's response is parsed back into the database. Cross-referenced against every non-AI timezone-sensitive code path (calendar UI, notifications, recurrence).

**Framing:** This was requested as a *combined* audit — timezone handling and AI-prompt design have been audited separately before but never together. That turned out to matter: the real bugs here live specifically at the seam between the two, not inside either system alone.

---

## TL;DR

The timezone utility library (`src/lib/timezone.ts`) is excellent — DST-aware, well-tested, correctly used almost everywhere. The AI prompt library (`src/lib/ai/prompts.ts`) is also well-built — heavy anti-hallucination guardrails, pre-computed relative times so the model rarely has to do date math itself.

The bugs are where the two meet: **a handful of call sites pass raw UTC timestamps into an AI prompt without timezone context, so the model has no way to reason about "local time" — and one of those sites has no code-level correction afterward either.** The codebase has already hit this exact bug class once and fixed it (see `calendar/events/route.ts`) with a comment explaining the fix — but the fix wasn't propagated to three other call sites that have the identical shape.

---

## 🔴 Finding 1 (Critical) — Auto-triage crisis plans use raw UTC time with zero timezone context

**File:** `src/lib/crisis-detection/cron-handler.ts`, `generateAutoTriagePlan()` (lines ~289–309)

The cron-triggered auto-triage path builds `CrisisParams` like this:

```ts
const params: CrisisParams = {
  taskName,
  deadline: firstDeadline.toISOString(),        // raw UTC
  currentTime: now.toISOString(),                // raw UTC
  ...
  upcomingEvents: calendarRows.map((e) => ({
    startTime: new Date(e.startTime).toISOString(),  // raw UTC
    endTime: new Date(e.endTime).toISOString(),       // raw UTC
    ...
  })),
  ...
};
```

`CrisisParams` has no `timezone` field at all, and nothing here calls `formatForDisplay`.

Compare this to the **manually-triggered** crisis flow in `src/app/api/crisis/route.ts` (both `POST` handlers), which does it correctly:

```ts
deadline: formatForDisplay(deadlineDate, timezone, DISPLAY_DATETIME),
currentTime,   // = formatForDisplay(now, timezone, DISPLAY_FULL_DATETIME)
upcomingEvents: formatEventsForAI(upcomingEvents, timezone),
```

**Why it's a real bug, not just style:** `CRISIS_SYSTEM_PROMPT` explicitly instructs the model:

> "TIME REFERENCES IN INSTRUCTIONS: NEVER use relative time... Use absolute times only: 'before 12 PM', 'by 3:30 PM'... The UI already shows a live countdown."

The model has to read the `Current time` / `Deadline` strings and produce clock-time instructions from them. When it's handed `"2026-04-14T23:00:00.000Z"` with no timezone stated anywhere in the prompt, the only reasonable reading is UTC-as-if-local — so for the app's default timezone (`America/New_York`, UTC-4/-5), every generated instruction like "finish by 7 PM" is off by 4–5 hours from what the user's clock actually says. This is exactly the auto-generated path (`tier === "auto_triage"`) — the one users never see being built, so a wrong "by 7 PM" instruction just silently sits in their crisis plan.

**Confirmed, not just inferred:** `CrisisParams.aiContextBlock` is optional, and `generateAutoTriagePlan`'s literal (lines 291–309) never sets it — so unlike the other AI call sites in this codebase, this path has no fallback source of timezone info either. The "zero timezone context" claim is exact, not approximate.

**Fix shape:** add `timezone: string` to `CrisisParams`, thread `userTimezone` (already available in `runCrisisDetection`) through to `generateAutoTriagePlan`, and format `deadline`/`currentTime`/`upcomingEvents[].startTime/endTime` the same way `api/crisis/route.ts` already does. Small, mechanical, contained to one function.

---

## 🟡 Finding 2 (Warning) — Task deadlines trust the AI's own UTC conversion; calendar events deliberately don't

**Files:** `src/lib/ai/prompts.ts` (`buildBrainDumpSystemPrompt`), `src/lib/ai/parse-dump.ts`

Brain dump parsing asks the AI to emit two different kinds of dates, and the app treats them with two different levels of trust:

- **Calendar events** — the prompt tells the AI to output *naive local wall-clock time*, no `Z` suffix ("Use the exact time the user said"). The app then explicitly does **not** trust any TZ math from the model — it runs the string through `toUTC(evt.startTime, timezone)`, which does the actual DST-aware offset conversion in code.
- **Task deadlines** — the prompt tells the AI to output a **UTC ISO 8601 string ending in `Z`** ("`GOOD: "deadline": "2026-04-04T23:59:00.000Z"`"), computed by the model itself from "the CURRENT DATE AND TIME and TIMEZONE... provided at the top". `parse-dump.ts` then takes that string as-is via `validateISODate()` — which only checks it parses and isn't absurdly old, with **no `toUTC()` pass, no offset correction.**

So for events, the code doesn't trust the model to do timezone arithmetic — for deadlines, it does, for the exact same brain-dump call. LLMs are unreliable at exact UTC-offset arithmetic (DST boundaries, less common zones, "end of day" semantics), and this is precisely the anti-pattern the codebase avoided for events.

**Illustrative wrinkle:** the prompt's own "GOOD" example reinforces the bug. `"deadline": "2026-04-04T23:59:00.000Z"` reads as "just append `Z` to the local wall-clock time" — which is the *naive-timestamp-treated-as-UTC* anti-pattern, not a real 11:59 PM `America/New_York` instant (that would be `2026-04-05T03:59:00.000Z` or `04:59:00.000Z` depending on DST). The example doesn't demonstrate correct offset math because doing so would require the model to already know the offset — which is the actual problem.

**Practical impact:** a deadline set from "end of day Friday" can land several hours into the wrong UTC day, which then risks tripping the *next* day's `startOfDayInTimezone` boundary in reminders/crisis-detection — a deadline that should read as "due tonight" could sort as "due tomorrow" or vice versa depending on which way the model's arithmetic drifted.

**What I could and couldn't verify:** I pulled your live pending tasks via `cc_list_tasks` looking for brain-dump-sourced deadlines with suspicious `:59:00` / offset-drifted timestamps. Everything currently pending is a "Prep: ..." task on the Canvas-assessment auto-prep path (a different code path from brain dump), and those are correctly localized — e.g. `Deadline: Sat, Nov 14, 2026, 10:00 PM EST` for an 11:59 PM Sun deadline, DST-correct across the Nov EDT→EST boundary. That's good evidence the *rest* of the deadline pipeline is sound, but it's the wrong code path to confirm or rule out this specific bug — there's currently no pending brain-dump-created task with a deadline to inspect. **This finding is a verified trust-boundary inconsistency in the code (confirmed by reading `prompts.ts` and `parse-dump.ts`), not a confirmed bad value on disk.** Worth a quick empirical check next time a deadline gets set via brain dump — compare the stored UTC value against what "end of day Friday" should actually convert to for your timezone.

**Fix shape:** two options, either legitimate:
1. Mirror the event pattern — have the AI emit a naive local deadline time (or just a local `HH:MM`/"end of day" flag) and convert with `toUTC()` in code, same as events.
2. If keeping the current "AI emits UTC" contract, at minimum fix the prompt's example to show *correct* offset math for a concrete timezone, and treat this as a known-lower-confidence field worth spot-checking in prod.

Option 1 is more consistent with how the rest of this codebase treats AI-timezone-math (never trust it) and is a small change confined to `buildBrainDumpSystemPrompt` + `parse-dump.ts`.

---

## 🟡 Finding 3 (Warning) — Auto-note prompts inject raw UTC deadlines with no timezone context

**Files:** `src/app/api/tasks/route.ts` (line 71), `src/app/api/tasks/[id]/chunk/route.ts` (line 54)

Both routes build their AI user-prompt with:

```ts
task.deadline ? `Deadline: ${task.deadline.toISOString()}` : null,
```

Both routes also append `aiCtx.formatted` right below this line, which *does* carry a `- Timezone: America/New_York`-style line plus correctly localized dates elsewhere in the context block. So the model isn't blind here the way it is in Finding 1 — it has what it needs to resolve the raw UTC instant, in principle. But it's being handed **two representations of time in the same prompt**: a raw UTC `Deadline:` line up top, and localized dates in the context block below it. That's an unforced error — asking the model to reconcile units instead of just giving it one consistent format — and it's the same mistake `calendar/events/route.ts` already ran into and fixed for the structurally identical "auto-generate a note" case:

```ts
// Format in the user's timezone — the server runs in UTC, so a bare
// toLocaleTimeString would render the UTC hour (e.g. 11 PM for a 7 PM EDT
// event) and the AI would write the wrong time into the note.
const eventTime = formatForDisplay(new Date(firstEvent.startTime), aiCtx.timezone, DISPLAY_TIME);
```

**Severity note:** lower than Findings 1–2 because neither `AUTO_NOTE_TASK_SYSTEM_PROMPT` nor `TASK_CHUNKING_PROMPT` explicitly asks the model to reason about *when* the deadline is — they're asking for a logistics tip / step breakdown, not a time-sensitive instruction. But a capable model can still incidentally reference "due tonight" / "due tomorrow morning" language based on a misread UTC timestamp, especially for deadlines that cross a local midnight boundary (a `02:00:00Z` deadline is 9-10 PM the *previous* evening in US zones — easy to misdescribe as "early morning").

**Fix shape:** swap both `task.deadline.toISOString()` lines for `formatForDisplay(task.deadline, aiCtx.timezone, DISPLAY_DATETIME)` — literally copy the pattern already proven in `calendar/events/route.ts`. Two-line fix each.

---

## 🟢 Verified correct — worth naming so it doesn't get "fixed" by accident

- **`src/lib/ai/recommend.ts`** — never lets the model see a raw date. Deadlines are pre-converted to `deadlineIn: "3 hours" / "OVERDUE"` strings before the prompt is built, and the prompt explicitly forbids the model from computing dates itself. This is the gold-standard pattern in this codebase.
- **`src/lib/ai/schedule.ts`** — free time blocks are computed as UTC instants in code (`findFreeBlocks`/`localHourToUTC`, both via `toUTC()`), and the AI is given both the UTC value and a human-readable local-time label (`localTime`) but told output must stay UTC. The model is doing selection/ranking, not offset arithmetic.
- **`src/lib/ai/context.ts`** (`buildAIContext`) — the shared context builder used by nearly every other AI call. Consistently timezone-aware: `startOfDayInTimezone`, `getCalendarParts`, and `formatForDisplay` used throughout; today/tomorrow bucketing for calendar events is done via timezone-correct calendar-part comparison, not raw Date math.
- **`src/lib/ai/snooze.ts`** — asks the AI for a relative `snoozeMinutes` integer, never an absolute time. No TZ exposure possible by construction.
- **`src/lib/notifications/triggers.ts`** — all AI-facing time context is relative ("Time until deadline: 3 hours") or timezone-correctly formatted; day-boundary checks use `startOfDayInTimezone`/`getHourInTimezone` consistently.
- **`src/app/api/crisis/route.ts`** (manual crisis flow) — the reference implementation for Finding 1's fix. Already does this right.
- **`src/lib/calendar/expand-recurrence.ts`** — DST-aware wall-clock preservation across recurrence expansion; its known edge-case limits are already documented (v2.14.1, per commit `fc57d7e`) and out of scope here.
- **Client-side calendar components** (`week-view.tsx`, `agenda-view.tsx`, `month-view.tsx`, `create-event-dialog.tsx`) — use bare `Date.setHours(0,0,0,0)` / `getDay()`. This is fine *because* it runs in the browser, where "local" genuinely means the user's device clock. Flagging only as a note: if a user's app-configured `timezone` setting ever diverges from their device's actual timezone (e.g., traveling, or manually overriding it in settings), calendar grid layout (client, device-TZ) and server-computed "today" boundaries (server, stored-setting-TZ) could disagree on what day something falls on. Low priority — would need a concrete report of the settings/device TZ ever diverging to be worth acting on.

---

## Secondary finding (not a timezone bug, but adjacent — surfaced during the same trace)

**`src/lib/ai/schedule.ts` — `generateSchedule()` doesn't verify AI-returned blocks actually fall inside a given free block.**

The prompt tells the model "ONLY schedule tasks into the provided free time blocks... verify: startTime ≥ freeBlock.start AND endTime ≤ freeBlock.end" — but the code-level safety net (`removeConflictsWithEvents` + `removeOverlappingBlocks`) only checks for conflicts with real calendar events and overlaps between the AI's own blocks. Nothing checks the returned `startTime`/`endTime` against the actual `freeBlocks` array it was given. `scheduleOneTask()` has the same gap. If the model ever hallucinates a time outside every free block (rare, but not structurally prevented), nothing catches it before it's saved as a scheduled block.

Worth a follow-up, but separate from this audit's scope — flagging since it lives in the same file as Finding 2's sibling logic and is a one-function fix (`blocks.filter(b => freeBlocks.some(fb => b.startTime >= fb.start && b.endTime <= fb.end))`).

---

## The actual answer to "what does running these concurrently reveal"

Not three unrelated mistakes — one missing rule. `calendar/events/route.ts` hit this exact bug shape once, fixed it, and left a comment explaining why. That fix never got generalized into something the other three call sites would automatically follow — there's no shared helper or convention that says "any date going into an AI prompt must be timezone-formatted first," so the same fix has to be independently rediscovered at every call site, and three of them haven't rediscovered it yet.

**Concrete fix:** a single wrapper in `src/lib/timezone.ts`, e.g. `formatForAI(date, timezone)` (probably just `formatForDisplay(date, timezone, DISPLAY_FULL_DATETIME)` under a name that signals its purpose), and a rule that any string built for an AI prompt uses it instead of `.toISOString()`. That turns "audit every call site by hand" into "grep for `.toISOString()` inside anything that touches `callHaiku`/`callSonnet`" — which is exactly the check that would have caught Findings 1 and 3 in one pass.

## Recommended fix order

1. **Finding 1** (crisis auto-triage) — highest impact, silent/unsupervised path, users never see it happen.
2. **Finding 3** (auto-note routes) — trivial two-line fixes, same proven pattern already in the codebase.
3. **Finding 2** (brain dump deadlines) — most involved of the three; needs a decision on which of the two fix shapes to take before touching code.
4. Secondary finding (free-block containment check) — cheap insurance, do whenever convenient.

None of these require new utilities — every fix reuses `formatForDisplay` / `toUTC`, both already in `src/lib/timezone.ts`.
