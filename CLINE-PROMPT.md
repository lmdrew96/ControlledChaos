# Cline Prompt: Add Calendar Import Feature

## What This Does
Adds ability for users to import their Canvas/Google Calendar/Outlook schedule by pasting an .ics feed URL. The AI automatically categorizes events and imports them as classes, deadlines, and tasks.

---

## Implementation Steps

### 1. Add ical.js Library to index.html
In the `<head>` section, add:
```html
<script src="https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js"></script>
```

### 2. Add calendar-import.js to Project
- Copy `calendar-import.js` to the root directory (same level as app.js, ui.js, etc.)
- Add script tag to index.html AFTER existing JS files:
```html
<script src="calendar-import.js"></script>
```

### 3. Add Import Button to Dashboard
In the dashboard tab (Tasks & Deadlines section), add:
```html
<button class="btn btn-primary" onclick="showCalendarImportModal()">
    📅 Import Calendar
</button>
```

### 4. Add Import Section to Settings Tab
In the Settings tab, add a new card:
```html
<div class="card">
    <h2>📅 Calendar Import</h2>
    <p style="color: var(--text-light); margin-bottom: 15px;">
        Import your schedule and deadlines from Canvas, Google Calendar, or any calendar app.
    </p>
    <button class="btn btn-primary" onclick="showCalendarImportModal()">
        📥 Import from Calendar Feed
    </button>
    <p style="margin-top: 10px; font-size: 0.9em; color: var(--text-light);">
        <strong>Where to find your feed URL:</strong><br>
        Canvas: Calendar → Calendar Feed → Copy link<br>
        Google Calendar: Settings → Secret address in iCal format
    </p>
</div>
```

---

## How It Works

**User Flow:**
1. User clicks "Import Calendar"
2. Modal appears asking for .ics feed URL
3. User pastes URL (e.g., from Canvas)
4. App fetches → parses → sends to Claude AI for categorization
5. Preview modal shows all events with checkboxes
6. User selects what to import
7. Events are imported as:
   - Recurring classes → Schedule blocks
   - Assignments/Exams → Deadlines
   - One-time events → Tasks

**AI Categorization:**
- Identifies classes, exams, assignments, quizzes, labs
- Sets energy levels (low/medium/high)
- Marks protected time (therapy, important meetings)
- Filters out generic events like holidays

---

## Testing
1. Get Canvas calendar feed: Canvas → Calendar → Calendar Feed → Copy link
2. Click "Import Calendar" button in app
3. Paste URL and import
4. Verify classes appear in schedule, deadlines in deadline list

---

## Dependencies
- **ical.js** library (loaded via CDN)
- **Claude API** (already configured in app)
- Existing functions: `addTask()`, `addDeadline()`, `callClaudeAPI()`, `saveData()`, `updateUI()`

---

## Notes
- Works with any standard .ics calendar feed
- Feed URL must be publicly accessible (no login required)
- Existing `calendar-import.js` file handles all logic
- No changes needed to existing app.js or storage.js
