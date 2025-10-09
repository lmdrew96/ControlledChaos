# Controlled Chaos v4 - Build Instructions for Cline

## Context
You're building v4 of a productivity app for a college student with ADHD. The user needs the app to work WITH their brain, not against it. The current v3 exists but has gaps between what the user needs and what it delivers.

## Core Philosophy
**Make it CONTEXT-AWARE and DECISION-MAKING**
- Instead of: "Here are your tasks, figure it out"
- v4 should say: "It's 2pm, you're at school, you have 45 minutes. I suggest: Beatles quiz (20 min, low energy, can do on phone)"

The app should TELL the user what to do next based on:
- Current time and day
- Where they are (home/school/work/commute)
- Available time until next commitment
- Energy level appropriate for time of day
- What's actually possible in their location

## User's Current Situation
- UD AAP student (University of Delaware Associate in Arts Program)
- Part-time restaurant job (Fridays/Saturdays, sometimes Sundays 12-4pm)
- Peer mentor position (3 classes)
- Weekly therapy at school
- New DM running homebrew D&D campaign with 4 players (plays Sundays 4:30pm, needs 4.5 hours prep weekly)
- Has ADHD, recently back on Adderall XR
- Takes 40min to commute school-home, 25min home-work, 1hr school-work

### Weekly Schedule (Important!)
**Monday:**
- 7:15 AM: Wake up, take meds
- 8:00-8:40 AM: Commute to school
- 8:40-10:35 AM: FREE TIME at school
- 10:35-11:55 AM: US Politics class
- 12-1 PM: Peer Mentor (optional)
- 1:00-1:40 PM: Commute home
- Evening: Free for work

**Tuesday:**
- 7:15 AM: Wake up, take meds
- 8:00-8:40 AM: Commute to school
- 8:40-9:00 AM: FREE TIME at school
- 9-10:20 AM: World History class
- 10:20-11:00 AM: FREE TIME at school
- 11-11:55 AM: Peer Mentor (mandatory)
- 12-1 PM: Hen & Ink Society
- 1-3 PM: FREE at school
- 3 PM: Therapy (at school)
- ~4:00-4:40 PM: Commute home
- Evening: BIO WORK (all due Wednesday!)

**Wednesday:**
- 7:15 AM: Wake up, take meds
- 8:00-8:40 AM: Commute to school
- 8:40-10:35 AM: FREE at school (Beatles discussion)
- 10:35-11:55 AM: US Politics class
- 12-1 PM: Peer Mentor (optional)
- 1-1:55 PM: Peer Mentor (mandatory)
- ~2:35-3:15 PM: Commute home
- Evening: Free for work

**Thursday:**
- 7:15 AM: Wake up, take meds
- 8:00-8:40 AM: Commute to school
- 8:40-9:00 AM: FREE TIME at school
- 9-10:20 AM: World History class
- 10:20 AM-12 PM: FREE at school
- 12-1 PM: Hen & Ink Society
- 1-3 PM: FREE at school
- 4:45-7 PM: Bio class (at UD)
- ~7:00-7:40 PM: Commute home
- 8-9 PM: D&D PREP SESSION 1 (PROTECTED - brainstorm, rough planning, creative ideas)
- 9-10 PM: Free time / wind down

**Friday:**
- 7:15 AM: Wake up, take meds
- 8:00-8:40 AM: Commute to school
- 9 AM-12 PM: Flex time - finish weekend work
- 12-2 PM: D&D PREP SESSION 2 (PROTECTED - world building, encounters, main campaign planning)
- ~2:35-3:00 PM: Commute to work
- 3-10 PM: WORK (no school work allowed at work!)
- ~10:25-10:50 PM: Commute home

**Saturday:**
- Sleep in (no early alarm!)
- 9-10:30 AM: D&D PREP SESSION 3 (PROTECTED - polish notes, finalize prep)
- ~10:35-11:00 AM: Commute to work
- 11 AM-10 PM: WORK (long shift!)
- ~10:25-10:50 PM: Commute home

**Sunday:**
- Sleep in
- 9 AM-12 PM: Submit deadlines & review
- 12-4 PM: MAYBE WORK (50/50 chance - check schedule)
- 4:30 PM: D&D GAME START! 🎲 (typically 3-4 hour session)

