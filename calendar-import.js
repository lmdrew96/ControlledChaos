// calendar-import.js - Calendar import functionality for .ics feeds

// ===== CALENDAR IMPORT MAIN FUNCTION =====
async function importCalendarFeed() {
    const urlInput = document.getElementById('calendarFeedUrl');
    const feedUrl = urlInput.value.trim();
    
    if (!feedUrl) {
        alert('Please enter a calendar feed URL!');
        return;
    }
    
    // Validate URL format
    if (!feedUrl.startsWith('http') || !feedUrl.includes('.ics')) {
        alert('Please enter a valid .ics calendar feed URL!\n\nExample: https://school.instructure.com/feeds/calendars/user_XXXXX.ics');
        return;
    }
    
    // Show loading state
    const importBtn = document.getElementById('importCalendarBtn');
    const originalBtnText = importBtn.textContent;
    importBtn.disabled = true;
    importBtn.textContent = '⏳ Fetching calendar...';
    
    try {
        // Step 1: Fetch the .ics file
        console.log('📥 Fetching calendar from:', feedUrl);
        const response = await fetch(feedUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch calendar: ${response.statusText}`);
        }
        
        const icsData = await response.text();
        console.log('✅ Calendar data fetched');
        
        // Step 2: Parse the .ics data
        importBtn.textContent = '🔍 Parsing events...';
        const events = parseICSData(icsData);
        console.log(`✅ Parsed ${events.length} events`);
        
        if (events.length === 0) {
            alert('No events found in calendar feed. Please check the URL and try again.');
            importBtn.disabled = false;
            importBtn.textContent = originalBtnText;
            return;
        }
        
        // Step 3: Categorize events with AI
        importBtn.textContent = '🧠 Categorizing with AI...';
        const categorizedEvents = await categorizeEventsWithAI(events);
        console.log('✅ Events categorized');
        
        // Step 4: Show preview modal
        showImportPreview(categorizedEvents);
        
        // Close the URL input modal
        closeModal('calendarImportModal');
        
    } catch (error) {
        console.error('❌ Calendar import error:', error);
        alert(`Failed to import calendar: ${error.message}\n\nMake sure the URL is correct and publicly accessible.`);
    } finally {
        importBtn.disabled = false;
        importBtn.textContent = originalBtnText;
    }
}

// ===== PARSE ICS DATA =====
function parseICSData(icsText) {
    try {
        const jcalData = ICAL.parse(icsText);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');
        
        const events = [];
        const now = new Date();
        
        vevents.forEach(vevent => {
            const event = new ICAL.Event(vevent);
            
            // Only include future events (or events from the last week)
            const eventDate = event.startDate.toJSDate();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            if (eventDate >= oneWeekAgo) {
                const eventData = {
                    summary: event.summary,
                    description: event.description || '',
                    startDate: event.startDate.toJSDate(),
                    endDate: event.endDate.toJSDate(),
                    location: event.location || '',
                    isRecurring: !!event.component.getFirstProperty('rrule')
                };
                
                events.push(eventData);
            }
        });
        
        return events;
    } catch (error) {
        console.error('❌ ICS parsing error:', error);
        throw new Error('Failed to parse calendar data. Make sure it\'s a valid .ics file.');
    }
}

// ===== CATEGORIZE EVENTS WITH AI =====
async function categorizeEventsWithAI(events) {
    // Group events by type for better processing
    const eventSummaries = events.slice(0, 100).map((e, i) => {
        const duration = Math.round((e.endDate - e.startDate) / (1000 * 60));
        return `${i}. "${e.summary}" on ${e.startDate.toLocaleDateString()} at ${e.startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} (${duration}min)${e.isRecurring ? ' [RECURRING]' : ''}`;
    }).join('\n');
    
    const systemPrompt = `You are an ADHD-friendly calendar organizer. Categorize these calendar events into the appropriate types.

For each event, determine:
1. **type**: "class", "assignment", "exam", "lab", "quiz", "personal", or "other"
2. **energy**: "low", "medium", or "high" (for tasks/assignments)
3. **shouldImport**: true/false (skip things like "No Class" or generic events)
4. **location**: "school", "work", "home", or "anywhere"
5. **isProtected**: true/false (important things like therapy, social events that shouldn't be scheduled over)

Guidelines:
- Classes, labs → type: "class"
- Assignments, papers, projects DUE dates → type: "assignment" 
- Exams, tests, finals → type: "exam"
- Quizzes → type: "quiz"
- Personal appointments (therapy, doctor) → type: "personal", isProtected: true
- Recurring classes should be added to schedule, one-time events become tasks/deadlines
- Skip generic "No Class", "Holiday", "Break" events (shouldImport: false)

Return ONLY valid JSON array (one object per event):
[{"index": 0, "type": "class", "energy": "medium", "shouldImport": true, "location": "school", "isProtected": false}]`;

    try {
        const response = await callClaudeAPI([{
            role: 'user',
            content: `Categorize these calendar events:\n\n${eventSummaries}`
        }], systemPrompt);
        
        const categorizations = JSON.parse(response);
        
        // Merge categorizations with original events
        const categorizedEvents = events.map((event, index) => {
            const category = categorizations.find(c => c.index === index) || {
                type: 'other',
                energy: 'medium',
                shouldImport: true,
                location: 'anywhere',
                isProtected: false
            };
            
            return {
                ...event,
                ...category
            };
        });
        
        return categorizedEvents;
    } catch (error) {
        console.error('❌ AI categorization error:', error);
        // Fallback: basic categorization
        return events.map(event => ({
            ...event,
            type: guessEventType(event.summary),
            energy: 'medium',
            shouldImport: true,
            location: 'anywhere',
            isProtected: false
        }));
    }
}

// Fallback categorization if AI fails
function guessEventType(summary) {
    const lower = summary.toLowerCase();
    if (lower.includes('exam') || lower.includes('test') || lower.includes('final')) return 'exam';
    if (lower.includes('quiz')) return 'quiz';
    if (lower.includes('lab')) return 'lab';
    if (lower.includes('assignment') || lower.includes('due') || lower.includes('project')) return 'assignment';
    if (lower.includes('class') || lower.includes('lecture')) return 'class';
    return 'other';
}

// ===== SHOW IMPORT PREVIEW =====
function showImportPreview(events) {
    // Filter out events that shouldn't be imported
    const importableEvents = events.filter(e => e.shouldImport);
    
    // Separate into categories
    const classes = importableEvents.filter(e => e.type === 'class' && e.isRecurring);
    const deadlines = importableEvents.filter(e => ['assignment', 'exam', 'quiz', 'lab'].includes(e.type) && !e.isRecurring);
    const oneTimeEvents = importableEvents.filter(e => e.type === 'personal' || (e.type === 'other' && !e.isRecurring));
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'importPreviewModal';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h2>✨ Import Preview</h2>
                <button class="close-modal" onclick="document.getElementById('importPreviewModal').remove()">&times;</button>
            </div>
            
            <p style="margin-bottom: 20px; color: var(--text-light);">
                Found ${importableEvents.length} items to import. Review and uncheck anything you don't want.
            </p>
            
            ${classes.length > 0 ? `
                <div class="import-section">
                    <h3 style="color: var(--primary); margin-bottom: 10px;">
                        <input type="checkbox" id="selectAllClasses" checked onchange="toggleImportSection('classes', this.checked)">
                        📚 Recurring Classes (${classes.length})
                    </h3>
                    <div id="classes-list" style="margin-left: 25px;">
                        ${classes.map((event, i) => `
                            <div style="padding: 8px; background: var(--bg-main); margin: 5px 0; border-radius: 6px;">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" class="import-checkbox classes-checkbox" data-index="${i}" data-category="classes" checked>
                                    <span style="margin-left: 10px;">
                                        <strong>${event.summary}</strong>
                                        <br>
                                        <small style="color: var(--text-light);">
                                            ${event.startDate.toLocaleTimeString([], {weekday: 'short', hour: '2-digit', minute:'2-digit'})} - ${event.endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            ${event.location ? ` | 📍 ${event.location}` : ''}
                                        </small>
                                    </span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${deadlines.length > 0 ? `
                <div class="import-section" style="margin-top: 20px;">
                    <h3 style="color: var(--primary); margin-bottom: 10px;">
                        <input type="checkbox" id="selectAllDeadlines" checked onchange="toggleImportSection('deadlines', this.checked)">
                        📅 Deadlines & Assignments (${deadlines.length})
                    </h3>
                    <div id="deadlines-list" style="margin-left: 25px;">
                        ${deadlines.map((event, i) => {
                            const typeEmoji = event.type === 'exam' ? '📝' : event.type === 'quiz' ? '❓' : event.type === 'lab' ? '🔬' : '📄';
                            return `
                                <div style="padding: 8px; background: var(--bg-main); margin: 5px 0; border-radius: 6px;">
                                    <label style="display: flex; align-items: center; cursor: pointer;">
                                        <input type="checkbox" class="import-checkbox deadlines-checkbox" data-index="${i}" data-category="deadlines" checked>
                                        <span style="margin-left: 10px;">
                                            ${typeEmoji} <strong>${event.summary}</strong>
                                            <br>
                                            <small style="color: var(--text-light);">
                                                Due: ${event.startDate.toLocaleDateString()} at ${event.startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </small>
                                        </span>
                                    </label>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${oneTimeEvents.length > 0 ? `
                <div class="import-section" style="margin-top: 20px;">
                    <h3 style="color: var(--primary); margin-bottom: 10px;">
                        <input type="checkbox" id="selectAllEvents" checked onchange="toggleImportSection('events', this.checked)">
                        🗓️ One-Time Events (${oneTimeEvents.length})
                    </h3>
                    <div id="events-list" style="margin-left: 25px;">
                        ${oneTimeEvents.map((event, i) => `
                            <div style="padding: 8px; background: var(--bg-main); margin: 5px 0; border-radius: 6px;">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" class="import-checkbox events-checkbox" data-index="${i}" data-category="events" checked>
                                    <span style="margin-left: 10px;">
                                        ${event.isProtected ? '🔒' : ''} <strong>${event.summary}</strong>
                                        <br>
                                        <small style="color: var(--text-light);">
                                            ${event.startDate.toLocaleDateString()} at ${event.startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </small>
                                    </span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="executeCalendarImport(${JSON.stringify(classes)}, ${JSON.stringify(deadlines)}, ${JSON.stringify(oneTimeEvents)})">
                    ✅ Import Selected Items
                </button>
                <button class="btn btn-secondary" onclick="document.getElementById('importPreviewModal').remove()">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ===== TOGGLE IMPORT SECTION =====
function toggleImportSection(category, checked) {
    document.querySelectorAll(`.${category}-checkbox`).forEach(checkbox => {
        checkbox.checked = checked;
    });
}

// ===== EXECUTE IMPORT =====
function executeCalendarImport(classes, deadlines, oneTimeEvents) {
    const selectedClasses = classes.filter((_, i) => {
        const checkbox = document.querySelector(`.classes-checkbox[data-index="${i}"]`);
        return checkbox && checkbox.checked;
    });
    
    const selectedDeadlines = deadlines.filter((_, i) => {
        const checkbox = document.querySelector(`.deadlines-checkbox[data-index="${i}"]`);
        return checkbox && checkbox.checked;
    });
    
    const selectedEvents = oneTimeEvents.filter((_, i) => {
        const checkbox = document.querySelector(`.events-checkbox[data-index="${i}"]`);
        return checkbox && checkbox.checked;
    });
    
    let importedCount = 0;
    
    // Import recurring classes to schedule
    selectedClasses.forEach(event => {
        const dayOfWeek = event.startDate.toLocaleDateString('en-US', { weekday: 'long' });
        const startTime = event.startDate.toTimeString().slice(0, 5); // HH:MM
        const endTime = event.endDate.toTimeString().slice(0, 5);
        
        if (!appData.schedule[dayOfWeek]) {
            appData.schedule[dayOfWeek] = [];
        }
        
        // Check if this time slot already exists
        const exists = appData.schedule[dayOfWeek].some(block => 
            block.startTime === startTime && block.endTime === endTime
        );
        
        if (!exists) {
            appData.schedule[dayOfWeek].push({
                startTime: startTime,
                endTime: endTime,
                text: event.summary,
                type: 'class',
                location: event.location === 'school' ? 'school' : 'work',
                editable: true,
                protected: event.isProtected
            });
            importedCount++;
        }
    });
    
    // Import deadlines
    selectedDeadlines.forEach(event => {
        addDeadline(event.summary, event.startDate.toISOString().split('T')[0]);
        importedCount++;
    });
    
    // Import one-time events as tasks
    selectedEvents.forEach(event => {
        addTask({
            title: event.summary,
            energy: event.energy,
            location: event.location,
            timeEstimate: Math.round((event.endDate - event.startDate) / (1000 * 60)),
            dueDate: event.startDate.toISOString().split('T')[0],
            description: event.description
        });
        importedCount++;
    });
    
    // Save everything
    saveData();
    
    // Update UI
    updateUI();
    
    // Close modal and show success
    document.getElementById('importPreviewModal').remove();
    
    confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 }
    });
    
    showToast(`✅ Imported ${importedCount} items from your calendar!`);
}

// ===== SHOW CALENDAR IMPORT MODAL =====
function showCalendarImportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'calendarImportModal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>📅 Import Calendar</h2>
                <button class="close-modal" onclick="closeModal('calendarImportModal')">&times;</button>
            </div>
            
            <p style="margin-bottom: 15px;">
                Import your schedule, deadlines, and events from Canvas or any calendar app!
            </p>
            
            <div class="form-group">
                <label style="font-weight: 600; margin-bottom: 5px; display: block;">
                    Calendar Feed URL (.ics link)
                </label>
                <input type="url" 
                       id="calendarFeedUrl" 
                       placeholder="https://school.instructure.com/feeds/calendars/user_XXXXX.ics"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px;">
                <small style="color: var(--text-light);">
                    <strong>Canvas:</strong> Calendar → Calendar Feed → Copy link<br>
                    <strong>Google Calendar:</strong> Settings → Integrate calendar → Secret address in iCal format<br>
                    <strong>Outlook:</strong> Calendar → Publish calendar → Get ICS link
                </small>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap;">
                <button class="btn btn-primary" id="importCalendarBtn" onclick="importCalendarFeed()">
                    📥 Import Calendar
                </button>
                <button class="btn btn-secondary" onclick="closeModal('calendarImportModal')">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus the input
    setTimeout(() => document.getElementById('calendarFeedUrl').focus(), 100);
    
    // Close modal on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal('calendarImportModal');
        }
    });
}
