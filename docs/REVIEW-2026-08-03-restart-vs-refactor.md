# ControlledChaos Codebase Review — Restart vs. Refactor Decision
**Date:** 2026-08-03
**Stack:** Next.js 16 (App Router, Turbopack) + TypeScript strict + Neon/Drizzle + Convex (partial) + Clerk + Claude Haiku/Sonnet + Vercel
**Project type:** Production PWA, single maintainer, 370 commits, live at controlledchaos.adhdesigns.dev
**Purpose of this review:** Evidence for a restart-vs-refactor decision, not a general audit. Every claim below is backed by a command run or file read in this session — see inline citations.

---

## Executive Summary

The foundations are meaningfully healthier than the "buggy and heavy" feeling suggests: **`tsc --noEmit` passes with zero errors, `pnpm lint` has zero errors (only 94 warnings, all from two recently-added rules), all 90 tests pass, and the production build compiles in ~20s.** The bug history is real but **concentrated in four named subsystems** (PWA/service-worker lifecycle, Calendar timezone/recurrence, Crisis AI-JSON-parsing, Notification triggers) — not spread evenly across the app. The schema itself (27 Drizzle tables) is reasonably normalized with sensible indexes and no significant drift.

The actual blocker for your offline-first goal isn't code quality — it's that **the app has no local-write layer of any kind today** (zero IndexedDB, effectively zero localStorage-as-data-cache). Every one of 66 API routes is a hard round trip to Neon's HTTP-only serverless driver, which itself has no live-query or offline story. That's not something a refactor "unlocks" either — it's new infrastructure either way.

**Recommendation: targeted fixes on the known bug clusters + a strangler-fig build-out of the offline-first layer. Not a full restart.** Details and reasoning in §5.

---

## 1. Architecture Health

### Schema (Neon/Drizzle) — 🟡 solid, some complexity to manage
- 27 tables in `src/lib/db/schema.ts`, consistent conventions: UUID PKs, `deletedAt` soft-deletes on user-facing entities (tasks, goals, moments), `jsonb` used pragmatically for AI-shaped or genuinely variable data (`progressSteps`, `crisis_plans.tasks`, `notification_prefs`) rather than over-normalizing everything.
- Indexing is deliberate and specific — e.g. `idx_tasks_user_deadline`, bidirectional-unique friendship constraint via `LEAST/GREATEST` (added in commit `dc6d51c` to close a real duplicate-friend bug), unique `(microtask_id, completed_date)` for daily-reset logic. This is not a schema that was never thought through.
- Only 5 migration files track all 27 tables, journal (`drizzle/meta/_journal.json`) is in sync with the migration files present — no orphaned or missing migrations found.
- One legacy field, explicitly marked: `brain_dumps.mediaUrl` ("back-compat; prefer mediaUrls"). This is the *only* legacy/deprecated marker in the entire schema — not evidence of drift.

### The two-database reality — 🟡 deliberate, but real complexity
`convex/schema.ts` exists alongside Drizzle/Neon, with its own `presence` and `roomEvents` tables, plus `crons.ts`, `auth.config.ts`, `presence.ts`. This is **not dead code or an abandoned migration** — a comment in the file states the intent explicitly: "Parallel Play — ephemeral real-time layer. Persistent room membership lives in Drizzle/Neon. This file holds only what needs reactive subscriptions and short-lived state." It's wired into 8 files (`use-parallel-play-sync.ts`, `PresenceBubble(s).tsx`, `RoomManager.tsx`, etc.).

This is a reasonable polyglot-persistence choice for its scope, but it means the codebase already has **two different sync/consistency models** live in production: HTTP-request/response for everything durable, and Convex's reactive subscriptions for presence only. That split matters directly for your offline-first plan — see §6.