### Current Courses & Deadlines
- Bio (weekly: SmartBook chapter, assignment, quiz, digital lab - all due Wednesdays 11:58pm)
- Beatles (weekly: discussion post, response, PowerPoint, quiz - due Sundays)
- World History (weekly: 1-2 chapters reading, monthly analytical paper)
- US Politics (irregular quizzes, media evolution paper/presentation)

## What v3 Currently Has
- Daily focus messages
- Hard-coded crisis plan for Oct 8-16 (Bio Exam 2)
- Top 3 priorities (sorted by priority level only)
- Mood tracker
- Upcoming deadlines list
- Weekly schedule display
- All tasks list
- "Not Today Pile"
- Weekly wins
- Brain Dump (with Claude API)
- "Pick For Me" (basic - just looks at priority)
- "I'm Stuck" (breaks down tasks with Claude API)
- Quick add tasks
- Manual deadlines addition

## What's Wrong / Missing in v3

### Critical Issues:
1. **No location/time awareness** - Doesn't know where user is or what time it is
2. **"Pick For Me" too simple** - Ignores context (time, location, available time)
3. **Schedule and tasks don't connect** - Shows schedule but doesn't use it for suggestions
4. **No "What should I do RIGHT NOW?"** - Makes user think too much instead of deciding for them
5. **Deadlines and tasks separate** - Doesn't auto-create tasks from deadlines
6. **No location-based filtering** - Can't filter tasks by where they can be done
7. **No energy-time awareness** - Suggests high-energy work at 9pm

## v4 Feature List (Priority Order)

### HIGHEST PRIORITY - Build These First

#### 1. Editable AI-Powered Weekly Schedule
The weekly schedule should NOT be hard-coded. Life changes - work schedule varies, appointments pop up, user gets sick, etc.

**Features:**
- **Edit Mode:** Click "Edit Schedule" button to modify any time block
  - Add/remove/edit appointments
  - Change work times
  - Add one-time events
  - Mark blocks as unavailable
- **Reoptimize Button:** After editing, click "Reoptimize My Week"
  - AI analyzes: what free time remains, what tasks are due, what deadlines are coming, protected time blocks (therapy, D&D prep)
  - Suggests optimal task placement in remaining free time
  - Warns if week is now impossible: "You lost 6 hours of free time but have 8 hours of work due. Let's move some tasks or adjust deadlines."
  - Shows before/after comparison
- **Quick Edits:** Common changes have one-click options
  - "Working Sunday this week" → adds 12-4pm work block, reoptimizes
  - "Doctor appointment" → prompts for time, blocks it out, reoptimizes
  - "Feeling sick today" → clears day, redistributes urgent tasks
- **Save as Template:** Can save modified schedules as templates for future use
  - "Holiday week schedule" (different work hours)
  - "Exam week schedule" (more study time)
  - "Break schedule" (no classes)

**Implementation Notes:**
Store schedule as editable JSON structure, not hard-coded. Each block should have:
```javascript
{
  day: 'Monday',
  startTime: '10:35',
  endTime: '11:55',
  type: 'class' | 'work' | 'personal' | 'free' | 'protected',
  title: 'US Politics',
  location: 'school',
  editable: true | false, // Some blocks like classes can't be moved
  recurring: true | false // Is this every week or just this week?
}
```

When user clicks "Reoptimize", send to Claude API:
```
Current schedule: [modified schedule JSON]
Tasks due this week: [tasks with deadlines]
Protected blocks: [therapy, D&D prep]
User's energy patterns: [morning=high, etc]

Analyze the available free time and suggest optimal task placement. 
Respond with JSON showing:
- Which tasks to do in which free blocks
- Time estimates for each block
- Warnings if anything is impossible
- Suggestions for what to move/postpone
```

**Why This Is Critical:**
- Makes app flexible instead of rigid
- Reduces anxiety when plans change
- ADHD brain doesn't have to manually recalculate everything
- App adapts to USER'S life, not vice versa

#### 2. "What Now?" Context-Aware Button
#### 2. "What Now?" Context-Aware Button
Replace/enhance "Pick For Me" with smart suggestion based on:
- Current day and time
- Quick location selector: "Where are you?" (🏠 Home / 🏫 School / 💼 Work / 🚗 Commute)
- Calculate available time until next scheduled commitment
- Match tasks to location, time available, and energy level
- Show clear recommendation: "You have 1hr 55min at school. I suggest: [specific task] because [reason]"

**Implementation notes:**
- Parse schedule object to find current time block
- Calculate time until next commitment
- Filter tasks by location capability
- Consider energy level for time of day (morning=high, afternoon=medium, evening=low)
- Clear, friendly language in suggestions

