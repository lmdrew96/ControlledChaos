# CLINE PROMPT: Add "Getting Ready" Time Blocks to Schedule

## OBJECTIVE
Update the weekly schedule in Controlled Chaos to split oversized "Wake up & take meds" blocks and add missing morning routine blocks for weekends.

---

## CONTEXT
The schedule currently has 45-minute "Wake up & take meds" blocks (7:15-8:00) which is unrealistic. It only takes ~10 minutes to wake up and take meds. The remaining 35 minutes should be a separate "Get ready" block for shower, getting dressed, breakfast, etc.

**Additionally:** Saturday and Sunday are completely missing morning routine blocks.

---

## DATA STRUCTURE
The schedule uses this format:
- Day: "Monday", "Tuesday", etc.
- Start Time: "7:15" (24-hour format without colon separator)
- End Time: "8:00"
- Activity: Description text
- Type: "personal", "free", "class", "work", "protected"
- Location: "home", "school", "work", "commute"
- Editable: TRUE or FALSE
- Protected: TRUE or FALSE

---

## CHANGES NEEDED

### MONDAY - THURSDAY
**Current:**
```
7:15-8:00: Wake up & take meds (personal, home, FALSE, FALSE)
```

**Change to:**
```
7:15-7:25: Wake up & take meds (personal, home, FALSE, FALSE)
7:25-8:00: Get ready for school (personal, home, FALSE, FALSE)
```

### FRIDAY
**Current:**
```
7:15-8:00: Wake up & take meds (personal, home, FALSE, FALSE)
8:00-9:00: Read a Book! (protected, home, FALSE, FALSE)
9:00-12:00: Flex time - finish weekend work (free, school, TRUE, FALSE)
12:00-14:00: D&D PREP SESSION 2 (protected, home, FALSE, TRUE)
14:35-15:00: Commute to work (free, commute, FALSE, FALSE)
```

**Change to:**
```
7:15-7:25: Wake up & take meds (personal, home, FALSE, FALSE)
7:25-8:00: Get ready for the day (personal, home, FALSE, FALSE)
8:00-9:00: Read a Book! (protected, home, FALSE, TRUE)
9:00-12:00: Flex time - finish weekend work (free, home, TRUE, FALSE)
12:00-14:00: D&D PREP SESSION 2 (protected, home, FALSE, TRUE)
14:00-14:35: Get ready for work (personal, home, FALSE, FALSE)
14:35-15:00: Commute to work (free, commute, FALSE, FALSE)
```

**Notes:**
- Reading time should be marked as protected (Protected = TRUE)
- Added 14:00-14:35 "Get ready for work" block (currently missing)
- Changed "Flex time" location from "school" to "home" (more realistic)

### SATURDAY
**Current:**
```
9:00-10:30: D&D PREP SESSION 3 (protected, home, FALSE, TRUE)
10:35-11:00: Commute to work (free, commute, FALSE, FALSE)
```

**Change to:**
```
7:45-8:00: Wake up & take meds (personal, home, FALSE, FALSE)
8:00-9:00: Get ready for work (personal, home, FALSE, FALSE)
9:00-10:30: D&D PREP SESSION 3 (protected, home, FALSE, TRUE)
10:30-11:00: Commute to work (free, commute, FALSE, FALSE)
```

**Notes:**
- Added wake up block (7:45-8:00) - 15 min
- Added getting ready block (8:00-9:00) - 1 hour for relaxed Saturday morning
- Fixed commute time to 10:30 (currently shows 10:35, but that creates a 5-min gap)

### SUNDAY
**Current:**
```
9:00-12:00: Submit deadlines & review (free, home, TRUE, FALSE)
12:00-16:00: MAYBE WORK (50/50 chance) (work, work, TRUE, FALSE)
16:30-20:30: D&D GAME TIME! 🎲 (protected, home, FALSE, TRUE)
```

**Change to:**
```
8:45-9:00: Wake up & take meds (personal, home, FALSE, FALSE)
9:00-10:30: Get ready & relax (personal, home, TRUE, FALSE)
10:30-12:00: Submit deadlines & review (free, home, TRUE, FALSE)
12:00-16:00: MAYBE WORK (50/50 chance) (work, work, TRUE, FALSE)
16:30-20:30: D&D GAME TIME! 🎲 (protected, home, FALSE, TRUE)
```

**Notes:**
- Added wake up block (8:45-9:00) - 15 min
- Added getting ready block (9:00-10:30) - 1.5 hours for very relaxed Sunday morning
- This is editable (TRUE) since Sunday schedule is more flexible

---

## IMPLEMENTATION INSTRUCTIONS

### 1. Locate the Schedule Data
Find where `defaultSchedule` is defined in `index.html`. It's probably structured as an object with arrays for each day:

```javascript
const defaultSchedule = {
  monday: [...],
  tuesday: [...],
  // etc.
};
```

### 2. Update Each Day
For each day listed above, make the specified changes. Keep the exact same data structure and field names.

### 3. Verify Data Integrity
After making changes:
- Ensure no time gaps between blocks (except intentional breaks)
- Verify all required fields are present for each block
- Check that Protected flags are correct for D&D and reading time
- Make sure times are in 24-hour format strings without colons in the time value

### 4. Test
After implementing:
- Hard refresh the app
- Check the visual weekly planner displays all days correctly
- Verify no console errors
- Confirm changes persist after refresh (Google Drive sync)
- Check that protected time blocks are visually distinct

---

## CRITICAL NOTES

⚠️ **Protected Time Blocks** - Make sure these all have `Protected: TRUE`:
- Friday 8:00-9:00: Read a Book!
- Friday 12:00-14:00: D&D PREP SESSION 2
- Saturday 9:00-10:30: D&D PREP SESSION 3
- Sunday 16:30-20:30: D&D GAME TIME!
- Thursday 20:00-21:00: D&D PREP SESSION 1 (already correct)

⚠️ **Time Format** - Use the same format as the existing schedule (24-hour as strings: "7:15", "14:00", etc.)

⚠️ **"Getting Ready" Blocks are NEW** - These represent realistic time for:
- Shower
- Getting dressed
- Breakfast/coffee
- General morning routine
- Mental transition time

⚠️ **Don't change other blocks** - Only modify what's listed above. Leave classes, work shifts, commutes, peer mentor times, etc. exactly as they are.

---

## EXPECTED OUTCOME

After this update:
1. ✅ All 7 days have "Wake up & take meds" time blocks
2. ✅ All days have realistic "Get ready" time blocks
3. ✅ Friday includes "Get ready for work" before work commute
4. ✅ No unrealistic 45-minute "wake up" blocks
5. ✅ Protected time blocks are properly flagged
6. ✅ Schedule displays correctly in the visual planner
7. ✅ Changes persist across sessions via Google Drive sync

The user will now have a realistic, ADHD-friendly schedule that accounts for actual morning routine needs!