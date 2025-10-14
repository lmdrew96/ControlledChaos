// calendar-import.js - Calendar import functionality for .ics feeds and syllabus uploads

// ===== COURSE CODE EXTRACTION =====
function extractCourseCode(text) {
    if (!text) return null;
    
    // Pattern 1: Canvas format [SEMESTER-DEPT#-SECTION] e.g., [25F-BISC104-510]
    const canvasMatch = text.match(/\[(?:\d+[A-Z]-)?([A-Z]+\d+)-\d+\]/i);
    if (canvasMatch) {
        const code = canvasMatch[1].toUpperCase();
        console.log('📚 Extracted course code from Canvas format:', code);
        return code;
    }
    
    // Pattern 2: Standard format DEPT### or DEPT ###
    const standardMatch = text.match(/\b([A-Z]{3,4})\s*(\d{3})\b/i);
    if (standardMatch) {
        const code = (standardMatch[1] + standardMatch[2]).toUpperCase();
        console.log('📚 Extracted course code from standard format:', code);
        return code;
    }
    
    return null;
}

// ===== COURSE DETECTION FROM EVENT TITLE =====
function detectCourseFromTitle(eventTitle) {
    if (!eventTitle) return null;
    
    // First try to extract course code
    const courseCode = extractCourseCode(eventTitle);
    if (courseCode) {
        // Check if we have a mapping for this code
        const mapping = getCourseMappingForCode(courseCode);
        if (mapping) {
            console.log('📚 Found mapping for', courseCode, '→', mapping);
            return mapping;
        }
        // If no mapping exists, return the course code itself as a fallback
        console.log('📚 No mapping found for', courseCode, '- using code as course name');
        return courseCode;
    }
    
    const lower = eventTitle.toLowerCase();
    
    // Priority 1: Exact course code matches (highest priority)
    if (lower.match(/\bbisc\d*\b/) || lower.match(/\bbio\d*\b/)) {
        console.log('📚 Detected course: Biology for event "' + eventTitle + '"');
        return 'Bio';
    }
    if (lower.match(/\bhist\d*\b/)) {
        console.log('📚 Detected course: History for event "' + eventTitle + '"');
        return 'History';
    }
    if (lower.match(/\bpoli\d*\b/) || lower.match(/\bpols\d*\b/) || lower.match(/\bposc\d*\b/)) {
        console.log('📚 Detected course: Politics for event "' + eventTitle + '"');
        return 'Politics';
    }
    if (lower.match(/\bmus\d*\b/) || lower.match(/\bmusc\d*\b/) || lower.match(/\bmusic\d*\b/)) {
        console.log('📚 Detected course: Beatles for event "' + eventTitle + '"');
        return 'Beatles';
    }
    
    // Priority 2: Keyword matches (case-insensitive)
    if (lower.includes('biology') || lower.includes('bio ') || lower.includes(' bio')) {
        console.log('📚 Detected course: Biology for event "' + eventTitle + '"');
        return 'Bio';
    }
    if (lower.includes('history')) {
        console.log('📚 Detected course: History for event "' + eventTitle + '"');
        return 'History';
    }
    if (lower.includes('politics') || lower.includes('political') || lower.includes('government')) {
        console.log('📚 Detected course: Politics for event "' + eventTitle + '"');
        return 'Politics';
    }
    if (lower.includes('beatles') || lower.includes('music')) {
        console.log('📚 Detected course: Beatles for event "' + eventTitle + '"');
        return 'Beatles';
    }
    
    // Priority 3: Check if explicitly marked as personal
    if (lower.includes('personal:') || lower.includes('personal ')) {
        console.log('📚 Detected: Personal event "' + eventTitle + '"');
        return null; // Will default to personal
    }
    
    // No match found - will default to personal
    console.log('📚 No course detected for event "' + eventTitle + '" - defaulting to personal');
    return null;
}

// ===== COURSE MAPPING FUNCTIONS =====
function getCourseMappings() {
    if (!appData.courseMappings) {
        appData.courseMappings = {};
    }
    return appData.courseMappings;
}

function getCourseMappingForCode(code) {
    const mappings = getCourseMappings();
    const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return mappings[normalizedCode] || null;
}

