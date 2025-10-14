// ui.js - UI updates and rendering functions

// ===== SYNC INDICATOR CLICK HANDLER =====
function setupSyncIndicatorClick() {
    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) {
        syncIndicator.addEventListener('click', () => {
            console.log('🖱️ Sync indicator clicked');
            openTab('settings');
        });
        console.log('✅ Sync indicator click handler attached');
    }
}

// ===== MORE MENU DROPDOWN =====
function initializeMoreMenu() {
    const moreButton = document.getElementById('moreMenuButton');
    const moreMenu = document.getElementById('moreMenu');
    const bottomSheet = document.getElementById('bottomSheet');
    const bottomSheetOverlay = document.getElementById('bottomSheetOverlay');
    
    if (!moreButton) {
        console.error('More button not found');
        return;
    }
    
    const isMobile = () => window.innerWidth <= 768;
    
    // More button click
    moreButton.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (isMobile()) {
            // Mobile: show bottom sheet
            if (bottomSheet && bottomSheetOverlay) {
                bottomSheet.classList.add('active');
                bottomSheetOverlay.classList.add('active');
            }
        } else {
            // Desktop: toggle dropdown
            if (moreMenu) {
                moreMenu.classList.toggle('hidden');
            }
        }
    });
    
    // Close bottom sheet on overlay click
    if (bottomSheetOverlay) {
        bottomSheetOverlay.addEventListener('click', () => {
            bottomSheet.classList.remove('active');
            bottomSheetOverlay.classList.remove('active');
        });
    }
    
    // Bottom sheet item clicks
    if (bottomSheet) {
        bottomSheet.querySelectorAll('.bottom-sheet-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                bottomSheet.classList.remove('active');
                bottomSheetOverlay.classList.remove('active');
                handleAction(action);
            });
        });
    }
    
    // Desktop dropdown item clicks
    if (moreMenu) {
        moreMenu.querySelectorAll('.more-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                moreMenu.classList.add('hidden');
                handleAction(action);
            });
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!isMobile() && !moreButton.contains(e.target) && !moreMenu.contains(e.target)) {
                moreMenu.classList.add('hidden');
            }
        });
    }
    
    function handleAction(action) {
        if (action === 'settings' || action === 'templates') {
            // Manually switch tabs since these don't have tab buttons
            const tabContents = document.querySelectorAll('.tab-content');
            const tabButtons = document.querySelectorAll('.tab-button');
            
            // Hide all tab content
            tabContents.forEach(content => {
                content.style.display = 'none';
            });
            
            // Remove active class from all tab buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            
            // Show the target tab
            const targetTabId = action === 'settings' ? 'settings-tab' : 'templates-tab';
            const targetTab = document.getElementById(targetTabId);
            if (targetTab) {
                targetTab.style.display = 'block';
                localStorage.setItem('activeTab', action);
                console.log(`📑 Switched to ${action} tab`);
            }
        } else if (action === 'appearance') {
            toggleFont();
        }
    }
}

// ===== TAB NAVIGATION =====
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Setup sync indicator click handler
    setupSyncIndicatorClick();
    
    // Initialize More menu dropdown
    initializeMoreMenu();
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Update buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update content
            tabContents.forEach(content => {
                content.style.display = 'none';
            });
            document.getElementById(`${targetTab}-tab`).style.display = 'block';
            
            // Remember active tab
            localStorage.setItem('activeTab', targetTab);
            
            console.log(`📑 Switched to ${targetTab} tab`);
        });
    });
    
    // Restore last active tab
    const savedTab = localStorage.getItem('activeTab') || 'dashboard';
    const savedButton = document.querySelector(`[data-tab="${savedTab}"]`);
    if (savedButton) {
        savedButton.click();
    } else {
        // Default to dashboard
        document.querySelector('[data-tab="dashboard"]').click();
    }
    
    console.log('✅ Tab navigation initialized');
}

function openTab(tabName) {
    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabButton) {
        tabButton.click();
    } else if (tabName === 'settings' || tabName === 'templates') {
        // Handle tabs without buttons (settings, templates)
        const tabContents = document.querySelectorAll('.tab-content');
        const tabButtons = document.querySelectorAll('.tab-button');
        
        // Hide all tab content
        tabContents.forEach(content => {
            content.style.display = 'none';
        });
        
        // Remove active class from all tab buttons
        tabButtons.forEach(btn => btn.classList.remove('active'));
        
        // Show the target tab
        const targetTabId = `${tabName}-tab`;
        const targetTab = document.getElementById(targetTabId);
        if (targetTab) {
            targetTab.style.display = 'block';
            localStorage.setItem('activeTab', tabName);
            console.log(`📑 Switched to ${tabName} tab`);
        }
    }
}

