// app.js - Main application logic and initialization

// Configuration variables (will be loaded from settings)
let CLOUDFLARE_WORKER_URL = 'https://controlled-chaos-api.lmdrew.workers.dev';
let GOOGLE_CLIENT_ID = '593850134085-21comnf9tcgcjqp7jnkvum180ksebid7.apps.googleusercontent.com';

// ===== APPLICATION INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 [INIT] Application starting...');
    
    // FIX 1: Add sync indicator click handler
    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) {
        syncIndicator.addEventListener('click', () => {
            console.log('🖱️ Sync indicator clicked - opening Settings');
            handleMoreMenuClick('settings');
        });
        console.log('✅ Sync indicator click handler attached');
    } else {
        console.error('❌ Sync indicator element not found');
    }
    
    // Initialize More menu functionality
    initializeMoreMenu();
    
    // Initialize tab navigation
    initializeTabs();
    
    // Initialize daily schedule with day tabs
    initializeDailySchedule();
    
    // Initialize Google API
    initGoogleAPI();
    
    // Wait for gapi to initialize before attempting any Drive operations
    console.log('⏳ [INIT] Waiting for gapi to initialize...');
    await waitForGapiInit();
    console.log('✅ [INIT] gapi initialized, proceeding with session restore');
    
    // Now restore session
    await restoreSession();
    
    // Run safety migration for phone -> errands
    migratePhoneToErrands();
    
    updateUI();
    
    // Set up auto-refresh
    setupAutoRefresh();
    
    // Set default location
    setLocation('home');
    
    // Restore font preference
    if (localStorage.getItem('dyslexiaFont') === 'true') {
        document.body.classList.add('dyslexia-font');
    }
    
    // Set default energy if not already set
    if (!appData.userEnergy) {
        setUserEnergy('medium');
    } else {
        // Restore saved energy state
        document.querySelectorAll('.energy-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.energy === appData.userEnergy);
        });
    }
    
    // Check if configured
    if (!CLOUDFLARE_WORKER_URL || CLOUDFLARE_WORKER_URL === 'YOUR-WORKER-URL-HERE/api/claude' ||
        !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR-CLIENT-ID-HERE.apps.googleusercontent.com') {
        document.getElementById('configWarning').style.display = 'block';
    } else {
        document.getElementById('configWarning').style.display = 'none';
    }
    
    // Initialize Due Soon banner
    updateDueSoonBanner();
    
    console.log('✅ [INIT] Application ready');
});

// ===== MORE MENU FUNCTIONALITY =====
function initializeMoreMenu() {
    const moreMenuButton = document.getElementById('moreMenuButton');
    const moreMenu = document.getElementById('moreMenu');
    
    if (!moreMenuButton || !moreMenu) {
        console.error('More menu elements not found');
        return;
    }
    
    // Toggle More menu on button click
    moreMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('hidden');
    });
    
    // Close More menu when clicking outside
    document.addEventListener('click', (e) => {
        // Don't close if clicking inside the menu or on the button
        if (!moreMenu.contains(e.target) && e.target !== moreMenuButton) {
            moreMenu.classList.add('hidden');
        }
    });
    
    // IMPORTANT: Prevent menu from closing when clicking menu items
    moreMenu.addEventListener('click', (e) => {
        // Allow the onclick handler to execute first
        // Then close the menu after a brief delay
        setTimeout(() => {
            moreMenu.classList.add('hidden');
        }, 100);
    });
}

function handleMoreMenuClick(tabName) {
    const moreMenu = document.getElementById('moreMenu');
    
    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    // Show the target tab
    const targetTab = document.getElementById(`${tabName}-tab`);
    if (targetTab) {
        targetTab.style.display = 'block';
    }
    
    // Update active state - remove from all main tabs
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Save the active tab
    localStorage.setItem('activeTab', tabName);
    
    // Populate settings if switching to settings tab
    if (tabName === 'settings' && typeof populateSettingsInputs === 'function') {
        populateSettingsInputs();
    }
    
    // Close the More menu
    if (moreMenu) {
        moreMenu.classList.add('hidden');
    }
    
    console.log(`📑 Switched to ${tabName} tab via More menu`);
}

function handleAppearanceClick() {
    const moreMenu = document.getElementById('moreMenu');
    
    // Toggle font
    toggleFont();
    
    // Close the More menu
    if (moreMenu) {
        moreMenu.classList.add('hidden');
    }
}

