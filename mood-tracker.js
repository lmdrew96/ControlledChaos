// ===== BIPOLAR 2 MOOD TRACKING SYSTEM =====
// Privacy-first, ADHD-friendly mood tracking for mental health management

// ===== DATA STRUCTURE =====
const MoodTracker = {
    // Check-in data storage
    checkIns: [],
    lastMorningCheckIn: null,
    lastEveningCheckIn: null,
    lastPatternAlert: null,
    
    // Settings
    settings: {
        enableNotifications: true,
        privacyMode: false
    },
    
    // Initialize from localStorage
    init() {
        const saved = localStorage.getItem('moodTrackingData');
        if (saved) {
            const data = JSON.parse(saved);
            this.checkIns = data.checkIns || [];
            this.lastMorningCheckIn = data.lastMorningCheckIn;
            this.lastEveningCheckIn = data.lastEveningCheckIn;
            this.lastPatternAlert = data.lastPatternAlert;
            this.settings = data.settings || this.settings;
        }
        
        // Start monitoring
        this.startMonitoring();
    },
    
    // Save to localStorage
    save() {
        const data = {
            checkIns: this.checkIns,
            lastMorningCheckIn: this.lastMorningCheckIn,
            lastEveningCheckIn: this.lastEveningCheckIn,
            lastPatternAlert: this.lastPatternAlert,
            settings: this.settings
        };
        localStorage.setItem('moodTrackingData', JSON.stringify(data));
        
        // Also sync to Drive if available
        if (typeof saveData === 'function') {
            if (!appData.moodTracking) {
                appData.moodTracking = {};
            }
            appData.moodTracking = data;
            saveData();
        }
    },
    
    // Start monitoring for check-in triggers
    startMonitoring() {
        // Check if activity monitoring is enabled
        const activityMonitoringEnabled = localStorage.getItem('activityMonitoringEnabled') !== 'false';
        
        // Check for evening reflection and post-intense activities every minute
        setInterval(() => {
            this.checkEveningReflection();
            if (activityMonitoringEnabled) {
                this.checkPostIntenseActivity();
            }
        }, 60 * 1000); // Check every minute
        
        // Initial check after 5 seconds
        setTimeout(() => {
            this.checkEveningReflection();
            if (activityMonitoringEnabled) {
                this.checkPostIntenseActivity();
            }
        }, 5000);
        
        // Also check when page becomes visible (if user had app open in background)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && activityMonitoringEnabled) {
                this.checkPostIntenseActivity();
            }
        });
    },
    
    // ===== PHASE 1: CORE CHECK-INS =====
    
    // 1. Morning Start Check-In
    showMorningCheckIn() {
        const today = new Date().toISOString().split('T')[0];
        
        // Don't show if already done today
        if (this.lastMorningCheckIn === today) {
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>☀️ Good morning! Quick start:</h2>
                </div>
                
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="checkbox" id="morningMeds" style="width: 24px; height: 24px;">
                        <span style="font-size: 1.1em;">Took my meds</span>
                    </label>
                </div>
                
                <div class="form-group">
                    <label>Sleep last night:</label>
                    <div style="margin: 10px 0;">
                        <label style="font-size: 0.9em; color: var(--text-light);">Hours:</label>
                        <input type="range" id="sleepHours" min="0" max="12" value="7" step="0.5" 
                               style="width: 100%;" oninput="document.getElementById('sleepHoursDisplay').textContent = this.value">
                        <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: var(--text-light); margin-top: 5px;">
                            <span>0</span>
                            <span id="sleepHoursDisplay" style="font-weight: 600; color: var(--primary);">7</span>
                            <span>12</span>
                        </div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Quality:</label>
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
                        <button class="mood-btn sleep-quality-btn" data-quality="restless" 
                                style="flex: 1; padding: 15px; font-size: 1.5em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">
                            😴<br><span style="font-size: 0.6em;">restless</span>
                        </button>
                        <button class="mood-btn sleep-quality-btn" data-quality="okay" 
                                style="flex: 1; padding: 15px; font-size: 1.5em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">
                            😐<br><span style="font-size: 0.6em;">okay</span>
                        </button>
                        <button class="mood-btn sleep-quality-btn" data-quality="good" 
                                style="flex: 1; padding: 15px; font-size: 1.5em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">
                            😌<br><span style="font-size: 0.6em;">good</span>
                        </button>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="MoodTracker.skipMorningCheckIn()">Skip</button>
                    <button class="btn btn-primary" onclick="MoodTracker.saveMorningCheckIn()" style="flex: 1;">Save →</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add click handlers for quality buttons
        modal.querySelectorAll('.sleep-quality-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                modal.querySelectorAll('.sleep-quality-btn').forEach(b => {
                    b.style.borderColor = 'var(--border)';
                    b.style.background = 'white';
                });
                this.style.borderColor = 'var(--primary)';
                this.style.background = 'rgba(102, 126, 234, 0.1)';
                this.dataset.selected = 'true';
            });
        });
    },
    
    saveMorningCheckIn() {
        const medicationTaken = document.getElementById('morningMeds').checked;
        const sleepHours = parseFloat(document.getElementById('sleepHours').value);
        const selectedQuality = document.querySelector('.sleep-quality-btn[data-selected="true"]');
        const sleepQuality = selectedQuality ? selectedQuality.dataset.quality : 'okay';
        
        const checkIn = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            checkInType: 'morning',
            medicationTaken,
            sleepHours,
            sleepQuality
        };
        
        this.checkIns.push(checkIn);
        this.lastMorningCheckIn = new Date().toISOString().split('T')[0];
        this.save();
        
        // Close modal
        document.querySelector('.mood-check-in-modal').remove();
        
        // Show success message
        this.showToast('✓ Logged! Have a great day 💜');
        
        // Run pattern detection
        this.detectPatterns();
    },
    
    skipMorningCheckIn() {
        document.querySelector('.mood-check-in-modal').remove();
        
        // Offer one retry later (30 minutes)
        setTimeout(() => {
            const today = new Date().toISOString().split('T')[0];
            if (this.lastMorningCheckIn !== today) {
                this.showMorningCheckIn();
            }
        }, 30 * 60 * 1000);
    },
    
    // 2. Task Completion Micro-Check
    showTaskCompletionCheck(taskId) {
        // Create inline check-in (not a modal)
        const container = document.createElement('div');
        container.className = 'task-completion-check';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            padding: 20px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 1500;
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
        `;
        
        container.innerHTML = `
            <div style="margin-bottom: 15px; font-weight: 600;">✓ Task completed!</div>
            <div style="margin-bottom: 10px; color: var(--text-light);">Energy right now:</div>
            <div style="display: flex; gap: 8px; justify-content: space-between;">
                <button class="energy-btn" data-energy="1" style="flex: 1; padding: 12px; font-size: 1.8em; border: 2px solid var(--border); background: white; border-radius: 8px; cursor: pointer;">💤</button>
                <button class="energy-btn" data-energy="2" style="flex: 1; padding: 12px; font-size: 1.8em; border: 2px solid var(--border); background: white; border-radius: 8px; cursor: pointer;">😴</button>
                <button class="energy-btn" data-energy="3" style="flex: 1; padding: 12px; font-size: 1.8em; border: 2px solid var(--border); background: white; border-radius: 8px; cursor: pointer;">😐</button>
                <button class="energy-btn" data-energy="4" style="flex: 1; padding: 12px; font-size: 1.8em; border: 2px solid var(--border); background: white; border-radius: 8px; cursor: pointer;">⚡</button>
                <button class="energy-btn" data-energy="5" style="flex: 1; padding: 12px; font-size: 1.8em; border: 2px solid var(--border); background: white; border-radius: 8px; cursor: pointer;">🚀</button>
            </div>
            <button class="btn btn-secondary" onclick="this.closest('.task-completion-check').remove()" 
                    style="width: 100%; margin-top: 15px; font-size: 0.9em;">Skip this</button>
        `;
        
        document.body.appendChild(container);
        
        // Add click handlers
        container.querySelectorAll('.energy-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const energyLevel = parseInt(this.dataset.energy);
                MoodTracker.saveTaskCompletionCheck(taskId, energyLevel);
                container.remove();
            });
        });
        
        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (container.parentNode) {
                container.remove();
            }
        }, 10000);
    },
    
    saveTaskCompletionCheck(taskId, energyLevel) {
        const checkIn = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            checkInType: 'task-completion',
            energyLevel,
            taskCompleted: taskId
        };
        
        this.checkIns.push(checkIn);
        this.save();
        
        // Run pattern detection
        this.detectPatterns();
    },
    
    // 3. Post-Intense Activity Check-In with Automatic Detection
    checkPostIntenseActivity() {
        const now = new Date();
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        // Define intense activities with their end times and check windows
        const intenseActivities = [
            { day: 'Tuesday', endTime: 16 * 60, name: 'Therapy', checkWindow: 15 },
            { day: 'Thursday', endTime: 19 * 60, name: 'Bio class', checkWindow: 15 },
            { day: 'Friday', endTime: 22 * 60, name: 'Work', checkWindow: 15 },
            { day: 'Saturday', endTime: 22 * 60, name: 'Work', checkWindow: 15 },
            { day: 'Sunday', endTime: 20 * 60, name: 'D&D game', checkWindow: 30 }
        ];
        
        // Find matching activity
        const matchingActivity = intenseActivities.find(activity => {
            if (activity.day !== currentDay) return false;
            
            // Check if we're within the check window
            const windowEndTime = activity.endTime + activity.checkWindow;
            return currentTime >= activity.endTime && currentTime <= windowEndTime;
        });
        
        if (matchingActivity) {
            // Check if we've already shown this check-in today
            const lastCheckInKey = `lastPostIntenseCheckIn_${matchingActivity.day}_${matchingActivity.name}`;
            const lastCheckInDate = localStorage.getItem(lastCheckInKey);
            const todayDateString = now.toDateString();
            
            if (lastCheckInDate !== todayDateString) {
                // Check if modal is already open
                if (!document.querySelector('.mood-check-in-modal')) {
                    // Show the check-in and mark as shown
                    this.showPostIntenseCheckIn(matchingActivity.name);
                    localStorage.setItem(lastCheckInKey, todayDateString);
                }
            }
        }
    },
    
    hasCompletedCheckInRecently(type, minutes) {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        return this.checkIns.some(c => 
            c.checkInType === type && 
            new Date(c.timestamp) > cutoff
        );
    },
    
    showPostIntenseCheckIn(activityName) {
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>🏋️ How was ${activityName}?</h2>
                </div>
                
                <div class="form-group">
                    <label>Mood:</label>
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
                        <button class="mood-btn mood-select-btn" data-mood="1" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😔</button>
                        <button class="mood-btn mood-select-btn" data-mood="2" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😐</button>
                        <button class="mood-btn mood-select-btn" data-mood="3" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😊</button>
                        <button class="mood-btn mood-select-btn" data-mood="4" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😃</button>
                        <button class="mood-btn mood-select-btn" data-mood="5" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">🤩</button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Energy:</label>
                    <div style="margin: 10px 0;">
                        <input type="range" id="postIntenseEnergy" min="1" max="5" value="3" step="1" 
                               style="width: 100%;" oninput="document.getElementById('energyDisplay').textContent = ['💤', '😴', '😐', '⚡', '🚀'][this.value - 1]">
                        <div style="display: flex; justify-content: space-between; font-size: 1.5em; margin-top: 5px;">
                            <span>💤</span>
                            <span id="energyDisplay">😐</span>
                            <span>🚀</span>
                        </div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Quick note? (optional)</label>
                    <textarea id="postIntenseNote" placeholder="How are you feeling?" 
                              style="width: 100%; padding: 12px; border: 2px solid var(--border); border-radius: 8px; min-height: 80px; resize: vertical;"></textarea>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="document.querySelector('.mood-check-in-modal').remove()">Skip</button>
                    <button class="btn btn-primary" onclick="MoodTracker.savePostIntenseCheckIn('${activityName}')" style="flex: 1;">Save</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add click handlers for mood buttons
        modal.querySelectorAll('.mood-select-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                modal.querySelectorAll('.mood-select-btn').forEach(b => {
                    b.style.borderColor = 'var(--border)';
                    b.style.background = 'white';
                });
                this.style.borderColor = 'var(--primary)';
                this.style.background = 'rgba(102, 126, 234, 0.1)';
                this.dataset.selected = 'true';
            });
        });
    },
    
    savePostIntenseCheckIn(activityName) {
        const selectedMood = document.querySelector('.mood-select-btn[data-selected="true"]');
        if (!selectedMood) {
            this.showToast('⚠️ Please select your mood');
            return;
        }
        
        const mood = parseInt(selectedMood.dataset.mood);
        const energyLevel = parseInt(document.getElementById('postIntenseEnergy').value);
        const note = document.getElementById('postIntenseNote').value.trim() || null;
        
        const checkIn = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            checkInType: 'post-intense',
            mood,
            energyLevel,
            activity: activityName,
            note
        };
        
        this.checkIns.push(checkIn);
        this.save();
        
        document.querySelector('.mood-check-in-modal').remove();
        this.showToast('✓ Check-in saved 💜');
        
        // Run pattern detection
        this.detectPatterns();
    },
    
    // 4. Evening Reflection
    checkEveningReflection() {
        const now = new Date();
        const hour = now.getHours();
        const today = now.toISOString().split('T')[0];
        
        // Only show after 7pm and if not done today
        if (hour >= 19 && this.lastEveningCheckIn !== today) {
            this.showEveningReflection();
        }
    },
    
    showEveningReflection() {
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>🌙 Quick end-of-day reflection</h2>
                </div>
                
                <div class="form-group">
                    <label>Overall mood today:</label>
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
                        <button class="mood-btn evening-mood-btn" data-mood="1" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😔</button>
                        <button class="mood-btn evening-mood-btn" data-mood="2" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😐</button>
                        <button class="mood-btn evening-mood-btn" data-mood="3" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😊</button>
                        <button class="mood-btn evening-mood-btn" data-mood="4" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😃</button>
                        <button class="mood-btn evening-mood-btn" data-mood="5" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">🤩</button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Overall energy today:</label>
                    <div style="margin: 10px 0;">
                        <input type="range" id="eveningEnergy" min="1" max="5" value="3" step="1" 
                               style="width: 100%;" oninput="document.getElementById('eveningEnergyDisplay').textContent = ['💤', '😴', '😐', '⚡', '🚀'][this.value - 1]">
                        <div style="display: flex; justify-content: space-between; font-size: 1.5em; margin-top: 5px;">
                            <span>💤</span>
                            <span id="eveningEnergyDisplay">😐</span>
                            <span>🚀</span>
                        </div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Any warning signs today?</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; background: var(--bg-main); border-radius: 6px;">
                            <input type="checkbox" class="warning-flag" value="racing">
                            <span>Racing thoughts</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; background: var(--bg-main); border-radius: 6px;">
                            <input type="checkbox" class="warning-flag" value="irritable">
                            <span>Irritability</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; background: var(--bg-main); border-radius: 6px;">
                            <input type="checkbox" class="warning-flag" value="impulsive">
                            <span>Impulsivity</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; background: var(--bg-main); border-radius: 6px;">
                            <input type="checkbox" class="warning-flag" value="substances">
                            <span>Alcohol/substances</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; background: var(--bg-main); border-radius: 6px; grid-column: 1 / -1;">
                            <input type="checkbox" class="warning-flag" value="none">
                            <span>None - feeling stable ✓</span>
                        </label>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Quick note about today? (optional)</label>
                    <textarea id="eveningNote" placeholder="Anything worth remembering?" 
                              style="width: 100%; padding: 12px; border: 2px solid var(--border); border-radius: 8px; min-height: 80px; resize: vertical;"></textarea>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="MoodTracker.skipEveningReflection()">Skip</button>
                    <button class="btn btn-primary" onclick="MoodTracker.saveEveningReflection()" style="flex: 1;">Save</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add click handlers for mood buttons
        modal.querySelectorAll('.evening-mood-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                modal.querySelectorAll('.evening-mood-btn').forEach(b => {
                    b.style.borderColor = 'var(--border)';
                    b.style.background = 'white';
                });
                this.style.borderColor = 'var(--primary)';
                this.style.background = 'rgba(102, 126, 234, 0.1)';
                this.dataset.selected = 'true';
            });
        });
        
        // Handle "None - feeling stable" checkbox
        const noneCheckbox = modal.querySelector('.warning-flag[value="none"]');
        const otherCheckboxes = Array.from(modal.querySelectorAll('.warning-flag:not([value="none"])'));
        
        noneCheckbox.addEventListener('change', function() {
            if (this.checked) {
                otherCheckboxes.forEach(cb => cb.checked = false);
            }
        });
        
        otherCheckboxes.forEach(cb => {
            cb.addEventListener('change', function() {
                if (this.checked) {
                    noneCheckbox.checked = false;
                }
            });
        });
    },
    
    saveEveningReflection() {
        const selectedMood = document.querySelector('.evening-mood-btn[data-selected="true"]');
        const moodOverall = selectedMood ? parseInt(selectedMood.dataset.mood) : 3;
        const energyOverall = parseInt(document.getElementById('eveningEnergy').value);
        const warningFlags = Array.from(document.querySelectorAll('.warning-flag:checked')).map(cb => cb.value);
        const note = document.getElementById('eveningNote').value.trim() || null;
        
        const checkIn = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            checkInType: 'evening',
            moodOverall,
            energyOverall,
            warningFlags,
            note
        };
        
        this.checkIns.push(checkIn);
        this.lastEveningCheckIn = new Date().toISOString().split('T')[0];
        this.save();
        
        document.querySelector('.mood-check-in-modal').remove();
        this.showToast('✓ Evening reflection saved 💜');
        
        // Run pattern detection
        this.detectPatterns();
    },
    
    skipEveningReflection() {
        const today = new Date().toISOString().split('T')[0];
        this.lastEveningCheckIn = today; // Mark as done so it doesn't show again tonight
        this.save();
        document.querySelector('.mood-check-in-modal').remove();
    },
    
    // ===== PHASE 3: PATTERN DETECTION =====
    
    detectPatterns() {
        // Check for hypomania
        if (this.detectHypomania()) {
            this.showPatternAlert('hypomania');
            return;
        }
        
        // Check for depression
        if (this.detectDepression()) {
            this.showPatternAlert('depression');
            return;
        }
        
        // Check for mixed state
        if (this.detectMixedState()) {
            this.showPatternAlert('mixed');
            return;
        }
    },
    
    getCheckInsFromLastHours(hours) {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        return this.checkIns.filter(c => new Date(c.timestamp) > cutoff);
    },
    
    getCheckInsFromLastDays(days) {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return this.checkIns.filter(c => new Date(c.timestamp) > cutoff);
    },
    
    detectHypomania() {
        const last2Hours = this.getCheckInsFromLastHours(2);
        const last3Days = this.getCheckInsFromLastDays(3);
        
        // Count task completions in last 2 hours
        const rapidTaskCompletion = last2Hours.filter(c => c.checkInType === 'task-completion').length >= 5;
        
        // Check for consistent high energy
        const highEnergyChecks = last3Days.filter(c => c.energyLevel && c.energyLevel >= 4);
        const consistentHighEnergy = highEnergyChecks.length >= 6;
        
        // Check for little sleep + high energy
        const morningChecks = last3Days.filter(c => c.checkInType === 'morning');
        const littleSleepHighEnergy = morningChecks.some(m => 
            m.sleepHours <= 5 && 
            last3Days.filter(c => c.energyLevel >= 4).length >= 3
        );
        
        // Check for late night activity (would need task completion timestamps)
        const lateNightActivity = last3Days.filter(c => {
            const hour = new Date(c.timestamp).getHours();
            return hour >= 23 || hour <= 3;
        }).length >= 2;
        
        const signals = [rapidTaskCompletion, consistentHighEnergy, littleSleepHighEnergy, lateNightActivity];
        const signalCount = signals.filter(Boolean).length;
        
        return signalCount >= 2;
    },
    
    detectDepression() {
        const today = this.getCheckInsFromLastHours(24);
        const last3Days = this.getCheckInsFromLastDays(3);
        
        // Check for no task completions today (after 3pm)
        const hour = new Date().getHours();
        const noTasksCompleted = hour >= 15 && today.filter(c => c.checkInType === 'task-completion').length === 0;
        
        // Check for consistent low energy
        const lowEnergyChecks = last3Days.filter(c => c.energyLevel && c.energyLevel <= 2);
        const consistentLowEnergy = lowEnergyChecks.length >= 6;
        
        // Check for excessive sleep
        const morningChecks = last3Days.filter(c => c.checkInType === 'morning');
        const excessiveSleep = morningChecks.some(m => 
            m.sleepHours >= 10 && 
            last3Days.filter(c => c.energyLevel <= 2).length >= 3
        );
        
        // Check for missed medication
        const missedMedication = morningChecks.filter(m => !m.medicationTaken).length >= 2;
        
        const signals = [noTasksCompleted, consistentLowEnergy, excessiveSleep, missedMedication];
        const signalCount = signals.filter(Boolean).length;
        
        return signalCount >= 2;
    },
    
    detectMixedState() {
        const last24Hours = this.getCheckInsFromLastHours(24);
        const last2Days = this.getCheckInsFromLastDays(2);
        
        // Classic mixed state: low mood + high energy
        const mixedStateSignals = last24Hours.filter(c => 
            c.mood && c.energyLevel && c.mood <= 2 && c.energyLevel >= 4
        );
        
        // Check for irritability + racing thoughts
        const eveningChecks = last2Days.filter(c => c.checkInType === 'evening');
        const hasIrritability = eveningChecks.some(c => 
            c.warningFlags && c.warningFlags.includes('irritable')
        );
        const hasRacingThoughts = eveningChecks.some(c => 
            c.warningFlags && c.warningFlags.includes('racing')
        );
        
        return mixedStateSignals.length >= 2 || (hasIrritability && hasRacingThoughts);
    },
    
    showPatternAlert(patternType) {
        // Don't spam alerts - wait at least 6 hours between alerts
        if (this.lastPatternAlert) {
            const hoursSinceLastAlert = (Date.now() - new Date(this.lastPatternAlert).getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastAlert < 6) {
                return;
            }
        }
        
        let alertConfig = {};
        
        if (patternType === 'hypomania') {
            alertConfig = {
                title: '🔔 Pattern noticed',
                message: "You've been moving fast lately:",
                signals: [
                    'Completed multiple tasks quickly',
                    'High energy for several days',
                    'Less sleep than usual'
                ],
                options: [
                    { value: 'on-roll', label: 'On a roll ✨' },
                    { value: 'too-much', label: 'A bit too much ⚠️' },
                    { value: 'productive', label: 'Just productive 💪' }
                ]
            };
        } else if (patternType === 'depression') {
            alertConfig = {
                title: '💙 Checking in on you',
                message: 'Noticed you might be having a tough day:',
                signals: [
                    'No tasks completed yet',
                    'Energy has been low',
                    'Sleeping a lot but still tired'
                ],
                options: [
                    { value: 'struggling', label: 'Struggling today 💙' },
                    { value: 'need-support', label: 'Need support 🤝' },
                    { value: 'slow-day', label: 'Just a slow day 🐌' }
                ]
            };
        } else if (patternType === 'mixed') {
            alertConfig = {
                title: '⚠️ Pattern noticed',
                message: "Your mood and energy seem to be pulling in different directions:",
                signals: [
                    'Low mood but high energy',
                    'Irritability flagged',
                    'Racing thoughts'
                ],
                options: [
                    { value: 'agitated', label: 'Agitated/wired but sad 😣' },
                    { value: 'restless', label: 'Restless and down 😤' },
                    { value: 'off', label: "Something's off ⚠️" }
                ]
            };
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${alertConfig.title}</h2>
                </div>
                
                <p style="margin-bottom: 15px;">${alertConfig.message}</p>
                <ul style="margin: 15px 0; padding-left: 20px; color: var(--text-light);">
                    ${alertConfig.signals.map(s => `<li>${s}</li>`).join('')}
                </ul>
                
                <p style="margin: 20px 0; font-weight: 600;">Quick check-in?</p>
                
                <div class="form-group">
                    <label>Mood:</label>
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
                        <button class="mood-btn pattern-mood-btn" data-mood="1" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😔</button>
                        <button class="mood-btn pattern-mood-btn" data-mood="2" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😐</button>
                        <button class="mood-btn pattern-mood-btn" data-mood="3" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😊</button>
                        <button class="mood-btn pattern-mood-btn" data-mood="4" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">😃</button>
                        <button class="mood-btn pattern-mood-btn" data-mood="5" style="flex: 1; padding: 15px; font-size: 2em; border: 3px solid var(--border); background: white; border-radius: 10px; cursor: pointer;">🤩</button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Energy:</label>
                    <div style="margin: 10px 0;">
                        <input type="range" id="patternEnergy" min="1" max="5" value="3" step="1" 
                               style="width: 100%;" oninput="document.getElementById('patternEnergyDisplay').textContent = ['💤', '😴', '😐', '⚡', '🚀'][this.value - 1]">
                        <div style="display: flex; justify-content: space-between; font-size: 1.5em; margin-top: 5px;">
                            <span>💤</span>
                            <span id="patternEnergyDisplay">😐</span>
                            <span>🚀</span>
                        </div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>How are you feeling?</label>
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
                        ${alertConfig.options.map(opt => `
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 12px; background: var(--bg-main); border-radius: 6px;">
                                <input type="radio" name="patternResponse" value="${opt.value}">
                                <span>${opt.label}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="document.querySelector('.mood-check-in-modal').remove()">Maybe later</button>
                    <button class="btn btn-primary" onclick="MoodTracker.savePatternAlert('${patternType}')" style="flex: 1;">Log it</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add click handlers for mood buttons
        modal.querySelectorAll('.pattern-mood-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                modal.querySelectorAll('.pattern-mood-btn').forEach(b => {
                    b.style.borderColor = 'var(--border)';
                    b.style.background = 'white';
                });
                this.style.borderColor = 'var(--primary)';
                this.style.background = 'rgba(102, 126, 234, 0.1)';
                this.dataset.selected = 'true';
            });
        });
    },
    
    savePatternAlert(patternType) {
        const selectedMood = document.querySelector('.pattern-mood-btn[data-selected="true"]');
        const mood = selectedMood ? parseInt(selectedMood.dataset.mood) : 3;
        const energyLevel = parseInt(document.getElementById('patternEnergy').value);
        const selectedResponse = document.querySelector('input[name="patternResponse"]:checked');
        const patternResponse = selectedResponse ? selectedResponse.value : null;
        
        const checkIn = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            checkInType: 'pattern-alert',
            mood,
            energyLevel,
            patternType,
            patternResponse
        };
        
        this.checkIns.push(checkIn);
        this.lastPatternAlert = new Date().toISOString();
        this.save();
        
        document.querySelector('.mood-check-in-modal').remove();
        this.showToast('✓ Pattern check-in saved 💜');
    },
    
    // Helper function to show toast messages
    showToast(message) {
        if (typeof showToast === 'function') {
            // Use existing toast function if available
            showToast(message);
        } else {
            // Create our own toast
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--success);
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 2000;
                animation: slideIn 0.3s ease-out;
            `;
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'fadeOut 0.5s ease-out forwards';
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        }
    },
    
    // Settings management
    showSettings() {
        const activityMonitoringEnabled = localStorage.getItem('activityMonitoringEnabled') !== 'false';
        
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>⚙️ Mood Tracker Settings</h2>
                </div>
                
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; background: var(--bg-main); border-radius: 8px;">
                        <input type="checkbox" id="enableActivityMonitoring" ${activityMonitoringEnabled ? 'checked' : ''} style="width: 20px; height: 20px;">
                        <div>
                            <div style="font-weight: 600;">Automatic check-ins after intense activities</div>
                            <div style="font-size: 0.9em; color: var(--text-light); margin-top: 4px;">
                                Prompt me to check in after therapy, classes, work, and D&D
                            </div>
                        </div>
                    </label>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: var(--bg-main); border-radius: 8px; font-size: 0.9em; color: var(--text-light);">
                    <strong>Automatic check-in schedule:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Tuesday 4:00pm - After Therapy (15 min window)</li>
                        <li>Thursday 7:00pm - After Bio class (15 min window)</li>
                        <li>Friday 10:00pm - After Work (15 min window)</li>
                        <li>Saturday 10:00pm - After Work (15 min window)</li>
                        <li>Sunday 8:00pm - After D&D game (30 min window)</li>
                    </ul>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn btn-primary" onclick="MoodTracker.saveSettings()" style="flex: 1;">Save Settings</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    saveSettings() {
        const activityMonitoringEnabled = document.getElementById('enableActivityMonitoring').checked;
        localStorage.setItem('activityMonitoringEnabled', activityMonitoringEnabled);
        
        document.querySelector('.mood-check-in-modal').remove();
        this.showToast('✓ Settings saved');
        
        // Restart monitoring with new settings
        if (activityMonitoringEnabled) {
            this.checkPostIntenseActivity();
        }
    },
    
    // ===== PHASE 5: PDF EXPORT =====
    
    showExportModal() {
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>📄 Export Mood Data for Therapy</h2>
                </div>
                
                <div class="export-config">
                    <div class="config-section" style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                        <h3 style="font-size: 1.1rem; margin-bottom: 12px; color: #4a5568;">Date Range</h3>
                        <select id="exportDateRange" style="width: 100%; padding: 8px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 1rem;">
                            <option value="7">Last 7 days</option>
                            <option value="14" selected>Last 2 weeks</option>
                            <option value="30">Last month</option>
                            <option value="90">Last 3 months</option>
                            <option value="custom">Custom range</option>
                        </select>
                        
                        <div id="customDateRange" style="display: none; margin-top: 12px;">
                            <label style="display: block; margin-bottom: 8px;">
                                From: <input type="date" id="exportStartDate" style="padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px;">
                            </label>
                            <label style="display: block;">
                                To: <input type="date" id="exportEndDate" style="padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px;">
                            </label>
                        </div>
                    </div>
                    
                    <div class="config-section" style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                        <h3 style="font-size: 1.1rem; margin-bottom: 12px; color: #4a5568;">Include in Report</h3>
                        <label style="display: block; margin: 8px 0; cursor: pointer;">
                            <input type="checkbox" id="includeMoodEnergy" checked disabled style="margin-right: 8px;">
                            Mood & Energy Trends (required)
                        </label>
                        <label style="display: block; margin: 8px 0; cursor: pointer;">
                            <input type="checkbox" id="includeSleep" checked style="margin-right: 8px;">
                            Sleep Patterns
                        </label>
                        <label style="display: block; margin: 8px 0; cursor: pointer;">
                            <input type="checkbox" id="includeMedication" checked style="margin-right: 8px;">
                            Medication Adherence
                        </label>
                        <label style="display: block; margin: 8px 0; cursor: pointer;">
                            <input type="checkbox" id="includeWarnings" checked style="margin-right: 8px;">
                            Warning Signs Summary
                        </label>
                        <label style="display: block; margin: 8px 0; cursor: pointer;">
                            <input type="checkbox" id="includePatterns" checked style="margin-right: 8px;">
                            Detected Patterns & Insights
                        </label>
                        <label style="display: block; margin: 8px 0; cursor: pointer;">
                            <input type="checkbox" id="includeNotes" checked style="margin-right: 8px;">
                            Daily Notes
                        </label>
                        <label style="display: block; margin: 8px 0; cursor: pointer;">
                            <input type="checkbox" id="includeCheckInLog" style="margin-right: 8px;">
                            Complete Check-In Log (detailed)
                        </label>
                    </div>
                    
                    <div class="config-section" style="margin-bottom: 24px;">
                        <h3 style="font-size: 1.1rem; margin-bottom: 12px; color: #4a5568;">Notes for Therapist (optional)</h3>
                        <textarea id="therapistNotes" placeholder="Add any context or questions you want to discuss..." rows="4" 
                                  style="width: 100%; padding: 8px; border: 1px solid #cbd5e0; border-radius: 4px; font-size: 1rem; resize: vertical;"></textarea>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="MoodTracker.closeExportModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="MoodTracker.generatePDF()" style="flex: 1;">Generate PDF</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle date range selector
        document.getElementById('exportDateRange').addEventListener('change', (e) => {
            const customRange = document.getElementById('customDateRange');
            if (e.target.value === 'custom') {
                customRange.style.display = 'block';
                // Set default dates
                const today = new Date();
                const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
                document.getElementById('exportEndDate').valueAsDate = today;
                document.getElementById('exportStartDate').valueAsDate = twoWeeksAgo;
            } else {
                customRange.style.display = 'none';
            }
        });
    },
    
    closeExportModal() {
        const modal = document.querySelector('.mood-check-in-modal');
        if (modal) {
            modal.remove();
        }
    },
    
    async generatePDF() {
        // Show loading state
        this.showToast('📄 Generating PDF...');
        
        // Get configuration
        const dateRange = document.getElementById('exportDateRange').value;
        const includeSleep = document.getElementById('includeSleep').checked;
        const includeMedication = document.getElementById('includeMedication').checked;
        const includeWarnings = document.getElementById('includeWarnings').checked;
        const includePatterns = document.getElementById('includePatterns').checked;
        const includeNotes = document.getElementById('includeNotes').checked;
        const includeCheckInLog = document.getElementById('includeCheckInLog').checked;
        const therapistNotes = document.getElementById('therapistNotes').value;
        
        // Calculate date range
        let startDate, endDate;
        if (dateRange === 'custom') {
            const startInput = document.getElementById('exportStartDate').value;
            const endInput = document.getElementById('exportEndDate').value;
            if (!startInput || !endInput) {
                this.showToast('⚠️ Please select both start and end dates');
                return;
            }
            startDate = new Date(startInput);
            endDate = new Date(endInput);
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(dateRange));
        }
        
        // Filter check-ins by date range
        const filteredCheckIns = this.checkIns.filter(c => {
            const checkInDate = new Date(c.timestamp);
            return checkInDate >= startDate && checkInDate <= endDate;
        });
        
        if (filteredCheckIns.length === 0) {
            this.showToast('⚠️ No check-ins found in this date range');
            return;
        }
        
        // Initialize jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        let yPosition = 20;
        const pageHeight = doc.internal.pageSize.height;
        const marginBottom = 20;
        
        // Helper function to check if we need a new page
        const checkPageBreak = (neededSpace) => {
            if (yPosition + neededSpace > pageHeight - marginBottom) {
                doc.addPage();
                yPosition = 20;
                return true;
            }
            return false;
        };
        
        // HEADER
        doc.setFontSize(20);
        doc.setTextColor(102, 126, 234);
        doc.text('Mood Tracking Report', 105, yPosition, { align: 'center' });
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        const dateRangeText = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        doc.text(dateRangeText, 105, yPosition, { align: 'center' });
        yPosition += 5;
        
        const generatedText = `Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
        doc.text(generatedText, 105, yPosition, { align: 'center' });
        yPosition += 15;
        
        // OVERVIEW SECTION
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text('Overview', 20, yPosition);
        yPosition += 8;
        
        doc.setFontSize(10);
        const totalCheckIns = filteredCheckIns.length;
        const avgMood = this.calculateAverage(filteredCheckIns, 'mood', 'moodOverall');
        const avgEnergy = this.calculateAverage(filteredCheckIns, 'energyLevel', 'energyOverall');
        const medAdherence = this.calculateMedicationAdherence(filteredCheckIns);
        
        doc.text(`Total Check-Ins: ${totalCheckIns}`, 20, yPosition);
        yPosition += 6;
        doc.text(`Average Mood: ${avgMood.toFixed(1)}/5 (${this.getMoodLabel(avgMood)})`, 20, yPosition);
        yPosition += 6;
        doc.text(`Average Energy: ${avgEnergy.toFixed(1)}/5 (${this.getEnergyLabel(avgEnergy)})`, 20, yPosition);
        yPosition += 6;
        
        if (includeMedication) {
            doc.text(`Medication Adherence: ${medAdherence}%`, 20, yPosition);
            yPosition += 10;
        }
        
        // MOOD & ENERGY TRENDS
        checkPageBreak(40);
        doc.setFontSize(14);
        doc.text('Mood & Energy Trends', 20, yPosition);
        yPosition += 8;
        
        doc.setFontSize(10);
        const moodTrend = this.analyzeTrend(filteredCheckIns, 'mood', 'moodOverall');
        const energyTrend = this.analyzeTrend(filteredCheckIns, 'energyLevel', 'energyOverall');
        
        doc.text(`Mood Trend: ${moodTrend}`, 20, yPosition);
        yPosition += 6;
        doc.text(`Energy Trend: ${energyTrend}`, 20, yPosition);
        yPosition += 10;
        
        // SLEEP PATTERNS
        if (includeSleep) {
            checkPageBreak(40);
            doc.setFontSize(14);
            doc.text('Sleep Patterns', 20, yPosition);
            yPosition += 8;
            
            const morningCheckIns = filteredCheckIns.filter(c => c.checkInType === 'morning');
            if (morningCheckIns.length > 0) {
                const avgSleep = morningCheckIns.reduce((sum, c) => sum + (c.sleepHours || 0), 0) / morningCheckIns.length;
                const sleepQuality = {
                    restless: morningCheckIns.filter(c => c.sleepQuality === 'restless').length,
                    okay: morningCheckIns.filter(c => c.sleepQuality === 'okay').length,
                    good: morningCheckIns.filter(c => c.sleepQuality === 'good').length
                };
                
                doc.setFontSize(10);
                doc.text(`Average Sleep: ${avgSleep.toFixed(1)} hours`, 20, yPosition);
                yPosition += 6;
                doc.text(`Sleep Quality Distribution:`, 20, yPosition);
                yPosition += 6;
                doc.text(`  Restless: ${sleepQuality.restless} nights (${((sleepQuality.restless / morningCheckIns.length) * 100).toFixed(0)}%)`, 25, yPosition);
                yPosition += 6;
                doc.text(`  Okay: ${sleepQuality.okay} nights (${((sleepQuality.okay / morningCheckIns.length) * 100).toFixed(0)}%)`, 25, yPosition);
                yPosition += 6;
                doc.text(`  Good: ${sleepQuality.good} nights (${((sleepQuality.good / morningCheckIns.length) * 100).toFixed(0)}%)`, 25, yPosition);
                yPosition += 10;
            }
        }
        
        // WARNING SIGNS
        if (includeWarnings) {
            checkPageBreak(50);
            doc.setFontSize(14);
            doc.text('Warning Signs', 20, yPosition);
            yPosition += 8;
            
            const warningCounts = {
                racing: 0,
                irritable: 0,
                impulsive: 0,
                substances: 0,
                none: 0
            };
            
            filteredCheckIns.forEach(c => {
                if (c.warningFlags) {
                    c.warningFlags.forEach(flag => {
                        if (warningCounts[flag] !== undefined) {
                            warningCounts[flag]++;
                        }
                    });
                }
            });
            
            doc.setFontSize(10);
            if (warningCounts.racing > 0) {
                doc.text(`Racing Thoughts: ${warningCounts.racing} times`, 20, yPosition);
                yPosition += 6;
            }
            if (warningCounts.irritable > 0) {
                doc.text(`Irritability: ${warningCounts.irritable} times`, 20, yPosition);
                yPosition += 6;
            }
            if (warningCounts.impulsive > 0) {
                doc.text(`Impulsivity: ${warningCounts.impulsive} times`, 20, yPosition);
                yPosition += 6;
            }
            if (warningCounts.substances > 0) {
                doc.text(`Alcohol/Substances: ${warningCounts.substances} times`, 20, yPosition);
                yPosition += 6;
            }
            if (warningCounts.none > 0) {
                doc.text(`Stable Days: ${warningCounts.none} times`, 20, yPosition);
                yPosition += 6;
            }
            yPosition += 4;
        }
        
        // DETECTED PATTERNS
        if (includePatterns) {
            checkPageBreak(50);
            doc.setFontSize(14);
            doc.text('Detected Patterns & Insights', 20, yPosition);
            yPosition += 8;
            
            doc.setFontSize(10);
            const patterns = this.generateInsights(filteredCheckIns);
            
            patterns.forEach(pattern => {
                checkPageBreak(15);
                const lines = doc.splitTextToSize(`• ${pattern}`, 170);
                lines.forEach(line => {
                    checkPageBreak(6);
                    doc.text(line, 20, yPosition);
                    yPosition += 6;
                });
            });
            yPosition += 4;
        }
        
        // DAILY NOTES
        if (includeNotes) {
            const checkInsWithNotes = filteredCheckIns.filter(c => c.note && c.note.trim() !== '');
            
            if (checkInsWithNotes.length > 0) {
                checkPageBreak(30);
                doc.setFontSize(14);
                doc.text('Daily Notes', 20, yPosition);
                yPosition += 8;
                
                doc.setFontSize(10);
                checkInsWithNotes.forEach(c => {
                    checkPageBreak(15);
                    const date = new Date(c.timestamp).toLocaleDateString();
                    doc.text(`${date}:`, 20, yPosition);
                    yPosition += 6;
                    
                    const noteLines = doc.splitTextToSize(c.note, 160);
                    noteLines.forEach(line => {
                        checkPageBreak(6);
                        doc.text(line, 25, yPosition);
                        yPosition += 6;
                    });
                    yPosition += 2;
                });
            }
        }
        
        // THERAPIST NOTES
        if (therapistNotes && therapistNotes.trim() !== '') {
            checkPageBreak(40);
            doc.setFontSize(14);
            doc.text('Notes for Discussion', 20, yPosition);
            yPosition += 8;
            
            doc.setFontSize(10);
            const noteLines = doc.splitTextToSize(therapistNotes, 160);
            noteLines.forEach(line => {
                checkPageBreak(6);
                doc.text(line, 20, yPosition);
                yPosition += 6;
            });
        }
        
        // COMPLETE CHECK-IN LOG
        if (includeCheckInLog) {
            doc.addPage();
            yPosition = 20;
            
            doc.setFontSize(14);
            doc.text('Complete Check-In Log', 20, yPosition);
            yPosition += 10;
            
            const tableData = filteredCheckIns.map(c => {
                const date = new Date(c.timestamp);
                return [
                    date.toLocaleDateString(),
                    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                    c.checkInType,
                    c.mood || c.moodOverall || '-',
                    c.energyLevel || c.energyOverall || '-',
                    c.note ? c.note.substring(0, 50) + (c.note.length > 50 ? '...' : '') : '-'
                ];
            });
            
            doc.autoTable({
                startY: yPosition,
                head: [['Date', 'Time', 'Type', 'Mood', 'Energy', 'Notes']],
                body: tableData,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [102, 126, 234] },
                columnStyles: {
                    5: { cellWidth: 50 }
                }
            });
        }
        
        // FOOTER on every page
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(
                `Controlled Chaos - Mood Tracking Report | Page ${i} of ${pageCount}`,
                105,
                pageHeight - 10,
                { align: 'center' }
            );
        }
        
        // Save the PDF
        const filename = `mood-tracking-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        
        this.closeExportModal();
        this.showToast('✅ PDF downloaded! Ready for therapy.');
        
        // Confetti if available
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    },
    
    // Helper functions for PDF generation
    calculateAverage(checkIns, ...fields) {
        let sum = 0;
        let count = 0;
        
        checkIns.forEach(c => {
            for (const field of fields) {
                if (c[field] !== undefined && c[field] !== null) {
                    sum += c[field];
                    count++;
                    break;
                }
            }
        });
        
        return count > 0 ? sum / count : 0;
    },
    
    calculateMedicationAdherence(checkIns) {
        const morningCheckIns = checkIns.filter(c => c.checkInType === 'morning');
        if (morningCheckIns.length === 0) return 0;
        
        const takenCount = morningCheckIns.filter(c => c.medicationTaken).length;
        return Math.round((takenCount / morningCheckIns.length) * 100);
    },
    
    getMoodLabel(avgMood) {
        if (avgMood >= 4.5) return 'Very elevated';
        if (avgMood >= 3.5) return 'Elevated';
        if (avgMood >= 2.5) return 'Stable';
        if (avgMood >= 1.5) return 'Low';
        return 'Very low';
    },
    
    getEnergyLabel(avgEnergy) {
        if (avgEnergy >= 4.5) return 'Very elevated';
        if (avgEnergy >= 3.5) return 'Elevated';
        if (avgEnergy >= 2.5) return 'Normal';
        if (avgEnergy >= 1.5) return 'Low';
        return 'Depleted';
    },
    
    analyzeTrend(checkIns, ...fields) {
        if (checkIns.length < 2) return 'Insufficient data';
        
        const midpoint = Math.floor(checkIns.length / 2);
        const firstHalf = checkIns.slice(0, midpoint);
        const secondHalf = checkIns.slice(midpoint);
        
        const firstAvg = this.calculateAverage(firstHalf, ...fields);
        const secondAvg = this.calculateAverage(secondHalf, ...fields);
        
        const diff = secondAvg - firstAvg;
        
        if (Math.abs(diff) < 0.3) return 'Stable';
        if (diff > 0) return 'Increasing trend';
        return 'Decreasing trend';
    },
    
    generateInsights(checkIns) {
        const insights = [];
        
        if (checkIns.length === 0) return insights;
        
        // Stability analysis
        const stableDays = checkIns.filter(c => {
            const mood = c.mood || c.moodOverall || 0;
            const energy = c.energyLevel || c.energyOverall || 0;
            return mood >= 2.5 && mood <= 3.5 && energy >= 2.5 && energy <= 3.5;
        }).length;
        
        insights.push(`${stableDays} stable days (${Math.round((stableDays / checkIns.length) * 100)}%)`);
        
        // Elevated energy analysis
        const elevatedDays = checkIns.filter(c => {
            const energy = c.energyLevel || c.energyOverall || 0;
            return energy >= 4;
        }).length;
        
        if (elevatedDays > 0) {
            insights.push(`${elevatedDays} days with elevated energy`);
        }
        
        // Low mood analysis
        const lowMoodDays = checkIns.filter(c => {
            const mood = c.mood || c.moodOverall || 0;
            return mood <= 2;
        }).length;
        
        if (lowMoodDays > 0) {
            insights.push(`${lowMoodDays} days with low mood`);
        }
        
        // Sleep correlation
        const morningCheckIns = checkIns.filter(c => c.checkInType === 'morning');
        if (morningCheckIns.length > 3) {
            const avgSleep = morningCheckIns.reduce((sum, c) => sum + (c.sleepHours || 0), 0) / morningCheckIns.length;
            if (avgSleep < 6) {
                insights.push('Sleep below recommended 7-9 hours - may impact mood');
            } else if (avgSleep > 9) {
                insights.push('Sleep above typical range - monitor for depression signals');
            }
        }
        
        // Medication adherence impact
        const medAdherence = this.calculateMedicationAdherence(checkIns);
        if (medAdherence < 80 && medAdherence > 0) {
            insights.push(`Medication adherence at ${medAdherence}% - consider discussing barriers with provider`);
        }
        
        // Pattern detection summary
        const hasRacing = checkIns.some(c => c.warningFlags && c.warningFlags.includes('racing'));
        const hasIrritability = checkIns.some(c => c.warningFlags && c.warningFlags.includes('irritable'));
        
        if (hasRacing && hasIrritability) {
            insights.push('Racing thoughts and irritability noted - discuss mixed state symptoms');
        }
        
        return insights;
    },
    
    // ===== PHASE 4: PATTERN VISUALIZATION =====
    
    showVisualization() {
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>📊 Mood & Energy Patterns</h2>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                
                <div class="viz-tabs" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid var(--border);">
                    <button class="viz-tab active" data-tab="trends" onclick="MoodTracker.switchVizTab('trends', this)">
                        📈 Trends
                    </button>
                    <button class="viz-tab" data-tab="calendar" onclick="MoodTracker.switchVizTab('calendar', this)">
                        📅 Calendar
                    </button>
                    <button class="viz-tab" data-tab="insights" onclick="MoodTracker.switchVizTab('insights', this)">
                        💡 Insights
                    </button>
                </div>
                
                <!-- PDF Export Button -->
                <div style="text-align: center; margin-bottom: 20px;">
                    <button class="btn btn-primary" onclick="MoodTracker.showExportModal()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
                        📄 Export for Therapy
                    </button>
                    <p style="font-size: 0.9em; color: var(--text-light); margin-top: 8px;">Generate a PDF report to share with your therapist</p>
                </div>
                
                <div id="vizContent">
                    ${this.renderTrendsView()}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    switchVizTab(tab, button) {
        // Update active tab
        document.querySelectorAll('.viz-tab').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Update content
        const content = document.getElementById('vizContent');
        if (tab === 'trends') {
            content.innerHTML = this.renderTrendsView();
        } else if (tab === 'calendar') {
            content.innerHTML = this.renderCalendarView();
        } else if (tab === 'insights') {
            content.innerHTML = this.renderInsightsView();
        }
    },
    
    renderTrendsView() {
        const last14Days = this.getCheckInsFromLastDays(14);
        
        if (last14Days.length === 0) {
            return `
                <div style="text-align: center; padding: 40px; color: var(--text-light);">
                    <div style="font-size: 3em; margin-bottom: 15px;">📊</div>
                    <p>No data yet! Complete some check-ins to see your patterns.</p>
                </div>
            `;
        }
        
        // Group by date
        const dataByDate = {};
        last14Days.forEach(checkIn => {
            const date = checkIn.timestamp.split('T')[0];
            if (!dataByDate[date]) {
                dataByDate[date] = {
                    mood: [],
                    energy: [],
                    sleep: null,
                    medication: null
                };
            }
            
            if (checkIn.mood) dataByDate[date].mood.push(checkIn.mood);
            if (checkIn.moodOverall) dataByDate[date].mood.push(checkIn.moodOverall);
            if (checkIn.energyLevel) dataByDate[date].energy.push(checkIn.energyLevel);
            if (checkIn.energyOverall) dataByDate[date].energy.push(checkIn.energyOverall);
            if (checkIn.sleepHours !== undefined) dataByDate[date].sleep = checkIn.sleepHours;
            if (checkIn.medicationTaken !== undefined) dataByDate[date].medication = checkIn.medicationTaken;
        });
        
        // Calculate averages
        const dates = Object.keys(dataByDate).sort();
        const moodData = dates.map(date => {
            const moods = dataByDate[date].mood;
            return moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
        });
        const energyData = dates.map(date => {
            const energies = dataByDate[date].energy;
            return energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : null;
        });
        
        return `
            <div class="trends-container">
                <h3 style="margin-bottom: 20px;">Last 14 Days</h3>
                
                <!-- Mood Chart -->
                <div style="background: var(--bg-main); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                    <h4 style="margin-bottom: 15px; color: var(--primary);">😊 Mood Trend</h4>
                    ${this.renderLineChart(dates, moodData, 'mood')}
                </div>
                
                <!-- Energy Chart -->
                <div style="background: var(--bg-main); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                    <h4 style="margin-bottom: 15px; color: var(--primary);">⚡ Energy Trend</h4>
                    ${this.renderLineChart(dates, energyData, 'energy')}
                </div>
                
                <!-- Sleep Chart -->
                <div style="background: var(--bg-main); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                    <h4 style="margin-bottom: 15px; color: var(--primary);">😴 Sleep Pattern</h4>
                    ${this.renderSleepChart(dates, dataByDate)}
                </div>
                
                <!-- Medication Adherence -->
                <div style="background: var(--bg-main); padding: 20px; border-radius: 10px;">
                    <h4 style="margin-bottom: 15px; color: var(--primary);">💊 Medication Adherence</h4>
                    ${this.renderMedicationChart(dates, dataByDate)}
                </div>
            </div>
        `;
    },
    
    renderLineChart(dates, data, type) {
        const maxValue = 5;
        const chartHeight = 200;
        const chartWidth = 100; // percentage
        
        // Filter out null values and get points
        const points = dates.map((date, i) => {
            if (data[i] === null) return null;
            const x = (i / (dates.length - 1)) * 100;
            const y = chartHeight - ((data[i] / maxValue) * chartHeight);
            return { x, y, value: data[i], date };
        }).filter(p => p !== null);
        
        if (points.length === 0) {
            return '<p style="color: var(--text-light); text-align: center;">No data available</p>';
        }
        
        // Create SVG path
        const pathData = points.map((p, i) => 
            `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
        ).join(' ');
        
        // Color based on type
        const color = type === 'mood' ? '#667eea' : '#f59e0b';
        
        return `
            <div style="position: relative; width: 100%; height: ${chartHeight}px; background: white; border-radius: 8px; padding: 10px;">
                <svg width="100%" height="100%" style="overflow: visible;">
                    <!-- Grid lines -->
                    ${[1, 2, 3, 4, 5].map(i => `
                        <line x1="0" y1="${chartHeight - (i / 5) * chartHeight}" 
                              x2="100%" y2="${chartHeight - (i / 5) * chartHeight}" 
                              stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4"/>
                    `).join('')}
                    
                    <!-- Line -->
                    <path d="${pathData}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    
                    <!-- Points -->
                    ${points.map(p => `
                        <circle cx="${p.x}%" cy="${p.y}" r="5" fill="${color}">
                            <title>${p.date}: ${p.value.toFixed(1)}</title>
                        </circle>
                    `).join('')}
                </svg>
                
                <!-- Y-axis labels -->
                <div style="position: absolute; left: -30px; top: 0; height: 100%; display: flex; flex-direction: column; justify-content: space-between; font-size: 0.75em; color: var(--text-light);">
                    <span>5</span>
                    <span>4</span>
                    <span>3</span>
                    <span>2</span>
                    <span>1</span>
                </div>
                
                <!-- X-axis labels -->
                <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.75em; color: var(--text-light);">
                    <span>${new Date(dates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span>${new Date(dates[Math.floor(dates.length / 2)]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span>${new Date(dates[dates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
            </div>
        `;
    },
    
    renderSleepChart(dates, dataByDate) {
        const chartHeight = 150;
        const barWidth = 100 / dates.length;
        
        return `
            <div style="position: relative; width: 100%; height: ${chartHeight}px; background: white; border-radius: 8px; padding: 10px;">
                <svg width="100%" height="100%">
                    ${dates.map((date, i) => {
                        const sleep = dataByDate[date].sleep;
                        if (sleep === null) return '';
                        
                        const barHeight = (sleep / 12) * chartHeight;
                        const x = i * barWidth;
                        const y = chartHeight - barHeight;
                        
                        // Color based on sleep amount
                        let color = '#10b981'; // Good (7-9 hours)
                        if (sleep < 6) color = '#ef4444'; // Too little
                        else if (sleep > 9) color = '#f59e0b'; // Too much
                        
                        return `
                            <rect x="${x}%" y="${y}" width="${barWidth * 0.8}%" height="${barHeight}" 
                                  fill="${color}" rx="4">
                                <title>${date}: ${sleep}h</title>
                            </rect>
                        `;
                    }).join('')}
                </svg>
                
                <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.75em; color: var(--text-light);">
                    <span>0h</span>
                    <span>6h</span>
                    <span>12h</span>
                </div>
            </div>
            
            <div style="display: flex; gap: 15px; margin-top: 15px; font-size: 0.85em;">
                <span><span style="display: inline-block; width: 12px; height: 12px; background: #ef4444; border-radius: 2px;"></span> &lt;6h</span>
                <span><span style="display: inline-block; width: 12px; height: 12px; background: #10b981; border-radius: 2px;"></span> 6-9h</span>
                <span><span style="display: inline-block; width: 12px; height: 12px; background: #f59e0b; border-radius: 2px;"></span> &gt;9h</span>
            </div>
        `;
    },
    
    renderMedicationChart(dates, dataByDate) {
        const taken = dates.filter(date => dataByDate[date].medication === true).length;
        const missed = dates.filter(date => dataByDate[date].medication === false).length;
        const total = taken + missed;
        
        if (total === 0) {
            return '<p style="color: var(--text-light); text-align: center;">No medication data yet</p>';
        }
        
        const percentage = Math.round((taken / total) * 100);
        
        return `
            <div style="text-align: center;">
                <div style="font-size: 3em; font-weight: 600; color: ${percentage >= 80 ? 'var(--success)' : percentage >= 60 ? 'var(--warning)' : 'var(--danger)'}; margin-bottom: 10px;">
                    ${percentage}%
                </div>
                <p style="color: var(--text-light); margin-bottom: 20px;">
                    ${taken} of ${total} days
                </p>
                
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <div style="flex: ${taken}; background: var(--success); height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                        ${taken > 0 ? `✓ ${taken}` : ''}
                    </div>
                    ${missed > 0 ? `
                        <div style="flex: ${missed}; background: var(--danger); height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                            ✗ ${missed}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },
    
    renderCalendarView() {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        // Get first day of month
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        // Get check-ins for this month
        const monthStart = new Date(currentYear, currentMonth, 1).toISOString();
        const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString();
        const monthCheckIns = this.checkIns.filter(c => 
            c.timestamp >= monthStart && c.timestamp <= monthEnd
        );
        
        // Group by date
        const dataByDate = {};
        monthCheckIns.forEach(checkIn => {
            const date = checkIn.timestamp.split('T')[0];
            if (!dataByDate[date]) {
                dataByDate[date] = { mood: [], energy: [], checkInCount: 0 };
            }
            dataByDate[date].checkInCount++;
            if (checkIn.mood) dataByDate[date].mood.push(checkIn.mood);
            if (checkIn.moodOverall) dataByDate[date].mood.push(checkIn.moodOverall);
            if (checkIn.energyLevel) dataByDate[date].energy.push(checkIn.energyLevel);
            if (checkIn.energyOverall) dataByDate[date].energy.push(checkIn.energyOverall);
        });
        
        const monthName = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        let calendarHTML = `
            <div class="calendar-view">
                <h3 style="text-align: center; margin-bottom: 20px;">${monthName}</h3>
                
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-bottom: 20px;">
                    ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => 
                        `<div style="text-align: center; font-weight: 600; padding: 10px; color: var(--text-light);">${day}</div>`
                    ).join('')}
                    
                    ${Array(startingDayOfWeek).fill('').map(() => 
                        '<div style="padding: 10px;"></div>'
                    ).join('')}
                    
                    ${Array(daysInMonth).fill('').map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const dayData = dataByDate[dateStr];
                        const isToday = day === today.getDate();
                        
                        let bgColor = 'white';
                        let emoji = '';
                        
                        if (dayData) {
                            const avgMood = dayData.mood.length > 0 
                                ? dayData.mood.reduce((a, b) => a + b, 0) / dayData.mood.length 
                                : 0;
                            const avgEnergy = dayData.energy.length > 0 
                                ? dayData.energy.reduce((a, b) => a + b, 0) / dayData.energy.length 
                                : 0;
                            
                            // Color based on mood
                            if (avgMood >= 4) {
                                bgColor = '#dcfce7';
                                emoji = '😊';
                            } else if (avgMood >= 3) {
                                bgColor = '#fef3c7';
                                emoji = '😐';
                            } else if (avgMood > 0) {
                                bgColor = '#fee2e2';
                                emoji = '😔';
                            }
                        }
                        
                        return `
                            <div style="
                                background: ${bgColor}; 
                                padding: 10px; 
                                border-radius: 8px; 
                                text-align: center;
                                border: ${isToday ? '3px solid var(--primary)' : '2px solid var(--border)'};
                                min-height: 60px;
                                display: flex;
                                flex-direction: column;
                                justify-content: space-between;
                            ">
                                <div style="font-weight: ${isToday ? '700' : '500'}; font-size: 0.9em;">
                                    ${day}
                                </div>
                                ${emoji ? `<div style="font-size: 1.5em;">${emoji}</div>` : ''}
                                ${dayData ? `<div style="font-size: 0.7em; color: var(--text-light);">${dayData.checkInCount} check-ins</div>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <div style="background: var(--bg-main); padding: 15px; border-radius: 10px;">
                    <h4 style="margin-bottom: 10px;">Legend</h4>
                    <div style="display: flex; gap: 15px; flex-wrap: wrap; font-size: 0.9em;">
                        <span><span style="display: inline-block; width: 20px; height: 20px; background: #dcfce7; border-radius: 4px; border: 2px solid var(--border);"></span> Good mood</span>
                        <span><span style="display: inline-block; width: 20px; height: 20px; background: #fef3c7; border-radius: 4px; border: 2px solid var(--border);"></span> Neutral</span>
                        <span><span style="display: inline-block; width: 20px; height: 20px; background: #fee2e2; border-radius: 4px; border: 2px solid var(--border);"></span> Low mood</span>
                        <span><span style="display: inline-block; width: 20px; height: 20px; background: white; border-radius: 4px; border: 2px solid var(--border);"></span> No data</span>
                    </div>
                </div>
            </div>
        `;
        
        return calendarHTML;
    },
    
    renderInsightsView() {
        const last30Days = this.getCheckInsFromLastDays(30);
        
        if (last30Days.length < 5) {
            return `
                <div style="text-align: center; padding: 40px; color: var(--text-light);">
                    <div style="font-size: 3em; margin-bottom: 15px;">💡</div>
                    <p>Not enough data yet! Complete more check-ins to see insights.</p>
                    <p style="margin-top: 10px; font-size: 0.9em;">Need at least 5 check-ins</p>
                </div>
            `;
        }
        
        // Calculate insights
        const morningCheckIns = last30Days.filter(c => c.checkInType === 'morning');
        const eveningCheckIns = last30Days.filter(c => c.checkInType === 'evening');
        const taskCompletions = last30Days.filter(c => c.checkInType === 'task-completion');
        
        // Medication adherence
        const medTaken = morningCheckIns.filter(c => c.medicationTaken).length;
        const medTotal = morningCheckIns.length;
        const medAdherence = medTotal > 0 ? Math.round((medTaken / medTotal) * 100) : 0;
        
        // Average sleep
        const sleepData = morningCheckIns.filter(c => c.sleepHours).map(c => c.sleepHours);
        const avgSleep = sleepData.length > 0 
            ? (sleepData.reduce((a, b) => a + b, 0) / sleepData.length).toFixed(1)
            : 0;
        
        // Most common warning signs
        const warningCounts = {};
        eveningCheckIns.forEach(c => {
            if (c.warningFlags) {
                c.warningFlags.forEach(flag => {
                    warningCounts[flag] = (warningCounts[flag] || 0) + 1;
                });
            }
        });
        const topWarnings = Object.entries(warningCounts)
            .filter(([flag]) => flag !== 'none')
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        
        // Energy patterns
        const energyByTime = { morning: [], afternoon: [], evening: [] };
        last30Days.forEach(c => {
            if (c.energyLevel) {
                const hour = new Date(c.timestamp).getHours();
                if (hour < 12) energyByTime.morning.push(c.energyLevel);
                else if (hour < 17) energyByTime.afternoon.push(c.energyLevel);
                else energyByTime.evening.push(c.energyLevel);
            }
        });
        
        const avgEnergyMorning = energyByTime.morning.length > 0 
            ? (energyByTime.morning.reduce((a, b) => a + b, 0) / energyByTime.morning.length).toFixed(1)
            : 0;
        const avgEnergyAfternoon = energyByTime.afternoon.length > 0 
            ? (energyByTime.afternoon.reduce((a, b) => a + b, 0) / energyByTime.afternoon.length).toFixed(1)
            : 0;
        const avgEnergyEvening = energyByTime.evening.length > 0 
            ? (energyByTime.evening.reduce((a, b) => a + b, 0) / energyByTime.evening.length).toFixed(1)
            : 0;
        
        return `
            <div class="insights-view">
                <h3 style="margin-bottom: 20px;">Last 30 Days Insights</h3>
                
                <!-- Key Metrics -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">
                    <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 2.5em; font-weight: 600; margin-bottom: 5px;">${last30Days.length}</div>
                        <div style="opacity: 0.9;">Total Check-ins</div>
                    </div>
                    
                    <div style="background: ${medAdherence >= 80 ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #f59e0b, #d97706)'}; color: white; padding: 20px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 2.5em; font-weight: 600; margin-bottom: 5px;">${medAdherence}%</div>
                        <div style="opacity: 0.9;">Medication Adherence</div>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 20px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 2.5em; font-weight: 600; margin-bottom: 5px;">${avgSleep}h</div>
                        <div style="opacity: 0.9;">Average Sleep</div>
                    </div>
                </div>
                
                <!-- Energy Patterns -->
                <div style="background: var(--bg-main); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                    <h4 style="margin-bottom: 15px; color: var(--primary);">⚡ Energy Patterns</h4>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                        <div style="text-align: center;">
                            <div style="font-size: 2em; margin-bottom: 5px;">☀️</div>
                            <div style="font-size: 1.5em; font-weight: 600; color: var(--primary);">${avgEnergyMorning}</div>
                            <div style="font-size: 0.9em; color: var(--text-light);">Morning</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 2em; margin-bottom: 5px;">🌤️</div>
                            <div style="font-size: 1.5em; font-weight: 600; color: var(--primary);">${avgEnergyAfternoon}</div>
                            <div style="font-size: 0.9em; color: var(--text-light);">Afternoon</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 2em; margin-bottom: 5px;">🌙</div>
                            <div style="font-size: 1.5em; font-weight: 600; color: var(--primary);">${avgEnergyEvening}</div>
                            <div style="font-size: 0.9em; color: var(--text-light);">Evening</div>
                        </div>
                    </div>
                </div>
                
                <!-- Warning Signs -->
                ${topWarnings.length > 0 ? `
                    <div style="background: var(--bg-main); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                        <h4 style="margin-bottom: 15px; color: var(--warning);">⚠️ Most Common Warning Signs</h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${topWarnings.map(([flag, count]) => {
                                const labels = {
                                    racing: 'Racing thoughts',
                                    irritable: 'Irritability',
                                    impulsive: 'Impulsivity',
                                    substances: 'Alcohol/substances'
                                };
                                return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 8px;">
                                        <span>${labels[flag] || flag}</span>
                                        <span style="background: var(--warning); color: white; padding: 4px 12px; border-radius: 12px; font-weight: 600;">${count}x</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }
};

// Initialize mood tracker when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MoodTracker.init());
} else {
    MoodTracker.init();
}
