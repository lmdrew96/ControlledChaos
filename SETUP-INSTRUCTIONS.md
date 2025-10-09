# Controlled Chaos v4 - Setup Instructions

Follow these steps to set up cross-device sync and AI features for Controlled Chaos v4.

## Part 1: Deploy Cloudflare Worker (API Proxy)

The Cloudflare Worker acts as a secure proxy for the Anthropic API, allowing the app to work from any device without CORS issues.

### Step 1: Create Cloudflare Account
1. Go to https://dash.cloudflare.com/sign-up
2. Sign up for a free account (no credit card required)
3. Verify your email

### Step 2: Deploy the Worker
1. Log in to Cloudflare Dashboard
2. Click **Workers & Pages** in the left sidebar
3. Click **Create Application**
4. Click **Create Worker**
5. Give it a name like `anthropic-proxy` (or any name you like)
6. Click **Deploy**
7. After deployment, click **Edit Code**
8. Delete all the default code
9. Copy the entire contents of `anthropic-proxy.js` from this project
10. Paste it into the Cloudflare editor
11. Click **Save and Deploy**

### Step 3: Get Your Worker URL
1. After deploying, you'll see your worker URL at the top
2. It will look like: `https://anthropic-proxy.YOUR-SUBDOMAIN.workers.dev`
3. **Copy this URL** - you'll need it later
4. Your API endpoint will be: `https://anthropic-proxy.YOUR-SUBDOMAIN.workers.dev/api/claude`

✅ **Cloudflare Worker is now deployed!**

---

## Part 2: Enable Google Drive API

This allows the app to save your data to Google Drive for cross-device sync.

### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Sign in with your Google account
3. Click **Select a project** at the top
4. Click **New Project**
5. Name it "Controlled Chaos" (or any name)
6. Click **Create**
7. Wait for the project to be created (takes a few seconds)

### Step 2: Enable Google Drive API
1. In the Google Cloud Console, make sure your new project is selected
2. Go to **APIs & Services** > **Library** (or visit https://console.cloud.google.com/apis/library)
3. Search for "Google Drive API"
4. Click on **Google Drive API**
5. Click **Enable**

### Step 3: Create OAuth Credentials
1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** at the top
3. Select **OAuth client ID**
4. If prompted to configure consent screen:
   - Click **Configure Consent Screen**
   - Select **External**
   - Click **Create**
   - Fill in:
     - App name: "Controlled Chaos"
     - User support email: (your email)
     - Developer contact: (your email)
   - Click **Save and Continue**
   - Skip the Scopes page (click **Save and Continue**)
   - Skip the Test users page (click **Save and Continue**)
   - Click **Back to Dashboard**
5. Go back to **Credentials** and click **Create Credentials** > **OAuth client ID** again
6. Select **Web application**
7. Name it "Controlled Chaos Web"
8. Under **Authorized JavaScript origins**, click **Add URI** and add:
   - `http://localhost` (for local testing)
   - `file://` (for opening HTML file directly)
   - Any other domains where you'll host the app
9. Under **Authorized redirect URIs**, add the same URIs
10. Click **Create**
11. **Copy your Client ID** - it will look like: `123456789-abcdefg.apps.googleusercontent.com`

✅ **Google Drive API is now enabled!**

---

## Part 3: Configure the App

### Step 1: Update the HTML File
1. Open `controlled-chaos-v4.html` in a text editor
2. Find this line near the top of the `<script>` section:
   ```javascript
   const CLOUDFLARE_WORKER_URL = 'YOUR-WORKER-URL-HERE';
   const GOOGLE_CLIENT_ID = 'YOUR-CLIENT-ID-HERE';
   ```
3. Replace `YOUR-WORKER-URL-HERE` with your Cloudflare Worker URL from Part 1, Step 3
   - Example: `https://anthropic-proxy.myname.workers.dev/api/claude`
4. Replace `YOUR-CLIENT-ID-HERE` with your Google Client ID from Part 2, Step 3
   - Example: `123456789-abcdefg.apps.googleusercontent.com`
5. Save the file

### Step 2: Open the App
1. Double-click `controlled-chaos-v4.html` to open it in your browser
2. You should see a **"Sign in with Google"** button
3. Click it and sign in with your Google account
4. Grant permission to access Google Drive
5. The app will now save all your data to Google Drive!

✅ **App is now configured!**

---

## Part 4: Add Your Anthropic API Key

1. In the app, click **Settings** (⚙️)
2. Paste your Anthropic API key
3. Click **Save Settings**
4. Your API key is stored securely in Google Drive (not in the Cloudflare Worker)

✅ **AI features are now enabled!**

---

## How It Works

### Data Storage
- All your tasks, schedule, and settings are saved to Google Drive as `controlled-chaos-data.json`
- Changes sync automatically across all your devices
- Works offline - changes are queued and synced when you're back online

### API Proxy
- When you use AI features (Brain Dump, I'm Stuck), the app sends requests to your Cloudflare Worker
- The worker forwards them to Anthropic's API with your API key
- This avoids CORS issues and works from any device

### Security
- Your API key is stored in Google Drive (encrypted by Google)
- The Cloudflare Worker never stores your API key
- Only you can access your Google Drive data

---

## Troubleshooting

### "Sign in with Google" button doesn't work
- Make sure you added the correct Client ID in the HTML file
- Check that you enabled the Google Drive API
- Try opening the file in a different browser

### AI features not working
- Make sure you deployed the Cloudflare Worker correctly
- Check that you added the correct Worker URL in the HTML file
- Verify your Anthropic API key is valid

### Data not syncing
- Make sure you're signed in to Google
- Check your internet connection
- Try clicking "Sign in with Google" again

### Worker deployment failed
- Make sure you copied the entire `anthropic-proxy.js` file
- Check that there are no syntax errors
- Try deploying again

---

## Need Help?

If you run into issues:
1. Check the browser console for error messages (F12 → Console tab)
2. Make sure all URLs and IDs are correct
3. Try signing out and signing back in to Google
4. Redeploy the Cloudflare Worker

---

## Privacy & Security

- **Your data**: Stored in YOUR Google Drive, encrypted by Google
- **Your API key**: Stored in YOUR Google Drive, never sent to Cloudflare
- **The Worker**: Only forwards requests, doesn't store anything
- **Open source**: All code is visible in the HTML file

You're in complete control of your data! 🔒✨
