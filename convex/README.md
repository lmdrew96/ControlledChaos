# Convex — Parallel Play real-time layer

This directory holds the ephemeral half of Parallel Play. Persistent room membership lives in Drizzle/Neon; presence + room events live here.

## One-time setup (run from repo root)

```bash
npx convex dev
```

This walks you through:
1. Logging into your Convex account
2. Creating a project (suggested name: `controlledchaos-parallel-play`)
3. Linking it to this repo

It writes `CONVEX_DEPLOYMENT` to `.env.local` and starts a watcher that pushes `convex/*.ts` changes live.

## Clerk JWT template

In the Clerk dashboard for the ControlledChaos instance:

1. **JWT Templates** → **+ New template** → select **Convex**.
2. Issuer URL appears as `Frontend API URL` — copy it.
3. Save the template (no claim changes needed; the default `aud: "convex"` is what `auth.config.ts` checks).

Then in Convex (`npx convex dashboard` → Settings → Environment Variables):

- `CLERK_JWT_ISSUER_DOMAIN` = the Clerk Frontend API URL from step 2.

## Vercel env vars

Add to Vercel (Production + Preview + Development):

- `NEXT_PUBLIC_CONVEX_URL` — copy from `npx convex dashboard` → Settings → URL & Deploy Key
- `CONVEX_DEPLOY_KEY` — generate from the same page; used by `next build` to push functions during Vercel deploys.

Then set Vercel's build command to `npx convex deploy --cmd 'pnpm build'` so each prod deploy ships function changes alongside the Next.js bundle.

## Files

- `schema.ts` — `presence`, `roomEvents` tables
- `auth.config.ts` — Clerk identity provider
- `presence.ts` — mutations + queries (P4)
- `crons.ts` — idle detection + event cleanup (P10)
