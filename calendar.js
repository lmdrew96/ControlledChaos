// calendar.js - Schedule and calendar functions

// Date/time utilities
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Current week tracking
let currentWeekStart = getWeekStart();

// User selection tracking
let userSelectedDay = null; // null = auto (show today), or specific date string
let lastAutoRefresh = Date.now();

// ===== DATE/TIME UTILITIES =====
function getCurrentDateTime() {
    return new Date();
}

function updateCurrentDate() {
    const today = getCurrentDateTime();
    const dayName = days[today.getDay()];
    const dayNum = today.getDate();
    const monthName = months[today.getMonth()];
    const year = today.getFullYear();
    document.getElementById('currentDate').textContent = `${dayName}, ${monthName} ${dayNum}, ${year}`;
}

// Get the Monday of the current week
function getWeekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Format date as YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Get day name from date
function getDayName(date) {
    const daysLower = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return daysLower[date.getDay()];
}

// Get schedule for specific date (checks overrides first, then template)
function getScheduleForDate(dateStr) {
    // Check if there's an override for this specific date
    if (appData.scheduleOverrides && appData.scheduleOverrides[dateStr]) {
        return appData.scheduleOverrides[dateStr];
    }
    
    // Otherwise, use the recurring template
    // SAFER DATE PARSING: Parse as local date to avoid timezone issues
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    const dayName = days[date.getDay()];
    return appData.schedule[dayName] || [];
}

// ===== TIME PARSING AND FORMATTING =====
function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function formatTime(timeStr) {
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${minutes} ${ampm}`;
}

// ===== CALENDAR RENDERING =====
// Render calendar week with actual dates
function renderCalendarWeek() {
    const weekStart = new Date(currentWeekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // Update week label
    document.getElementById('weekLabel').textContent = 
        `Week of ${weekStart.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}`;
    
    // Clear and regenerate day tabs dynamically to ensure correct order
    const dayTabsContainer = document.querySelector('.day-tabs');
    dayTabsContainer.innerHTML = '';
    
    // Generate 7 day tabs starting from Monday
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        const dateStr = formatDate(date);
        const dayName = date.toLocaleDateString('en-US', {weekday: 'short'});
        const monthDay = date.toLocaleDateString('en-US', {month: 'numeric', day: 'numeric'});
        
        const button = document.createElement('button');
        button.className = 'day-tab';
        button.dataset.date = dateStr;
        button.textContent = `${dayName} ${monthDay}`;
        
        // Highlight today
        const today = formatDate(new Date());
        if (dateStr === today) {
            button.classList.add('active');
        }
        
        // Add click handler
        button.addEventListener('click', () => {
            const clickedDate = button.dataset.date;
            console.log('📅 Clicked tab for date:', clickedDate);
            
            // Track user's manual selection
            userSelectedDay = clickedDate;
            console.log('👤 User manually selected:', userSelectedDay);
            
            document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
            button.classList.add('active');
            renderScheduleForDate(clickedDate);
        });
        
        dayTabsContainer.appendChild(button);
    }
    
    // Render today's schedule by default
    const today = formatDate(new Date());
    renderScheduleForDate(today);
}

// Render schedule for specific date
function renderScheduleForDate(dateStr) {
    console.log('📅 [RENDER SCHEDULE] Called with dateStr:', dateStr);
    
    const scheduleDisplay = document.getElementById('scheduleView');
    const schedule = getScheduleForDate(dateStr);
    
    if (!schedule || schedule.length === 0) {
        scheduleDisplay.innerHTML = '<p>No schedule for this day</p>';
        return;
    }
    
    // SAFER DATE PARSING: Parse as local date to avoid timezone issues
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    
    console.log('📅 [RENDER SCHEDULE] Parsed date object:', date);
    console.log('📅 [RENDER SCHEDULE] date.getDay():', date.getDay());
    
    const dayName = date.toLocaleDateString('en-US', {weekday: 'long'});
    console.log('📅 [RENDER SCHEDULE] Calculated day name:', dayName);
    
    let html = `<div class="schedule-day"><h3>${dayName}</h3>`;
    schedule.forEach((block, index) => {
        const protectedIcon = block.protected ? '🔒' : '';
        const blockClass = block.protected ? 'protected' : block.type;
        
        html += `
            <div class="schedule-item ${blockClass}" style="display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    ${protectedIcon}
                    ${formatTime(block.startTime)} - ${formatTime(block.endTime)}
                    <span style="margin-left: 10px;">${block.text || block.activity}</span>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="task-btn" onclick="editScheduleBlock('${dayName}', ${index})" title="Edit block" style="padding: 4px 8px; font-size: 0.8em;">
                        ✏️
                    </button>
                    <button class="task-btn" onclick="deleteScheduleBlock('${dayName}', ${index})" title="Delete block" style="padding: 4px 8px; font-size: 0.8em;">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    scheduleDisplay.innerHTML = html;
}