// ===== MAIN UI UPDATE =====
function updateUI() {
    updateCurrentDate();
    renderSchedule();
    renderTasks();
    updateWhatNow();
    renderDeadlines();
    renderProjects();
    renderTemplates();
    
    // Render course deadline view
    if (typeof renderCourseDeadlineView === 'function') {
        renderCourseDeadlineView();
    }
    
    // Check for crisis mode
    if (typeof updateCrisisMode === 'function') {
        updateCrisisMode();
    }
    
    // Initialize planner if visible (with null check)
    const plannerGrid = document.getElementById('plannerGrid');
    if (plannerGrid && plannerGrid.children.length === 0) {
        showCurrentWeek();
    }
}

// ===== TASK RENDERING =====
function renderTasks() {
    const container = document.getElementById('allTasks');
    const incompleteTasks = appData.tasks.filter(t => !t.completed);
    
    if (incompleteTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <p>No tasks yet! Use Quick Add or Brain Dump to get started.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = incompleteTasks.map(task => {
        // Get course badge if task has courseId
        let courseBadge = '';
        if (task.courseId && typeof COURSES !== 'undefined' && COURSES[task.courseId]) {
            const course = COURSES[task.courseId];
            courseBadge = `<span style="background: ${course.color}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.8em; margin-right: 5px;">${course.icon} ${course.shortName}</span>`;
        }
        
        // Check if this is a subtask
        let subtaskBadge = '';
        let parentInfo = '';
        if (task.parentTaskId) {
            subtaskBadge = `<span style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.75em; margin-right: 5px;">🔨 ${task.subtaskIndex}/${task.subtaskTotal}</span>`;
            parentInfo = `<div style="font-size: 0.85em; color: var(--text-light); margin-top: 5px;">↳ Part of: ${task.parentTaskTitle}</div>`;
        }
        
        // Check if this task has been broken down into subtasks
        let brokenDownBadge = '';
        if (task.brokenDown && task.subtaskIds) {
            const completedSubtasks = task.subtaskIds.filter(id => {
                const subtask = appData.tasks.find(t => t.id === id);
                return subtask && subtask.completed;
            }).length;
            brokenDownBadge = `<span style="background: var(--success); color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.75em; margin-left: 5px;">✅ ${completedSubtasks}/${task.subtaskIds.length} subtasks done</span>`;
        }
        
        return `
            <div class="task-item" style="${task.parentTaskId ? 'border-left: 4px solid #667eea; background: linear-gradient(to right, #f5f3ff, white);' : ''}">
                <input type="checkbox" class="task-checkbox" 
                       onchange="toggleTask('${task.id}')" ${task.completed ? 'checked' : ''}>
                <div class="task-content">
                    <div class="task-title">
                        ${subtaskBadge}${courseBadge}
                        <span contenteditable="true"
                              onblur="editTaskTitle('${task.id}', this.textContent)"
                              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                              style="cursor: text;"
                              title="Click to edit title">
                            ${task.title}
                        </span>
                        ${brokenDownBadge}
                    </div>
                    ${parentInfo}
                    <div class="task-meta">
                        <span class="energy-badge energy-${task.energy}" 
                              onclick="cycleTaskEnergy('${task.id}')"
                              style="cursor: pointer;"
                              title="Click to change energy level">
                            ${task.energy}
                        </span>
                        <span class="location-badge"
                              onclick="cycleTaskLocation('${task.id}')"
                              style="cursor: pointer;"
                              title="Click to change location">
                            📍 ${task.location}
                        </span>
                        ${task.timeEstimate ? `<span class="time-estimate" onclick="editTaskTime('${task.id}')" style="cursor: pointer;" title="Click to edit time estimate">⏱️ <span id="time-${task.id}">${task.timeEstimate}</span>min</span>` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="task-btn" onclick="deleteTask('${task.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Also render errand tasks
    renderErrandTasks();
}

// ===== ERRAND TASKS RENDERING =====
function getErrandTasks() {
    return appData.tasks.filter(task => 
        !task.completed && 
        task.location === 'errands'
    ).sort((a, b) => {
        // Prioritize by due date, then priority
        if (a.dueDate && b.dueDate) {
            return new Date(a.dueDate) - new Date(b.dueDate);
        }
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority] || 2;
        const bPriority = priorityOrder[b.priority] || 2;
        return bPriority - aPriority;
    });
}

function renderErrandTasks() {
    const container = document.getElementById('errandTasks');
    const errandTasks = getErrandTasks();
    const indicator = document.getElementById('commuteHomeIndicator');
    
    // Update commute home indicator
    if (isCommuteHomeBlock()) {
        indicator.style.display = 'block';
    } else {
        indicator.style.display = 'none';
    }
    
    if (errandTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏪</div>
                <p>No errands yet!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = errandTasks.map(task => `
        <div class="task-item">
            <input type="checkbox" class="task-checkbox" 
                   onchange="toggleTask('${task.id}')" ${task.completed ? 'checked' : ''}>
            <div class="task-content">
                <div class="task-title">${task.title}</div>
                <div class="task-meta">
                    <span class="energy-badge energy-${task.energy}">${task.energy}</span>
                    <span class="location-badge">🏪 ${task.location}</span>
                    ${task.timeEstimate ? `<span class="time-estimate">⏱️ ${task.timeEstimate}min</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="task-btn" onclick="deleteTask('${task.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ===== CREATE TEMPLATE MODAL =====
function showCreateTemplateModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'createTemplateModal';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>➕ Create Custom Template</h2>
                <button class="close-modal" id="closeTemplateModalBtn">&times;</button>
            </div>
            
            <div class="form-group">
                <label for="templateName">Template Name *</label>
                <input type="text" 
                       id="templateName" 
                       placeholder="e.g., Weekly Coursework, Study Routine"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div class="form-group">
                <label for="templateDescription">Description *</label>
                <input type="text" 
                       id="templateDescription" 
                       placeholder="What is this template for?"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div class="form-group">
                <label for="templateCategory">Category *</label>
                <input type="text" 
                       id="templateCategory" 
                       placeholder="e.g., coursework, personal, work"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div class="form-group">
                <label for="templateRecurringDay">Recurring Day *</label>
                <select id="templateRecurringDay" 
                        style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                    <option value="Weekdays">Weekdays</option>
                    <option value="Weekend">Weekend</option>
                    <option value="varies">Varies</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Tasks * <small style="color: var(--text-light);">(at least one required)</small></label>
                <div id="templateTasksList" style="margin-bottom: 10px;">
                    <!-- Task fields will be added here -->
                </div>
                <button class="btn btn-secondary btn-sm" id="addTaskBtn" type="button">
                    ➕ Add Task
                </button>
            </div>
            
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="templateProtected" style="width: auto;">
                    <span>Protected Template (cannot be deleted)</span>
                </label>
            </div>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" id="saveTemplateBtn">
                    💾 Create Template
                </button>
                <button class="btn btn-secondary" id="cancelTemplateBtn">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Task counter for unique IDs
    let taskCounter = 0;
    
    // Function to add a task field
    function addTaskField(title = '', energy = 'medium', location = 'anywhere', timeEstimate = '') {
        const taskId = `task-${taskCounter++}`;
        const tasksList = document.getElementById('templateTasksList');
        
        const taskDiv = document.createElement('div');
        taskDiv.className = 'template-task-field';
        taskDiv.id = taskId;
        taskDiv.style.cssText = 'background: var(--bg-main); padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid var(--border);';
        
        taskDiv.innerHTML = `
            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 10px;">
                <strong style="color: var(--primary);">Task ${taskCounter}</strong>
                <button class="btn btn-danger btn-sm" onclick="document.getElementById('${taskId}').remove()" type="button" style="margin-left: auto;">
                    🗑️
                </button>
            </div>
            <div style="margin-bottom: 8px;">
                <input type="text" 
                       class="task-title" 
                       placeholder="Task title *" 
                       value="${title}"
                       style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <select class="task-energy" style="padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
                    <option value="low" ${energy === 'low' ? 'selected' : ''}>Low Energy</option>
                    <option value="medium" ${energy === 'medium' ? 'selected' : ''}>Medium Energy</option>
                    <option value="high" ${energy === 'high' ? 'selected' : ''}>High Energy</option>
                </select>
                <select class="task-location" style="padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
                    <option value="anywhere" ${location === 'anywhere' ? 'selected' : ''}>Anywhere</option>
                    <option value="home" ${location === 'home' ? 'selected' : ''}>Home</option>
                    <option value="school" ${location === 'school' ? 'selected' : ''}>School</option>
                    <option value="work" ${location === 'work' ? 'selected' : ''}>Work</option>
                    <option value="commute" ${location === 'commute' ? 'selected' : ''}>Commute</option>
                    <option value="errands" ${location === 'errands' ? 'selected' : ''}>Errands</option>
                </select>
            </div>
            <div style="margin-top: 8px;">
                <input type="number" 
                       class="task-time" 
                       placeholder="Time estimate (minutes)" 
                       value="${timeEstimate}"
                       min="1"
                       style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
            </div>
        `;
        
        tasksList.appendChild(taskDiv);
    }
    
    // Add first task field by default
    addTaskField();
    
    // Event listeners
    const saveBtn = document.getElementById('saveTemplateBtn');
    const cancelBtn = document.getElementById('cancelTemplateBtn');
    const closeBtn = document.getElementById('closeTemplateModalBtn');
    const addTaskBtn = document.getElementById('addTaskBtn');
    
    addTaskBtn.addEventListener('click', () => addTaskField());
    
    saveBtn.addEventListener('click', () => {
        const name = document.getElementById('templateName').value.trim();
        const description = document.getElementById('templateDescription').value.trim();
        const category = document.getElementById('templateCategory').value.trim();
        const recurringDay = document.getElementById('templateRecurringDay').value;
        const isProtected = document.getElementById('templateProtected').checked;
        
        // Validation
        if (!name) {
            alert('Please enter a template name');
            return;
        }
        
        if (!description) {
            alert('Please enter a description');
            return;
        }
        
        if (!category) {
            alert('Please enter a category');
            return;
        }
        
        // Collect tasks
        const taskFields = document.querySelectorAll('.template-task-field');
        const tasks = [];
        
        for (const field of taskFields) {
            const title = field.querySelector('.task-title').value.trim();
            const energy = field.querySelector('.task-energy').value;
            const location = field.querySelector('.task-location').value;
            const timeEstimate = field.querySelector('.task-time').value;
            
            if (title) {
                tasks.push({
                    title,
                    energy,
                    location,
                    timeEstimate: timeEstimate ? parseInt(timeEstimate) : null
                });
            }
        }
        
        if (tasks.length === 0) {
            alert('Please add at least one task with a title');
            return;
        }
        
        // Create template object
        const newTemplate = {
            name,
            description,
            category,
            recurringDay,
            tasks,
            protected: isProtected
        };
        
        // Add to appData
        appData.templates.push(newTemplate);
        saveData();
        
        // Close modal and refresh
        modal.remove();
        renderTemplates();
        showToast(`✅ Template "${name}" created!`);
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    // Focus first input
    setTimeout(() => document.getElementById('templateName').focus(), 100);
}

// ===== TEMPLATE RENDERING =====
function renderTemplates() {
    const container = document.getElementById('templateCards');
    if (!container) return; // Templates tab might not exist yet
    
    // Safety check: ensure templates array exists
    if (!appData.templates) {
        appData.templates = [];
    }
    
    if (appData.templates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <p>No templates yet!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = appData.templates.map((template, index) => {
        const taskCount = template.tasks ? template.tasks.length : 0;
        const protectedBadge = template.protected ? '<span style="background: var(--protected); color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.75em; margin-left: 8px;">🔒 PROTECTED</span>' : '';
        
        return `
            <div class="template-card" style="background: var(--bg-main); padding: 20px; border-radius: 10px; border: 2px solid var(--border); transition: all 0.2s;">
                <h4 style="color: var(--primary); margin-bottom: 10px; display: flex; align-items: center; flex-wrap: wrap;">
                    ${template.name}
                    ${protectedBadge}
                </h4>
                <p class="template-info" style="color: var(--text-light); font-size: 0.9em; margin-bottom: 10px;">
                    ${template.description}
                </p>
                <p class="template-meta" style="color: var(--text-light); font-size: 0.85em; margin-bottom: 15px;">
                    ${taskCount} task${taskCount !== 1 ? 's' : ''} • ${template.category} • ${template.recurringDay}
                </p>
                <button class="btn btn-primary" onclick="createTasksFromTemplate(${index})" style="width: 100%;">
                    ✨ Create Tasks
                </button>
            </div>
        `;
    }).join('');
}

// ===== PROJECT RENDERING =====
function renderProjects() {
    const container = document.getElementById('projectsList');
    if (!container) return; // Projects tab might not exist yet
    
    // Safety check: ensure projects array exists
    if (!appData.projects) {
        appData.projects = [];
    }
    
    if (appData.projects.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💻</div>
                <p>No projects yet!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = appData.projects.map(project => {
        const statusColors = {
            'active': '#10b981',
            'paused': '#f59e0b',
            'planning': '#6366f1',
            'completed': '#8b5cf6'
        };
        
        const statusColor = statusColors[project.status] || '#6b7280';
        
        return `
            <div class="project-card">
                <div class="project-header">
                    <h3>${project.name}</h3>
                    <div class="project-badges">
                        <span class="status-badge status-${project.status}">${project.status}</span>
                        <span class="category-badge">${project.category}</span>
                    </div>
                </div>
                <p class="project-description">${project.description}</p>
                <div class="project-progress-container" onclick="showProjectModal(${project.id})" title="Click to view tasks">
                    <div class="project-progress-bar">
                        <div class="project-progress-fill" style="width: ${project.progress}%; background: ${statusColor};"></div>
                    </div>
                    <span class="project-progress-text">${project.progress}%</span>
                </div>
                <div class="project-task-count">
                    ${project.tasks.filter(t => t.completed).length}/${project.tasks.length} tasks complete
                </div>
            </div>
        `;
    }).join('');
}

// ===== DEADLINE RENDERING =====
let deadlineRefreshInterval = null;

function renderDeadlines() {
    console.log('📋 Rendering deadlines section');
    
    // Safety check: ensure deadlines array exists
    if (!appData.deadlines) {
        appData.deadlines = [];
    }
    
    const container = document.getElementById('allDeadlines');
    if (!container) {
        console.error('❌ Deadlines container not found');
        return;
    }
    
    const activeDeadlines = appData.deadlines.filter(d => !d.completed);
    
    if (activeDeadlines.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <p>No deadlines yet!</p>
            </div>
        `;
        // Clear refresh interval if no deadlines
        if (deadlineRefreshInterval) {
            clearInterval(deadlineRefreshInterval);
            deadlineRefreshInterval = null;
        }
        return;
    }
    
    // Sort by due date
    activeDeadlines.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    
    // Check if any deadline is <24 hours away for live updates
    const hasUrgentDeadline = activeDeadlines.some(d => {
        const dueDateStr = d.dueDate.includes('T') ? d.dueDate : d.dueDate + 'T23:59:00';
        const msUntil = new Date(dueDateStr) - new Date();
        return msUntil > 0 && msUntil < 24 * 60 * 60 * 1000;
    });
    
    // Set up live refresh for urgent deadlines
    if (hasUrgentDeadline && !deadlineRefreshInterval) {
        deadlineRefreshInterval = setInterval(() => {
            renderDeadlines();
        }, 60000); // Refresh every minute
    } else if (!hasUrgentDeadline && deadlineRefreshInterval) {
        clearInterval(deadlineRefreshInterval);
        deadlineRefreshInterval = null;
    }
    
    // Build the HTML with Clear All button at the top
    let html = `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 15px;">
            <button class="btn btn-danger btn-sm" onclick="clearAllDeadlines()" title="Clear all deadlines" style="padding: 8px 16px; font-size: 0.9em;">
                🗑️ Clear All
            </button>
        </div>
    `;
    
    html += activeDeadlines.map(deadline => {
        // BACKWARD COMPATIBILITY: If dueDate doesn't include time (old format), append 11:59 PM
        let dueDateStr = deadline.dueDate;
        if (!dueDateStr.includes('T')) {
            dueDateStr = dueDateStr + 'T23:59:00';
        }
        
        const dueDate = new Date(dueDateStr);
        const now = new Date();
        const msUntil = dueDate - now;
        const hoursUntil = Math.floor(msUntil / (1000 * 60 * 60));
        const minutesUntil = Math.floor((msUntil % (1000 * 60 * 60)) / (1000 * 60));
        const daysUntil = Math.ceil(hoursUntil / 24);
        
        let urgencyText;
        let urgencyColor;
        
        if (msUntil < 0) {
            urgencyColor = 'var(--danger)';
            urgencyText = 'OVERDUE';
        } else if (hoursUntil < 24) {
            // Less than 24 hours: Show "X hours Y min"
            urgencyColor = 'var(--danger)';
            urgencyText = `${hoursUntil}h ${minutesUntil}m`;
        } else if (hoursUntil < 72) {
            // 24-72 hours: Show "X hours"
            urgencyColor = 'var(--warning)';
            urgencyText = `${hoursUntil} hours`;
        } else {
            // More than 72 hours: Show "X days"
            urgencyColor = 'var(--success)';
            urgencyText = `${daysUntil} days`;
        }
        
        const relatedTasks = appData.tasks.filter(t => t.parentDeadline === deadline.id);
        const completedTasks = relatedTasks.filter(t => t.completed).length;
        const incompleteTasks = relatedTasks.filter(t => !t.completed);
        
        // Calculate available time and work needed
        const timeAvailable = calculateAvailableTime(deadline);
        const totalWorkMinutes = incompleteTasks.reduce((sum, t) => sum + (t.timeEstimate || 30), 0);
        const totalWorkHours = Math.floor(totalWorkMinutes / 60);
        const workMinutesRemainder = totalWorkMinutes % 60;
        
        // Determine if achievable
        const isAchievable = timeAvailable.totalMinutes >= totalWorkMinutes;
        const statusIcon = isAchievable ? '✅' : '⚠️';
        const cardClass = isAchievable ? '' : 'tight-deadline';
        
        return `
            <div class="task-item ${cardClass}" style="border-left: 4px solid ${urgencyColor}; ${!isAchievable && incompleteTasks.length > 0 ? 'background: linear-gradient(to right, #fff5f0, white);' : ''}">
                <input type="checkbox" class="task-checkbox" 
                       onchange="toggleDeadline('${deadline.id}')" ${deadline.completed ? 'checked' : ''}>
                <div class="task-content" style="flex: 1;">
                    <div class="task-title" 
                         contenteditable="true"
                         onblur="editDeadlineTitle('${deadline.id}', this.textContent)"
                         onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                         style="cursor: text;"
                         title="Click to edit title">
                        ${deadline.title}
                    </div>
                    <div class="task-meta" style="flex-direction: column; gap: 8px; align-items: flex-start;">
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <span style="background: ${urgencyColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 600;">
                                📅 ${urgencyText}
                            </span>
                            <span onclick="editDeadlineDateTime('${deadline.id}')" 
                                  style="cursor: pointer; background: var(--border); padding: 4px 12px; border-radius: 20px; font-size: 0.85em;"
                                  title="Click to edit due date/time">
                                📅 Due: ${formatDeadlineDate(dueDateStr)}
                            </span>
                            ${deadline.timeEstimate ? `
                                <span class="deadline-time" onclick="editDeadlineTime('${deadline.id}')" style="cursor: pointer; background: var(--border); padding: 4px 12px; border-radius: 20px; font-size: 0.85em;" title="Click to edit time estimate">
                                    ⏱️ <span id="deadline-time-${deadline.id}">${deadline.timeEstimate}</span>min
                                </span>
                            ` : ''}
                            ${relatedTasks.length > 0 ? `
                                <span style="background: var(--border); padding: 4px 12px; border-radius: 20px; font-size: 0.85em;">
                                    ${completedTasks}/${relatedTasks.length} tasks done
                                </span>
                            ` : ''}
                        </div>
                        ${incompleteTasks.length > 0 && daysUntil > 0 ? `
                            <div style="font-size: 0.85em; color: var(--text-light); margin-top: 5px;">
                                ${statusIcon} <strong>${timeAvailable.blockCount} free blocks</strong> = ${timeAvailable.totalHours}h ${timeAvailable.remainingMinutes}m available
                                <br>
                                📝 ${totalWorkHours}h ${workMinutesRemainder}m of work needed
                                ${!isAchievable ? `
                                    <br>
                                    <span style="color: var(--warning); font-weight: 600;">⚠️ Tight schedule! Consider moving tasks or extending deadline.</span>
                                ` : ''}
                            </div>
                            ${timeAvailable.freeBlocks.length > 0 ? `
                                <details style="margin-top: 8px; font-size: 0.85em;">
                                    <summary style="cursor: pointer; color: var(--primary); font-weight: 500;">
                                        View ${timeAvailable.freeBlocks.length} available time blocks
                                    </summary>
                                    <div style="margin-top: 8px; padding: 10px; background: var(--bg-main); border-radius: 6px;">
                                        ${timeAvailable.freeBlocks.slice(0, 5).map(block => `
                                            <div style="padding: 4px 0; color: var(--text-light);">
                                                • ${block.date}: ${block.time} (${Math.floor(block.duration / 60)}h ${block.duration % 60}m) at ${block.location}
                                            </div>
                                        `).join('')}
                                        ${timeAvailable.freeBlocks.length > 5 ? `
                                            <div style="padding: 4px 0; color: var(--text-light); font-style: italic;">
                                                + ${timeAvailable.freeBlocks.length - 5} more blocks
                                            </div>
                                        ` : ''}
                                    </div>
                                </details>
                            ` : ''}
                        ` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="task-btn" onclick="breakDownDeadline('${deadline.id}')" title="Break down into smaller tasks">
                        🔨 Break Down
                    </button>
                    <button class="task-btn" onclick="deleteDeadline('${deadline.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
    console.log('✅ Clear All button rendered with', activeDeadlines.length, 'deadlines');
}

// ===== WHAT NOW LOGIC =====
function getCurrentEnergy() {
    const hour = getCurrentDateTime().getHours();
    if (hour >= 6 && hour < 12) return 'high';
    if (hour >= 12 && hour < 17) return 'medium';
    return 'low';
}

function updateWhatNow() {
    const currentBlock = getCurrentBlock();
    const userEnergy = appData.userEnergy || 'medium'; // Get user's selected energy
    const location = appData.currentLocation;
    
    const contextInfo = document.getElementById('contextInfo');
    const contextTitle = document.getElementById('contextTitle');
    const contextDetails = document.getElementById('contextDetails');
    
    contextInfo.style.display = 'block';
    contextTitle.textContent = `📍 ${location.charAt(0).toUpperCase() + location.slice(1)} | ⚡ ${userEnergy} energy`;
    
    if (currentBlock) {
        if (currentBlock.type === 'protected') {
            contextDetails.textContent = `🔒 Protected time: ${currentBlock.text}`;
        } else if (currentBlock.type === 'class') {
            contextDetails.textContent = `📚 In class: ${currentBlock.text}`;
        } else {
            contextDetails.textContent = `Current block: ${currentBlock.text}`;
        }
    } else {
        contextDetails.textContent = 'No scheduled block right now';
    }
    
    const suggestionCard = document.getElementById('suggestionCard');
    
    // SAFETY: Special handling for commute location - ONLY show errands during commute home
    if (location === 'commute') {
        const errandTasks = getErrandTasks();
        const isCommuteHome = isCommuteHomeBlock();
        
        if (isCommuteHome && errandTasks.length > 0) {
            const task = errandTasks[0];
            
            suggestionCard.innerHTML = `
                <div class="suggestion-card">
                    <h3>🏪 Errand Suggestion</h3>
                    <p style="font-size: 1.2em; font-weight: 600; margin: 10px 0;">${task.title}</p>
                    <div style="display: flex; gap: 10px; margin: 15px 0;">
                        <span class="energy-badge energy-${task.energy}">${task.energy}</span>
                        <span class="location-badge">🏪 ${task.location}</span>
                        ${task.timeEstimate ? `<span class="time-estimate">⏱️ ${task.timeEstimate}min</span>` : ''}
                    </div>
                    <p class="suggestion-reason">
                        🚗 You're driving home - good time to make stops!
                    </p>
                    <button class="btn btn-success" onclick="toggleTask('${task.id}')" style="margin-top: 15px;">
                        ✅ Mark Complete
                    </button>
                </div>
            `;
            suggestionCard.style.display = 'block';
            return;
        } else {
            suggestionCard.innerHTML = `
                <div class="suggestion-card">
                    <h3>🚗 Safe Driving</h3>
                    <p>Focus on the road! ${isCommuteHome ? 'Add errands with 🏪 if you need to make stops.' : 'Enjoy your commute safely.'}</p>
                    ${isCommuteHome ? `
                        <button class="btn btn-primary" onclick="showQuickAdd()" style="margin-top: 15px;">
                            ➕ Add Errand
                        </button>
                    ` : ''}
                </div>
            `;
            suggestionCard.style.display = 'block';
            return;
        }
    }
    
    // Define energy hierarchy
    const energyLevels = { low: 1, medium: 2, high: 3 };
    const userEnergyLevel = energyLevels[userEnergy];
    
    // Filter tasks: show any task at or below user's current energy
    const availableTasks = appData.tasks.filter(t => {
        if (t.completed) return false;
        if (t.location !== 'anywhere' && t.location !== location) return false;
        
        const taskEnergyLevel = energyLevels[t.energy] || 2;
        return taskEnergyLevel <= userEnergyLevel;
    });
    
    if (currentBlock && currentBlock.type === 'protected') {
        suggestionCard.innerHTML = `
            <div class="suggestion-card">
                <h3>🔒 Protected Time</h3>
                <p>This is your ${currentBlock.text}. Enjoy it guilt-free!</p>
                <p class="suggestion-reason">Protected blocks are sacred - no tasks allowed.</p>
            </div>
        `;
        suggestionCard.style.display = 'block';
    } else if (availableTasks.length > 0) {
        const task = availableTasks[0];
        suggestionCard.innerHTML = `
            <div class="suggestion-card">
                <h3>✨ Suggested Task</h3>
                <p style="font-size: 1.2em; font-weight: 600; margin: 10px 0;">${task.title}</p>
                <div style="display: flex; gap: 10px; margin: 15px 0;">
                    <span class="energy-badge energy-${task.energy}">${task.energy}</span>
                    <span class="location-badge">📍 ${task.location}</span>
                    ${task.timeEstimate ? `<span class="time-estimate">⏱️ ${task.timeEstimate}min</span>` : ''}
                </div>
                <p class="suggestion-reason">
                    Perfect for your ${userEnergy} energy at ${location}
                </p>
                <button class="btn btn-success" onclick="toggleTask('${task.id}')" style="margin-top: 15px;">
                    ✅ Mark Complete
                </button>
            </div>
        `;
        suggestionCard.style.display = 'block';
    } else {
        suggestionCard.innerHTML = `
            <div class="suggestion-card">
                <h3>🎉 All Clear!</h3>
                <p>No tasks match your current context. Time to relax or add new tasks!</p>
                <button class="btn btn-primary" onclick="showQuickAdd()" style="margin-top: 15px;">
                    ➕ Add Task
                </button>
            </div>
        `;
        suggestionCard.style.display = 'block';
    }
}

// ===== MODAL FUNCTIONS =====
function showQuickAdd() {
    document.getElementById('quickTaskInput').focus();
}

function showBrainDump() {
    document.getElementById('brainDumpModal').classList.add('active');
    document.getElementById('brainDumpText').focus();
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// ===== SETTINGS FUNCTIONS =====
function showSettings() {
    openTab('settings');
}

function populateSettingsInputs() {
    console.log('🔧 [SETTINGS] Populating settings input fields...');
    
    const workerUrlInput = document.getElementById('workerUrlInput');
    const workerPasswordInput = document.getElementById('workerPasswordInput');
    const clientIdInput = document.getElementById('clientIdInput');
    const apiKeyInput = document.getElementById('apiKeyInput');
    
    if (workerUrlInput && appData.settings?.workerUrl) {
        workerUrlInput.value = appData.settings.workerUrl;
        console.log('🔧 [SETTINGS] Worker URL populated');
    }
    
    if (workerPasswordInput && appData.settings?.workerPassword) {
        workerPasswordInput.value = appData.settings.workerPassword;
        console.log('🔧 [SETTINGS] Worker password populated');
    }
    
    if (clientIdInput && appData.settings?.clientId) {
        clientIdInput.value = appData.settings.clientId;
        console.log('🔧 [SETTINGS] Client ID populated');
    }
    
    if (apiKeyInput && appData.settings?.apiKey) {
        apiKeyInput.value = appData.settings.apiKey;
        console.log('🔧 [SETTINGS] API key saved:', appData.settings.apiKey ? '✓ Present' : '✗ Missing');
    }
    
    const maxWorkInput = document.getElementById('maxWorkInput');
    if (maxWorkInput && appData.settings?.maxDailyWorkMinutes) {
        maxWorkInput.value = appData.settings.maxDailyWorkMinutes;
        console.log('🔧 [SETTINGS] Max work time populated:', appData.settings.maxDailyWorkMinutes);
    }
}

// ===== TOAST NOTIFICATION =====
function showToast(message) {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// ===== UTILITY FUNCTIONS =====
function toggleFont() {
    document.body.classList.toggle('dyslexia-font');
    
    // Save preference
    const isDyslexicFont = document.body.classList.contains('dyslexia-font');
    localStorage.setItem('dyslexiaFont', isDyslexicFont);
    
    // Show feedback
    showToast(isDyslexicFont ? '🔤 Dyslexia font enabled' : '🔤 Standard font enabled');
}

function isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
}

// ===== COURSE MAPPINGS UI =====
function renderCourseMappings() {
    const container = document.getElementById('courseMappingsList');
    if (!container) return;
    
    const mappings = getCourseMappings();
    const mappingEntries = Object.entries(mappings);
    
    if (mappingEntries.length === 0) {
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--text-light); background: var(--bg-main); border-radius: 8px;">
                <p>No course mappings yet. Add one to get started!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = mappingEntries.map(([code, name]) => `
        <div style="display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--bg-main); border-radius: 8px; margin-bottom: 10px;">
            <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--primary);">${code}</div>
                <div style="font-size: 0.9em; color: var(--text-light);">${name}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="deleteCourseMappingConfirm('${code}')" title="Delete mapping">
                🗑️
            </button>
        </div>
    `).join('');
}

function showAddCourseMappingModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'addCourseMappingModal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>➕ Add Course Mapping</h2>
                <button class="close-modal" id="closeAddMappingBtn">&times;</button>
            </div>
            
            <div class="form-group">
                <label for="courseMappingCode">Course Code</label>
                <input type="text" 
                       id="courseMappingCode" 
                       placeholder="e.g., BISC104, MUSC199, POSC150"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; text-transform: uppercase;">
                <small style="color: var(--text-light); display: block; margin-top: 5px;">
                    Enter the course code as it appears in your calendar or syllabus
                </small>
            </div>
            
            <div class="form-group">
                <label for="courseMappingName">Friendly Name</label>
                <input type="text" 
                       id="courseMappingName" 
                       placeholder="e.g., Biology, US Politics, Beatles"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                <small style="color: var(--text-light); display: block; margin-top: 5px;">
                    Choose a name you'll recognize easily
                </small>
            </div>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" id="saveCourseMappingBtn">
                    💾 Save Mapping
                </button>
                <button class="btn btn-secondary" id="cancelCourseMappingBtn">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners
    const saveBtn = document.getElementById('saveCourseMappingBtn');
    const cancelBtn = document.getElementById('cancelCourseMappingBtn');
    const closeBtn = document.getElementById('closeAddMappingBtn');
    const codeInput = document.getElementById('courseMappingCode');
    
    // Auto-uppercase the code input
    codeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
    
    saveBtn.addEventListener('click', () => {
        const code = codeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const name = document.getElementById('courseMappingName').value.trim();
        
        if (!code) {
            alert('Please enter a course code');
            return;
        }
        
        if (!name) {
            alert('Please enter a friendly name');
            return;
        }
        
        // Get existing mappings
        const mappings = getCourseMappings();
        mappings[code] = name;
        saveCourseMappings(mappings);
        
        modal.remove();
        renderCourseMappings();
        showToast(`✅ Added mapping: ${code} → ${name}`);
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    // Focus first input
    setTimeout(() => codeInput.focus(), 100);
}

function deleteCourseMappingConfirm(code) {
    const mappings = getCourseMappings();
    const name = mappings[code];
    
    if (confirm(`Delete mapping for ${code} (${name})?`)) {
        delete mappings[code];
        saveCourseMappings(mappings);
        renderCourseMappings();
        showToast(`🗑️ Deleted mapping: ${code}`);
    }
}
