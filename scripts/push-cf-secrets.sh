#!/usr/bin/env bash
#
# Upload ControlledChaos's server-side env vars to the Cloudflare Worker.
#
#   ./scripts/push-cf-secrets.sh            # dry run — prints key names only
#   ./scripts/push-cf-secrets.sh --apply    # actually upload
#
# Reads .env.local and pipes it to `wrangler secret bulk`. Values are never
# echoed and never written to disk — the JSON goes straight down a pipe.
#
# NEXT_PUBLIC_* are deliberately excluded: Next inlines those into the bundle
# at build time (that is what the prefix means), so they need to be present
# when `pnpm cf:build` runs, not as Worker secrets. They already are, via
# .env.local. If a NEXT_PUBLIC_ value looks stale in production, rebuild —
# uploading it here would not fix it.
#
# VERCEL_* are excluded because they are Vercel's, not ours.
#
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] || { echo "no .env.local here" >&2; exit 1; }

# Strip comments/blanks, drop excluded prefixes, unquote values, emit JSON.
JSON=$(
  grep -vE '^\s*(#|$)' .env.local \
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

echo "Keys to upload:"
python3 -c 'import json,sys; [print("  " + k) for k in sorted(json.loads(sys.argv[1]))]' "$JSON"

if [ "${1:-}" != "--apply" ]; then
  echo
  echo "Dry run. Re-run with --apply to upload."
  exit 0
fi

echo
printf '%s' "$JSON" | npx wrangler secret bulk