### Data-layer implications for offline-first — 🔴 the real gap
- `@neondatabase/serverless` in `neon-http` mode has no persistent connection and no live-query mechanism — every query is its own fetch. The app is already "always-online" at the lowest layer.
- Searched the whole `src/` tree: **zero uses of `indexedDB`**, and only one file touches `localStorage` at all (used for AI-recommendation persistence and changelog-seen tracking — not app data caching). There is no local-first write path to strangler-fig *onto* — this is genuinely greenfield work no matter what you decide about the rest of the app.
- This is good news for the restart-vs-refactor question specifically: the offline-first buildout doesn't get easier or harder depending on whether you restart, because nothing in the current architecture does it halfway. You're not fighting existing offline anti-patterns — there simply aren't any to unwind.

### Documentation drift — 🟡 minor but real
`docs/system-architecture-description.md` (marked "v2.0, last updated April 2026") says: 14 core tables (actual: 27), and that push notifications run on Sonnet (code switched to Haiku in commit `7ebe7b9`, "perf(ai): switch push notifications from Sonnet to Haiku, trim prompt examples"). Nothing depends on this doc being right, but it means **docs aren't a reliable map of the system** — a future contributor (or a future me) has to read code, not docs, to get the real picture.

### Biggest remaining "god file" — 🟢 self-correcting pattern already in place
`mcp/src/tools.ts` is 2,449 lines — the one large undifferentiated file left. Notably, the project already did this exact cleanup once: commit `dc8281c1` split a 3,103-line `queries.ts` into 12 per-domain files (`queries/tasks.ts`, `queries/crisis.ts`, etc.) — now the largest query file is 405 lines. That's evidence of a maintainer who *does* pay down structural debt when it gets painful, which is a meaningfully different signal than debt that never gets addressed.

---

## 2. Bug Concentration — clustered, not evenly spread

Analysis basis: full 370-commit history, tagged with conventional-commit scopes (`fix(scope): ...`), plus file-churn counts (`git log --name-only`).

**`fix()`-scoped commits by subsystem (top 5):**
| Scope | Fix commits |
|---|---|
| `pwa` | 8 |
| `crisis` | 6 |
| `ui` | 5 |
| `calendar` | 5 |
| `notifications` | 4 |

Everything else (tasks, users, settings, friends, microtasks, momentum, moments, etc.) sits at 1–2 fix commits each. **The top 5 scopes account for more distinct bug-fix commits than the other ~20 scopes combined.**

### Named worst offenders

**1. PWA / service-worker lifecycle — the single most re-litigated bug in the project.**
8 dedicated fix commits across versions v2.1.1 → v2.8.9, all variations on one root cause: iOS demoting the installed PWA back to a plain Safari tab. `public/sw.js` documents the accumulated understanding in a comment: *"We deliberately do NOT call skipWaiting(): on iOS standalone PWAs, an in-session SW swap fires controllerchange during page init and the OS demotes the window."* Each fix (scope gating, launch-handler, notification-click navigation via `postMessage` instead of `client.navigate()`, manifest `id` stability) addressed a new edge of the same underlying platform quirk. This is hard-won, non-obvious knowledge — the kind that gets silently lost in a rewrite.

**2. Calendar — highest single-component churn in the repo.**
`src/components/features/calendar/week-view.tsx` is 1,157 lines and was touched **29 times**, more than any other component in the codebase. Combined with 5 dedicated `fix(calendar)` commits: all-day Canvas events off by 24h on UTC servers, recurring-series time edits, midnight/hour-24 boundary handling, AI auto-note timezone rendering. This is exactly the class of bug your own CLAUDE.md flags in its Common Issues table ("Timezone bugs → Read the global CLAUDE.md timezone rules") and the reason a dedicated `tz-audit` skill exists — timezone handling here is a known, recurring soft spot, not a one-off.