// ===== DAILY SCHEDULE INITIALIZATION =====
function initializeDailySchedule() {
    // Initialize calendar week (this now handles all tab creation and event listeners)
    renderCalendarWeek();
    
    // Add week navigation event listeners
    document.getElementById('prevWeek').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        renderCalendarWeek();
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        renderCalendarWeek();
    });
}

// ===== CURRENT BLOCK DETECTION =====
function getCurrentBlock() {
    const now = getCurrentDateTime();
    const dayName = days[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const todaySchedule = appData.schedule[dayName] || [];
    
    for (let block of todaySchedule) {
        const startMinutes = parseTime(block.startTime);
        const endMinutes = parseTime(block.endTime);
        
        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
            return {
                ...block,
                minutesRemaining: endMinutes - currentMinutes
            };
        }
    }
    
    return null;
}

// ===== SCHEDULE RENDERING =====
function renderSchedule() {
    const now = getCurrentDateTime();
    const dayName = days[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const currentBlock = getCurrentBlock();
    const currentBlockDiv = document.getElementById('currentBlock');
    
    if (currentBlock) {
        currentBlockDiv.style.display = 'block';
        document.getElementById('currentBlockText').textContent = currentBlock.text;
        const hours = Math.floor(currentBlock.minutesRemaining / 60);
        const mins = currentBlock.minutesRemaining % 60;
        document.getElementById('timeRemaining').textContent = 
            `⏱️ ${hours}h ${mins}m remaining`;
    } else {
        currentBlockDiv.style.display = 'none';
    }
    
    const scheduleView = document.getElementById('scheduleView');
    const todaySchedule = appData.schedule[dayName] || [];
    
    scheduleView.innerHTML = `
        <div class="schedule-day">
            <h3>${dayName}</h3>
            ${todaySchedule.map(block => {
                const startMinutes = parseTime(block.startTime);
                const endMinutes = parseTime(block.endTime);
                const isCurrent = currentMinutes >= startMinutes && currentMinutes < endMinutes;
                
                return `
                    <div class="schedule-item ${block.type} ${isCurrent ? 'current' : ''}">
                        <span>
                            ${block.type === 'protected' ? '<span class="lock-icon">🔒</span> ' : ''}
                            ${formatTime(block.startTime)} - ${formatTime(block.endTime)}
                        </span>
                        <span>${block.text}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ===== AUTO-REFRESH SETUP =====
function setupAutoRefresh() {
    // Update every minute
    setInterval(() => {
        const today = formatDate(new Date());
        
        console.log('🔄 [AUTO-REFRESH] Triggered at', new Date().toLocaleTimeString());
        console.log('🔄 [AUTO-REFRESH] User selected day:', userSelectedDay);
        console.log('🔄 [AUTO-REFRESH] Today is:', today);
        
        // Only auto-refresh schedule if user hasn't manually selected a different day
        if (!userSelectedDay || userSelectedDay === today) {
            console.log('🔄 Auto-refresh: updating to today');
            
            // Update the schedule to show today
            renderScheduleForDate(today);
            
            // Update tab highlighting to show today as active
            document.querySelectorAll('.day-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.date === today) {
                    tab.classList.add('active');
                }
            });
        } else {
            console.log('⏸️ Auto-refresh: skipping (user selected', userSelectedDay, ')');
        }
        
        // Update other UI elements (current time, tasks, etc.)
        updateCurrentDate();
        renderTasks();
        updateWhatNow();
        renderDeadlines();
        
        lastAutoRefresh = Date.now();
    }, 60000);
}

// ===== AVAILABLE TIME CALCULATION =====
function getAvailableFreeBlocks(startDate, endDate) {
    const blocks = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Iterate through each day until deadline
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayName = days[d.getDay()];
        const daySchedule = appData.schedule[dayName] || [];
        
        daySchedule.forEach(block => {
            if (block.type === 'free' && !block.protected) {
                const startMinutes = parseTime(block.startTime);
                const endMinutes = parseTime(block.endTime);
                const duration = endMinutes - startMinutes;
                
                blocks.push({
                    day: dayName,
                    date: new Date(d).toLocaleDateString(),
                    time: `${formatTime(block.startTime)}-${formatTime(block.endTime)}`,
                    duration: duration,
                    location: block.location
                });
            }
        });
    }
    
    return blocks;
}

