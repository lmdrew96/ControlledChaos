# ControlledChaos

**AI-powered ADHD executive function companion.**
*Your brain has the ideas. I'll handle the rest.*

---

## What is this?

ControlledChaos is a productivity app built specifically for ADHD brains. Instead of forcing you into rigid systems that require the very executive function you're missing, it provides AI-driven external scaffolding grounded in cognitive science.

**Core loop:** Dump it (text, voice, photo) → AI parses into tasks → AI tells you what to do right now

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19, React Compiler) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | Clerk |
| Database | Neon (Serverless Postgres) + Drizzle ORM |
| AI | Claude Haiku 4.5 (task parsing, recommendations) |
| Hosting | Vercel |

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Fill in Clerk keys, Neon DB URL, Anthropic API key

# Run database migrations
pnpm db:push

# Start dev server
pnpm dev
```

## Project Structure

```
src/
  app/           # Next.js App Router pages + API routes
    (app)/       # Authenticated routes (dashboard, dump, tasks, calendar, settings)
    (auth)/      # Clerk auth routes (sign-in, sign-up)
    api/         # API routes (dump, tasks)
  components/
    ui/          # shadcn/ui components
    features/    # Feature components (brain-dump, task-feed)
    layout/      # App shell, providers, navigation
  lib/
    ai/          # AI integration (prompts, parsing)
    db/          # Drizzle schema, queries, connection
  types/         # Shared TypeScript types
```

## Documentation

- [Vision & Development Guide](docs/development%20guides/vision-and-development-guide.md)
- [System Architecture](docs/system-architecture-description.md)
- [Development Timeline](docs/development%20guides/development-timeline.md)
- [Theoretical Framework](docs/ControlledChaos_Theoretical_Framework.md)

## Status

Building toward MVP (Feb 2026 → Jun 2026). See the [development timeline](docs/development%20guides/development-timeline.md) for current progress.

---

Built by Nae Drew. Grounded in cognitive science. Designed for the beautiful chaos of an ADHD mind.