function saveCourseMappings(mappings) {
    appData.courseMappings = mappings;
    saveData();
}

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
    const importBtn = document.querySelector('button[onclick="importCalendarFeed()"]');
    if (!importBtn) {
        console.error('Import button not found');
        alert('Error: Import button not found. Please try again.');
        return;
    }
    const originalBtnText = importBtn.textContent;
    importBtn.disabled = true;
    importBtn.textContent = '⏳ Fetching calendar...';
    
    try {
        // Step 1: Fetch the .ics file through the Vercel calendar proxy
        console.log('📥 Fetching calendar from:', feedUrl);
        
        const proxyUrl = `/api/calendar-proxy?url=${encodeURIComponent(feedUrl)}`;
        
        console.log('📡 Using proxy:', proxyUrl);
        const response = await fetch(proxyUrl, {
            method: 'GET'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Failed to fetch calendar: ${response.statusText}`);
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
        
        // Step 3: Categorize events with pattern matching
        importBtn.textContent = '🔍 Categorizing events...';
        const categorizedEvents = categorizeEvents(events);
        console.log('✅ Events categorized');
        
        // Step 4: Check for unmapped course codes
        importBtn.textContent = '🔍 Checking course codes...';
        const unmappedCodes = [...new Set(
            categorizedEvents
                .map(e => extractCourseCode(e.summary))
                .filter(code => code && !getCourseMappingForCode(code))
        )];
        
        console.log('📚 Found unmapped course codes:', unmappedCodes);
        
        // Step 5: If there are unmapped codes, show mapping modal first
        if (unmappedCodes.length > 0) {
            console.log('🎓 Showing course mapping modal for:', unmappedCodes);
            closeModal('calendarImportModal');
            
            showCourseMappingModal(unmappedCodes, (mappings) => {
                console.log('✅ Course mappings saved, proceeding with import');
                // After mapping is complete, show the import preview
                showImportPreview(categorizedEvents);
            });
        } else {
            // No unmapped codes, proceed directly to preview
            console.log('✅ All courses mapped, showing preview');
            showImportPreview(categorizedEvents);
            closeModal('calendarImportModal');
        }
        
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

// ===== CATEGORIZE EVENTS WITH PATTERN MATCHING =====
function categorizeEvents(events) {
    return events.map(event => {
        const title = event.summary.toLowerCase();
        const description = (event.description || '').toLowerCase();
        const hasCourseBracket = /\[[\w-]+\]/.test(event.summary);
        
        // Skip generic events
        if (title.includes('no class') || title.includes('holiday') || 
            title.includes('break') || title.includes('vacation')) {
            return {
                ...event,
                type: 'other',
                energy: 'medium',
                shouldImport: false,
                location: 'anywhere',
                isProtected: false
            };
        }
        
        // ASSIGNMENTS/EXAMS (high priority)
        if (title.includes('exam') || title.includes('test') || title.includes('quiz')) {
            return { 
                ...event, 
                type: 'exam', 
                energy: 'high',
                shouldImport: true,
                location: 'school',
                isProtected: false,
                defaultTimeEstimate: title.includes('quiz') ? 30 : 120
            };
        }
        
        if (title.includes('assignment') || title.includes('homework') || 
            title.includes('project') || title.includes('lab') || 
            title.includes('paper') || title.includes('essay') ||
            title.includes('smartbook') || title.includes('chapter')) {
            
            // Set realistic time estimates based on type
            let timeEstimate = 45;
            if (title.includes('smartbook')) {
                timeEstimate = 75;
            } else if (title.includes('lab')) {
                timeEstimate = 90;
            } else if (title.includes('essay') || title.includes('paper')) {
                timeEstimate = 120;
            }
            
            return { 
                ...event, 
                type: 'assignment', 
                energy: 'high',
                shouldImport: true,
                location: 'home',
                isProtected: false,
                defaultTimeEstimate: timeEstimate
            };
        }
        
        // CLASSES (recurring with course codes)
        if (hasCourseBracket && (title.includes('lecture') || title.includes('class') || 
            title.includes('discussion') || title.includes('lab session'))) {
            return { 
                ...event, 
                type: 'class', 
                energy: 'medium',
                shouldImport: true,
                location: 'school',
                isProtected: false
            };
        }
        
        // Classes: recurring events or things with "lecture", "class", etc.
        if (event.isRecurring || title.includes('lecture') || title.includes('class')) {
            return {
                ...event,
                type: 'class',
                energy: 'medium',
                shouldImport: true,
                location: 'school',
                isProtected: false
            };
        }
        
        // CAREER/CAMPUS EVENTS
        if (title.includes('career') || title.includes('fair') || 
            title.includes('networking') || title.includes('workshop')) {
            return { 
                ...event, 
                type: 'event', 
                energy: 'medium',
                shouldImport: true,
                location: 'school',
                isProtected: false
            };
        }
        
        // Personal appointments (protected)
        if (title.includes('therapy') || title.includes('doctor') || 
            title.includes('appointment') || title.includes('dentist') ||
            title.includes('meeting') || title.includes('interview')) {
            return {
                ...event,
                type: 'personal',
                energy: 'low',
                shouldImport: true,
                location: 'anywhere',
                isProtected: true
            };
        }
        
        // DEFAULT: If it has a course bracket, it's probably an assignment
        if (hasCourseBracket) {
            return { 
                ...event, 
                type: 'assignment', 
                energy: 'medium',
                shouldImport: true,
                location: 'home',
                isProtected: false,
                defaultTimeEstimate: 45
            };
        }
        
        // Everything else is personal
        return { 
            ...event, 
            type: 'event', 
            energy: 'medium',
            shouldImport: true,
            location: 'anywhere',
            isProtected: false
        };
    });
}

// Legacy fallback (kept for compatibility)
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
                <button class="close-modal" id="closePreviewBtn">&times;</button>
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
                <button class="btn btn-primary" id="importSelectedBtn">
                    ✅ Import Selected Items
                </button>
                <button class="btn btn-secondary" id="cancelImportBtn">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // FIX: Use proper event listeners with closures instead of inline onclick
    // This gives the button access to classes, deadlines, and oneTimeEvents
    const importBtn = document.getElementById('importSelectedBtn');
    const cancelBtn = document.getElementById('cancelImportBtn');
    const closeBtn = document.getElementById('closePreviewBtn');
    
    importBtn.addEventListener('click', () => {
        executeCalendarImport(classes, deadlines, oneTimeEvents);
    });
    
    cancelBtn.addEventListener('click', () => {
        document.getElementById('importPreviewModal').remove();
    });
    
    closeBtn.addEventListener('click', () => {
        document.getElementById('importPreviewModal').remove();
    });
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
    
    // Import deadlines with proper time estimates AND course detection
    selectedDeadlines.forEach(event => {
        // Determine time estimate based on event type
        let timeEstimate = 45; // Default
        const lower = event.summary.toLowerCase();
        
        if (lower.includes('smartbook') || lower.includes('smart book')) {
            timeEstimate = 75;
        } else if (lower.includes('lab')) {
            timeEstimate = 90;
        } else if (lower.includes('exam') && !lower.includes('prep')) {
            timeEstimate = 120;
        } else if (lower.includes('quiz')) {
            timeEstimate = 30;
        } else if (lower.includes('essay') || lower.includes('paper')) {
            timeEstimate = 120;
        } else if (event.defaultTimeEstimate) {
            timeEstimate = event.defaultTimeEstimate;
        }
        
        // Detect course from event title
        const detectedCourse = detectCourseFromTitle(event.summary);
        
        // PRESERVE ACTUAL DUE TIME from calendar (not just date!)
        const deadline = {
            id: Date.now().toString() + Math.random(),
            title: event.summary,
            dueDate: event.startDate.toISOString(), // Full ISO datetime with time!
            createdAt: new Date().toISOString(),
            completed: false,
            timeEstimate: timeEstimate,
            class: detectedCourse // Assign detected course (or null for personal)
        };
        
        // CHECK FOR DUPLICATES before adding
        const isDuplicate = appData.deadlines.some(existing => 
            existing.title === deadline.title && 
            existing.dueDate === deadline.dueDate &&
            !existing.completed
        );
        
        if (!isDuplicate) {
            console.log(`📥 Importing deadline: ${event.summary} with ${timeEstimate}min estimate, course: ${detectedCourse || 'personal'}`);
            appData.deadlines.push(deadline);
            importedCount++;
        } else {
            console.log(`⏭️ Skipping duplicate: ${event.summary} (${deadline.dueDate})`);
        }
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

// ===== SHOW COURSE MAPPING MODAL =====
function showCourseMappingModal(unmappedCodes, callback) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'courseMappingModal';
    
    // Get existing mappings
    const existingMappings = getCourseMappings();
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>🎓 Name Your Courses</h2>
                <button class="close-modal" id="closeMappingBtn">&times;</button>
            </div>
            
            <p style="margin-bottom: 20px; color: var(--text-light);">
                We found these course codes. Give them friendly names you'll recognize:
            </p>
            
            <div id="courseMappingList" style="margin-bottom: 20px;">
                ${unmappedCodes.map(code => {
                    const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const existingMapping = existingMappings[normalizedCode] || '';
                    return `
                        <div style="margin-bottom: 15px; padding: 15px; background: var(--bg-main); border-radius: 8px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                                ${code}
                            </label>
                            <input type="text" 
                                   class="course-mapping-input" 
                                   data-code="${normalizedCode}"
                                   value="${existingMapping}"
                                   placeholder="e.g., Biology, US Politics, Beatles"
                                   style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div style="background: rgba(102, 126, 234, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 0.9em; color: var(--text-light);">
                    ℹ️ You can edit these anytime in Settings → Course Mappings
                </p>
            </div>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" id="saveMappingsBtn">
                    💾 Save & Import
                </button>
                <button class="btn btn-secondary" id="skipMappingsBtn">
                    Skip for now
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners
    const saveBtn = document.getElementById('saveMappingsBtn');
    const skipBtn = document.getElementById('skipMappingsBtn');
    const closeBtn = document.getElementById('closeMappingBtn');
    
    saveBtn.addEventListener('click', () => {
        const newMappings = {};
        document.querySelectorAll('.course-mapping-input').forEach(input => {
            const code = input.dataset.code;
            const name = input.value.trim();
            if (name) {
                newMappings[code] = name;
            }
        });
        
        // Merge with existing mappings
        const allMappings = { ...existingMappings, ...newMappings };
        saveCourseMappings(allMappings);
        
        modal.remove();
        showToast('✅ Course mappings saved!');
        
        if (callback) callback(allMappings);
    });
    
    skipBtn.addEventListener('click', () => {
        modal.remove();
        if (callback) callback(existingMappings);
    });
    
    closeBtn.addEventListener('click', () => {
        modal.remove();
        if (callback) callback(existingMappings);
    });
    
    // Focus first input
    setTimeout(() => {
        const firstInput = document.querySelector('.course-mapping-input');
        if (firstInput) firstInput.focus();
    }, 100);
}

// ===== SHOW CALENDAR IMPORT MODAL =====
function showCalendarImportModal() {
    // Remove any existing modal first
    const existingModal = document.getElementById('calendarImportModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'calendarImportModal';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>📅 Import Calendar or Syllabus</h2>
                <button class="close-modal" onclick="closeModal('calendarImportModal')">&times;</button>
            </div>
            
            <p style="margin-bottom: 20px; color: var(--text-light);">
                Import your schedule and deadlines from Canvas, Google Calendar, or upload a syllabus PDF/DOCX.
            </p>
            
            <!-- Calendar Feed Section -->
            <div class="form-group" style="margin-bottom: 30px;">
                <h3 style="margin-bottom: 10px;">📅 Calendar Feed (.ics)</h3>
                <input type="url" 
                       id="calendarFeedUrl" 
                       placeholder="https://school.instructure.com/feeds/calendars/user_XXXXX.ics"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px;">
                <small style="color: var(--text-light); display: block; margin-bottom: 10px;">
                    <strong>Canvas:</strong> Calendar → Calendar Feed → Copy link<br>
                    <strong>Google Calendar:</strong> Settings → Secret address in iCal format
                </small>
                <button class="btn btn-primary" onclick="importCalendarFeed()" style="width: 100%;">
                    📥 Import Calendar Feed
                </button>
            </div>
            
            <div style="text-align: center; margin: 20px 0; color: var(--text-light); font-weight: 600;">
                — OR —
            </div>
            
            <!-- Syllabus Upload Section -->
            <div class="form-group">
                <h3 style="margin-bottom: 10px;">📄 Upload Syllabus</h3>
                <div id="syllabusDropZone" style="
                    border: 2px dashed var(--border);
                    border-radius: 10px;
                    padding: 40px 20px;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    background: var(--bg-main);
                ">
                    <div style="font-size: 3em; margin-bottom: 10px;">📄</div>
                    <p style="margin: 0; font-weight: 600;">Drop PDF here</p>
                    <p style="margin: 5px 0 0 0; font-size: 0.9em; color: var(--text-light);">or click to browse</p>
                </div>
                <input type="file" 
                       id="syllabusFileInput" 
                       accept=".pdf"
                       style="display: none;">
            </div>
            
            <button class="btn btn-secondary" onclick="closeModal('calendarImportModal')" style="width: 100%; margin-top: 20px;">
                Cancel
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Set up file upload handlers
    const dropZone = document.getElementById('syllabusDropZone');
    const fileInput = document.getElementById('syllabusFileInput');
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--primary)';
        dropZone.style.background = 'rgba(102, 126, 234, 0.1)';
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = 'var(--bg-main)';
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = 'var(--bg-main)';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleSyllabusUpload(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleSyllabusUpload(e.target.files[0]);
        }
    });
    
    // Focus the calendar URL input
    setTimeout(() => document.getElementById('calendarFeedUrl').focus(), 100);
    
    // Close modal on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal('calendarImportModal');
        }
    });
}

