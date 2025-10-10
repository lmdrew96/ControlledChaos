# Fix Cloudflare Worker URL

## Problem
The `CLOUDFLARE_WORKER_URL` has an incorrect path. The worker is deployed at the root domain, not at `/api/claude`.

## Fix Required

In `index.html`, find line 17 (around line 17):

**CURRENT (WRONG):**
```javascript
let CLOUDFLARE_WORKER_URL = 'https://controlled-chaos-api.lmdrew.workers.dev/api/claude';
```

**CHANGE TO:**
```javascript
let CLOUDFLARE_WORKER_URL = 'https://controlled-chaos-api.lmdrew.workers.dev';
```

**That's it!** Just remove the `/api/claude` part.

## Why This Fixes It

The Cloudflare Worker (worker.js) is deployed at the root path of the domain. When the app calls:
- ❌ `https://controlled-chaos-api.lmdrew.workers.dev/api/claude` → 404 Not Found
- ✅ `https://controlled-chaos-api.lmdrew.workers.dev` → Works!

The worker receives the request, adds CORS headers, and proxies to Anthropic's API.

## Testing After Fix

1. Make sure `worker.js` and `wrangler.jsonc` are committed to the GitHub repo
2. Let the Cloudflare Worker deploy successfully
3. After this URL fix, the AI features (Brain Dump, I'm Stuck, Auto-break deadlines) should work

## Note

The app already has the correct architecture:
- `callClaudeAPI()` function uses `CLOUDFLARE_WORKER_URL`
- Sends API key in `X-API-Key` header
- Worker adds CORS and proxies to Anthropic

This is ONLY a URL path correction.
