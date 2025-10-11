# 📅 Calendar Import Feature

## What This Does

Lets users import their entire schedule from Canvas, Google Calendar, Outlook, or any calendar app by simply pasting an .ics feed URL. The AI automatically categorizes everything and imports it into the right place in Controlled Chaos.

---

## Why This Is Awesome

### For Users:
- **No manual entry** - Paste a link, done. No typing out every class and deadline.
- **Works with ANY calendar** - Canvas, Google, Outlook, Apple Calendar - they all use .ics
- **AI does the work** - Automatically figures out what's a class, what's an assignment, what's protected time
- **Smart categorization** - Classes go to schedule, deadlines to deadline list, personal events become tasks
- **Preview before import** - See everything with checkboxes, uncheck what you don't want

### For Onboarding:
This makes onboarding SO much easier! Instead of:
1. "Tell me about your typical week"
2. "What tasks do you have?"
3. "What deadlines are coming up?"

It becomes:
1. "Paste your Canvas calendar link"
2. [AI does everything]
3. "Done! Here's your schedule."

---

## How It Works

### User Flow:
1. Click "Import Calendar" button
2. Paste .ics feed URL (e.g., Canvas calendar feed)
3. App fetches and parses the calendar data
4. Sends events to Claude API for smart categorization
5. Shows preview with checkboxes for each item
6. User selects what to import
7. Selected items are imported

### What Gets Imported:
- **Recurring classes** → Added to weekly schedule (Monday-Sunday blocks)
- **Assignments due** → Created as deadlines
- **Exams/Quizzes** → Created as deadlines with special flags
- **Labs** → Created as deadlines or schedule blocks
- **Personal appointments** → Created as tasks or protected time
- **One-time events** → Created as tasks

### AI Categorization:
The AI looks at each event and determines:
- **Type**: class, assignment, exam, quiz, lab, personal, other
- **Energy level**: high/medium/low (for tasks)
- **Location**: school, work, home, anywhere
- **Protected status**: Is this important time that shouldn't be scheduled over?
- **Should import**: Filters out generic events like "No Class" or "Holiday"

---

## Technical Details

### Dependencies:
- **ical.js** - Industry-standard JavaScript library for parsing .ics files
- **Claude API** - For smart categorization (already configured in app)
- **Existing functions** - Uses app's existing `addTask()`, `addDeadline()`, `saveData()` functions

### Files:
- `calendar-import.js` - Main import logic (~350 lines)
- `INTEGRATION-INSTRUCTIONS.md` - Step-by-step integration guide
- `CLINE-PROMPT.md` - Concise prompt for Cline
- `HTML-SNIPPETS.html` - Exact HTML additions needed

### Browser Compatibility:
- Works in all modern browsers
- Requires CORS-enabled calendar feed (publicly accessible URL)
- No backend needed - all processing happens client-side

---

## Example .ics Feed URLs

### Canvas:
```
https://udel.instructure.com/feeds/calendars/user_ABC123XYZ.ics
```
**How to get it:**
1. Go to Canvas
2. Click Calendar
3. Click Calendar Feed (right sidebar)
4. Copy the link from the dialog

### Google Calendar:
```
https://calendar.google.com/calendar/ical/username%40gmail.com/private-abc123/basic.ics
```
**How to get it:**
1. Go to Google Calendar settings
2. Select your calendar
3. Scroll to "Integrate calendar"
4. Copy "Secret address in iCal format"

### Outlook:
```
https://outlook.office365.com/owa/calendar/abc123@outlook.com/calendar.ics
```
**How to get it:**
1. Go to Outlook Calendar
2. Click Publish calendar
3. Copy the ICS link

---

## Benefits for Multi-User App

This is PERFECT for when you open the app to your friends because:

1. **Fast setup** - New users can be up and running in 60 seconds
2. **No manual work** - They don't have to type out their entire schedule
3. **Accurate data** - Pulls directly from their official calendar
4. **Personalized** - Each user imports THEIR schedule, not yours
5. **Works for students** - Most schools use Canvas, Google, or Outlook

---

## Future Enhancements

- **Auto-sync** - Periodically re-fetch calendar to catch new assignments
- **Template detection** - Identify recurring assignment patterns and suggest templates
- **Calendar export** - Let users export their Controlled Chaos schedule back to .ics
- **Multiple calendars** - Import from multiple sources (Canvas + personal calendar)

---

## Security & Privacy

- Calendar feed URL is NOT stored permanently
- Data is only fetched when user clicks Import
- All processing happens client-side (no data sent to external servers except Claude API)
- Users control exactly what gets imported via checkboxes

---

## Testing Checklist

- [ ] Import from Canvas calendar feed
- [ ] Verify classes appear in weekly schedule
- [ ] Verify assignments appear as deadlines
- [ ] Verify exams are flagged correctly
- [ ] Test "select all" checkboxes work
- [ ] Test individual item unchecking works
- [ ] Verify protected time is marked correctly
- [ ] Test with Google Calendar feed
- [ ] Test with empty calendar (should show appropriate message)
- [ ] Test with invalid URL (should show error message)

---

## Support

If users have trouble:
1. **"Failed to fetch"** - Check that URL is publicly accessible (not behind login)
2. **"No events found"** - Verify URL is correct and calendar isn't empty
3. **"Events not importing"** - Make sure API key is configured in Settings

---

## Summary

This feature transforms onboarding from "tedious manual entry" to "paste a link and you're done." It's the difference between a 20-minute setup and a 2-minute setup. For students especially, this is a game-changer since they already have Canvas calendars with everything in them.

**Bottom line:** This makes your app actually usable for your friends without them having to spend an hour setting it up! 🎉
