// ===== MOOD TRACKER CORE =====
// Main MoodTracker object and initialization

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
        
        // Show quick mood widget if no check-in today
        const today = new Date().toISOString().split('T')[0];
        const hasCheckedInToday = this.checkIns.some(c => 
            c.timestamp.split('T')[0] === today
        );
        
        if (!hasCheckedInToday) {
            setTimeout(() => QuickCheck.showWidget(), 5000);
        }
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
    
    // Helper functions
    getCheckInsFromLastHours(hours) {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        return this.checkIns.filter(c => new Date(c.timestamp) > cutoff);
    },
    
    getCheckInsFromLastDays(days) {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return this.checkIns.filter(c => new Date(c.timestamp) > cutoff);
    },
    
    hasCompletedCheckInRecently(type, minutes) {
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        return this.checkIns.some(c => 
            c.checkInType === type && 
            new Date(c.timestamp) > cutoff
        );
    },
    
    // Check for evening reflection
    checkEveningReflection() {
        const now = new Date();
        const hour = now.getHours();
        const today = now.toISOString().split('T')[0];
        
        // Only show after 7pm and if not done today
        if (hour >= 19 && this.lastEveningCheckIn !== today) {
            this.showEveningReflection();
        }
    },
    
    // Check for post-intense activity
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
    }
};

// Initialize mood tracker when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MoodTracker.init());
} else {
    MoodTracker.init();
}
