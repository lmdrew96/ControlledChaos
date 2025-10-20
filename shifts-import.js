// shifts-import.js - 7shifts work schedule import via iCalendar

// ===== FETCH AND PARSE 7SHIFTS CALENDAR =====
async function fetchAndParse7Shifts() {
    const settings = appData.settings;
    const calendarUrl = settings.shifts7CalendarUrl;
    
    if (!calendarUrl) {
        throw new Error('No 7shifts calendar URL configured. Please add your calendar URL in settings.');
    }
    
    // Validate URL format
    if (!calendarUrl.startsWith('http') || !calendarUrl.includes('.ics')) {
        throw new Error('Invalid calendar URL. Please provide a valid .ics calendar feed URL.');
    }
    
    console.log('📥 Fetching 7shifts calendar from:', calendarUrl);
    
    try {
        // Use the same calendar proxy endpoint as the main calendar import
        const proxyUrl = `/api/calendar-proxy?url=${encodeURIComponent(calendarUrl)}`;
        
        const response = await fetch(proxyUrl, {
            method: 'GET'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Failed to fetch calendar: ${response.statusText}`);
        }
        
        const icsData = await response.text();
        console.log('✅ 7shifts calendar data fetched');
        
        // Parse the .ics data using ICAL.js
        const shifts = parse7ShiftsICS(icsData);
        console.log(`✅ Parsed ${shifts.length} shifts from 7shifts calendar`);
        
        return shifts;
        
    } catch (error) {
        console.error('❌ 7shifts fetch error:', error);
        throw error;
    }
}

// ===== PARSE 7SHIFTS ICS DATA =====
function parse7ShiftsICS(icsText) {
    try {
        const jcalData = ICAL.parse(icsText);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');
        
        const shifts = [];
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        vevents.forEach(vevent => {
            const event = new ICAL.Event(vevent);
            
            // Only include future shifts (or shifts from the last week)
            const shiftDate = event.startDate.toJSDate();
            
            if (shiftDate >= oneWeekAgo) {
                const shift = {
                    title: event.summary || 'Work Shift',
                    description: event.description || '',
                    startDate: event.startDate.toJSDate(),
                    endDate: event.endDate.toJSDate(),
                    location: event.location || 'work',
                    isRecurring: !!event.component.getFirstProperty('rrule')
                };
                
                shifts.push(shift);
            }
        });
        
        // Sort shifts by start date
        shifts.sort((a, b) => a.startDate - b.startDate);
        
        return shifts;
        
    } catch (error) {
        console.error('❌ ICS parsing error:', error);
        throw new Error('Failed to parse 7shifts calendar data. Make sure it\'s a valid .ics file.');
    }
}

// ===== MAP SHIFTS TO SCHEDULE BLOCKS =====
function mapShiftsToScheduleBlocks(shifts) {
    const scheduleBlocks = [];
    
    shifts.forEach(shift => {
        const dayOfWeek = shift.startDate.toLocaleDateString('en-US', { weekday: 'long' });
        const startTime = shift.startDate.toTimeString().slice(0, 5); // HH:MM format
        const endTime = shift.endDate.toTimeString().slice(0, 5);
        
        // Check if shift spans midnight
        const spansMidnight = shift.endDate.getDate() !== shift.startDate.getDate();
        
        if (spansMidnight) {
            // Split into two blocks: one ending at 23:59, one starting at 00:00
            console.log(`⏰ Shift spans midnight: ${shift.title} on ${dayOfWeek}`);
            
            // First block: start time to 23:59
            scheduleBlocks.push({
                day: dayOfWeek,
                startTime: startTime,
                endTime: '23:59',
                text: shift.title,
                type: 'work',
                location: 'work',
                editable: true,
                protected: false,
                source: '7shifts'
            });
            
            // Second block: 00:00 to end time (next day)
            const nextDay = new Date(shift.startDate);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayName = nextDay.toLocaleDateString('en-US', { weekday: 'long' });
            
            scheduleBlocks.push({
                day: nextDayName,
                startTime: '00:00',
                endTime: endTime,
                text: shift.title + ' (cont.)',
                type: 'work',
                location: 'work',
                editable: true,
                protected: false,
                source: '7shifts'
            });
        } else {
            // Normal shift within same day
            scheduleBlocks.push({
                day: dayOfWeek,
                startTime: startTime,
                endTime: endTime,
                text: shift.title,
                type: 'work',
                location: 'work',
                editable: true,
                protected: false,
                source: '7shifts'
            });
        }
    });
    
    return scheduleBlocks;
}

// ===== SYNC 7SHIFTS NOW (MANUAL SYNC) =====
async function sync7ShiftsNow() {
    const syncButton = document.getElementById('sync7ShiftsNow');
    const lastSyncDisplay = document.getElementById('lastSync7Shifts');
    
    if (!syncButton) {
        console.error('Sync button not found');
        return;
    }
    
    // Show loading state
    const originalBtnText = syncButton.textContent;
    syncButton.disabled = true;
    syncButton.textContent = '⏳ Syncing...';
    
    // Get URL from input field if not saved in settings yet
    const urlInput = document.getElementById('shifts7CalendarUrl');
    if (urlInput && urlInput.value.trim()) {
        // Save the URL to settings immediately
        appData.settings.shifts7CalendarUrl = urlInput.value.trim();
        saveData();
        console.log('💾 Saved 7shifts URL from input field');
    }
    
    // Check if URL is now available
    if (!appData.settings.shifts7CalendarUrl) {
        showToast('⚠️ Please enter your 7shifts calendar URL first');
        syncButton.disabled = false;
        syncButton.textContent = originalBtnText;
        return;
    }
    
    try {
        // Fetch and parse shifts
        const shifts = await fetchAndParse7Shifts();
        
        if (shifts.length === 0) {
            showToast('ℹ️ No upcoming shifts found in your 7shifts calendar');
            return;
        }
        
        // Map shifts to schedule blocks
        const scheduleBlocks = mapShiftsToScheduleBlocks(shifts);
        
        // Remove existing 7shifts blocks from schedule
        Object.keys(appData.schedule).forEach(day => {
            appData.schedule[day] = appData.schedule[day].filter(block => block.source !== '7shifts');
        });
        
        // Add new schedule blocks
        let addedCount = 0;
        scheduleBlocks.forEach(block => {
            const day = block.day;
            
            if (!appData.schedule[day]) {
                appData.schedule[day] = [];
            }
            
            // Check for conflicts with existing blocks
            const hasConflict = appData.schedule[day].some(existing => {
                // Skip if it's another 7shifts block (already filtered out above)
                if (existing.source === '7shifts') return false;
                
                // Check for time overlap
                return (
                    (block.startTime >= existing.startTime && block.startTime < existing.endTime) ||
                    (block.endTime > existing.startTime && block.endTime <= existing.endTime) ||
                    (block.startTime <= existing.startTime && block.endTime >= existing.endTime)
                );
            });
            
            if (!hasConflict) {
                appData.schedule[day].push({
                    startTime: block.startTime,
                    endTime: block.endTime,
                    text: block.text,
                    type: block.type,
                    location: block.location,
                    editable: block.editable,
                    protected: block.protected,
                    source: block.source
                });
                addedCount++;
            } else {
                console.log(`⚠️ Skipping conflicting shift: ${block.text} on ${day} ${block.startTime}-${block.endTime}`);
            }
        });
        
        // Update last sync timestamp
        appData.settings.lastSync7Shifts = new Date().toISOString();
        
        // Save data and update UI
        saveData();
        updateUI();
        
        // Update last sync display
        if (lastSyncDisplay) {
            lastSyncDisplay.textContent = `Last synced: ${new Date().toLocaleString()}`;
        }
        
        // Show success message
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
        
        showToast(`✅ Synced ${addedCount} work shift${addedCount !== 1 ? 's' : ''} from 7shifts!`);
        
    } catch (error) {
        console.error('❌ 7shifts sync error:', error);
        showToast(`❌ Sync failed: ${error.message}`, 'error');
    } finally {
        syncButton.disabled = false;
        syncButton.textContent = originalBtnText;
    }
}

// ===== AUTO-SYNC ON APP LOAD =====
async function autoSync7ShiftsIfNeeded() {
    const settings = appData.settings;
    
    // Check if auto-sync is enabled
    if (!settings.autoSync7Shifts) {
        console.log('ℹ️ 7shifts auto-sync is disabled');
        return;
    }
    
    // Check if calendar URL is configured
    if (!settings.shifts7CalendarUrl) {
        console.log('ℹ️ No 7shifts calendar URL configured');
        return;
    }
    
    // Check if we need to sync (more than 7 days since last sync)
    const lastSync = settings.lastSync7Shifts ? new Date(settings.lastSync7Shifts) : null;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    if (!lastSync || lastSync < sevenDaysAgo) {
        console.log('🔄 Auto-syncing 7shifts calendar (last sync: ' + (lastSync ? lastSync.toLocaleString() : 'never') + ')');
        
        try {
            await sync7ShiftsNow();
        } catch (error) {
            console.error('❌ Auto-sync failed:', error);
            // Don't show error toast for auto-sync failures to avoid annoying the user
        }
    } else {
        console.log('✅ 7shifts calendar is up to date (last sync: ' + lastSync.toLocaleString() + ')');
    }
}

// ===== INITIALIZE ON PAGE LOAD =====
// This will be called from app.js after the app initializes
function init7ShiftsSync() {
    // Update last sync display if element exists
    const lastSyncDisplay = document.getElementById('lastSync7Shifts');
    if (lastSyncDisplay) {
        const settings = appData.settings;
        if (settings.lastSync7Shifts) {
            const lastSync = new Date(settings.lastSync7Shifts);
            lastSyncDisplay.textContent = `Last synced: ${lastSync.toLocaleString()}`;
        } else {
            lastSyncDisplay.textContent = 'Never synced';
        }
    }
    
    // Trigger auto-sync if needed
    autoSync7ShiftsIfNeeded();
}
