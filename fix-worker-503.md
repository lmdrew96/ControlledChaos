# Fix Cloudflare Worker 503 Error

## Problem
Worker is returning 503 Service Unavailable. This means the worker is running but failing internally.

## Most Likely Cause
The API key isn't being received correctly or is invalid.

## Fix Steps

### Step 1: Replace worker.js with Improved Version

Replace the entire contents of `worker.js` with the improved version from `worker-improved.js`.

The improved worker has:
- Better error handling
- Case-insensitive API key header reading
- API key format validation
- Detailed error messages
- Console logging for debugging

### Step 2: Commit and Deploy

After replacing worker.js:
```bash
git add worker.js
git commit -m "Improve worker error handling and logging"
git push
```

Wait for Cloudflare to redeploy (1-2 minutes).

### Step 3: Check API Key in App

In the app, click Settings (⚙️) and verify:
- **Anthropic API Key** field has a key that starts with `sk-ant-`
- The key is complete (not truncated)
- Click "Save Settings"

### Step 4: Test Again

Try Brain Dump again. If it still fails:

**Check the Cloudflare Worker logs:**
1. Go to Cloudflare Dashboard
2. Workers & Pages → controlled-chaos-api
3. Click "Logs" tab
4. Try Brain Dump again
5. Watch the logs for the actual error

## Common Issues

### Issue 1: API Key Not Set
**Error:** "API key required"
**Fix:** Go to Settings → Add your Anthropic API key → Save

### Issue 2: Invalid API Key Format
**Error:** "Invalid API key format"
**Fix:** Make sure the key starts with `sk-ant-` (not `sk-` or anything else)

### Issue 3: API Key Invalid/Expired
**Error:** Status 401 from Anthropic
**Fix:** Get a new API key from console.anthropic.com

### Issue 4: API Quota Exceeded
**Error:** Status 429 from Anthropic
**Fix:** Check your Anthropic usage limits

## Testing Checklist

After deploying the improved worker:
- [ ] Settings shows Cloudflare Worker URL (not "YOUR-WORKER-URL")
- [ ] Settings has API key that starts with sk-ant-
- [ ] Clicked "Save Settings"
- [ ] Brain Dump test: Enter some tasks and click "Organize My Chaos"
- [ ] Check browser console for any errors
- [ ] Check Cloudflare Worker logs for detailed errors

## If Still Not Working

The improved worker will return better error messages. Share the exact error message from:
1. Browser alert dialog
2. Browser console (F12)
3. Cloudflare Worker logs

This will help diagnose the exact issue.
