# Calendar Import Feature - Integration Instructions

## Overview
This adds a calendar import feature that lets users import their schedule from Canvas, Google Calendar, Outlook, or any .ics feed. The AI automatically categorizes events as classes, deadlines, or personal events.

---

## Step 1: Add ical.js Library

In `index.html`, add this script tag in the `<head>` section (before your other script tags):

```html
<!-- iCalendar parser library -->
<script src="https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js"></script>
```

---

## Step 2: Add calendar-import.js Script

In `index.html`, add this script tag AFTER your other JS files (after app.js, ui.js, etc.):

```html
<script src="calendar-import.js"></script>
```

---

## Step 3: Add Import Button to Dashboard

In `index.html`, find the dashboard section (where Quick Add and Brain Dump buttons are).

Add this button:

```html
<button class="btn btn-primary" onclick="showCalendarImportModal()" style="margin: 5px 0;">
    📅 Import Calendar
</button>
```

Suggested location: Right after the Brain Dump button or in the Tasks section.

---

## Step 4: Add Import Button to Settings

In the Settings tab in `index.html`, add an import option:

```html
<div class="card">
    <h2>📅 Calendar Import</h2>
    <p style="color: var(--text-light); margin-bottom: 15px;">
        Import your schedule and deadlines from Canvas, Google Calendar, or any calendar app.
    </p>
    <button class="btn btn-primary" onclick="showCalendarImportModal()">
        📥 Import from Calendar Feed
    </button>
</div>
```

---

## Step 5: Optional - Add to Onboarding Flow

If you want to add this to a future onboarding flow, you can call:
```javascript
showCalendarImportModal();
```

---

## How It Works

1. **User Experience:**
   - User clicks "Import Calendar"
   - Pastes their .ics feed URL (Canvas, Google Calendar, etc.)
   - App fetches and parses the calendar
   - AI categorizes events (classes, assignments, exams, etc.)
   - User sees a preview with checkboxes
   - Selected items are imported

2. **What Gets Imported:**
   - **Recurring classes** → Added to weekly schedule
   - **Assignments/Exams** → Created as deadlines
   - **One-time events** → Created as tasks
   - **Personal appointments** → Created as protected time blocks

3. **AI Categorization:**
   - Uses Claude API to intelligently categorize events
   - Determines energy levels for tasks
   - Identifies protected time (therapy, important meetings)
   - Filters out generic events like "No Class" or holidays

---

## Testing

1. Get a calendar feed URL:
   - **Canvas**: Calendar → Calendar Feed → Copy link
   - **Google Calendar**: Settings → Integrate calendar → Secret address in iCal format

2. Click "Import Calendar" button

3. Paste URL and click "Import Calendar"

4. Review the preview and uncheck anything you don't want

5. Click "Import Selected Items"

6. Check that:
   - Classes appear in your schedule
   - Deadlines appear in the deadlines list
   - Tasks appear in your task list

---

## Troubleshooting

**"Failed to fetch calendar"**
- URL must be publicly accessible (not behind login)
- Must be a valid .ics URL
- Check for CORS issues (some servers block cross-origin requests)

**"No events found"**
- Calendar might be empty
- Check that URL points to correct calendar
- Verify .ics format

**Events not categorized correctly**
- AI might need adjustment in systemPrompt
- Check that API key is configured in Settings

---

## Future Enhancements

- Auto-sync calendar periodically
- Support for authenticated calendar feeds
- Smarter recurring event handling
- Template creation from recurring assignments

---

## Files Included

1. **calendar-import.js** - Main import logic
2. **INTEGRATION-INSTRUCTIONS.md** - This file

Move `calendar-import.js` to your main project directory with your other JS files.
