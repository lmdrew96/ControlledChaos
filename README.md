# ControlledChaos

**AI-powered ADHD executive function companion.**
*Your brain has the ideas. I'll handle the rest.*

🌐 [controlledchaos.adhdesigns.dev](https://controlledchaos.adhdesigns.dev)

---

## What is this?

ControlledChaos is a productivity app built specifically for ADHD brains. Instead of forcing you into rigid systems that require the very executive function you're missing, it provides AI-driven external scaffolding grounded in cognitive science.

**Core loop:** Dump it (text, voice, photo) → AI parses into tasks → AI tells you what to do right now.

No guilt. No streaks. No rigid systems.

## Features

- **Brain Dump** — Text, voice (Groq Whisper), or photo input. AI parses unstructured thoughts into tasks.
- **Task Feed** — Drag-and-drop reorder, energy/priority/category filtering, soft-delete with undo.
- **Calendar** — Canvas iCal import for academic schedules, with recurrence expansion.
- **AI Recommendations** — Claude Haiku picks the next-best task based on energy, time, and context.
- **Goals** — Long-horizon tracking with task linkage.
- **Crisis Mode** — Auto-detected overwhelm states with de-escalation support.
- **Momentum** — Lightweight progress visualization (no streaks, no guilt).
- **Push Notifications** — Configurable event/deadline reminders via Web Push.
- **Digest Emails** — Morning and evening summaries via Resend.
- **MCP Server** — Access your tasks from Claude Desktop / Claude Code (see [`mcp/README.md`](mcp/README.md)).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19, React Compiler) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui + Radix UI |
| Auth | Clerk |
| Database | Neon Postgres (serverless driver) |
| ORM | Drizzle ORM + drizzle-kit |
| AI | Claude Haiku 4.5 (`@anthropic-ai/sdk`) |
| Speech-to-Text | Groq (Whisper) |
| File Storage | Cloudflare R2 (S3 API) |
| Email | Resend + React Email |
| Push | Web Push (VAPID) |
| Calendar | `node-ical` (Canvas import) |
| Maps | Leaflet + react-leaflet |
| Animations | Framer Motion |
| Drag & Drop | dnd-kit |
| Testing | Vitest |
| Hosting | Vercel (serverless + cron) |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- A Neon Postgres database
- Accounts/keys for: Clerk, Anthropic, Groq, Cloudflare R2, Resend

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Fill in values (see table below)

# Push database schema
pnpm db:push

# Start dev server
pnpm dev
```

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key | Yes |
| `CLERK_SECRET_KEY` | Clerk backend key | Yes |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Clerk sign-in path (default `/sign-in`) | Yes |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Clerk sign-up path (default `/sign-up`) | Yes |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Post-login redirect (default `/dashboard`) | Yes |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Post-signup redirect (default `/dashboard`) | Yes |
| `DATABASE_URL` | Neon Postgres connection string | Yes |
| `ANTHROPIC_API_KEY` | Claude Haiku API key for AI features | Yes |
| `GROQ_API_KEY` | Groq API key for voice transcription | Yes |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID | Yes |
| `R2_ACCESS_KEY_ID` | R2 access key | Yes |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | Yes |
| `R2_BUCKET_NAME` | R2 bucket for brain dump media | Yes |
| `RESEND_API_KEY` | Resend API key for digest emails | Yes |
| `EMAIL_FROM` | From address (e.g. `ControlledChaos <digest@example.com>`) | Yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key — generate with `npx web-push generate-vapid-keys` | Yes |
| `VAPID_PRIVATE_KEY` | VAPID private key | Yes |
| `CRON_SECRET` | Shared secret for authenticating Vercel cron requests | Yes |
| `NEXT_PUBLIC_APP_URL` | App origin (e.g. `http://localhost:3000`) | Yes |

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build (auto-runs changelog generation) |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run Vitest once |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm changelog` | Regenerate `src/lib/changelog.generated.json` |
| `pnpm db:generate` | Generate Drizzle migration files |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:push` | Push schema directly (dev shortcut — no migration files) |
| `pnpm db:studio` | Open Drizzle Studio |

## Cron Jobs

Configured in `vercel.json`:

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/calendar-sync` | Every 15 min | Re-fetch Canvas iCal feeds |
| `/api/cron/push-triggers` | Every 15 min | Fire due push notifications |
| `/api/cron/morning-digest` | Every 15 min, 06:00–16:59 UTC | Send morning digest emails |
| `/api/cron/evening-digest` | Every 15 min, 22:00–04:59 UTC | Send evening digest emails |

All cron endpoints require the `CRON_SECRET` bearer token.

## Project Structure

```
src/
  app/
    (app)/          # Authenticated routes (dashboard, dump, tasks, calendar,
                    # goals, momentum, crisis, settings)
    (auth)/         # Clerk sign-in / sign-up
    api/            # REST endpoints (dump, tasks, calendar, notifications,
                    # recommend, goals, crisis, cron, etc.)
    onboarding/     # First-run flow
  components/
    ui/             # shadcn/ui primitives
    features/       # Feature components (brain-dump, task-feed, etc.)
    layout/         # App shell, providers, navigation
  lib/
    ai/             # Claude prompts + parsing
    calendar/       # Canvas iCal sync + recurrence expansion
    crisis-detection/
    db/             # Drizzle schema, queries, connection
    notifications/  # Web Push scheduling
    nudges/
    storage/        # R2 helpers
    timezone.ts     # UTC/local conversion helpers
  hooks/
  types/
mcp/                # Standalone MCP server (see mcp/README.md)
scripts/            # Maintenance scripts (changelog generator, migrations)
drizzle/            # Generated migration SQL
docs/               # Vision, architecture, specs
```

## Deployment

Deployed on Vercel. Pushes to `main` auto-deploy. Set every env var from the table above in the Vercel project settings. Add `vercel.json`'s cron schedule to the project (Pro plan required for scheduled cron).

## Documentation

- [Vision & Development Guide](docs/development%20guides/vision-and-development-guide.md)
- [System Architecture](docs/system-architecture-description.md)
- [Development Timeline](docs/development%20guides/development-timeline.md)
- [Theoretical Framework](docs/ControlledChaos_Theoretical_Framework.md)
- [MCP Server Setup](mcp/README.md)

## Status

MVP development, targeting public launch June 2026. See the [development timeline](docs/development%20guides/development-timeline.md) for current progress.

---

Built by Nae Drew. Grounded in cognitive science. Designed for the beautiful chaos of an ADHD mind.
