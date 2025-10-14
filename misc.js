// misc.js - Miscellaneous utility functions

// ===== LOCATION & ENERGY =====
function setLocation(location) {
    appData.currentLocation = location;
    document.querySelectorAll('.location-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.location === location);
    });
    updateWhatNow();
    saveData();
}

function setUserEnergy(energy) {
    appData.userEnergy = energy;
    document.querySelectorAll('.energy-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.energy === energy);
    });
    updateWhatNow();
    saveData();
}

// ===== DONE FOR TODAY =====
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

// ===== MOOD TRACKER TOGGLE =====
function toggleMoodTracker() {
    const checkbox = document.getElementById('moodTrackerEnabled');
    const isEnabled = checkbox.checked;
    
    // Save preference to localStorage
    localStorage.setItem('moodTrackerEnabled', isEnabled ? 'true' : 'false');
    
    // Get mood tracker buttons
    const quickMoodBtn = Array.from(document.querySelectorAll('.header-buttons .btn')).find(btn => 
        btn.getAttribute('onclick')?.includes('QuickCheck.showWidget')
    );
    const moodPatternsBtn = Array.from(document.querySelectorAll('.header-buttons .btn')).find(btn => 
        btn.getAttribute('onclick')?.includes('MoodTracker.showVisualization')
    );
    
    // Show or hide buttons
    if (quickMoodBtn) {
        quickMoodBtn.style.display = isEnabled ? '' : 'none';
    }
    if (moodPatternsBtn) {
        moodPatternsBtn.style.display = isEnabled ? '' : 'none';
    }
    
    // Show toast notification
    showToast(isEnabled ? '💜 Mood Tracker enabled' : '💜 Mood Tracker disabled');
}

function initializeMoodTrackerToggle() {
    // Check localStorage for saved preference (default to enabled)
    const isEnabled = localStorage.getItem('moodTrackerEnabled') !== 'false';
    
    // Set checkbox state
    const checkbox = document.getElementById('moodTrackerEnabled');
    if (checkbox) {
        checkbox.checked = isEnabled;
    }
    
    // Get mood tracker buttons
    const quickMoodBtn = Array.from(document.querySelectorAll('.header-buttons .btn')).find(btn => 
        btn.getAttribute('onclick')?.includes('QuickCheck.showWidget')
    );
    const moodPatternsBtn = Array.from(document.querySelectorAll('.header-buttons .btn')).find(btn => 
        btn.getAttribute('onclick')?.includes('MoodTracker.showVisualization')
    );
    
    // Show or hide buttons based on preference
    if (quickMoodBtn) {
        quickMoodBtn.style.display = isEnabled ? '' : 'none';
    }
    if (moodPatternsBtn) {
        moodPatternsBtn.style.display = isEnabled ? '' : 'none';
    }
}

// ===== SETTINGS =====
async function saveSettings() {
    const clientId = document.getElementById('clientIdInput').value.trim();
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const maxWorkMinutes = parseInt(document.getElementById('maxWorkInput').value) || 90;
    
    // Update appData.settings
    appData.settings.clientId = clientId;
    appData.settings.apiKey = apiKey;
    appData.settings.maxDailyWorkMinutes = maxWorkMinutes;
    
    // Save auto-import settings
    if (typeof saveAutoImportSettings === 'function') {
        saveAutoImportSettings();
    }
    
    // Update global variables
    if (clientId) GOOGLE_CLIENT_ID = clientId;
    
    // Hide warning if configured
    if (clientId && apiKey) {
        document.getElementById('configWarning').style.display = 'none';
    }
    
    // IMMEDIATE save to localStorage when settings change
    saveToLocalStorage();
    
    // Show syncing indicator
    updateSyncIndicator('syncing');
    
    // Save encrypted settings to Drive if signed in
    if (isDriveAvailable() && userEmail) {
        try {
            const success = await saveSettingsToDrive();
            if (success) {
                showToast('⚡ Settings saved and synced!');
                
                // Show confetti for first-time setup
                if (!localStorage.getItem('firstSyncComplete')) {
                    confetti({
                        particleCount: 150,
                        spread: 100,
                        origin: { y: 0.6 }
                    });
                    localStorage.setItem('firstSyncComplete', 'true');
                }
            } else {
                updateSyncIndicator('local');
                showToast('💾 Settings saved locally (Drive sync failed)');
            }
        } catch (error) {
            console.error('❌ Failed to sync settings:', error);
            updateSyncIndicator('local');
            showToast('💾 Settings saved locally only');
        }
    } else {
        updateSyncIndicator('local');
        showToast('💾 Settings saved locally (sign in to sync)');
    }
    
    // Also save full data to Drive (tasks, deadlines, etc.)
    saveData();
}

// ===== MORE MENU HANDLERS =====
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
    if (tabName === 'settings') {
        if (typeof populateSettingsInputs === 'function') {
            populateSettingsInputs();
        }
        if (typeof renderCourseMappings === 'function') {
            renderCourseMappings();
        }
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

// ===== CLEAR ALL FUNCTIONS =====
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
