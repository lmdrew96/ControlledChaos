# Claude Code Instructions for ControlledChaos

> Project-specific instructions. General coding conventions, git workflow, communication style, and identity are in the global CLAUDE.md — don't duplicate them here.

## Project Overview

ControlledChaos is an ADHD-friendly productivity app — task management, calendar integration, goal tracking, AI-powered scheduling, brain dumps, crisis mode, and push notifications. No guilt, no streaks, no rigid systems.

**Live:** controlledchaos.adhdesigns.dev
**Repo:** github.com/lmdrew96/ControlledChaos

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Framework** | Next.js 16 (App Router) | Vercel deployment |
| **Language** | TypeScript | Strict mode |
| **Styling** | Tailwind CSS 4 + shadcn/ui + Radix UI | `next-themes` for dark/light |
| **Database** | Neon Postgres (`@neondatabase/serverless`) | Serverless driver, NOT full `pg` |
| **ORM** | Drizzle ORM (`drizzle-kit`) | Type-safe queries, push/migrate/generate |
| **Auth** | Clerk (`@clerk/nextjs`) | Email + social providers |
| **AI** | Claude Haiku 4.5 (`@anthropic-ai/sdk`) | Task parsing, scheduling, crisis support |
| **Speech-to-Text** | Groq (`groq-sdk`) | Whisper — brain dump voice input |
| **File Storage** | Cloudflare R2 (`@aws-sdk/client-s3`) | Brain dump photos/audio |
| **Maps** | Leaflet + react-leaflet | Location features |
| **Animations** | Framer Motion | Micro-interactions, transitions |
| **Notifications** | Web Push (`web-push`) | Push notification scheduling |
| **Email** | Resend + React Email | Digest emails |
| **Calendar** | Canvas iCal (`node-ical`) | Academic schedule import — no Google Calendar integration |
| **Testing** | Vitest | Unit tests |

---

## Runtime Constraints

- **Vercel serverless functions** — cold starts, 10s default timeout (can extend to 60s on Pro)
- **Neon serverless driver (`neon-http`)** — supports **batched** transactions only via `db.transaction(async (tx) => {...})`. The callback may only contain sequential `tx.update()` / `tx.insert()` / `tx.select()` calls — no external `fetch`/AI calls/timers/conditional awaits between queries. Use this when you need atomic multi-row updates (see `reorderTasks` in `src/lib/db/queries.ts` for the canonical pattern). For interactive transactions (any await on something other than a `tx.*` query), neon-http does NOT support them — fall back to sequential plain queries with manual rollback logic.
- **No Node.js-specific APIs in edge routes** — if a route uses `export const runtime = 'edge'`, stick to Web APIs only

---

## Key Architecture

### Database
- Schema in Drizzle format (check actual path before writing to any table)
- Migrations via `drizzle-kit`: `pnpm db:generate` → `pnpm db:migrate`
- Quick dev iteration: `pnpm db:push` (pushes schema directly, no migration files)
- `pnpm db:studio` opens Drizzle Studio for visual DB browsing

### AI Integration
- All AI calls go through Claude Haiku 4.5 via `@anthropic-ai/sdk`
- Used for: task parsing from brain dumps, schedule recommendations, crisis support
- Keep calls cheap — Haiku, not Sonnet. Cache when possible.

### Push Notifications
- Uses `web-push` for server-side VAPID notification delivery
- Service worker handles client-side push events
- Notification scheduling is timezone-sensitive — see global CLAUDE.md timezone rules

### Calendar Integration
- Canvas iCal: URL-based import, parsed with `node-ical` — no auth needed
- Recurrence expansion handled in `src/lib/calendar/expand-recurrence.ts`
- Re-synced every 15 min via `/api/cron/calendar-sync`
- **No Google Calendar integration** — do not add `googleapis` or GCal OAuth without explicit request

### Changelog
- Auto-generated at build time via `scripts/generate-changelog.ts`
- `prebuild` script runs it automatically
- Output: `src/lib/changelog.generated.json`

---

## MCP Server

ControlledChaos has an MCP server (`cc_` prefixed tools) for Claude Desktop / Claude Code integration. When modifying MCP tools:
- Follow existing `cc_` naming convention
- Validate inputs
- Return markdown-formatted responses

---

## Build Commands

```bash
pnpm dev              # Next.js dev server
pnpm build            # Production build (runs changelog generation first)
pnpm db:generate      # Generate Drizzle migration files
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema directly (dev shortcut)
pnpm db:studio        # Open Drizzle Studio
pnpm test             # Run Vitest
pnpm test:watch       # Vitest watch mode
pnpm lint             # ESLint
```

---

## Common Issues

| Problem | Solution |
|---------|----------|
| DB connection fails | Check `DATABASE_URL` in `.env.local` — must be Neon connection string |
| Drizzle types out of sync | Run `pnpm db:generate` then restart TS server |
| Push notifications not firing | Check VAPID keys in env vars, verify service worker registration |
| Calendar import shows stale data | Canvas iCal feeds can be slow to update on Canvas's side; check the source URL directly before assuming it's a code bug |
| AI actions failing | Check `ANTHROPIC_API_KEY` in `.env.local` |
| Clerk auth issues | Check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` |
| Timezone bugs | Read the global CLAUDE.md timezone rules. Always test with explicit timezone examples. |
