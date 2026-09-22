#!/usr/bin/env bash
#
# Upload ControlledChaos's server-side env vars to the Cloudflare Worker.
#
#   ./scripts/push-cf-secrets.sh            # dry run — prints key names only
#   ./scripts/push-cf-secrets.sh --apply    # actually upload
#
# Reads .env.production.local. Values are never echoed and never written to
# disk — the JSON goes straight down a pipe to `wrangler secret bulk`.
#
# WHY NOT .env.local:
# .env.local holds DEVELOPMENT values. ControlledChaos runs a Clerk *dev*
# instance locally and a *prod* instance in production, and they have separate
# user stores — so a Worker built from .env.local authenticates against the
# wrong Clerk instance and every user looks brand new. That shipped once; hence
# this file. Assume anything can differ between dev and prod, not just Clerk.
#
# NEXT_PUBLIC_* are excluded here on purpose: Next inlines them into the bundle
# at BUILD time, so a secret upload cannot fix them. They come from
# .env.production.local too, which `next build` reads in preference to
# .env.local when NODE_ENV=production. That is why the prod publishable key
# belongs in that file and not just in wrangler secrets.
#
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.production.local"

if [ ! -f "$ENV_FILE" ]; then
  cat >&2 <<MSG
Missing $ENV_FILE

It must hold the PRODUCTION values (the ones Vercel serves), not the dev ones
in .env.local. At minimum these differ between the two environments:

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   pk_live_... (dev is pk_test_...)
  CLERK_SECRET_KEY                    sk_live_... (dev is sk_test_...)

Check every other key too — DATABASE_URL especially.

  vercel env pull $ENV_FILE --environment=production

That file is gitignored by .env*.local. Never commit it.
MSG
  exit 1
fi

# Fail loudly on dev Clerk keys rather than shipping a broken auth config.
if grep -qE '^(NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_|CLERK_SECRET_KEY=sk_test_)' "$ENV_FILE"; then
  echo "$ENV_FILE contains pk_test_/sk_test_ Clerk keys — those are the DEV instance." >&2
  echo "Production needs pk_live_/sk_live_, or users authenticate against an empty user store." >&2
  exit 1
fi

JSON=$(
  grep -vE '^\s*(#|$)' "$ENV_FILE" \
  | grep -vE '^(NEXT_PUBLIC_|VERCEL_)' \
  | python3 -c '
import json, sys
out = {}
for line in sys.stdin:
    if "=" not in line: continue
    k, v = line.rstrip("\n").split("=", 1)
    out[k.strip()] = v.strip().strip("\"").strip("'"'"'")
print(json.dumps(out))
'
)

echo "Source: $ENV_FILE"
echo "Keys to upload:"
python3 -c 'import json,sys; [print("  " + k) for k in sorted(json.loads(sys.argv[1]))]' "$JSON"

if [ "${1:-}" != "--apply" ]; then
  echo
  echo "Dry run. Re-run with --apply to upload."
  exit 0
fi

echo
printf '%s' "$JSON" | npx wrangler secret bulk