function handleDriveInfoClick() {
    const moreMenu = document.getElementById('moreMenu');
    
    // Open Settings tab and scroll to Google Drive section
    handleMoreMenuClick('settings');
    
    // Scroll to Google Drive section after a brief delay
    setTimeout(() => {
        const driveSection = document.querySelector('.card h2');
        if (driveSection && driveSection.textContent.includes('Google Drive')) {
            driveSection.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
    
    // Close the More menu
    if (moreMenu) {
        moreMenu.classList.add('hidden');
    }
}

// Close modals on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// ===== TASK MANAGEMENT =====
function addTask(task) {
    task.id = Date.now().toString();
    task.completed = false;
    task.createdAt = new Date().toISOString();
    appData.tasks.push(task);
    saveData();
    renderTasks();
    updateDueSoonBanner();
    
    // Crisis Mode removed - replaced with Due Soon banner
    // if (typeof invalidateCrisisCache === 'function') {
    //     invalidateCrisisCache();
    // }
}

function toggleTask(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        if (task.completed) {
            task.completedAt = new Date().toISOString();
            
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
            
            // Check if this is a subtask - if so, check if all subtasks are complete
            if (task.parentTaskId) {
                const parentTask = appData.tasks.find(t => t.id === task.parentTaskId);
                if (parentTask && parentTask.subtaskIds) {
                    const allSubtasksComplete = parentTask.subtaskIds.every(id => {
                        const subtask = appData.tasks.find(t => t.id === id);
                        return subtask && subtask.completed;
                    });
                    
                    if (allSubtasksComplete) {
                        // Show celebration for completing all subtasks
                        setTimeout(() => {
                            showSubtaskCompletionCelebration(parentTask);
                        }, 500);
                    }
                }
            }
            
            // Check if this is the "Wake up & take meds" task
            if (task.title && task.title.toLowerCase().includes('wake up') && task.title.toLowerCase().includes('meds')) {
                // Show morning check-in after a brief delay
                setTimeout(() => {
                    if (typeof MoodTracker !== 'undefined') {
                        MoodTracker.showMorningCheckIn();
                    }
                }, 2000);
            } else {
                // Show task completion micro-check for other tasks
                setTimeout(() => {
                    if (typeof MoodTracker !== 'undefined') {
                        MoodTracker.showTaskCompletionCheck(taskId);
                    }
                }, 1000);
            }
        }
        saveData();
        renderTasks();
        updateWhatNow();
        updateDueSoonBanner();
        
        // Crisis Mode removed - replaced with Due Soon banner
        // if (typeof invalidateCrisisCache === 'function') {
        //     invalidateCrisisCache();
        // }
    }
}

function showSubtaskCompletionCelebration(parentTask) {
    // Extra confetti for completing all subtasks!
    confetti({
        particleCount: 200,
        spread: 120,
        origin: { y: 0.6 },
        colors: ['#667eea', '#764ba2', '#f093fb', '#4facfe']
    });
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>🎉 All Subtasks Complete!</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <p style="font-size: 1.1em; margin-bottom: 20px;">
                You finished all ${parentTask.subtaskIds.length} mini-tasks for:<br>
                <strong style="color: var(--primary);">${parentTask.title}</strong>
            </p>
            <p style="margin-bottom: 20px;">Would you like to mark the parent task as complete too?</p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-success" onclick="toggleTask('${parentTask.id}'); this.closest('.modal').remove();">
                    ✅ Yes, mark it done!
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove();">
                    Not yet
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function deleteTask(taskId) {
    if (confirm('Delete this task?')) {
        appData.tasks = appData.tasks.filter(t => t.id !== taskId);
        saveData();
        renderTasks();
        updateWhatNow();
        updateDueSoonBanner();
        
        // Crisis Mode removed - replaced with Due Soon banner
        // if (typeof invalidateCrisisCache === 'function') {
        //     invalidateCrisisCache();
        // }
    }
}

function quickAddTask() {
    const input = document.getElementById('quickTaskInput');
    const text = input.value.trim();
    if (text) {
        addTask({
            title: text,
            energy: 'medium',
            location: 'anywhere',
            timeEstimate: 30
        });
        input.value = '';
    }
}

function quickAddErrand(errandType) {
    const errandDefaults = {
        'Post office': {
            title: 'Stop at post office',
            timeEstimate: 10,
            energy: 'low'
        },
        'Grocery store': {
            title: 'Quick grocery run',
            timeEstimate: 20,
            energy: 'medium'
        },
        'Gas station': {
            title: 'Fill up gas tank',
            timeEstimate: 10,
            energy: 'low'
        },
        'Pharmacy': {
            title: 'Pick up prescription',
            timeEstimate: 10,
            energy: 'low'
        }
    };
    
    const defaults = errandDefaults[errandType];
    
    const newTask = {
        title: defaults.title,
        timeEstimate: defaults.timeEstimate,
        energy: defaults.energy,
        location: 'errands',
        priority: 'medium'
    };
    
    addTask(newTask);
    showToast(`✅ Added: ${defaults.title}`);
}

// Migration function for existing 'phone' tasks
function migratePhoneToErrands() {
    const migrationKey = 'phone_to_errands_migration_done';
    
    if (localStorage.getItem(migrationKey)) {
        return; // Already migrated
    }
    
    let migratedCount = 0;
    
    appData.tasks.forEach(task => {
        if (task.location === 'phone') {
            // Analyze the task to determine if it's actually an errand
            const isActualErrand = 
                task.title.toLowerCase().includes('post office') ||
                task.title.toLowerCase().includes('grocery') ||
                task.title.toLowerCase().includes('gas') ||
                task.title.toLowerCase().includes('store') ||
                task.title.toLowerCase().includes('pharmacy') ||
                task.title.toLowerCase().includes('pick up') ||
                task.title.toLowerCase().includes('drop off') ||
                task.title.toLowerCase().includes('errand');
            
            if (isActualErrand) {
                task.location = 'errands';
            } else {
                // These were probably meant to be phone tasks but are unsafe
                // Change to 'anywhere' since they can do them when NOT driving
                task.location = 'anywhere';
            }
            
            migratedCount++;
        }
    });
    
    if (migratedCount > 0) {
        saveData();
        showToast(`📝 Updated ${migratedCount} tasks for safety`);
    }
    
    localStorage.setItem(migrationKey, 'true');
}

// ===== PROJECT MANAGEMENT =====
function calculateProjectProgress(project) {
    if (!project.tasks || project.tasks.length === 0) return 0;
    const completedTasks = project.tasks.filter(t => t.completed).length;
    return Math.round((completedTasks / project.tasks.length) * 100);
}

function updateProjectProgress(projectId) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project) {
        project.progress = calculateProjectProgress(project);
        saveData();
        renderProjects();
    }
}

function toggleProjectTask(projectId, taskIndex) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project && project.tasks[taskIndex]) {
        project.tasks[taskIndex].completed = !project.tasks[taskIndex].completed;
        updateProjectProgress(projectId);
        
        if (project.tasks[taskIndex].completed) {
            confetti({
                particleCount: 50,
                spread: 60,
                origin: { y: 0.6 }
            });
        }
    }
}

function addProjectTask(projectId, taskText) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project && taskText.trim()) {
        project.tasks.push({
            text: taskText.trim(),
            completed: false
        });
        updateProjectProgress(projectId);
    }
}

function editProjectTask(projectId, taskIndex, newText) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project && project.tasks[taskIndex] && newText.trim()) {
        project.tasks[taskIndex].text = newText.trim();
        saveData();
        renderProjects();
    }
}

function deleteProjectTask(projectId, taskIndex) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project && project.tasks[taskIndex]) {
        if (confirm('Delete this task?')) {
            project.tasks.splice(taskIndex, 1);
            updateProjectProgress(projectId);
        }
    }
}

function showProjectModal(projectId) {
    const project = appData.projects.find(p => p.id === projectId);
    if (!project) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'projectModal';
    
    const completedCount = project.tasks.filter(t => t.completed).length;
    const totalCount = project.tasks.length;
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${project.name}</h2>
                <button class="close-modal" onclick="closeProjectModal()">&times;</button>
            </div>
            <p style="color: var(--text-light); margin-bottom: 10px;">${project.description}</p>
            <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                <span class="status-badge status-${project.status}">${project.status}</span>
                <span class="category-badge">${project.category}</span>
            </div>
            
            <div class="project-tasks-list" id="projectTasksList">
                ${project.tasks.map((task, index) => `
                    <div class="project-task-item ${task.completed ? 'completed' : ''}">
                        <input type="checkbox" 
                               ${task.completed ? 'checked' : ''}
                               onchange="toggleProjectTask(${projectId}, ${index})"
                               class="task-checkbox">
                        <span class="project-task-text" 
                              contenteditable="true"
                              onblur="editProjectTask(${projectId}, ${index}, this.textContent)"
                              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                              >${task.text}</span>
                        <button class="task-delete-btn" 
                                onclick="deleteProjectTask(${projectId}, ${index})"
                                title="Delete task">×</button>
                    </div>
                `).join('')}
            </div>
            
            <div class="add-task-section">
                <input type="text" 
                       id="newProjectTaskInput" 
                       placeholder="Add new task..."
                       onkeydown="if(event.key==='Enter'){addProjectTaskFromInput(${projectId})}"
                       style="flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                <button class="btn btn-primary" onclick="addProjectTaskFromInput(${projectId})">
                    + Add
                </button>
            </div>
            
            <div class="project-progress-summary">
                <strong>Progress: ${project.progress}%</strong> (${completedCount}/${totalCount} tasks complete)
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeProjectModal();
        }
    });
    
    // Close on ESC key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeProjectModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function addProjectTaskFromInput(projectId) {
    const input = document.getElementById('newProjectTaskInput');
    if (input && input.value.trim()) {
        addProjectTask(projectId, input.value);
        input.value = '';
        input.focus();
    }
}