#### 3. AI Crisis Detection & Auto-Planning
Monitor deadlines continuously and auto-trigger crisis mode when:
- Multiple high-priority deadlines converging within 3 days
- Big deadline approaching with insufficient prep completed
- More work scheduled than available free time
- Pattern matches previous crisis situations

When crisis detected:
- Generate day-by-day crisis plan using Claude API
- Consider user's actual schedule
- Break work into specific time blocks
- Provide realistic, achievable daily goals
- Show crisis end date with encouragement

**API Prompt Structure:**
```
Current situation:
- Deadlines: [list with dates]
- Completed tasks: [list]
- Available time blocks: [from schedule]
- Days until crisis: [number]

Generate a day-by-day crisis plan that:
1. Breaks work into manageable chunks
2. Fits user's actual schedule
3. Prioritizes most urgent items
4. Includes specific time estimates
5. Has built-in buffer time
6. Ends with achievable final push

Respond as JSON with daily structure.
```

#### 4. Location Tags for Tasks
Add location field to tasks:
- 🏠 Home only
- 🏫 School only
- 💼 Work (limited - breaks only)
- 📱 Phone (can do during commute)
- 🌍 Anywhere

**UI Changes:**
- Add location picker when creating/editing tasks
- Filter buttons to show only tasks for current location
- Visual icons on task cards
- "What Now?" uses this for filtering

#### 5. Smart Schedule Integration
Make schedule ACTIVE not PASSIVE:
- Highlight current time block ("YOU ARE HERE")
- Show time remaining in current block
- Suggest tasks that fit: "You have 1hr 55min free at school. Here are tasks that fit..."
- Color-code blocks by available energy level
- Show which tasks could fit in upcoming blocks

**Implementation:**
- Get current time
- Find matching schedule block
- Calculate remaining time
- Filter tasks by: location match, time estimate <= remaining time, appropriate energy level
- Display prominently near schedule

### HIGH PRIORITY - Build These Second

#### 6. Auto-Break-Down Big Deadlines
When deadline is >3 days away:
- Offer to break into smaller tasks using Claude API
- Suggest scheduling tasks in upcoming free blocks
- Show visual timeline of when work needs to happen
- Update as tasks completed

**API Prompt:**
```
Deadline: [name] due [date]
Available time blocks before deadline: [list with dates/times]
Break this into subtasks that:
1. Are specific and actionable
2. Have realistic time estimates
3. Can fit in available blocks
4. Build toward completion
5. Include review/buffer time
```

#### 7. Energy-Time Awareness
Tasks should have energy level. System should:
- **Morning (8am-12pm):** Suggest high-energy tasks (complex work, writing, problem-solving)
- **Afternoon (12pm-5pm):** Medium energy tasks (reading, assignments, routine work)
- **Evening (5pm-10pm):** Low energy tasks (discussion posts, quizzes, organizing)
- Never suggest high-energy tasks late at night
- Override: User can force any task if needed

**Add to task object:**
```javascript
{
  energy: 'high' | 'medium' | 'low',
  bestTimeOfDay: ['morning', 'afternoon', 'evening'] // auto-determined
}
```

#### 8. Commute Task List
Special section for phone-capable tasks:
- Reading assignments
- Discussion board posts/responses
- Quick quizzes
- Review flashcards
- Emails to professors

**Implementation:**
- Filter tasks with 📱 location tag
- Show in dedicated "Commute Tasks" section
- Suggest during commute time blocks
- Mark as "can do on phone" in task card

#### 9. Better "I'm Stuck" with Context
Enhanced breakdown that shows:
- When user has time to work on it next
- Where they'll be during that time
- How much time they'll have
- Broken-down steps that fit those blocks

**Example:**
"You're stuck on Bio SmartBook Chapter 5. Your next good block for this is Thursday 1-3pm at school (2 hours). Want me to break it into pieces that fit?"

### MEDIUM PRIORITY - Build These Third

#### 10. Time Block Planner (Visual)
- Drag tasks onto schedule blocks
- Visual view: "Is my week manageable?"
- Warns if more work scheduled than time available
- Shows empty blocks that could be used
- Color-codes blocks by work type

#### 11. "Done for Today" Mode
One-button solution for exhaustion:
- Hit button → everything left moves to tomorrow
- Shows encouragement for what WAS completed
- No guilt, just reset
- Optional: Note reason (useful for pattern detection)

