// ===== QUICK CHECK-IN FEATURE =====
// One-tap mood logging with streak tracking

const QuickCheck = {
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
            <div class="quick-mood-emojis">
                <button class="quick-mood-btn" data-mood="1" onclick="QuickCheck.logMood(1)">😔</button>
                <button class="quick-mood-btn" data-mood="2" onclick="QuickCheck.logMood(2)">😐</button>
                <button class="quick-mood-btn" data-mood="3" onclick="QuickCheck.logMood(3)">😊</button>
                <button class="quick-mood-btn" data-mood="4" onclick="QuickCheck.logMood(4)">😃</button>
                <button class="quick-mood-btn" data-mood="5" onclick="QuickCheck.logMood(5)">🤩</button>
            </div>
            <div class="quick-mood-streak" id="quickMoodStreak"></div>
        `;
        document.body.appendChild(widget);
        this.updateStreak();
    },

    logMood(mood) {
        // One-tap mood logging
        const checkIn = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            checkInType: 'quick-mood',
            mood,
            energyLevel: null
        };
        
        MoodTracker.checkIns.push(checkIn);
        MoodTracker.save();
        
        // Visual feedback
        this.celebrate();
        this.updateStreak();
        
        // Run pattern detection
        if (typeof MoodTracker.detectPatterns === 'function') {
            MoodTracker.detectPatterns();
        }
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