function closeProjectModal() {
    const modal = document.getElementById('projectModal');
    if (modal) {
        modal.remove();
    }
}

// ===== DEADLINE MANAGEMENT =====
function addDeadline(title, dueDate) {
    const deadline = {
        id: Date.now().toString(),
        title: title,
        dueDate: dueDate,
        createdAt: new Date().toISOString(),
        completed: false
    };
    
    appData.deadlines.push(deadline);
    saveData();
    renderDeadlines();
    updateDueSoonBanner();
    
    // Crisis Mode removed - replaced with Due Soon banner
    // if (typeof invalidateCrisisCache === 'function') {
    //     invalidateCrisisCache();
    // }
    
    // Show the "Create tasks?" modal
    afterDeadlineCreated(deadline);
}

function toggleDeadline(deadlineId) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (deadline) {
        deadline.completed = !deadline.completed;
        
        // Also complete all related tasks
        if (deadline.completed) {
            appData.tasks.forEach(task => {
                if (task.parentDeadline === deadlineId) {
                    task.completed = true;
                }
            });
            
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 }
            });
        }
        
        saveData();
        renderDeadlines();
        renderTasks();
        updateDueSoonBanner();
    }
}

function deleteDeadline(deadlineId) {
    if (confirm('Delete this deadline and all related tasks?')) {
        appData.deadlines = appData.deadlines.filter(d => d.id !== deadlineId);
        appData.tasks = appData.tasks.filter(t => t.parentDeadline !== deadlineId);
        saveData();
        renderDeadlines();
        renderTasks();
        updateDueSoonBanner();
        
        // Crisis Mode removed - replaced with Due Soon banner
        // if (typeof invalidateCrisisCache === 'function') {
        //     invalidateCrisisCache();
        // }
    }
}