#### 12. Recurring Task Templates
Save time with templates:
- "Beatles weekly work" → auto-creates 3 tasks
- "Bio weekly work" → auto-creates 4 tasks
- Customizable by course
- Set day/time they should appear

#### 13. Better Deadline Countdown
Show not just days but TIME available:
- "5 days = 3 free blocks = 6 hours available"
- "Due in 48 hours. You have TWO 2-hour blocks left."
- Helps visualize if deadline is actually achievable

### NICE-TO-HAVE - Build If Time

#### 14. Focus Timer
- Start task → timer begins
- Tracks actual time vs estimated
- Learns if user consistently over/underestimates
- Adjusts future estimates

#### 15. "Impossible Day" Detector
- Counts free hours vs work hours scheduled
- Warns: "You have 4 hours free but 8 hours of tasks"
- Suggests moving tasks to tomorrow
- Teaches realistic planning

#### 16. Enhanced Celebration
- Weekly recap of accomplishments
- Time saved by using app
- More confetti and encouragement
- Share-able wins

## Technical Implementation Notes

### Data Structure Updates

```javascript
// Enhanced task object
{
  id: number,
  title: string,
  completed: boolean,
  energy: 'low' | 'medium' | 'high',
  timeEstimate: string,
  location: 'home' | 'school' | 'work' | 'phone' | 'anywhere',
  dueDate: Date | null,
  priority: 'low' | 'medium' | 'high',
  createdAt: string,
  completedAt: string | null,
  weekCompleted: string | null,
  parentDeadline: number | null, // Link to deadline if auto-created
  recurring: {
    template: string | null,
    frequency: 'weekly' | 'biweekly' | null
  }
}

// Crisis detection
{
  crisisActive: boolean,
  crisisReason: string,
  crisisStart: Date,
  crisisEnd: Date,
  crisisPlan: [
    {
      date: Date,
      dayName: string,
      tasks: string[],
      timeBlocks: string[]
    }
  ]
}

// Current context (for "What Now?")
{
  currentTime: Date,
  currentLocation: 'home' | 'school' | 'work' | 'commute',
  currentBlock: {
    name: string,
    startTime: string,
    endTime: string,
    timeRemaining: number, // minutes
    type: 'free' | 'class' | 'work' | 'personal'
  },
  nextCommitment: {
    name: string,
    time: string,
    minutesUntil: number
  }
}
```

### Schedule Parser
Create function to:
- Get current day of week
- Get current time
- Find matching schedule block
- Calculate time remaining
- Get next commitment
- Return structured data

**IMPORTANT: Protected Time Blocks**
Some schedule blocks are PROTECTED and should never be suggested for other tasks:
- **D&D Prep Sessions** (Thursday 8-9pm, Friday 12-2pm, Saturday 9-10:30am) - marked "PROTECTED" in schedule
- **Therapy** (Tuesday 3pm)
- **D&D Game** (Sunday 4:30pm onwards)