**3. Crisis mode — symptom of a broader "untrusted LLM JSON" fragility.**
`src/lib/ai/crisis.ts` (221 lines) plus `api/crisis/route.ts`: 6 fix commits — JSON extraction failures requiring a bracket-scan fallback (now centralized in `src/lib/ai/validate.ts`'s `extractJSON`), output truncation (`max_tokens` 1024→2048), panic-label length constraints, datetime normalization before sending to the API. The underlying issue — parsing structured output from an LLM that doesn't always return clean JSON — is a pattern repeated everywhere the app calls Haiku/Sonnet for structured data (recommend, schedule, parse-dump), so crisis mode is likely just the most-exercised example of a fragility that exists project-wide.

**4. Notifications / push triggers — the most complex business logic in the app.**
`src/lib/notifications/triggers.ts` (848 lines, 31 churns) and `api/cron/push-triggers/route.ts` (511 lines, 30 churns) are the two most-changed non-generated files after the AI prompt library. Fix history: duplicate push deliveries from stale subscriptions, quiet-hours gating racing ahead of AI generation, mobile notification-popover scroll bugs, auto-heal for rotated push subscriptions (most recent commit, `bbfea01`). This is where deadline math, assertiveness-mode caps, quiet hours, and geofence dedup all intersect — genuinely the hardest logic in the codebase, and the fix history reflects that.

**5. Parallel Play / Friends — newest area, worth watching, not yet a top offender.**
15 `feat(parallel-play)` commits (heaviest feature investment of any single scope) but comparatively few fixes so far — plausibly because it's newest and least exercised in production, not because it's inherently more solid. It's also the one place a second database (Convex) is in play, which is worth flagging for extra scrutiny before it accumulates the same kind of history as calendar/notifications.

**By contrast**, core Tasks CRUD, Goals, Medications, Momentum, and non-crisis AI parsing show low fix counts — the base task-management loop is comparatively stable. **The pain is real but narrow**, which matters directly for the restart-vs-refactor call.

---

## 3. UI/UX & Feature Completeness

- **25 `ui`-scoped commits**, mostly `feat` rather than `fix` — active, ongoing design iteration: typography swapped to Fraunces/IBM Plex Sans, color palette reworked twice, Settings rebuilt as a single search-first list, sidebar utilities consolidated into the Clerk avatar menu, global ⌘K command palette added, TaskCard simplified. This reads as **design churn/indecision more than instability** — several commits redo the same surface (TaskCard, Settings, sidebar) more than once.
- `src/components/layout/app-shell.tsx` is the **second-highest-churn file in the repo** (35 changes) — the central shell keeps needing rework as new top-level surfaces (Friends, Parallel Play, ⌘K, notification bell) get bolted onto navigation.
- Mobile responsiveness has its own audit history: a dedicated `mobile-check` skill and `docs/mobile-verification/issue-9-report.md` exist, with fixes for touch targets and chip collapsing already shipped (`7a12d52`, `4f97bc9`, `f639346`). Good that it's been audited — but its existence as a recurring dedicated audit also signals mobile bugs keep resurfacing.
- Feature surface is broad for a single-maintainer app: brain dump (text/voice/photo), tasks, AI recommend-next, crisis mode, Canvas calendar sync, medications, goals, moments/mood logging, microtasks, friends/parallel-play/presence, push + email notifications, geofencing. 66 API routes total. This breadth is very likely a real contributor to the "heavy" feeling independent of bug count — there's just a lot of surface area to hold in your head.
- No offline UX exists today beyond a static app-shell cache in the service worker (5 routes cached, network-first with fallback) — there's no "you're offline, here's what you can still do" state anywhere in the UI.

---

## 4. Developer Experience

Ran directly in this session, not estimated:

| Check | Result |
|---|---|
| `pnpm install` | Clean, 11.4s |
| `npx tsc --noEmit` | **0 errors**, 12.3s, strict mode on, only 2 raw `any` in all of `src/` |
| `pnpm lint` | **0 errors**, 94 warnings — 100% from two recently-added rules (`react-hooks/set-state-in-effect`, `@typescript-eslint/no-floating-promises`, added in `6fd0539`) |
| `pnpm test` (vitest) | **90/90 passing**, 6 test files, 691ms total |
| `next build` (Turbopack) | Compiles in ~20.5s; fails only at page-data collection for lack of `DATABASE_URL` in this sandbox — not a code defect |

**What this means:** the "buggy" feeling is not a type-safety or lint-discipline problem — those signals are clean. The 94 lint warnings are worth burning down (floating promises in particular can silently swallow real errors — e.g. `use-notifications.ts:35`, `confetti.ts` has 14 of them), but none are currently causing failures.

**Where DX actually hurts:**
- **Test coverage is thin and lopsided.** 6 files test timezone math, energy scoring, schedule logic, crisis-moments, recap assembly, Canvas sync — genuinely useful, but there is **zero test coverage** for any of the 66 API routes, for `notifications/triggers.ts` (the single most-changed logic file in the app), or for the AI JSON-parsing path in `crisis.ts` that's been fixed 6 times. The tests that exist are in exactly the right spirit (pure-logic unit tests, fast) — there just aren't enough of them where the bugs actually cluster.
- **Docs drift** (see §1) means the written architecture description isn't trustworthy without cross-checking code.
- **`mcp/src/tools.ts`** at 2,449 lines is the one remaining oversized file, a good candidate for the same domain-split treatment `queries.ts` already got.

**What's working well and shouldn't be disrupted:** strict TypeScript is actually enforced (not just declared), conventional commits with scope tags are used consistently across 370 commits (this review would have been much harder without that discipline), semver is bumped almost every commit, and there's a track record of proactively splitting god-files when they become a problem.

---

## 5. Recommendation: Targeted fixes + strangler-fig for offline-first. Not a restart.

**Reasoning, tied to what was actually found:**

1. **The foundations you'd be throwing away are good.** Zero type errors, zero lint errors, a normalized schema with real thought behind its indexes and constraints, and 370 commits of hard-won bug fixes (the iOS PWA lifecycle alone represents 8 rounds of platform-specific trial and error you would almost certainly have to re-learn from scratch in a rewrite). A restart doesn't fix any of the actual named problems — it just defers them and adds the risk of re-introducing bugs already closed.
2. **The bug burden is concentrated, not systemic.** Four subsystems (PWA lifecycle, calendar timezone/recurrence, crisis AI-parsing, notification triggers) account for the majority of real fix commits. That's a targeted-fix problem, not a "the whole codebase is rotten" problem. If bugs were evenly smeared across every feature, restart would be a much stronger case — they aren't.
3. **Offline-first is additive work either way.** There is currently no local-write layer, no sync queue, no conflict resolution anywhere in the stack — restarting doesn't make this easier, because there's nothing today to migrate away from. You'd build this exact new layer whether you restart or keep the current app underneath it.
4. **"Heavy" is more likely feature-surface breadth than architectural rot.** 66 API routes across 12+ feature areas for a solo-maintained app is a lot to hold in your head, and it shows up as churn in the shell/navigation layer, not as broken foundations.

### Concrete shape of the recommended plan

**A. Targeted fixes (weeks, not months):**
- Add test coverage where churn + fix-count is highest and coverage is currently zero: `notifications/triggers.ts` and the AI JSON-parsing path (`ai/crisis.ts`, `ai/validate.ts`'s `extractJSON`) first.
- Burn down the 94 lint warnings, prioritizing the `no-floating-promises` ones — those are real bug risk (silently swallowed errors), not style noise.
- Split `mcp/src/tools.ts` the same way `queries.ts` was split.
- Reconcile `docs/system-architecture-description.md` with the real schema/model choices (or delete it if it's not going to be kept current — a stale doc is worse than no doc).

**B. Strangler-fig for offline-first (the actual new capability you want):**
Build the local-first write layer as a new layer in front of the existing Neon/Drizzle API routes, rolled out one entity at a time rather than all at once:
1. **Pilot on Tasks** — the most stable, lowest-fix-count entity, and the core loop. Prove the local-write + sync-queue + conflict-resolution pattern here first.
2. **Extend to Moments/Microtasks** — simple, high-frequency, mostly single-writer — a good second test of the sync engine under real usage before it touches anything complex.
3. **Leave Crisis, Calendar, and Notifications for last**, deliberately, until the sync engine is proven — these are exactly the subsystems with the most timing-sensitivity and the most existing bug history; layering an unproven sync engine under them first would be the highest-risk order, not the lowest.
4. **Decide explicitly whether Convex expands or stays scoped to presence** — see §6 below. This is a real fork in the road and should be a deliberate decision, not something you back into by accident while building the sync queue.

**Do not do a full restart.** The evidence doesn't support it: the parts that would need to be identical in a rewrite (schema shape, business rules, hard-won platform fixes) are already solid, and the parts that are broken are narrow enough to fix in place.

---

## 6. If offline-first architecture is being designed fresh (applies to the strangler-fig build-out too)

Since this is the one capability you explicitly want built in from day one rather than retrofitted, here's what a clean implementation needs to get right — relevant whether it's layered onto the current app (recommended) or, if you later decide otherwise, a full rebuild:

- **Local writes first, always.** Every mutation (create task, complete task, log a moment) should write to a local store (IndexedDB — via something like Dexie or `idb`) synchronously and update the UI optimistically *before* any network call happens. The current architecture does the literal opposite: every mutation is API-route-first with no local fallback. This is the core inversion the whole effort is about.
- **A durable, inspectable sync queue** — not "retry the last fetch." An ordered queue of pending operations with idempotency keys, so a flaky connection replaying "complete task X" twice doesn't double-fire a notification. (The codebase has already hit exactly this class of bug once, with duplicate push-notification deliveries from stale/duplicate subscriptions — the fix pattern there, dedup + idempotent upsert, is the right instinct to generalize into the sync queue.)
- **Per-entity conflict resolution, decided deliberately, not applied uniformly.** Tasks/Moments/Goals are effectively single-writer (one user, rarely concurrent edits across devices) — last-write-wins with a server timestamp is probably sufficient. Friends/Rooms/Parallel Play are genuinely multi-writer and need either a CRDT-style merge or a server-authoritative model. Treating both classes the same is how naive offline-first implementations break.
- **Distinguish "device offline" from "device online but stale."** Most naive implementations only handle the first case; the second (server has newer data than the client's last sync) is where real bugs live.
- **Notification/push side effects must be idempotent and server-triggered only after sync confirms.** Client-side logic should never fire an AI notification against local-only, unsynced data — you'd get notifications for actions the server never actually received.
- **A real architectural fork worth deciding explicitly: broaden Convex's role, or hand-roll a queue on top of Neon.** Convex is *already* a reactive, sync-capable database in this codebase today — currently scoped only to Parallel Play presence. Rather than bolting a separate local-first/IndexedDB layer onto the Neon HTTP driver (which has zero live-query story), an honest option is extending Convex's scope to cover more of the app's mutable state, since it already solves reactive sync. This is a real trade-off (two datastores to reason about vs. one more capable one) that deserves a deliberate decision up front — not something to discover mid-build.

---

## Dimension Summaries

### Architecture: 🟡 sound schema, real complexity from two databases, zero offline layer to build on
### Bug concentration: 🟡 real but narrow — 4 named subsystems, not systemic
### UI/UX & Features: 🟡 broad, ambitious, some design churn/indecision, no offline UX
### Dev Experience: 🟢 clean types/lint/build, 🔴 thin test coverage exactly where bugs cluster

## Strengths (worth preserving through any migration)
- Strict TypeScript actually enforced, not just declared (0 errors, 2 raw `any` in ~285 files).
- Consistent conventional-commit + semver discipline across 370 commits — made this entire review possible.
- Self-correcting habit of splitting god-files under real pain (`queries.ts` 3,103→12 files).
- Hard-won, documented platform knowledge (iOS PWA lifecycle comments in `sw.js`) that a rewrite would risk losing.
- A shared `extractJSON` utility already centralizes the "untrusted LLM JSON" fragility fix — the right instinct, just needs to be leaned on harder and tested.
