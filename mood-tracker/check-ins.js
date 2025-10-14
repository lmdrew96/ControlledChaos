// ===== CHECK-IN MODALS =====
// Morning, evening, task completion, and post-intense activity check-ins

// Add check-in functions to MoodTracker
Object.assign(MoodTracker, {
    // 1. Morning Start Check-In (Simplified)
    showMorningCheckIn() {
        const today = new Date().toISOString().split('T')[0];
        
        // Don't show if already done today
        if (this.lastMorningCheckIn === today) {
            return;
        }
        
        const modal = MoodUI.createModal('☀️ Good morning!', `
            <div class="morning-quick">
                <label class="checkbox-large">
                    <input type="checkbox" id="morningMeds">
                    <span>💊 Took my meds</span>
                </label>
            </div>
            
            <div class="form-group">
                <label>Sleep last night:</label>
                <div class="sleep-quick">
                    <button class="sleep-btn" data-hours="4">😴 Bad<br><small>4h</small></button>
                    <button class="sleep-btn" data-hours="6">😐 Okay<br><small>6h</small></button>
                    <button class="sleep-btn selected" data-hours="7">😊 Good<br><small>7h</small></button>
                    <button class="sleep-btn" data-hours="8">😌 Great<br><small>8h</small></button>
                </div>
            </div>
            
            <div class="form-group">
                <label>Energy level right now:</label>
                ${MoodUI.energySelector('morningEnergy')}
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button class="btn btn-secondary" onclick="MoodTracker.skipMorningCheckIn()">Skip</button>
                <button class="btn btn-primary" onclick="MoodTracker.saveMorningCheckIn()" style="flex: 1;">Save</button>
            </div>
        `);
        
        document.body.appendChild(modal);
        
        // Sleep button selection
        modal.querySelectorAll('.sleep-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                modal.querySelectorAll('.sleep-btn').forEach(b => b.classList.remove('selected'));
                this.classList.add('selected');
            });
        });
    },
    
    saveMorningCheckIn() {
        const medicationTaken = document.getElementById('morningMeds').checked;
        const selectedSleep = document.querySelector('.sleep-btn.selected');
        const sleepHours = selectedSleep ? parseFloat(selectedSleep.dataset.hours) : 7;
        const energyLevel = parseInt(document.getElementById('morningEnergy').value);
        
        // Determine quality based on hours
        let sleepQuality = 'okay';
        if (sleepHours >= 7) sleepQuality = 'good';
        if (sleepHours <= 5) sleepQuality = 'restless';
        
        const checkIn = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            checkInType: 'morning',
            medicationTaken,
            sleepHours,
            sleepQuality,
            energyLevel
        };
        
        this.checkIns.push(checkIn);
        this.lastMorningCheckIn = new Date().toISOString().split('T')[0];
        this.save();
        
        document.querySelector('.mood-check-in-modal').remove();
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
        
        container.querySelectorAll('.energy-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const energyLevel = parseInt(this.dataset.energy);
                MoodTracker.saveTaskCompletionCheck(taskId, energyLevel);
                container.remove();
            });
        });
        
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
        this.detectPatterns();
    },
    
    // 3. Post-Intense Activity Check-In
    showPostIntenseCheckIn(activityName) {
        const modal = MoodUI.createModal(`🏋️ How was ${activityName}?`, `
            <div class="form-group">
                <label>Mood:</label>
                ${MoodUI.moodSelector('postIntenseMood')}
            </div>
            
            <div class="form-group">
                <label>Energy:</label>
                ${MoodUI.energySelector('postIntenseEnergy')}
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
        `);
        
        document.body.appendChild(modal);
        MoodUI.initSelectors(modal);
    },
    
    savePostIntenseCheckIn(activityName) {
        const modal = document.querySelector('.mood-check-in-modal');
        const mood = MoodUI.getSelectedMood(modal, 'postIntenseMood');
        
        if (!mood) {
            this.showToast('⚠️ Please select your mood');
            return;
        }
        
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
        
        modal.remove();
        this.showToast('✓ Check-in saved 💜');
        this.detectPatterns();
    },
    
    // 4. Evening Reflection
    showEveningReflection() {
        const modal = MoodUI.createModal('🌙 Quick end-of-day reflection', `
            <div class="form-group">
                <label>Overall mood today:</label>
                ${MoodUI.moodSelector('eveningMood')}
            </div>
            
            <div class="form-group">
                <label>Overall energy today:</label>
                ${MoodUI.energySelector('eveningEnergy')}
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
        `);
        
        document.body.appendChild(modal);
        MoodUI.initSelectors(modal);
        
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
        const modal = document.querySelector('.mood-check-in-modal');
        const moodOverall = MoodUI.getSelectedMood(modal, 'eveningMood') || 3;
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
        
        modal.remove();
        this.showToast('✓ Evening reflection saved 💜');
        this.detectPatterns();
    },
    
    skipEveningReflection() {
        const today = new Date().toISOString().split('T')[0];
        this.lastEveningCheckIn = today;
        this.save();
        document.querySelector('.mood-check-in-modal').remove();
    }
});