function calculateAvailableTime(deadline) {
    const now = new Date();
    const dueDate = new Date(deadline.dueDate);
    
    // Find all free blocks between now and deadline
    const freeBlocks = [];
    let currentDate = new Date(now);
    
    while (currentDate <= dueDate) {
        const dayName = days[currentDate.getDay()];
        const daySchedule = appData.schedule[dayName] || [];
        const currentMinutes = currentDate.getTime() === now.getTime() ? now.getHours() * 60 + now.getMinutes() : 0;
        
        daySchedule.forEach(block => {
            if (block.type === 'free' && !block.protected && block.editable) {
                const startMinutes = parseTime(block.startTime);
                const endMinutes = parseTime(block.endTime);
                
                // Skip blocks that have already passed today
                if (currentDate.toDateString() === now.toDateString() && endMinutes <= currentMinutes) {
                    return;
                }
                
                const duration = endMinutes - startMinutes;
                
                freeBlocks.push({
                    date: currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                    time: `${formatTime(block.startTime)}-${formatTime(block.endTime)}`,
                    duration: duration,
                    location: block.location
                });
            }
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Calculate total available hours
    const totalMinutes = freeBlocks.reduce((sum, block) => sum + block.duration, 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    
    return {
        freeBlocks,
        totalHours,
        remainingMinutes,
        blockCount: freeBlocks.length,
        totalMinutes
    };
}

// ===== COMMUTE HOME DETECTION =====
function isCommuteHomeBlock() {
    const now = getCurrentDateTime();
    const dayName = days[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const commuteHomeBlocks = [
        { day: 'Monday', startTime: '13:00', endTime: '13:40' },
        { day: 'Tuesday', startTime: '16:00', endTime: '16:40' },
        { day: 'Wednesday', startTime: '14:00', endTime: '14:35' },
        { day: 'Friday', startTime: '22:25', endTime: '22:50' },
        { day: 'Saturday', startTime: '22:25', endTime: '22:50' }
    ];
    
    return commuteHomeBlocks.some(block => {
        if (block.day !== dayName) return false;
        const startMinutes = parseTime(block.startTime);
        const endMinutes = parseTime(block.endTime);
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    });
}

// ===== NEXT AVAILABLE BLOCK FINDER =====
function findNextAvailableBlock(task) {
    const now = getCurrentDateTime();
    const currentDay = days[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Check today's remaining schedule first
    const todaySchedule = appData.schedule[currentDay] || [];
    for (let block of todaySchedule) {
        const startMinutes = parseTime(block.startTime);
        const endMinutes = parseTime(block.endTime);
        const duration = endMinutes - startMinutes;
        
        // Skip if block already passed or is protected/class
        if (startMinutes <= currentMinutes || block.type === 'protected' || block.type === 'class') {
            continue;
        }
        
        // Check if block is suitable for task
        if (block.type === 'free' && 
            (task.location === 'anywhere' || task.location === block.location || block.location === 'anywhere') &&
            (!task.timeEstimate || duration >= task.timeEstimate)) {
            return {
                day: currentDay,
                time: `${formatTime(block.startTime)}-${formatTime(block.endTime)}`,
                location: block.location,
                duration: duration,
                available: true
            };
        }
    }
    
    // Check next 7 days
    for (let i = 1; i <= 7; i++) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + i);
        const dayName = days[checkDate.getDay()];
        const daySchedule = appData.schedule[dayName] || [];
        
        for (let block of daySchedule) {
            const startMinutes = parseTime(block.startTime);
            const endMinutes = parseTime(block.endTime);
            const duration = endMinutes - startMinutes;
            
            if (block.type === 'free' && 
                (task.location === 'anywhere' || task.location === block.location || block.location === 'anywhere') &&
                (!task.timeEstimate || duration >= task.timeEstimate)) {
                return {
                    day: dayName,
                    time: `${formatTime(block.startTime)}-${formatTime(block.endTime)}`,
                    location: block.location,
                    duration: duration,
                    available: true
                };
            }
        }
    }
    
    return { available: false };
}

// ===== SCHEDULE EDITING =====
function editScheduleBlock(day, blockIndex) {
    const block = appData.schedule[day][blockIndex];
    if (!block) return;
    
    // Prompt for new values
    const newText = prompt('Block name:', block.text);
    if (!newText) return;
    
    const newStartTime = prompt('Start time (HH:MM, 24-hour format):', block.startTime);
    if (!newStartTime) return;
    
    const newEndTime = prompt('End time (HH:MM, 24-hour format):', block.endTime);
    if (!newEndTime) return;
    
    const newLocation = prompt('Location (home/school/work/commute/anywhere):', block.location);
    if (!newLocation) return;
    
    const newType = prompt('Type (free/class/protected):', block.type);
    if (!newType) return;
    
    // Update block
    block.text = newText.trim();
    block.startTime = newStartTime.trim();
    block.endTime = newEndTime.trim();
    block.location = newLocation.trim();
    block.type = newType.trim();
    
    saveData();
    renderDailySchedule();
    showToast('✏️ Schedule block updated');
}

function deleteScheduleBlock(day, blockIndex) {
    if (!confirm('Delete this schedule block?')) return;
    
    appData.schedule[day].splice(blockIndex, 1);
    saveData();
    renderDailySchedule();
    showToast('🗑️ Schedule block deleted');
}

// Helper function to re-render the daily schedule
function renderDailySchedule() {
    const today = formatDate(new Date());
    renderScheduleForDate(today);
}