function showAddDeadlineModal() {
    const quickInput = document.getElementById('quickDeadlineInput');
    const quickText = quickInput.value.trim();
    
    // Create a simple prompt modal
    const title = quickText || prompt('What\'s the deadline for?');
    if (!title) return;
    
    const dateStr = prompt('When is it due? (YYYY-MM-DD or MM/DD)');
    if (!dateStr) return;
    
    // Parse date
    let dueDate;
    if (dateStr.includes('-')) {
        dueDate = dateStr; // Already in YYYY-MM-DD format
    } else {
        // Convert MM/DD to YYYY-MM-DD
        const [month, day] = dateStr.split('/');
        const year = new Date().getFullYear();
        dueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    addDeadline(title, dueDate);
    quickInput.value = '';
}

function afterDeadlineCreated(deadline) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>✨ Create tasks for this deadline?</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <p style="margin-bottom: 20px;">Would you like to create tasks for <strong>${deadline.title}</strong>?</p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="autoCreateTasksWithAI('${deadline.id}'); this.closest('.modal').remove();">
                    ✨ Auto-create (AI)
                </button>
                <button class="btn btn-secondary" onclick="showQuickTaskCreator('${deadline.id}'); this.closest('.modal').remove();">
                    📝 Quick setup
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove();">
                    Skip for now
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function autoCreateTasksWithAI(deadlineId) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (!deadline) return;
    
    // Show loading state
    const loadingModal = document.createElement('div');
    loadingModal.className = 'modal active';
    loadingModal.innerHTML = `
        <div class="modal-content">
            <h2>✨ Creating tasks...</h2>
            <p>AI is breaking down "${deadline.title}" into manageable tasks...</p>
        </div>
    `;
    document.body.appendChild(loadingModal);
    
    try {
        const daysUntil = Math.ceil((new Date(deadline.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        
        const systemPrompt = `You are an ADHD-friendly task planner. Break down the deadline into 2-4 concrete, actionable tasks. Consider the time available (${daysUntil} days). For each task, determine:
- title (clear, specific action)
- energy level (high/medium/low)
- location (home/school/work/phone/anywhere)
- timeEstimate in minutes (realistic)

Return ONLY valid JSON array, no other text:
[{"title": "...", "energy": "...", "location": "...", "timeEstimate": 30}]`;

        const response = await callClaudeAPI([{
            role: 'user',
            content: `Deadline: ${deadline.title}\nDue: ${deadline.dueDate}\nDays until due: ${daysUntil}`
        }], systemPrompt);

        const tasks = JSON.parse(response);
        tasks.forEach(task => {
            task.parentDeadline = deadlineId;
            task.dueDate = deadline.dueDate;
            addTask(task);
        });

        loadingModal.remove();
        
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
        
        alert(`✅ Created ${tasks.length} tasks for "${deadline.title}"!`);
    } catch (error) {
        console.error('Auto-create tasks error:', error);
        loadingModal.remove();
        alert('Failed to create tasks. Check your API configuration or try Quick setup instead.');
    }
}

function showQuickTaskCreator(deadlineId) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (!deadline) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>📝 Quick Task Setup</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <p style="margin-bottom: 15px;">Create up to 3 tasks for <strong>${deadline.title}</strong>:</p>
            
            <div class="form-group">
                <label>Task 1</label>
                <input type="text" id="quickTask1" placeholder="e.g., Research topic">
            </div>
            
            <div class="form-group">
                <label>Task 2 (optional)</label>
                <input type="text" id="quickTask2" placeholder="e.g., Write outline">
            </div>
            
            <div class="form-group">
                <label>Task 3 (optional)</label>
                <input type="text" id="quickTask3" placeholder="e.g., Final review">
            </div>
            
            <button class="btn btn-primary" onclick="saveQuickTasks('${deadlineId}'); this.closest('.modal').remove();">
                ✅ Create Tasks
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Focus first input
    setTimeout(() => document.getElementById('quickTask1').focus(), 100);
}

function saveQuickTasks(deadlineId) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (!deadline) return;
    
    const task1 = document.getElementById('quickTask1').value.trim();
    const task2 = document.getElementById('quickTask2').value.trim();
    const task3 = document.getElementById('quickTask3').value.trim();
    
    let count = 0;
    [task1, task2, task3].forEach(title => {
        if (title) {
            addTask({
                title: title,
                energy: 'medium',
                location: 'anywhere',
                timeEstimate: 30,
                parentDeadline: deadlineId,
                dueDate: deadline.dueDate
            });
            count++;
        }
    });
    
    if (count > 0) {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
        alert(`✅ Created ${count} task${count > 1 ? 's' : ''} for "${deadline.title}"!`);
    }
}

async function breakDownDeadline(deadlineId) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (!deadline) return;
    
    // Check if already broken down
    if (deadline.brokenDown) {
        if (confirm('This deadline has already been broken down. Break it down again?')) {
            // Remove old subtasks
            appData.tasks = appData.tasks.filter(t => t.parentDeadline !== deadlineId);
        } else {
            return;
        }
    }
    
    // Show loading modal
    const loadingModal = document.createElement('div');
    loadingModal.className = 'modal active';
    loadingModal.innerHTML = `
        <div class="modal-content">
            <h2>🔨 Breaking down deadline...</h2>
            <p>AI is analyzing your schedule and creating a plan for "${deadline.title}"...</p>
        </div>
    `;
    document.body.appendChild(loadingModal);
    
    try {
        const now = new Date();
        const dueDate = new Date(deadline.dueDate);
        const availableBlocks = getAvailableFreeBlocks(now, dueDate);
        
        if (availableBlocks.length === 0) {
            loadingModal.remove();
            alert('No free time blocks found before the deadline. Consider adjusting your schedule or deadline date.');
            return;
        }
        
        const blocksText = availableBlocks.slice(0, 10).map(b => 
            `- ${b.day} ${b.time}: ${b.duration} minutes at ${b.location}`
        ).join('\n');
        
        const systemPrompt = `You are an ADHD-friendly task planner. Break down the deadline into 3-6 specific, actionable subtasks.

Deadline: ${deadline.title}
Due: ${deadline.dueDate}

Available time blocks before deadline:
${blocksText}

Create subtasks that:
1. Are concrete and completable (not vague like "work on essay")
2. Have realistic time estimates (15-90 minutes each)
3. Can fit in the available time blocks
4. Build toward completing the deadline
5. Include buffer/review time at the end

Respond ONLY with valid JSON in this exact format (no markdown, no backticks):
{
  "subtasks": [
    {
      "title": "specific task name",
      "timeEstimate": 45,
      "energy": "medium",
      "location": "school",
      "suggestedBlock": "Monday 8:40 AM-10:30 AM at school",
      "reasoning": "why this fits here"
    }
  ]
}`;

        const response = await callClaudeAPI([{
            role: 'user',
            content: `Break down this deadline into subtasks that fit my schedule.`
        }], systemPrompt);

        const data = JSON.parse(response);
        
        // Create tasks from subtasks
        data.subtasks.forEach(subtask => {
            addTask({
                title: subtask.title,
                energy: subtask.energy,
                location: subtask.location,
                timeEstimate: subtask.timeEstimate,
                parentDeadline: deadlineId,
                dueDate: deadline.dueDate,
                suggestedBlock: subtask.suggestedBlock,
                reasoning: subtask.reasoning
            });
        });
        
        // Mark deadline as broken down
        deadline.brokenDown = true;
        saveData();
        renderDeadlines();
        
        loadingModal.remove();
        
        // Show success modal with timeline
        const successModal = document.createElement('div');
        successModal.className = 'modal active';
        successModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>✅ Deadline Broken Down!</h2>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <p style="margin-bottom: 20px;">Created ${data.subtasks.length} tasks for <strong>${deadline.title}</strong>:</p>
                <div style="background: var(--bg-main); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                    ${data.subtasks.map((subtask, i) => `
                        <div style="margin: 15px 0; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid var(--primary);">
                            <div style="font-weight: 600; margin-bottom: 5px;">
                                ${i + 1}. ${subtask.title}
                            </div>
                            <div style="font-size: 0.9em; color: var(--text-light); margin-bottom: 5px;">
                                ⏱️ ${subtask.timeEstimate} min | 📍 ${subtask.location} | ⚡ ${subtask.energy}
                            </div>
                            <div style="font-size: 0.85em; color: var(--primary); margin-bottom: 5px;">
                                📅 Suggested: ${subtask.suggestedBlock}
                            </div>
                            <div style="font-size: 0.85em; color: var(--text-light); font-style: italic;">
                                ${subtask.reasoning}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-primary" onclick="this.closest('.modal').remove()">
                    Got it! Let's do this 🚀
                </button>
            </div>
        `;
        document.body.appendChild(successModal);
        
        confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.6 }
        });
        
    } catch (error) {
        console.error('Break down deadline error:', error);
        loadingModal.remove();
        alert('Failed to break down deadline. Check your API configuration and try again.');
    }
}

// ===== AI FEATURES =====
async function callClaudeAPI(messages, systemPrompt = '') {
    console.log('🤖 [CLAUDE API] Starting API call...');
    console.log('🤖 [CLAUDE API] Worker URL from settings:', appData.settings?.workerUrl);
    console.log('🤖 [CLAUDE API] Global CLOUDFLARE_WORKER_URL:', CLOUDFLARE_WORKER_URL);
    
    if (!CLOUDFLARE_WORKER_URL || CLOUDFLARE_WORKER_URL === 'YOUR-WORKER-URL-HERE/api/claude') {
        console.error('❌ [CLAUDE API] Worker URL not configured');
        alert('Please configure your Cloudflare Worker URL in Settings!');
        showSettings();
        throw new Error('Worker URL not configured');
    }

    const apiKey = appData.settings.apiKey || '';
    console.log('🤖 [CLAUDE API] API Key exists:', !!apiKey);
    console.log('🤖 [CLAUDE API] API Key starts with sk-ant-:', apiKey.startsWith('sk-ant-'));
    
    if (!apiKey) {
        console.error('❌ [CLAUDE API] API key not found');
        alert('Please add your Anthropic API key in Settings to use AI features!');
        showSettings();
        throw new Error('API key not configured');
    }

    // Get worker password from settings
    const workerPassword = appData.settings?.workerPassword || '';
    console.log('🤖 [CLAUDE API] Worker password exists:', !!workerPassword);
    console.log('🤖 [CLAUDE API] Worker password length:', appData.settings.workerPassword?.length || 0);
    console.log('🤖 [CLAUDE API] Worker password first 3 chars:', appData.settings.workerPassword?.substring(0, 3) || 'MISSING');
    
    if (!workerPassword) {
        console.error('❌ [CLAUDE API] Worker password not found');
        alert('Please configure your Worker Password in Settings first!');
        showSettings();
        throw new Error('Worker password not configured');
    }

    // FIX: Ensure we're using the full API endpoint, not just the domain
    const apiUrl = CLOUDFLARE_WORKER_URL.endsWith('/api/claude') 
        ? CLOUDFLARE_WORKER_URL 
        : `${CLOUDFLARE_WORKER_URL}/api/claude`;
    
    console.log('🤖 [CLAUDE API] Full API URL:', apiUrl);

    // Create the actual API call function to be queued
    const makeAPICall = async () => {
        const maxRetries = 3;
        const delays = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`🤖 [CLAUDE API] Attempt ${attempt + 1}/${maxRetries}`);
                
                // Show retry message if not first attempt
                if (attempt > 0) {
                    showToast(`Hmm, Claude is thinking slowly... retrying (${attempt}/${maxRetries})...`);
                }
                
                const requestBody = {
                    model: 'claude-sonnet-4-5-20250929',
                    max_tokens: 2000,
                    system: systemPrompt,
                    messages: messages
                };
                
                console.log('🤖 [CLAUDE API] Request body:', {
                    model: requestBody.model,
                    max_tokens: requestBody.max_tokens,
                    systemPromptLength: systemPrompt.length,
                    messagesCount: messages.length
                });
                
                console.log('🤖 [CLAUDE API] Request payload:', JSON.stringify({
                    model: requestBody.model,
                    max_tokens: requestBody.max_tokens,
                    messages: requestBody.messages
                }, null, 2));
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey,
                        'Authorization': `Bearer ${workerPassword}`
                    },
                    body: JSON.stringify(requestBody)
                });

                console.log('🤖 [CLAUDE API] Response status:', response.status);
                console.log('🤖 [CLAUDE API] Response headers:', Object.fromEntries(response.headers.entries()));

                // Check for 503 Service Unavailable
                if (response.status === 503) {
                    console.warn('⚠️ [CLAUDE API] Service unavailable (503)');
                    const errorBody = await response.clone().text();
                    console.log('🔴 [CLAUDE API] 503 Error body:', errorBody);
                    // If this is the last attempt, throw error
                    if (attempt === maxRetries - 1) {
                        throw new Error('Service temporarily unavailable after multiple retries');
                    }
                    
                    // Wait before retrying with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, delays[attempt]));
                    continue; // Retry
                }

                // For other errors, get the response text for better error messages
                const responseText = await response.text();
                console.log('🤖 [CLAUDE API] Response headers:', {
                    'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
                    'x-ratelimit-limit': response.headers.get('x-ratelimit-limit'),
                    'x-ratelimit-reset': response.headers.get('x-ratelimit-reset'),
                    'retry-after': response.headers.get('retry-after')
                });
                console.log('🤖 [CLAUDE API] Response body:', responseText);
                
                if (!response.ok) {
                    console.error('❌ [CLAUDE API] Request failed:', response.status, responseText);
                    throw new Error(`API call failed (${response.status}): ${responseText}`);
                }

                // Success! Parse and return
                const data = JSON.parse(responseText);
                console.log('✅ [CLAUDE API] Success! Response:', data);
                
                // Show success message if we had to retry
                if (attempt > 0) {
                    showToast('✅ Got it! Claude responded successfully.');
                }
                
                return data.content[0].text;
                
            } catch (error) {
                console.error(`❌ [CLAUDE API] Attempt ${attempt + 1} failed:`, error);
                
                // If this is the last attempt, throw the error
                if (attempt === maxRetries - 1) {
                    console.error('❌ [CLAUDE API] All retries exhausted');
                    throw error;
                }
                
                // For network errors or 503s, wait and retry
                if (error.message.includes('503') || error.message.includes('fetch')) {
                    await new Promise(resolve => setTimeout(resolve, delays[attempt]));
                    continue;
                }
                
                // For other errors, throw immediately
                throw error;
            }
        }
    };

    // Queue the request instead of calling directly
    const description = messages[0]?.content?.substring(0, 50) + '...' || 'API Request';
    return await apiQueue.queueRequest(makeAPICall, description);
}

async function processBrainDump() {
    const text = document.getElementById('brainDumpText').value.trim();
    if (!text) return;

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '🧠 Processing...';

    try {
        // Build template context
        let templateContext = `The user has these task templates:

1. **Errands & Stops**: For shopping/errands (use simple names like "grocery", "pharmacy", not full sentences)
2. **Bio Weekly Work**: For weekly biology coursework
3. **Beatles Weekly Work**: For weekly Beatles discussion tasks`;

        // Add custom templates if they exist
        if (appData.templates && appData.templates.length > 0) {
            const customTemplates = appData.templates.filter(t => t.custom);
            if (customTemplates.length > 0) {
                templateContext += '\n' + customTemplates.map((t, i) => 
                    `${i + 4}. **${t.name}**: Custom template`
                ).join('\n');
        }
        }

        const systemPrompt = `You are an ADHD-friendly task organizer. Parse the user's brain dump into clear, actionable tasks.

${templateContext}

**IMPORTANT RULES:**

1. **For errands/shopping tasks** (grocery, store, pharmacy, post office, gas, etc.):
   - Use location: "errands"
   - Use simple, short names (e.g., "grocery", "pharmacy", "gas")
   - NOT full sentences like "Go to grocery store" or "Pick up prescription"
   - These are stops to make while out

2. **For course-related tasks**, detect the course and include a courseId:
   - Biology/Bio tasks: courseId: "bio"
   - Beatles/Music tasks: courseId: "beatles"
   - History/World History tasks: courseId: "history"
   - Politics/US Politics tasks: courseId: "politics"
   - If no course detected: courseId: null

3. **For all tasks**:
   - Create as individual tasks
   - Determine energy level (high/medium/low)
   - Determine location (home/school/work/anywhere)
   - Estimate time in minutes
   - Include courseId if course-related

**Examples:**

Input: "buy groceries, pick up prescription, Beatles discussion post, study for bio exam"
Output: 
- Task 1: title: "grocery", location: "errands", energy: "medium", timeEstimate: 20, courseId: null
- Task 2: title: "pharmacy", location: "errands", energy: "low", timeEstimate: 10, courseId: null
- Task 3: title: "Beatles discussion post", location: "anywhere", energy: "medium", timeEstimate: 20, courseId: "beatles"
- Task 4: title: "Study for bio exam", location: "school", energy: "high", timeEstimate: 60, courseId: "bio"

Input: "write essay for history, fill up gas tank"
Output:
- Task 1: title: "Write essay for history", location: "home", energy: "high", timeEstimate: 90, courseId: "history"
- Task 2: title: "gas", location: "errands", energy: "low", timeEstimate: 10, courseId: null

Return ONLY valid JSON array of tasks, no other text:
[{"title": "...", "energy": "...", "location": "...", "timeEstimate": 30, "courseId": null}]`;

        const response = await callClaudeAPI([{
            role: 'user',
            content: text
        }], systemPrompt);

        const tasks = JSON.parse(response);
        
        let errandCount = 0;
        let courseTaskCount = 0;
        let regularCount = 0;
        
        tasks.forEach(task => {
            // Track what type of task this is
            if (task.location === 'errands') {
                errandCount++;
            } else if (task.courseId) {
                courseTaskCount++;
            } else {
                regularCount++;
            }
            
            addTask(task);
        });

        closeModal('brainDumpModal');
        document.getElementById('brainDumpText').value = '';
        
        // Show summary of what was created
        let summary = `Created ${tasks.length} task${tasks.length !== 1 ? 's' : ''}:\n`;
        if (errandCount > 0) summary += `\n🏪 ${errandCount} errand${errandCount !== 1 ? 's' : ''}`;
        if (courseTaskCount > 0) summary += `\n🎓 ${courseTaskCount} course task${courseTaskCount !== 1 ? 's' : ''}`;
        if (regularCount > 0) summary += `\n📝 ${regularCount} other task${regularCount !== 1 ? 's' : ''}`;
        
        showToast(summary);
        
        confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.6 }
        });
    } catch (error) {
        console.error('Brain dump error:', error);
        alert('Failed to process brain dump. Check your API configuration.');
    } finally {
        btn.disabled = false;
        btn.textContent = '✨ Organize My Chaos';
    }
}

async function showStuck() {
    const incompleteTasks = appData.tasks.filter(t => !t.completed);
    
    if (incompleteTasks.length === 0) {
        alert('No tasks to help with! Add some tasks first.');
        return;
    }

    const modal = document.getElementById('stuckModal');
    const content = document.getElementById('stuckContent');
    
    content.innerHTML = `
        <p>Select a task you're stuck on:</p>
        <div style="margin: 20px 0;">
            ${incompleteTasks.map(task => `
                <button class="btn btn-secondary" onclick="getStuckHelp('${task.id}')" 
                        style="width: 100%; margin: 5px 0; text-align: left;">
                    ${task.title}
                </button>
            `).join('')}
        </div>
    `;
    
    modal.classList.add('active');
}

async function getStuckHelp(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task) return;

    const content = document.getElementById('stuckContent');
    content.innerHTML = `
        <h3>${task.title}</h3>
        <p>🤔 Breaking this down into tiny steps...</p>
    `;

    try {
        // Find next available time block
        const nextBlock = findNextAvailableBlock(task);
        
        const scheduleContext = nextBlock.available 
            ? `Next available time: ${nextBlock.day} ${nextBlock.time} at ${nextBlock.location} (${nextBlock.duration} minutes available)`
            : 'No clear free time found soon - user may need to make time';
        
        const systemPrompt = `You are an ADHD coach helping break down tasks. The user is stuck on a task.

Task: ${task.title}
Time estimate: ${task.timeEstimate ? task.timeEstimate + ' minutes' : 'not specified'}
Location needed: ${task.location}

${scheduleContext}

Break this down into 2-4 TINY, actionable subtasks. Each step should be:
- Completable in under 15 minutes
- Require zero decision-making
- Be physically actionable
- Build momentum toward completing the parent task

Return ONLY valid JSON array, no other text:
[{"title": "specific action step", "timeEstimate": 10, "energy": "low"}]

Example for "Write essay":
[
  {"title": "Open document and write thesis sentence", "timeEstimate": 5, "energy": "low"},
  {"title": "Write 3 bullet points for intro", "timeEstimate": 10, "energy": "medium"},
  {"title": "Expand bullets into full paragraphs", "timeEstimate": 15, "energy": "medium"}
]`;

        const response = await callClaudeAPI([{
            role: 'user',
            content: `I'm stuck on: ${task.title}`
        }], systemPrompt);

        // Parse the JSON response
        const subtasks = JSON.parse(response);
        
        let scheduleInfo = '';
        if (nextBlock.available) {
            scheduleInfo = `
                <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                    <strong>📅 Your next good time for this:</strong><br>
                    ${nextBlock.day} ${nextBlock.time} at ${nextBlock.location}<br>
                    <small>(${nextBlock.duration} minutes available)</small>
                </div>
            `;
        }

        // Display the breakdown with option to create tasks
        content.innerHTML = `
            <h3>${task.title}</h3>
            ${scheduleInfo}
            <div style="background: var(--bg-main); padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h4 style="margin-bottom: 15px;">🎯 Here's your breakdown:</h4>
                ${subtasks.map((subtask, i) => `
                    <div style="padding: 12px; background: white; border-radius: 8px; margin: 10px 0; border-left: 4px solid var(--primary);">
                        <div style="font-weight: 600; margin-bottom: 5px;">
                            ${i + 1}. ${subtask.title}
                        </div>
                        <div style="font-size: 0.85em; color: var(--text-light);">
                            ⏱️ ${subtask.timeEstimate} min | ⚡ ${subtask.energy} energy
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-success" onclick="createSubtasksFromBreakdown('${task.id}', ${JSON.stringify(subtasks).replace(/"/g, '&quot;')})">
                    ✨ Create These Subtasks
                </button>
                <button class="btn btn-secondary" onclick="closeModal('stuckModal')">
                    Not now
                </button>
            </div>
        `;
    } catch (error) {
        console.error('Stuck help error:', error);
        content.innerHTML = `
            <h3>${task.title}</h3>
            <p style="color: var(--danger);">Failed to get help. Check your API configuration.</p>
            <button class="btn btn-secondary" onclick="closeModal('stuckModal')">Close</button>
        `;
    }
}

function createSubtasksFromBreakdown(parentTaskId, subtasks) {
    const parentTask = appData.tasks.find(t => t.id === parentTaskId);
    if (!parentTask) return;
    
    // Mark parent task as broken down
    parentTask.brokenDown = true;
    parentTask.subtaskIds = [];
    
    // Create each subtask
    subtasks.forEach((subtask, index) => {
        const newTask = {
            title: subtask.title,
            energy: subtask.energy || 'low',
            location: parentTask.location,
            timeEstimate: subtask.timeEstimate || 10,
            parentTaskId: parentTaskId,
            parentTaskTitle: parentTask.title,
            subtaskIndex: index + 1,
            subtaskTotal: subtasks.length,
            courseId: parentTask.courseId || null,
            dueDate: parentTask.dueDate || null
        };
        
        addTask(newTask);
        parentTask.subtaskIds.push(newTask.id);
    });
    
    saveData();
    renderTasks();
    closeModal('stuckModal');
    
    // Show success message
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
    
    showToast(`✅ Created ${subtasks.length} subtasks! Check them off as you go.`);
}

// ===== TEMPLATE MANAGEMENT =====
function createTasksFromTemplate(templateIndex) {
    const template = appData.templates[templateIndex];
    if (!template) {
        alert('Template not found!');
        return;
    }
    
    // Ask for due date
    const dueDateStr = prompt(`When are these ${template.name} tasks due? (YYYY-MM-DD or MM/DD)`);
    if (!dueDateStr) return;
    
    // Parse date
    let dueDate;
    if (dueDateStr.includes('-')) {
        dueDate = dueDateStr; // Already in YYYY-MM-DD format
    } else {
        // Convert MM/DD to YYYY-MM-DD
        const [month, day] = dueDateStr.split('/');
        const year = new Date().getFullYear();
        dueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Create tasks from template
    let createdCount = 0;
    template.tasks.forEach(taskTitle => {
        addTask({
            title: taskTitle,
            energy: 'medium',
            location: template.category === 'History' || template.category === 'Politics' || template.category === 'Bio' || template.category === 'Beatles' ? 'school' : 'anywhere',
            timeEstimate: 30,
            dueDate: dueDate,
            category: template.category
        });
        createdCount++;
    });
    
    // Show success message
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
    
    showToast(`✅ Created ${createdCount} tasks from ${template.name}!`);
}

// ===== TIME ESTIMATE EDITING =====
function editTaskTime(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const currentTime = task.timeEstimate || 30;
    const newTime = prompt(`How long will "${task.title}" take? (in minutes)`, currentTime);
    
    if (newTime === null) return; // User cancelled
    
    const timeNum = parseInt(newTime);
    if (isNaN(timeNum) || timeNum <= 0) {
        alert('Please enter a valid number of minutes (greater than 0)');
        return;
    }
    
    task.timeEstimate = timeNum;
    
    // Update the display
    const timeSpan = document.getElementById(`time-${taskId}`);
    if (timeSpan) {
        timeSpan.textContent = timeNum;
    }
    
    saveData();
    updateDueSoonBanner();
    
    // Crisis Mode removed - replaced with Due Soon banner
    // if (typeof updateCrisisMode === 'function') {
    //     updateCrisisMode();
    // }
    
    showToast(`✅ Updated time estimate to ${timeNum} minutes`);
}

function editDeadlineTime(deadlineId) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (!deadline) return;
    
    const currentTime = deadline.timeEstimate || 45;
    const newTime = prompt(`How long will "${deadline.title}" take? (in minutes)`, currentTime);
    
    if (newTime === null) return; // User cancelled
    
    const timeNum = parseInt(newTime);
    if (isNaN(timeNum) || timeNum <= 0) {
        alert('Please enter a valid number of minutes (greater than 0)');
        return;
    }
    
    deadline.timeEstimate = timeNum;
    
    // Update the display
    const timeSpan = document.getElementById(`deadline-time-${deadlineId}`);
    if (timeSpan) {
        timeSpan.textContent = timeNum;
    }
    
    saveData();
    renderDeadlines();
    updateDueSoonBanner();
    
    // Crisis Mode removed - replaced with Due Soon banner
    // if (typeof updateCrisisMode === 'function') {
    //     updateCrisisMode();
    // }
    
    showToast(`✅ Updated time estimate to ${timeNum} minutes`);
}

// ===== LOCATION MANAGEMENT =====
function setLocation(location) {
    appData.currentLocation = location;
    document.querySelectorAll('.location-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.location === location);
    });
    updateWhatNow();
    saveData();
}

// ===== ENERGY MANAGEMENT =====
function setUserEnergy(energy) {
    appData.userEnergy = energy;
    document.querySelectorAll('.energy-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.energy === energy);
    });
    updateWhatNow();
    saveData();
}

// ===== SETTINGS MANAGEMENT =====
function saveSettings() {
    const workerUrl = document.getElementById('workerUrlInput').value.trim().replace(/\/+$/, '');
    const workerPassword = document.getElementById('workerPasswordInput').value.trim();
    const clientId = document.getElementById('clientIdInput').value.trim();
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const maxWorkMinutes = parseInt(document.getElementById('maxWorkInput').value) || 90;
    
    appData.settings.workerUrl = workerUrl;
    appData.settings.workerPassword = workerPassword;
    appData.settings.clientId = clientId;
    appData.settings.apiKey = apiKey;
    appData.settings.maxDailyWorkMinutes = maxWorkMinutes;
    
    if (workerUrl) CLOUDFLARE_WORKER_URL = workerUrl;
    if (clientId) GOOGLE_CLIENT_ID = clientId;
    
    // Hide warning if configured
    if (workerUrl && clientId) {
        document.getElementById('configWarning').style.display = 'none';
    }
    
    // IMMEDIATE save to localStorage when settings change
    saveToLocalStorage();
    
    // Then save to Drive
    saveData();
    
    showToast('✅ Settings saved!');
}

async function testAPIConnection() {
    const btn = document.getElementById('testApiBtn');
    const resultDiv = document.getElementById('apiTestResult');
    
    // Show loading
    btn.disabled = true;
    btn.textContent = '⏳ Testing...';
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#f0f9ff';
    resultDiv.style.border = '1px solid #3b82f6';
    resultDiv.style.color = '#1e40af';
    resultDiv.innerHTML = 'Testing API connection...';
    
    try {
        // Step 1: Check if settings exist
        console.log('🔧 [API TEST] Step 1: Checking settings...');
        console.log('🔧 [API TEST] Worker URL:', appData.settings?.workerUrl || 'NOT SET');
        console.log('🔧 [API TEST] Worker Password exists:', !!appData.settings?.workerPassword);
        console.log('🔧 [API TEST] API Key exists:', !!appData.settings?.apiKey);
        console.log('🔧 [API TEST] API Key starts with sk-ant-:', appData.settings?.apiKey?.startsWith('sk-ant-'));
        
        if (!appData.settings?.workerUrl) {
            throw new Error('Worker URL not configured');
        }
        
        if (!appData.settings?.workerPassword) {
            throw new Error('Worker Password not configured');
        }
        
        if (!appData.settings?.apiKey) {
            throw new Error('API Key not configured');
        }
        
        if (!appData.settings.apiKey.startsWith('sk-ant-')) {
            throw new Error('API Key format invalid (should start with sk-ant-)');
        }
        
        resultDiv.innerHTML = '✅ Settings validated<br>🔄 Making test API call...';
        
        // Step 2: Make a simple test call
        console.log('🔧 [API TEST] Step 2: Making test API call...');
        
        const response = await callClaudeAPI([{
            role: 'user',
            content: 'Reply with just the word "SUCCESS" and nothing else.'
        }], 'You are a test bot. Reply with exactly the word SUCCESS.');
        
        console.log('🔧 [API TEST] Response:', response);
        
        // Step 3: Check response
        if (response && response.toLowerCase().includes('success')) {
            resultDiv.style.background = '#f0fdf4';
            resultDiv.style.border = '1px solid #22c55e';
            resultDiv.style.color = '#15803d';
            resultDiv.innerHTML = `
                ✅ <strong>API Connection Successful!</strong><br>
                <small>Worker URL: ${appData.settings.workerUrl}</small><br>
                <small>API Response: "${response}"</small>
            `;
            
            showToast('✅ API connection working!');
        } else {
            throw new Error(`Unexpected response: ${response}`);
        }
        
    } catch (error) {
        console.error('❌ [API TEST] Failed:', error);
        
        resultDiv.style.background = '#fef2f2';
        resultDiv.style.border = '1px solid #ef4444';
        resultDiv.style.color = '#991b1b';
        resultDiv.innerHTML = `
            ❌ <strong>API Test Failed</strong><br>
            <small>${error.message}</small><br>
            <small>Check console for details (F12)</small>
        `;
        
        // Show detailed error info in console
        console.log('🔧 [API TEST] Detailed Error Info:');
        console.log('- Worker URL:', appData.settings?.workerUrl);
        console.log('- Worker Password length:', appData.settings?.workerPassword?.length || 0);
        console.log('- API Key prefix:', appData.settings?.apiKey?.substring(0, 10) || 'NOT SET');
        console.log('- CLOUDFLARE_WORKER_URL global:', CLOUDFLARE_WORKER_URL);
        console.log('- Error stack:', error.stack);
    } finally {
        btn.disabled = false;
        btn.textContent = '🔧 Test API Connection';
    }
}

// ===== DONE FOR TODAY FEATURE =====
function handleDoneForToday() {
    const incompleteTasks = appData.tasks.filter(t => !t.completed);
    
    if (incompleteTasks.length === 0) {
        showToast('🎉 You already finished everything!');
        return;
    }
    
    // Show confirmation modal
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>😴 Call it a day?</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <p style="margin-bottom: 20px;">You have ${incompleteTasks.length} incomplete task${incompleteTasks.length > 1 ? 's' : ''}. Move them all to tomorrow?</p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="moveTasksToTomorrow(${JSON.stringify(incompleteTasks.map(t => t.id))}); this.closest('.modal').remove();">
                    Yes, move ${incompleteTasks.length} task${incompleteTasks.length > 1 ? 's' : ''}
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove();">
                    Cancel
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function moveTasksToTomorrow(taskIds) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    taskIds.forEach(taskId => {
        const task = appData.tasks.find(t => t.id === taskId);
        if (task && !task.completed) {
            task.movedToTomorrow = true;
            task.originalDueDate = task.dueDate;
            task.dueDate = tomorrowStr;
        }
    });
    
    saveData();
    renderTasks();
    showCelebration();
}

function showCelebration() {
    const completedToday = appData.tasks.filter(t => 
        t.completed && 
        t.completedAt && 
        isToday(new Date(t.completedAt))
    );
    
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>✨ Great Work Today!</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="celebration-stats">
                <h3 style="color: var(--primary); margin-bottom: 15px;">You completed ${completedToday.length} task${completedToday.length !== 1 ? 's' : ''} today!</h3>
                ${completedToday.length > 0 ? `
                    <ul style="list-style: none; padding: 0; margin: 20px 0;">
                        ${completedToday.map(t => `<li style="padding: 8px; background: var(--bg-main); margin: 5px 0; border-radius: 6px;">✓ ${t.title}</li>`).join('')}
                    </ul>
                ` : ''}
                <p style="color: var(--text-light); font-style: italic; margin-top: 20px;">Rest up - tomorrow is a fresh start! 🌟</p>
            </div>
            <button class="btn btn-primary" onclick="this.closest('.modal').remove();" style="margin-top: 20px;">
                Thanks! 😊
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

// ===== DUE SOON BANNER SYSTEM =====
let countdownInterval = null;

function updateDueSoonBanner() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Find the most urgent item
    let mostUrgent = null;
    let shortestTime = Infinity;
    
    [...(appData.tasks || []), ...(appData.deadlines || [])]
        .filter(item => !item.completed && item.dueDate)
        .forEach(item => {
            const dueDate = new Date(item.dueDate);
            const timeUntil = dueDate - now;
            
            // Only show if due within 24 hours and not past due
            if (timeUntil > 0 && timeUntil < 24 * 60 * 60 * 1000) {
                if (timeUntil < shortestTime) {
                    shortestTime = timeUntil;
                    mostUrgent = {
                        title: item.title,
                        dueDate: dueDate,
                        timeEstimate: item.timeEstimate || 30
                    };
                }
            }
        });
    
    const banner = document.getElementById('dueSoonBanner');
    const content = document.getElementById('dueSoonContent');
    const timer = document.getElementById('countdownTimer');
    
    if (mostUrgent) {
        // Show banner
        banner.style.display = 'block';
        
        // Set content
        content.innerHTML = `⚠️ DUE SOON: ${mostUrgent.title} (${mostUrgent.timeEstimate} min estimated)`;
        
        // Clear old interval if exists
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        
        // Update countdown every second
        const updateCountdown = () => {
            const now = new Date();
            const timeLeft = mostUrgent.dueDate - now;
            
            if (timeLeft <= 0) {
                timer.textContent = "⏰ OVERDUE!";
                timer.style.color = '#ff6b6b';
                clearInterval(countdownInterval);
                return;
            }
            
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
            
            timer.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // Change color based on urgency
            if (hours < 1) {
                timer.style.color = '#ff6b6b'; // Red when less than 1 hour
            } else if (hours < 6) {
                timer.style.color = '#ffd93d'; // Yellow when less than 6 hours
            } else {
                timer.style.color = 'white'; // White otherwise
            }
        };
        
        updateCountdown(); // Initial call
        countdownInterval = setInterval(updateCountdown, 1000); // Update every second
        
    } else {
        // Hide banner if nothing urgent
        banner.style.display = 'none';
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }
}

// ===== CLEAR ALL FUNCTIONS =====
function clearAllDeadlines() {
    if (!appData.deadlines || appData.deadlines.length === 0) {
        showToast('No deadlines to clear!');
        return;
    }
    
    const count = appData.deadlines.length;
    if (confirm(`⚠️ Clear ALL ${count} deadline${count !== 1 ? 's' : ''}? This will also delete all related tasks.\n\nThis cannot be undone.`)) {
        // Get deadline IDs before clearing
        const deadlineIds = appData.deadlines.map(d => d.id);
        
        // Clear deadlines
        appData.deadlines = [];
        
        // Clear tasks related to these deadlines
        appData.tasks = appData.tasks.filter(t => !deadlineIds.includes(t.parentDeadline));
        
        saveData();
        renderDeadlines();
        renderTasks();
        showToast(`✅ Cleared ${count} deadline${count !== 1 ? 's' : ''}`);
    }
}

function clearAllTasks() {
    if (!appData.tasks || appData.tasks.length === 0) {
        showToast('No tasks to clear!');
        return;
    }
    
    const count = appData.tasks.length;
    if (confirm(`⚠️ Clear ALL ${count} task${count !== 1 ? 's' : ''}?\n\nThis cannot be undone.`)) {
        appData.tasks = [];
        saveData();
        renderTasks();
        updateWhatNow();
        showToast(`✅ Cleared ${count} task${count !== 1 ? 's' : ''}`);
    }
}

function clearAllProjects() {
    if (!appData.projects || appData.projects.length === 0) {
        showToast('No projects to clear!');
        return;
    }
    
    const count = appData.projects.length;
    if (confirm(`⚠️ Clear ALL ${count} project${count !== 1 ? 's' : ''}?\n\nThis cannot be undone.`)) {
        appData.projects = [];
        saveData();
        renderProjects();
        showToast(`✅ Cleared ${count} project${count !== 1 ? 's' : ''}`);
    }
}

function clearAllErrands() {
    const errandTasks = appData.tasks.filter(t => t.location === 'errands');
    
    if (errandTasks.length === 0) {
        showToast('No errands to clear!');
        return;
    }
    
    const count = errandTasks.length;
    if (confirm(`⚠️ Clear ALL ${count} errand${count !== 1 ? 's' : ''}?\n\nThis cannot be undone.`)) {
        appData.tasks = appData.tasks.filter(t => t.location !== 'errands');
        saveData();
        renderTasks();
        updateWhatNow();
        showToast(`✅ Cleared ${count} errand${count !== 1 ? 's' : ''}`);
    }
}

function clearDailySchedule() {
    if (!appData.schedule || Object.keys(appData.schedule).length === 0) {
        showToast('Schedule is already empty!');
        return;
    }
    
    // Count total blocks
    let totalBlocks = 0;
    Object.values(appData.schedule).forEach(day => {
        totalBlocks += day.length;
    });
    
    if (totalBlocks === 0) {
        showToast('Schedule is already empty!');
        return;
    }
    
    if (confirm(`⚠️ Clear your ENTIRE weekly schedule (${totalBlocks} time blocks)?\n\nThis cannot be undone.`)) {
        appData.schedule = {
            Monday: [],
            Tuesday: [],
            Wednesday: [],
            Thursday: [],
            Friday: [],
            Saturday: [],
            Sunday: []
        };
        saveData();
        renderDailySchedule();
        showToast(`✅ Cleared schedule (${totalBlocks} blocks removed)`);
    }
}
