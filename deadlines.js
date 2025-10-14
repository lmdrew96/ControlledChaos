// deadlines.js - Deadline management functions

// ===== DEADLINE CRUD OPERATIONS =====
function addDeadline(title, dueDate, dueTime = '23:59') {
    // If dueDate already includes time (ISO format), use it as-is
    // Otherwise, append the time to create full datetime
    let fullDueDate;
    if (dueDate.includes('T')) {
        fullDueDate = dueDate; // Already has time
    } else {
        fullDueDate = dueDate + 'T' + dueTime + ':00'; // Add time
    }
    
    const deadline = {
        id: Date.now().toString(),
        title: title,
        dueDate: fullDueDate,
        createdAt: new Date().toISOString(),
        completed: false
    };
    
    appData.deadlines.push(deadline);
    saveData();
    renderDeadlines();
    updateDueSoonBanner();
    
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
    
    // Create a modal with date AND time inputs
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'addDeadlineModal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>➕ Add Deadline</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            
            <div class="form-group">
                <label for="deadlineTitle">What's the deadline for? *</label>
                <input type="text" 
                       id="deadlineTitle" 
                       value="${quickText}"
                       placeholder="e.g., Biology Lab Report"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div class="form-group">
                <label for="deadlineDate">Due Date *</label>
                <input type="date" 
                       id="deadlineDate" 
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div class="form-group">
                <label for="deadlineTime">Due Time</label>
                <input type="time" 
                       id="deadlineTime" 
                       value="23:59"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                <small style="color: var(--text-light); display: block; margin-top: 5px;">
                    Defaults to 11:59 PM if not specified
                </small>
            </div>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" id="saveDeadlineBtn">
                    ✅ Add Deadline
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove();">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners
    const saveBtn = document.getElementById('saveDeadlineBtn');
    const titleInput = document.getElementById('deadlineTitle');
    const dateInput = document.getElementById('deadlineDate');
    const timeInput = document.getElementById('deadlineTime');
    
    saveBtn.addEventListener('click', () => {
        const title = titleInput.value.trim();
        const date = dateInput.value;
        const time = timeInput.value || '23:59';
        
        if (!title) {
            alert('Please enter a title for the deadline');
            return;
        }
        
        if (!date) {
            alert('Please select a due date');
            return;
        }
        
        addDeadline(title, date, time);
        modal.remove();
        if (quickInput) quickInput.value = '';
    });
    
    // Focus title input
    setTimeout(() => titleInput.focus(), 100);
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

// ===== DEADLINE BREAKDOWN FEATURES =====
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

// ===== DEADLINE EDITING =====
function editDeadlineTitle(deadlineId, newTitle) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (!deadline || !newTitle.trim()) return;
    
    deadline.title = newTitle.trim();
    saveData();
    renderDeadlines();
    showToast('✏️ Deadline title updated');
}

function editDeadlineDateTime(deadlineId) {
    const deadline = appData.deadlines.find(d => d.id === deadlineId);
    if (!deadline) return;
    
    // Parse current date/time
    const currentDate = new Date(deadline.dueDate);
    const dateStr = currentDate.toISOString().split('T')[0];
    const timeStr = currentDate.toTimeString().slice(0, 5);
    
    // Prompt for new date
    const newDateStr = prompt('Due date (YYYY-MM-DD):', dateStr);
    if (!newDateStr) return;
    
    // Prompt for new time
    const newTimeStr = prompt('Due time (HH:MM, 24-hour format):', timeStr);
    if (!newTimeStr) return;
    
    // Update deadline
    deadline.dueDate = `${newDateStr}T${newTimeStr}:00`;
    saveData();
    renderDeadlines();
    updateDueSoonBanner();
    showToast('📅 Deadline date/time updated');
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

function formatDeadlineDate(dueDateStr) {
    const date = new Date(dueDateStr);
    const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeFormatted = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateFormatted} at ${timeFormatted}`;
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

// ===== CLEAR ALL DEADLINES =====
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
