// ===== QUICK CHECK-IN FEATURE =====
// One-tap mood logging with streak tracking

const QuickCheck = {
    selectedMood: null,
    selectedEnergy: null,
    
    // Show floating quick check widget
    showWidget() {
        // Don't show if already open
        if (document.getElementById('quickMoodWidget')) return;
        
        const widget = document.createElement('div');
        widget.id = 'quickMoodWidget';
        widget.className = 'quick-mood-widget';
        widget.innerHTML = `
            <div class="quick-mood-header">
                <span>💜 Quick Check</span>
                <button class="quick-mood-close" onclick="QuickCheck.hideWidget()">×</button>
            </div>
            <div class="quick-mood-section-label" style="font-weight: 600; color: var(--text-light); margin-bottom: 8px;">Mood:</div>
            <div class="quick-mood-emojis">
                <button class="quick-mood-btn" data-mood="1" onclick="QuickCheck.logMood(1)">😔</button>
                <button class="quick-mood-btn" data-mood="2" onclick="QuickCheck.logMood(2)">😐</button>
                <button class="quick-mood-btn" data-mood="3" onclick="QuickCheck.logMood(3)">😊</button>
                <button class="quick-mood-btn" data-mood="4" onclick="QuickCheck.logMood(4)">😃</button>
                <button class="quick-mood-btn" data-mood="5" onclick="QuickCheck.logMood(5)">🤩</button>
            </div>
            <div class="quick-mood-section-label" style="margin-top: 15px; font-weight: 600; color: var(--text-light); margin-bottom: 8px;">Energy Level:</div>
            <div class="quick-mood-emojis">
                <button class="quick-mood-btn" data-energy="1" onclick="QuickCheck.selectEnergy(1)">💤</button>
                <button class="quick-mood-btn" data-energy="2" onclick="QuickCheck.selectEnergy(2)">😴</button>
                <button class="quick-mood-btn" data-energy="3" onclick="QuickCheck.selectEnergy(3)">😐</button>
                <button class="quick-mood-btn" data-energy="4" onclick="QuickCheck.selectEnergy(4)">⚡</button>
                <button class="quick-mood-btn" data-energy="5" onclick="QuickCheck.selectEnergy(5)">🚀</button>
            </div>
            <div class="quick-mood-streak" id="quickMoodStreak"></div>
        `;
        document.body.appendChild(widget);
        this.updateStreak();
    },

    logMood(mood) {
        this.selectedMood = mood;
        
        // Visual feedback - highlight selected button
        document.querySelectorAll('.quick-mood-btn[data-mood]').forEach(btn => {
            btn.style.transform = 'scale(1)';
            btn.style.opacity = '0.6';
        });
        const selectedBtn = document.querySelector(`.quick-mood-btn[data-mood="${mood}"]`);
        if (selectedBtn) {
            selectedBtn.style.transform = 'scale(1.2)';
            selectedBtn.style.opacity = '1';
        }
        
        // If both mood and energy are selected, auto-log
        if (this.selectedMood !== null && this.selectedEnergy !== null) {
            this.logBoth();
        }
    },
    
    selectEnergy(energy) {
        this.selectedEnergy = energy;
        
        // Visual feedback - highlight selected button
        document.querySelectorAll('.quick-mood-btn[data-energy]').forEach(btn => {
            btn.style.transform = 'scale(1)';
            btn.style.opacity = '0.6';
        });
        const selectedBtn = document.querySelector(`.quick-mood-btn[data-energy="${energy}"]`);
        if (selectedBtn) {
            selectedBtn.style.transform = 'scale(1.2)';
            selectedBtn.style.opacity = '1';
        }
        
        // If both mood and energy are selected, auto-log
        if (this.selectedMood !== null && this.selectedEnergy !== null) {
            this.logBoth();
        }
    },
    
    logBoth() {
        const checkIn = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            checkInType: 'quick-mood',
            mood: this.selectedMood,
            energyLevel: this.selectedEnergy
        };
        
        MoodTracker.checkIns.push(checkIn);
        MoodTracker.save();
        
        // Visual feedback
        this.celebrate();
        this.updateStreak();
        
        // Reset selections
        this.selectedMood = null;
        this.selectedEnergy = null;
        
        // Run pattern detection
        if (typeof MoodTracker.detectPatterns === 'function') {
            MoodTracker.detectPatterns();
        }
        
        // Close widget after logging
        setTimeout(() => this.hideWidget(), 1500);
    },

    celebrate() {
        // Confetti animation
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 50,
                spread: 60,
                origin: { y: 0.8 }
            });
        }
        
        // Show success toast
        const toast = document.createElement('div');
        toast.className = 'quick-mood-toast';
        toast.textContent = '✓ Logged!';
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    },

    updateStreak() {
        const streak = this.calculateStreak();
        const streakEl = document.getElementById('quickMoodStreak');
        if (streakEl) {
            streakEl.innerHTML = `
                <span class="streak-icon">🔥</span>
                <span class="streak-count">${streak}</span>
                <span class="streak-label">day streak!</span>
            `;
        }
    },

    calculateStreak() {
        const today = new Date().toISOString().split('T')[0];
        let streak = 0;
        let currentDate = new Date();
        
        while (true) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const hasCheckIn = MoodTracker.checkIns.some(c => 
                c.timestamp.split('T')[0] === dateStr
            );
            
            if (!hasCheckIn) break;
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
        }
        
        return streak;
    },

    hideWidget() {
        const widget = document.getElementById('quickMoodWidget');
        if (widget) widget.remove();
    }
};
