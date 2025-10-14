// tasks.js - Task management functions

// ===== TASK CRUD OPERATIONS =====
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

// ===== TASK EDITING =====
function editTaskTitle(taskId, newTitle) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task || !newTitle.trim()) return;
    
    task.title = newTitle.trim();
    saveData();
    renderTasks();
    showToast('✏️ Task title updated');
}

function cycleTaskEnergy(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const energyLevels = ['low', 'medium', 'high'];
    const currentIndex = energyLevels.indexOf(task.energy);
    const nextIndex = (currentIndex + 1) % energyLevels.length;
    
    task.energy = energyLevels[nextIndex];
    saveData();
    renderTasks();
    showToast(`⚡ Energy: ${task.energy}`);
}

function cycleTaskLocation(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const locations = ['anywhere', 'home', 'school', 'work', 'errands'];
    const currentIndex = locations.indexOf(task.location);
    const nextIndex = (currentIndex + 1) % locations.length;
    
    task.location = locations[nextIndex];
    saveData();
    renderTasks();
    updateWhatNow();
    showToast(`📍 Location: ${task.location}`);
}

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

// ===== UTILITY FUNCTIONS =====
function getErrandTasks() {
    return appData.tasks.filter(t => t.location === 'errands' && !t.completed);
}
