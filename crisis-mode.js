// crisis-mode.js - Crisis Mode detection and management

// ===== CRISIS MODE STATE =====
let crisisMode = {
    active: false,
    clusters: [],
    currentCluster: null,
    dailyBreakdowns: {},
    completedChunks: {}
};

// ===== CRISIS DETECTION ALGORITHM =====
function detectCrisisMode() {
    console.log('🔥 [CRISIS] Running crisis detection...');
    
    const now = new Date();
    const clusters = [];
    
    // Group tasks by deadline
    const deadlineGroups = {};
    
    appData.tasks.forEach(task => {
        if (task.completed || !task.dueDate) return;
        
        const dueDate = new Date(task.dueDate);
        const hoursUntilDeadline = (dueDate - now) / (1000 * 60 * 60);
        const daysUntilDeadline = hoursUntilDeadline / 24;
        
        // Only consider deadlines within 4 days
        if (daysUntilDeadline > 4 || daysUntilDeadline < 0) return;
        
        const deadlineKey = task.dueDate;
        if (!deadlineGroups[deadlineKey]) {
            deadlineGroups[deadlineKey] = {
                dueDate: task.dueDate,
                tasks: [],
                totalMinutes: 0,
                category: task.category || 'General'
            };
        }
        
        deadlineGroups[deadlineKey].tasks.push(task);
        deadlineGroups[deadlineKey].totalMinutes += task.timeEstimate || 30;
    });
    
    // Analyze each deadline group for crisis conditions
    Object.values(deadlineGroups).forEach(group => {
        const dueDate = new Date(group.dueDate);
        const hoursUntilDeadline = (dueDate - now) / (1000 * 60 * 60);
        const totalHoursNeeded = group.totalMinutes / 60;
        
        // Calculate available time
        const availableTime = calculateAvailableTime({ dueDate: group.dueDate });
        const availableHours = availableTime.totalMinutes / 60;
        
        // Crisis criteria
        const timeRatio = totalHoursNeeded / availableHours;
        const isTight = timeRatio > 0.6;
        const isUrgent = hoursUntilDeadline < 96; // Less than 4 days
        
        // Check for procrastination patterns (tasks that have been around for a while)
        const hasOldTasks = group.tasks.some(task => {
            if (!task.createdAt) return false;
            const taskAge = (now - new Date(task.createdAt)) / (1000 * 60 * 60 * 24);
            return taskAge > 2; // Task created more than 2 days ago
        });
        
        // Check for historically difficult task types
        const hasDifficultTasks = group.tasks.some(task => {
            const title = task.title.toLowerCase();
            return title.includes('smartbook') || 
                   title.includes('bio') || 
                   title.includes('exam prep');
        });
        
        if (isTight && isUrgent) {
            clusters.push({
                id: `crisis_${group.dueDate}`,
                name: `${group.category} Work`,
                dueDate: group.dueDate,
                tasks: group.tasks,
                totalMinutes: group.totalMinutes,
                totalHours: Math.floor(totalHoursNeeded),
                remainingMinutes: group.totalMinutes % 60,
                availableHours: Math.floor(availableHours),
                availableMinutes: availableTime.totalMinutes % 60,
                timeRatio: timeRatio,
                hoursUntilDeadline: hoursUntilDeadline,
                daysUntilDeadline: Math.ceil(hoursUntilDeadline / 24),
                isAchievable: timeRatio <= 1.0,
                severity: timeRatio > 1.0 ? 'critical' : timeRatio > 0.8 ? 'urgent' : 'warning',
                hasOldTasks: hasOldTasks,
                hasDifficultTasks: hasDifficultTasks,
                availableBlocks: availableTime.freeBlocks
            });
        }
    });
    
    // Sort by severity and urgency
    clusters.sort((a, b) => {
        const severityOrder = { critical: 3, urgent: 2, warning: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return a.hoursUntilDeadline - b.hoursUntilDeadline;
    });
    
    // Update crisis mode state
    crisisMode.clusters = clusters;
    crisisMode.active = clusters.length > 0;
    
    if (crisisMode.active && !crisisMode.currentCluster) {
        crisisMode.currentCluster = clusters[0];
        generateDailyBreakdown(clusters[0]);
    }
    
    console.log(`🔥 [CRISIS] Detection complete. Active: ${crisisMode.active}, Clusters: ${clusters.length}`);
    
    return crisisMode;
}

// ===== DAILY BREAKDOWN GENERATOR =====
function generateDailyBreakdown(cluster) {
    console.log('📋 [CRISIS] Generating daily breakdown for:', cluster.name);
    
    const now = new Date();
    const dueDate = new Date(cluster.dueDate);
    const breakdown = [];
    
    // Get available blocks
    const availableBlocks = cluster.availableBlocks;
    
    if (availableBlocks.length === 0) {
        console.warn('⚠️ [CRISIS] No available blocks found');
        return [];
    }
    
    // Sort tasks by estimated difficulty (SmartBooks first, then assignments, then quizzes)
    const sortedTasks = [...cluster.tasks].sort((a, b) => {
        const getDifficulty = (task) => {
            const title = task.title.toLowerCase();
            if (title.includes('smartbook')) return 3;
            if (title.includes('assignment')) return 2;
            if (title.includes('lab')) return 2;
            if (title.includes('quiz')) return 1;
            return 1;
        };
        return getDifficulty(b) - getDifficulty(a);
    });
    
    // Distribute tasks across available days
    let taskIndex = 0;
    let currentDay = null;
    let currentDayTasks = [];
    let currentDayMinutes = 0;
    
    availableBlocks.forEach((block, blockIndex) => {
        if (taskIndex >= sortedTasks.length) return;
        
        // Start a new day if this is a different date
        if (block.date !== currentDay) {
            if (currentDay && currentDayTasks.length > 0) {
                breakdown.push({
                    date: currentDay,
                    tasks: [...currentDayTasks],
                    totalMinutes: currentDayMinutes,
                    completed: false
                });
            }
            currentDay = block.date;
            currentDayTasks = [];
            currentDayMinutes = 0;
        }
        
        // Try to fit tasks into this block
        while (taskIndex < sortedTasks.length && currentDayMinutes < block.duration) {
            const task = sortedTasks[taskIndex];
            const taskTime = task.timeEstimate || 30;
            
            // Add task to current day
            currentDayTasks.push({
                ...task,
                suggestedBlock: `${block.time} at ${block.location}`
            });
            currentDayMinutes += taskTime;
            taskIndex++;
            
            // If we've filled this day's capacity, move to next day
            if (currentDayMinutes >= 120) { // Max 2 hours per day chunk
                break;
            }
        }
    });
    
    // Add the last day
    if (currentDay && currentDayTasks.length > 0) {
        breakdown.push({
            date: currentDay,
            tasks: currentDayTasks,
            totalMinutes: currentDayMinutes,
            completed: false
        });
    }
    
    crisisMode.dailyBreakdowns[cluster.id] = breakdown;
    console.log('📋 [CRISIS] Generated breakdown with', breakdown.length, 'days');
    
    return breakdown;
}

// ===== CRISIS MODE UI RENDERING =====
function renderCrisisMode() {
    const container = document.getElementById('crisisModeContainer');
    
    if (!crisisMode.active || crisisMode.clusters.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    const cluster = crisisMode.currentCluster || crisisMode.clusters[0];
    const breakdown = crisisMode.dailyBreakdowns[cluster.id] || [];
    
    // Determine progress bar color
    let progressColor = '#10b981'; // green
    if (cluster.severity === 'urgent') progressColor = '#f59e0b'; // yellow
    if (cluster.severity === 'critical') progressColor = '#ef4444'; // red
    
    // Calculate progress
    const completedDays = breakdown.filter(d => d.completed).length;
    const totalDays = breakdown.length;
    const progressPercent = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;
    
    // Get today's chunk
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const todayChunk = breakdown.find(d => d.date === today);
    
    // Get critical tasks (due within 24 hours)
    const criticalTasks = appData.tasks.filter(task => {
        if (task.completed || !task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        const hoursUntil = (dueDate - new Date()) / (1000 * 60 * 60);
        return hoursUntil > 0 && hoursUntil <= 24;
    });
    
    let html = `
        <div class="crisis-banner">
            <div class="crisis-header">
                <h2>🔥 CRISIS MODE: ${cluster.name}</h2>
                <button class="crisis-close-btn" onclick="dismissCrisisMode()" title="Dismiss (will reappear if still critical)">×</button>
            </div>
            <div class="crisis-summary">
                <div class="crisis-stat">
                    <span class="crisis-stat-label">Time Available</span>
                    <span class="crisis-stat-value">${cluster.availableHours}h ${cluster.availableMinutes}m</span>
                </div>
                <div class="crisis-stat">
                    <span class="crisis-stat-label">Work Needed</span>
                    <span class="crisis-stat-value">${cluster.totalHours}h ${cluster.remainingMinutes}m</span>
                </div>
                <div class="crisis-stat">
                    <span class="crisis-stat-label">Due In</span>
                    <span class="crisis-stat-value">${cluster.daysUntilDeadline} day${cluster.daysUntilDeadline !== 1 ? 's' : ''}</span>
                </div>
            </div>
            <div class="crisis-progress-bar">
                <div class="crisis-progress-fill" style="width: ${progressPercent}%; background: ${progressColor};"></div>
            </div>
            <div class="crisis-progress-text">
                ${cluster.isAchievable ? 
                    `✅ Achievable if you stick to the plan` : 
                    `⚠️ WARNING: ${Math.ceil((cluster.timeRatio - 1) * cluster.totalHours)} hours short - consider extensions`
                }
            </div>
        </div>
    `;
    
    // Critical tasks section (due within 24 hours)
    if (criticalTasks.length > 0) {
        html += `
            <div class="crisis-section critical-section">
                <h3>🔥 CRITICAL - Due Within 24 Hours</h3>
                <div class="crisis-tasks">
                    ${criticalTasks.map(task => {
                        const dueDate = new Date(task.dueDate);
                        const hoursUntil = Math.floor((dueDate - new Date()) / (1000 * 60 * 60));
                        return `
                            <div class="crisis-task critical-task">
                                <input type="checkbox" class="task-checkbox" 
                                       onchange="toggleTask('${task.id}')" ${task.completed ? 'checked' : ''}>
                                <div class="crisis-task-content">
                                    <div class="crisis-task-title">${task.title}</div>
                                    <div class="crisis-task-meta">
                                        <span class="crisis-deadline">⏰ ${hoursUntil}h remaining</span>
                                        <span class="crisis-time">⏱️ ${task.timeEstimate || 30}min</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    // Today's chunk section
    if (todayChunk && !todayChunk.completed) {
        const totalHours = Math.floor(todayChunk.totalMinutes / 60);
        const totalMins = todayChunk.totalMinutes % 60;
        
        html += `
            <div class="crisis-section urgent-section">
                <h3>⚠️ TODAY'S CHUNK - ${todayChunk.date}</h3>
                <div class="crisis-chunk-summary">
                    Total work: ${totalHours}h ${totalMins}m
                </div>
                <div class="crisis-tasks">
                    ${todayChunk.tasks.map(task => `
                        <div class="crisis-task">
                            <input type="checkbox" class="task-checkbox" 
                                   onchange="toggleTask('${task.id}')" ${task.completed ? 'checked' : ''}>
                            <div class="crisis-task-content">
                                <div class="crisis-task-title">${task.title}</div>
                                <div class="crisis-task-meta">
                                    <span class="crisis-time">⏱️ ${task.timeEstimate || 30}min</span>
                                    <span class="crisis-block">📅 ${task.suggestedBlock}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-success crisis-complete-btn" onclick="completeTodayChunk('${cluster.id}')">
                    ✅ I Finished Today's Chunk
                </button>
            </div>
        `;
    }
    
    // Full breakdown section
    if (breakdown.length > 0) {
        html += `
            <div class="crisis-section plan-section">
                <h3>📋 YOUR PLAN</h3>
                <div class="crisis-breakdown">
                    ${breakdown.map((day, index) => {
                        const totalHours = Math.floor(day.totalMinutes / 60);
                        const totalMins = day.totalMinutes % 60;
                        const isToday = day.date === today;
                        const isPast = new Date(day.date) < new Date() && !isToday;
                        
                        return `
                            <div class="crisis-day ${day.completed ? 'completed' : ''} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}">
                                <div class="crisis-day-header">
                                    <span class="crisis-day-date">
                                        ${day.completed ? '✅' : isPast ? '⏳' : isToday ? '📍' : '⏳'} 
                                        ${day.date}
                                    </span>
                                    <span class="crisis-day-time">${totalHours}h ${totalMins}m</span>
                                </div>
                                <div class="crisis-day-tasks">
                                    ${day.tasks.map(task => `
                                        <div class="crisis-day-task">
                                            • ${task.title} (${task.timeEstimate || 30}min)
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    // Regular tasks section
    const regularTasks = appData.tasks.filter(task => {
        if (task.completed) return false;
        if (!task.dueDate) return true; // No deadline
        
        const dueDate = new Date(task.dueDate);
        const hoursUntil = (dueDate - new Date()) / (1000 * 60 * 60);
        
        // Not in crisis cluster and not critical
        return hoursUntil > 24 && !cluster.tasks.some(ct => ct.id === task.id);
    });
    
    if (regularTasks.length > 0) {
        html += `
            <div class="crisis-section regular-section">
                <h3>📋 Regular Tasks</h3>
                <p style="color: var(--text-light); font-size: 0.9em; margin-bottom: 10px;">
                    These can wait - focus on crisis tasks first
                </p>
                <div class="crisis-tasks">
                    ${regularTasks.slice(0, 5).map(task => `
                        <div class="crisis-task regular-task">
                            <input type="checkbox" class="task-checkbox" 
                                   onchange="toggleTask('${task.id}')" ${task.completed ? 'checked' : ''}>
                            <div class="crisis-task-content">
                                <div class="crisis-task-title">${task.title}</div>
                                <div class="crisis-task-meta">
                                    <span class="crisis-time">⏱️ ${task.timeEstimate || 30}min</span>
                                    ${task.dueDate ? `<span class="crisis-due">📅 ${new Date(task.dueDate).toLocaleDateString()}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    ${regularTasks.length > 5 ? `
                        <div style="text-align: center; padding: 10px; color: var(--text-light);">
                            + ${regularTasks.length - 5} more tasks
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ===== CRISIS MODE ACTIONS =====
function completeTodayChunk(clusterId) {
    const breakdown = crisisMode.dailyBreakdowns[clusterId];
    if (!breakdown) return;
    
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const todayChunk = breakdown.find(d => d.date === today);
    
    if (!todayChunk) {
        showToast('⚠️ No chunk found for today');
        return;
    }
    
    // Check if all tasks are actually completed
    const allCompleted = todayChunk.tasks.every(task => {
        const appTask = appData.tasks.find(t => t.id === task.id);
        return appTask && appTask.completed;
    });
    
    if (!allCompleted) {
        const incomplete = todayChunk.tasks.filter(task => {
            const appTask = appData.tasks.find(t => t.id === task.id);
            return !appTask || !appTask.completed;
        });
        
        if (confirm(`You still have ${incomplete.length} incomplete task${incomplete.length !== 1 ? 's' : ''} for today. Mark chunk as complete anyway?`)) {
            todayChunk.completed = true;
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 }
            });
            showToast('🎉 Today\'s chunk marked complete!');
            renderCrisisMode();
            saveData();
        }
    } else {
        todayChunk.completed = true;
        confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.6 }
        });
        showToast('🎉 Amazing work! Today\'s chunk complete!');
        renderCrisisMode();
        saveData();
    }
}

function dismissCrisisMode() {
    crisisMode.active = false;
    renderCrisisMode();
    showToast('Crisis Mode dismissed (will reappear if still critical)');
}

// ===== INTEGRATION WITH EXISTING SYSTEM =====
// Call this whenever tasks or deadlines are updated
function updateCrisisMode() {
    detectCrisisMode();
    renderCrisisMode();
}

// Export functions for use in other files
if (typeof window !== 'undefined') {
    window.crisisMode = crisisMode;
    window.detectCrisisMode = detectCrisisMode;
    window.renderCrisisMode = renderCrisisMode;
    window.updateCrisisMode = updateCrisisMode;
    window.completeTodayChunk = completeTodayChunk;
    window.dismissCrisisMode = dismissCrisisMode;
}
