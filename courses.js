// courses.js - Course management and smart connections

// Course definitions with colors for visual distinction
const COURSES = {
    'history': {
        id: 'history',
        name: 'World History',
        shortName: 'History',
        color: '#8b5cf6', // Purple
        icon: '📚',
        class: 'History'
    },
    'bio': {
        id: 'bio',
        name: 'Biology',
        shortName: 'Bio',
        color: '#10b981', // Green
        icon: '🧬',
        class: 'Bio'
    },
    'beatles': {
        id: 'beatles',
        name: 'Beatles',
        shortName: 'Beatles',
        color: '#f59e0b', // Orange
        icon: '🎵',
        class: 'Beatles'
    },
    'politics': {
        id: 'politics',
        name: 'US Politics',
        shortName: 'Politics',
        color: '#3b82f6', // Blue
        icon: '🏛️',
        class: 'Politics'
    },
    'personal': {
        id: 'personal',
        name: 'Personal',
        shortName: 'Personal',
        color: '#ec4899', // Pink
        icon: '✨',
        class: null
    }
};

// ===== COURSE DETECTION =====
function detectCourseFromText(text) {
    const lowerText = text.toLowerCase();
    
    // Check for course keywords
    if (lowerText.includes('bio') || lowerText.includes('biology')) return 'bio';
    if (lowerText.includes('beatles') || lowerText.includes('music')) return 'beatles';
    if (lowerText.includes('history') || lowerText.includes('world history')) return 'history';
    if (lowerText.includes('politics') || lowerText.includes('political')) return 'politics';
    
    return null;
}

// ===== COURSE-DEADLINE CONNECTIONS =====
function getDeadlinesByCourse() {
    const courseDeadlines = {};
    
    // Initialize all courses
    Object.keys(COURSES).forEach(courseId => {
        courseDeadlines[courseId] = [];
    });
    
    // Group deadlines by course
    appData.deadlines.forEach(deadline => {
        if (deadline.completed) return;
        
        // Match deadline to course based on class field
        // Try multiple matching strategies:
        // 1. Exact match with COURSES[id].class
        // 2. Exact match with COURSES[id].name
        // 3. Exact match with COURSES[id].shortName
        // 4. Case-insensitive partial match
        const courseId = Object.keys(COURSES).find(id => {
            const course = COURSES[id];
            const deadlineClass = (deadline.class || '').toLowerCase();
            
            // Skip if no class assigned
            if (!deadline.class) return false;
            
            // Try exact matches first
            if (course.class === deadline.class) return true;
            if (course.name === deadline.class) return true;
            if (course.shortName === deadline.class) return true;
            
            // Try case-insensitive matches
            if (course.class && course.class.toLowerCase() === deadlineClass) return true;
            if (course.name.toLowerCase() === deadlineClass) return true;
            if (course.shortName.toLowerCase() === deadlineClass) return true;
            
            // Try partial matches (e.g., "Biology" contains "Bio")
            if (deadlineClass.includes(course.shortName.toLowerCase())) return true;
            if (course.shortName.toLowerCase().includes(deadlineClass)) return true;
            
            return false;
        });
        
        if (courseId) {
            courseDeadlines[courseId].push(deadline);
        } else {
            // Default to personal if no match
            courseDeadlines['personal'].push(deadline);
        }
    });
    
    // Sort deadlines within each course by due date
    Object.keys(courseDeadlines).forEach(courseId => {
        courseDeadlines[courseId].sort((a, b) => 
            new Date(a.dueDate) - new Date(b.dueDate)
        );
    });
    
    return courseDeadlines;
}

