// ===== PATTERN DETECTION =====
// Detect hypomania, depression, and mixed states

Object.assign(MoodTracker, {
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
    
    detectHypomania() {
        const last2Hours = this.getCheckInsFromLastHours(2);
        const last3Days = this.getCheckInsFromLastDays(3);
        
        const rapidTaskCompletion = last2Hours.filter(c => c.checkInType === 'task-completion').length >= 5;
        const highEnergyChecks = last3Days.filter(c => c.energyLevel && c.energyLevel >= 4);
        const consistentHighEnergy = highEnergyChecks.length >= 6;
        
        const morningChecks = last3Days.filter(c => c.checkInType === 'morning');
        const littleSleepHighEnergy = morningChecks.some(m => 
            m.sleepHours <= 5 && 
            last3Days.filter(c => c.energyLevel >= 4).length >= 3
        );
        
        const lateNightActivity = last3Days.filter(c => {
            const hour = new Date(c.timestamp).getHours();
            return hour >= 23 || hour <= 3;
        }).length >= 2;
        
        const signals = [rapidTaskCompletion, consistentHighEnergy, littleSleepHighEnergy, lateNightActivity];
        return signals.filter(Boolean).length >= 2;
    },
    
    detectDepression() {
        const today = this.getCheckInsFromLastHours(24);
        const last3Days = this.getCheckInsFromLastDays(3);
        
        const hour = new Date().getHours();
        const noTasksCompleted = hour >= 15 && today.filter(c => c.checkInType === 'task-completion').length === 0;
        
        const lowEnergyChecks = last3Days.filter(c => c.energyLevel && c.energyLevel <= 2);
        const consistentLowEnergy = lowEnergyChecks.length >= 6;
        
        const morningChecks = last3Days.filter(c => c.checkInType === 'morning');
        const excessiveSleep = morningChecks.some(m => 
            m.sleepHours >= 10 && 
            last3Days.filter(c => c.energyLevel <= 2).length >= 3
        );
        
        const missedMedication = morningChecks.filter(m => !m.medicationTaken).length >= 2;
        
        const signals = [noTasksCompleted, consistentLowEnergy, excessiveSleep, missedMedication];
        return signals.filter(Boolean).length >= 2;
    },
    
    detectMixedState() {
        const last24Hours = this.getCheckInsFromLastHours(24);
        const last2Days = this.getCheckInsFromLastDays(2);
        
        const mixedStateSignals = last24Hours.filter(c => 
            c.mood && c.energyLevel && c.mood <= 2 && c.energyLevel >= 4
        );
        
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
                signals: ['Completed multiple tasks quickly', 'High energy for several days', 'Less sleep than usual'],
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
                signals: ['No tasks completed yet', 'Energy has been low', 'Sleeping a lot but still tired'],
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
                signals: ['Low mood but high energy', 'Irritability flagged', 'Racing thoughts'],
                options: [
                    { value: 'agitated', label: 'Agitated/wired but sad 😣' },
                    { value: 'restless', label: 'Restless and down 😤' },
                    { value: 'off', label: "Something's off ⚠️" }
                ]
            };
        }
        
        const modal = MoodUI.createModal(alertConfig.title, `
            <p style="margin-bottom: 15px;">${alertConfig.message}</p>
            <ul style="margin: 15px 0; padding-left: 20px; color: var(--text-light);">
                ${alertConfig.signals.map(s => `<li>${s}</li>`).join('')}
            </ul>
            
            <p style="margin: 20px 0; font-weight: 600;">Quick check-in?</p>
            
            <div class="form-group">
                <label>Mood:</label>
                ${MoodUI.moodSelector('patternMood')}
            </div>
            
            <div class="form-group">
                <label>Energy:</label>
                ${MoodUI.energySelector('patternEnergy')}
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
        `);
        
        document.body.appendChild(modal);
        MoodUI.initSelectors(modal);
    },
    
    savePatternAlert(patternType) {
        const modal = document.querySelector('.mood-check-in-modal');
        const mood = MoodUI.getSelectedMood(modal, 'patternMood') || 3;
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
        
        modal.remove();
        this.showToast('✓ Pattern check-in saved 💜');
    }
});
