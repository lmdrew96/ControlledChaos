# Controlled Chaos 🌀

ADHD-friendly productivity app with AI-powered task management.

## Features

- 🧠 **Brain Dump** → AI organizes your chaos into actionable tasks
- ✨ **"Pick For Me"** → Context-aware AI suggestions based on location, energy, and schedule
- 📅 **Smart Scheduling** → Google Calendar sync with automatic conflict detection
- 💜 **Mood Tracking** → Track patterns and get insights into your productivity
- ☁️ **Cross-Device Sync** → Google Drive sync keeps your data everywhere
- 🔒 **Privacy-First** → Location only checked manually, data encrypted before sync
- 💼 **Work Schedule Import** → Automatic 7shifts calendar integration
- 🎓 **Course Management** → Import syllabi and track deadlines by course

## Quick Start

1. **Deploy to Vercel**
   ```bash
   vercel deploy
   ```

2. **Set Environment Variables**
   - `ANTHROPIC_API_KEY` - Your Anthropic API key for AI features

3. **Configure Google OAuth**
   - Create a Google Cloud project
   - Enable Google Drive API
   - Add OAuth credentials
   - Add your Client ID in Settings

4. **Start Using**
   - Sign in with Google
   - Run the Initial Setup wizard
   - Start dumping your brain! 🧠

## Security Features

### Rate Limiting
- 50 AI requests per hour per user
- Prevents API abuse
- Resets hourly

### CORS Protection
- **TODO:** Update `api/claude.js` with your Vercel domain
- Replace `'Access-Control-Allow-Origin': '*'` with your actual domain
- Example: `'https://your-app.vercel.app'`

### Multi-User Access Control
- Owner-controlled allowlist (max 4 users)
- Google OAuth authentication required
- Encrypted API key storage

## Documentation

See the [docs/](./docs/) folder for detailed documentation:
- Bug fixes and improvements
- Feature implementation guides
- Setup wizard documentation
- UI/UX improvements

## Tech Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** Vercel Edge Functions
- **AI:** Anthropic Claude (via server-side proxy)
- **Storage:** Google Drive API
- **Calendar:** iCalendar (ICAL.js)
- **Maps:** Nominatim (OpenStreetMap)

## Privacy & Data

- Location data never leaves your device
- API keys encrypted before Google Drive sync
- No tracking or analytics
- Open source - audit the code yourself

## Contributing

This is a personal project, but feel free to fork and adapt for your own use!

## License

MIT License - See LICENSE file for details