// ===== HANDLE SYLLABUS UPLOAD =====
async function handleSyllabusUpload(file) {
    // Validate file type
    const validTypes = ['application/pdf'];
    if (!validTypes.includes(file.type)) {
        alert('Please upload a PDF file.');
        return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File is too large. Please upload a file smaller than 10MB.');
        return;
    }
    
    closeModal('calendarImportModal');
    
    // Show loading modal
    const loadingModal = document.createElement('div');
    loadingModal.className = 'modal active';
    loadingModal.id = 'syllabusLoadingModal';
    loadingModal.innerHTML = `
        <div class="modal-content">
            <h2>📄 Processing Syllabus...</h2>
            <p>Extracting assignments and due dates from ${file.name}...</p>
            <div style="text-align: center; margin: 20px 0;">
                <div style="display: inline-block; width: 50px; height: 50px; border: 5px solid var(--bg-main); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(loadingModal);
    
    try {
        // Read file as base64
        const reader = new FileReader();
        const fileData = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        
        // Call API to parse syllabus
        const response = await fetch('/api/parse-syllabus', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileName: file.name,
                fileData: fileData,
                fileType: file.type
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to parse syllabus');
        }
        
        const result = await response.json();
        
        loadingModal.remove();
        
        // Check for unmapped course codes
        const courseCode = result.courseCode;
        if (courseCode) {
            const mapping = getCourseMappingForCode(courseCode);
            if (!mapping) {
                // Show mapping modal first
                showCourseMappingModal([courseCode], (mappings) => {
                    // Apply mapping and show preview
                    result.courseName = mappings[courseCode.toUpperCase().replace(/[^A-Z0-9]/g, '')] || result.courseTitle || 'Unknown Course';
                    showSyllabusImportPreview(result);
                });
                return;
            } else {
                result.courseName = mapping;
            }
        }
        
        // Show import preview
        showSyllabusImportPreview(result);
        
    } catch (error) {
        console.error('❌ Syllabus upload error:', error);
        loadingModal.remove();
        alert(`Failed to process syllabus: ${error.message}\n\nPlease try again or import manually.`);
    }
}

// ===== SHOW SYLLABUS IMPORT PREVIEW =====
function showSyllabusImportPreview(result) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'syllabusPreviewModal';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h2>📄 Syllabus Import Preview</h2>
                <button class="close-modal" id="closeSyllabusPreviewBtn">&times;</button>
            </div>
            
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 5px 0;">${result.courseName || result.courseTitle || 'Course'}</h3>
                ${result.courseCode ? `<p style="margin: 0; opacity: 0.9;">Code: ${result.courseCode}</p>` : ''}
            </div>
            
            <p style="margin-bottom: 20px; color: var(--text-light);">
                Found ${result.assignments.length} assignment${result.assignments.length !== 1 ? 's' : ''}. Review and uncheck anything you don't want to import.
            </p>
            
            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; cursor: pointer; font-weight: 600; margin-bottom: 10px;">
                    <input type="checkbox" id="selectAllSyllabusItems" checked onchange="toggleAllSyllabusItems(this.checked)">
                    <span style="margin-left: 10px;">Select All</span>
                </label>
                
                ${result.assignments.map((assignment, i) => `
                    <div style="padding: 12px; background: var(--bg-main); margin: 8px 0; border-radius: 8px;">
                        <label style="display: flex; align-items: start; cursor: pointer;">
                            <input type="checkbox" class="syllabus-item-checkbox" data-index="${i}" checked style="margin-top: 4px;">
                            <div style="margin-left: 10px; flex: 1;">
                                <div style="font-weight: 600; margin-bottom: 5px;">${assignment.name}</div>
                                <div style="font-size: 0.9em; color: var(--text-light);">
                                    📅 Due: ${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No date specified'}
                                    ${assignment.description ? `<br>📝 ${assignment.description}` : ''}
                                </div>
                            </div>
                        </label>
                    </div>
                `).join('')}
            </div>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" id="importSyllabusBtn">
                    ✅ Import Selected (${result.assignments.length})
                </button>
                <button class="btn btn-secondary" id="cancelSyllabusBtn">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners
    const importBtn = document.getElementById('importSyllabusBtn');
    const cancelBtn = document.getElementById('cancelSyllabusBtn');
    const closeBtn = document.getElementById('closeSyllabusPreviewBtn');
    
    importBtn.addEventListener('click', () => {
        executeSyllabusImport(result);
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });
}

// ===== TOGGLE ALL SYLLABUS ITEMS =====
function toggleAllSyllabusItems(checked) {
    document.querySelectorAll('.syllabus-item-checkbox').forEach(checkbox => {
        checkbox.checked = checked;
    });
    
    // Update button text
    const importBtn = document.getElementById('importSyllabusBtn');
    if (importBtn) {
        const count = checked ? document.querySelectorAll('.syllabus-item-checkbox').length : 0;
        importBtn.textContent = `✅ Import Selected (${count})`;
    }
}

// Update count when individual checkboxes change
document.addEventListener('change', (e) => {
    if (e.target.classList.contains('syllabus-item-checkbox')) {
        const importBtn = document.getElementById('importSyllabusBtn');
        if (importBtn) {
            const count = document.querySelectorAll('.syllabus-item-checkbox:checked').length;
            importBtn.textContent = `✅ Import Selected (${count})`;
        }
    }
});

// ===== EXECUTE SYLLABUS IMPORT =====
function executeSyllabusImport(result) {
    const selectedAssignments = result.assignments.filter((_, i) => {
        const checkbox = document.querySelector(`.syllabus-item-checkbox[data-index="${i}"]`);
        return checkbox && checkbox.checked;
    });
    
    if (selectedAssignments.length === 0) {
        alert('Please select at least one assignment to import.');
        return;
    }
    
    let importedCount = 0;
    
    selectedAssignments.forEach(assignment => {
        const deadline = {
            id: Date.now().toString() + Math.random(),
            title: assignment.name,
            dueDate: assignment.dueDate || new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
            completed: false,
            timeEstimate: 45, // Default estimate
            class: result.courseName || null,
            description: assignment.description || ''
        };
        
        appData.deadlines.push(deadline);
        importedCount++;
    });
    
    // Save everything
    saveData();
    updateUI();
    
    // Close modal
    document.getElementById('syllabusPreviewModal').remove();
    
    // Show success
    confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 }
    });
    
    showToast(`✅ Imported ${importedCount} assignment${importedCount !== 1 ? 's' : ''} from syllabus!`);
}