Protected blocks should:
- Have `editable: false` in schedule JSON (can't be moved/deleted)
- Show with lock icon 🔒 and special styling
- Never be available for task suggestions
- Be excluded from "available free time" calculations
- Trigger warning if user tries to schedule over them

When "What Now?" or other features suggest tasks:
- Never suggest tasks during protected blocks
- Warn if user tries to schedule tasks during protected time
- Show protected blocks with special styling (different color, lock icon)
- Track if user is skipping protected time (might indicate overwhelm)

### Location-Aware Filtering
```javascript
function getTasksForContext(location, timeAvailable, energyLevel) {
  return tasks.filter(task => {
    // Must match location
    if (task.location !== 'anywhere' && task.location !== location) {
      return false;
    }
    
    // Must fit in time available
    const taskMinutes = parseTimeEstimate(task.timeEstimate);
    if (taskMinutes > timeAvailable) {
      return false;
    }
    
    // Should match energy level (but don't filter out completely)
    // Just sort by best match
    
    return true;
  }).sort((a, b) => {
    // Prioritize energy level matches
    const aMatch = a.energy === energyLevel ? 2 : 1;
    const bMatch = b.energy === energyLevel ? 2 : 1;
    return bMatch - aMatch;
  });
}
```

### Crisis Detection Logic
**IMPORTANT:** Crisis detection must use the user's CURRENT edited schedule, not the default template. If user modified their schedule (added work shift, appointment, etc.), crisis detection should calculate available time based on the actual edited schedule.

```javascript
function detectCrisis() {
  const now = new Date();
  const threeDaysOut = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
  
  // Get upcoming deadlines
  const upcoming = deadlines.filter(d => 
    d.date > now && d.date <= threeDaysOut
  );
  
  // Count incomplete related tasks
  const incompleteTasks = tasks.filter(t => 
    !t.completed && 
    upcoming.some(d => d.id === t.parentDeadline)
  );
  
  // Calculate available time FROM CURRENT EDITED SCHEDULE
  const availableHours = calculateAvailableHours(now, threeDaysOut);
  const requiredHours = incompleteTasks.reduce((sum, t) => 
    sum + parseTimeEstimate(t.timeEstimate), 0
  ) / 60;
  
  // Crisis if: multiple deadlines + insufficient time + incomplete work
  if (upcoming.length >= 2 && requiredHours > availableHours * 0.8) {
    return {
      crisis: true,
      reason: `${upcoming.length} deadlines in 3 days, ${requiredHours}hrs work needed, only ${availableHours}hrs available`
    };
  }
  
  return { crisis: false };
}
```

## UI/UX Guidelines

### Language & Tone
- Simple, direct language
- No jargon unless user uses it first
- Friendly but not condescending
- Encouraging without being patronizing
- Clear action items, no vague suggestions

### Visual Hierarchy
1. **"What Now?" suggestion** - Most prominent (hero section)
2. Current time block + remaining time
3. Top 3 priorities (but contextualized)
4. Crisis plan (if active)
5. Everything else

**Protected Time Block Styling:**
- Show D&D prep blocks with distinct color (e.g., purple gradient)
- Add lock icon 🔒 to protected blocks
- Never allow tasks to be dragged into these blocks
- If user is currently IN a protected block, "What Now?" should say: "This is your D&D prep time! Focus on campaign planning."

### Interaction Patterns
- **One-click actions** preferred over multi-step
- **Smart defaults** - guess what user wants
- **Easy undo** - let them experiment without fear
- **Clear feedback** - confirm actions with friendly messages
- **Mobile-friendly** - user is often on phone

### Accessibility
- Maintain dyslexia font toggle
- High contrast options
- Large touch targets
- Clear focus indicators
- Screen reader friendly

## API Integration

### Claude API Endpoints
The app uses Anthropic Claude API for:
- Brain Dump organization
- Task breakdown
- Crisis plan generation
- "I'm Stuck" help

**API Key Storage:**
- User provides in settings
- Stored in localStorage only
- Never sent anywhere except Anthropic

**Cost Management:**
- Use claude-sonnet-4-20250514
- Keep tokens low with focused prompts
- Cache user context when possible
- Provide non-AI fallbacks

## Testing Checklist

### Core Functionality
- [ ] "What Now?" accurately identifies current context
- [ ] Location filtering works correctly
- [ ] Time calculations are accurate
- [ ] Crisis detection triggers appropriately
- [ ] Tasks sync with deadlines
- [ ] Schedule integration highlights current block

### Edge Cases
- [ ] Handle missing API key gracefully
- [ ] Work when offline (except AI features)
- [ ] Handle midnight rollover
- [ ] Handle week changes
- [ ] Handle empty task lists
- [ ] Handle no upcoming deadlines

### User Experience
- [ ] Fast loading (<2 seconds)
- [ ] Responsive on mobile
- [ ] Clear error messages
- [ ] Undo works correctly
- [ ] Data persists correctly
- [ ] No data loss on refresh

## File Structure
Keep everything in a single HTML file like v3. Use:
- Inline CSS in `<style>` tags
- Inline JavaScript in `<script>` tags
- localStorage for persistence
- Fetch API for Claude calls

## Final Notes

**Remember:** This user has ADHD. The app must:
- **Reduce decisions** - Tell them what to do, don't make them figure it out
- **Reduce overwhelm** - Show what matters NOW, hide the rest
- **Be forgiving** - Easy to move tasks around, no shame for not finishing
- **Celebrate progress** - Acknowledge all wins, even small ones
- **Stay simple** - Don't add complexity that requires thinking

**Success metrics:**
- User knows what to do in under 5 seconds
- Tasks feel achievable, not overwhelming
- Reduces anxiety about deadlines
- Actually helps get things done

Good luck! Build something that works WITH their brain, not against it. 🧠✨