// ===== GET NEXT DEADLINE FOR EACH COURSE =====
function getNextDeadlinePerCourse() {
    const courseDeadlines = getDeadlinesByCourse();
    const nextDeadlines = [];
    
    Object.keys(courseDeadlines).forEach(courseId => {
        const deadlines = courseDeadlines[courseId];
        if (deadlines.length > 0) {
            const nextDeadline = deadlines[0]; // Already sorted by date
            const course = COURSES[courseId];
            
            // Calculate days until deadline
            const dueDate = new Date(nextDeadline.dueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            
            // Get related tasks
            const relatedTasks = appData.tasks.filter(t => 
                !t.completed && t.parentDeadline === nextDeadline.id
            );
            
            nextDeadlines.push({
                course,
                deadline: nextDeadline,
                daysUntil,
                relatedTasks,
                urgency: getUrgencyLevel(daysUntil)
            });
        }
    });
    
    // Sort by urgency (most urgent first)
    nextDeadlines.sort((a, b) => a.daysUntil - b.daysUntil);
    
    return nextDeadlines;
}

// ===== URGENCY CALCULATION =====
function getUrgencyLevel(daysUntil) {
    if (daysUntil < 0) return 'overdue';
    if (daysUntil === 0) return 'today';
    if (daysUntil <= 3) return 'urgent';
    if (daysUntil <= 7) return 'soon';
    return 'normal';
}

function getUrgencyColor(urgency) {
    const colors = {
        'overdue': '#ef4444',
        'today': '#ef4444',
        'urgent': '#f59e0b',
        'soon': '#fbbf24',
        'normal': '#10b981'
    };
    return colors[urgency] || colors.normal;
}

function getUrgencyText(daysUntil) {
    if (daysUntil < 0) return 'OVERDUE';
    if (daysUntil === 0) return 'TODAY';
    if (daysUntil === 1) return 'Tomorrow';
    return `${daysUntil} days`;
}

// ===== RENDER COURSE-ORGANIZED DEADLINE VIEW =====
function renderCourseDeadlineView() {
    const container = document.getElementById('courseDeadlineView');
    if (!container) return;
    
    // Get all unique courses from deadlines (DYNAMIC - no hardcoded COURSES)
    const uniqueCourses = [...new Set(appData.deadlines
        .filter(d => !d.completed)
        .map(d => d.class || d.course)
        .filter(c => c && c !== 'Personal')
    )];
    
    // Generate color palette dynamically
    const colors = ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#06b6d4', '#84cc16', '#f43f5e'];
    const icons = ['📚', '🧬', '🎵', '🏛️', '💻', '🔬', '📐', '🎨'];
    
    if (uniqueCourses.length === 0 && appData.deadlines.filter(d => !d.completed).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎉</div>
                <p>No upcoming deadlines! You're all caught up.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    // Render section for each course found in the data
    uniqueCourses.forEach((courseName, index) => {
        const courseColor = colors[index % colors.length];
        const courseIcon = icons[index % icons.length];
        
        // Get deadlines for this course
        const courseDeadlines = appData.deadlines
            .filter(d => !d.completed && (d.class === courseName || d.course === courseName))
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        
        if (courseDeadlines.length === 0) return;
        
        // Get the next (most urgent) deadline for this course
        const nextDeadline = courseDeadlines[0];
        const dueDate = new Date(nextDeadline.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        
        const urgency = getUrgencyLevel(daysUntil);
        const urgencyColor = getUrgencyColor(urgency);
        const urgencyText = getUrgencyText(daysUntil);
        
        // Get related tasks
        const relatedTasks = appData.tasks.filter(t => 
            !t.completed && t.parentDeadline === nextDeadline.id
        );
        
        html += `
            <div class="course-deadline-card" style="
                border-left: 4px solid ${courseColor};
                background: white;
                padding: 20px;
                border-radius: 10px;
                margin-bottom: 15px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            ">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div>
                        <h3 style="margin: 0; color: ${courseColor};">
                            ${courseIcon} ${courseName}
                        </h3>
                        <p style="margin: 5px 0; font-weight: 600; font-size: 1.1em;">
                            ${nextDeadline.title}
                        </p>
                        ${courseDeadlines.length > 1 ? `
                            <p style="margin: 5px 0; font-size: 0.85em; color: var(--text-light);">
                                +${courseDeadlines.length - 1} more deadline${courseDeadlines.length - 1 !== 1 ? 's' : ''}
                            </p>
                        ` : ''}
                    </div>
                    <span style="
                        background: ${urgencyColor};
                        color: white;
                        padding: 6px 12px;
                        border-radius: 20px;
                        font-size: 0.9em;
                        font-weight: 600;
                        white-space: nowrap;
                    ">
                        📅 ${urgencyText}
                    </span>
                </div>
                
                <div style="display: flex; gap: 15px; align-items: center; margin-top: 15px;">
                    ${relatedTasks.length > 0 ? `
                        <button class="btn btn-secondary btn-sm" onclick="showCourseTasksModal('${courseName}', '${nextDeadline.id}')" style="flex: 1;">
                            ☐ ${relatedTasks.length} task${relatedTasks.length !== 1 ? 's' : ''} to do
                        </button>
                    ` : `
                        <span style="color: var(--success); font-weight: 600; flex: 1;">
                            ✓ All tasks complete!
                        </span>
                    `}
                    <button class="btn btn-primary btn-sm" onclick="addTaskForDeadline('${nextDeadline.id}')" style="white-space: nowrap;">
                        + Add task
                    </button>
                </div>
            </div>
        `;
    });
    
    // Add Personal/Uncategorized section if there are any
    const personalDeadlines = appData.deadlines
        .filter(d => !d.completed && (!d.class || d.class === 'Personal'))
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    
    if (personalDeadlines.length > 0) {
        const nextDeadline = personalDeadlines[0];
        const dueDate = new Date(nextDeadline.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        
        const urgency = getUrgencyLevel(daysUntil);
        const urgencyColor = getUrgencyColor(urgency);
        const urgencyText = getUrgencyText(daysUntil);
        
        const relatedTasks = appData.tasks.filter(t => 
            !t.completed && t.parentDeadline === nextDeadline.id
        );
        
        html += `
            <div class="course-deadline-card" style="
                border-left: 4px solid #ec4899;
                background: white;
                padding: 20px;
                border-radius: 10px;
                margin-bottom: 15px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            ">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div>
                        <h3 style="margin: 0; color: #ec4899;">
                            ✨ Personal
                        </h3>
                        <p style="margin: 5px 0; font-weight: 600; font-size: 1.1em;">
                            ${nextDeadline.title}
                        </p>
                        ${personalDeadlines.length > 1 ? `
                            <p style="margin: 5px 0; font-size: 0.85em; color: var(--text-light);">
                                +${personalDeadlines.length - 1} more deadline${personalDeadlines.length - 1 !== 1 ? 's' : ''}
                            </p>
                        ` : ''}
                    </div>
                    <span style="
                        background: ${urgencyColor};
                        color: white;
                        padding: 6px 12px;
                        border-radius: 20px;
                        font-size: 0.9em;
                        font-weight: 600;
                        white-space: nowrap;
                    ">
                        📅 ${urgencyText}
                    </span>
                </div>
                
                <div style="display: flex; gap: 15px; align-items: center; margin-top: 15px;">
                    ${relatedTasks.length > 0 ? `
                        <button class="btn btn-secondary btn-sm" onclick="showCourseTasksModal('Personal', '${nextDeadline.id}')" style="flex: 1;">
                            ☐ ${relatedTasks.length} task${relatedTasks.length !== 1 ? 's' : ''} to do
                        </button>
                    ` : `
                        <span style="color: var(--success); font-weight: 600; flex: 1;">
                            ✓ All tasks complete!
                        </span>
                    `}
                    <button class="btn btn-primary btn-sm" onclick="addTaskForDeadline('${nextDeadline.id}')" style="white-space: nowrap;">
                        + Add task
                    </button>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ===== SHOW COURSE TASKS MODAL =====
function showCourseTasksModal(courseName, deadlineId) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (!deadline) return;
    
    const relatedTasks = appData.tasks.filter(t => 
        !t.completed && t.parentDeadline === deadlineId
    );
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${deadline.title}</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            
            <div style="margin: 20px 0;">
                ${relatedTasks.map(task => `
                    <div class="task-item" style="margin-bottom: 10px;">
                        <input type="checkbox" class="task-checkbox" 
                               onchange="toggleTask('${task.id}'); setTimeout(() => this.closest('.modal').remove(), 500);">
                        <div class="task-content">
                            <div class="task-title">${task.title}</div>
                            <div class="task-meta">
                                <span class="energy-badge energy-${task.energy}">${task.energy}</span>
                                <span class="location-badge">📍 ${task.location}</span>
                                ${task.timeEstimate ? `<span class="time-estimate">⏱️ ${task.timeEstimate}min</span>` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                Close
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ===== ADD TASK FOR DEADLINE =====
function addTaskForDeadline(deadlineId) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (!deadline) return;
    
    const taskTitle = prompt(`Add a task for "${deadline.title}":`);
    if (!taskTitle || !taskTitle.trim()) return;
    
    // Detect course from deadline
    const courseId = Object.keys(COURSES).find(id => 
        COURSES[id].class === deadline.class
    );
    
    addTask({
        title: taskTitle.trim(),
        energy: 'medium',
        location: courseId && courseId !== 'personal' ? 'school' : 'anywhere',
        timeEstimate: 30,
        parentDeadline: deadlineId,
        dueDate: deadline.dueDate,
        courseId: courseId
    });
    
    showToast(`✅ Added task for ${deadline.title}`);
    renderCourseDeadlineView();
}

// ===== ENHANCED PICK FOR ME WITH COURSE CONTEXT =====
function pickTaskWithCourseContext() {
    const incompleteTasks = appData.tasks.filter(t => !t.completed);
    
    if (incompleteTasks.length === 0) {
        showToast('🎉 No tasks to pick from!');
        return null;
    }
    
    const now = new Date();
    const userEnergy = appData.userEnergy || 'medium';
    const location = appData.currentLocation || 'home';
    
    // Score each task
    const scoredTasks = incompleteTasks.map(task => {
        let score = 0;
        
        // 1. Deadline proximity (highest weight)
        if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
            
            if (daysUntil < 0) score += 1000; // Overdue
            else if (daysUntil === 0) score += 500; // Due today
            else if (daysUntil <= 3) score += 300; // Due soon
            else if (daysUntil <= 7) score += 100; // Due this week
        }
        
        // 2. Energy match
        const energyLevels = { low: 1, medium: 2, high: 3 };
        const userEnergyLevel = energyLevels[userEnergy];
        const taskEnergyLevel = energyLevels[task.energy] || 2;
        
        if (taskEnergyLevel === userEnergyLevel) score += 50;
        else if (taskEnergyLevel < userEnergyLevel) score += 30;
        
        // 3. Location match
        if (task.location === location || task.location === 'anywhere') {
            score += 40;
        }
        
        // 4. Course that hasn't been worked on recently
        if (task.courseId) {
            const recentCourseTasks = appData.tasks.filter(t => 
                t.courseId === task.courseId && 
                t.completed && 
                t.completedAt &&
                (now - new Date(t.completedAt)) < 24 * 60 * 60 * 1000 // Last 24 hours
            );
            
            if (recentCourseTasks.length === 0) {
                score += 20; // Boost courses not worked on recently
            }
        }
        
        // 5. Time estimate (prefer shorter tasks when energy is low)
        if (userEnergy === 'low' && task.timeEstimate && task.timeEstimate <= 30) {
            score += 15;
        }
        
        return { task, score };
    });
    
    // Sort by score (highest first)
    scoredTasks.sort((a, b) => b.score - a.score);
    
    return scoredTasks[0].task;
}

// ===== SHOW ENHANCED PICK FOR ME =====
function showEnhancedPickForMe() {
    const task = pickTaskWithCourseContext();
    
    if (!task) {
        showToast('🎉 No tasks available!');
        return;
    }
    
    // Get course info if available
    let courseInfo = '';
    if (task.courseId && COURSES[task.courseId]) {
        const course = COURSES[task.courseId];
        courseInfo = `
            <div style="display: inline-block; background: ${course.color}; color: white; padding: 6px 12px; border-radius: 20px; margin-bottom: 10px;">
                ${course.icon} ${course.name}
            </div>
        `;
    }
    
    // Get deadline info if available
    let deadlineInfo = '';
    if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        const urgencyText = getUrgencyText(daysUntil);
        const urgencyColor = getUrgencyColor(getUrgencyLevel(daysUntil));
        
        deadlineInfo = `
            <div style="display: inline-block; background: ${urgencyColor}; color: white; padding: 6px 12px; border-radius: 20px; margin-bottom: 10px; margin-left: 10px;">
                📅 Due ${urgencyText}
            </div>
        `;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>✨ Pick For Me</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            
            ${courseInfo}${deadlineInfo}
            
            <h3 style="margin: 20px 0; font-size: 1.3em;">${task.title}</h3>
            
            <div style="display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap;">
                <span class="energy-badge energy-${task.energy}">${task.energy}</span>
                <span class="location-badge">📍 ${task.location}</span>
                ${task.timeEstimate ? `<span class="time-estimate">⏱️ ${task.timeEstimate}min</span>` : ''}
            </div>
            
            <p style="color: var(--text-light); margin: 20px 0;">
                This task was picked based on your current energy, location, and upcoming deadlines.
            </p>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-success" onclick="toggleTask('${task.id}'); this.closest('.modal').remove();">
                    ✅ Mark Complete
                </button>
                <button class="btn btn-primary" onclick="this.closest('.modal').remove(); showEnhancedPickForMe();">
                    🔄 Pick Another
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove();">
                    Maybe Later
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ===== COURSE DROPDOWN FOR TASK CREATION =====
function renderCourseDropdown(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const html = `
        <label for="taskCourseSelect" style="display: block; margin-bottom: 5px; font-weight: 600;">
            Course (optional)
        </label>
        <select id="taskCourseSelect" style="
            width: 100%;
            padding: 10px;
            border: 1px solid var(--border);
            border-radius: 6px;
            font-size: 1em;
            margin-bottom: 15px;
        ">
            <option value="">None (Personal task)</option>
            ${Object.values(COURSES).map(course => `
                <option value="${course.id}">${course.icon} ${course.name}</option>
            `).join('')}
        </select>
    `;
    
    container.innerHTML = html;
}

// ===== INITIALIZE COURSE FEATURES =====
function initializeCourseFeatures() {
    console.log('🎓 [COURSES] Initializing course features...');
    
    // Render course deadline view if container exists
    const courseDeadlineView = document.getElementById('courseDeadlineView');
    if (courseDeadlineView) {
        renderCourseDeadlineView();
    }
    
    console.log('✅ [COURSES] Course features initialized');
}
