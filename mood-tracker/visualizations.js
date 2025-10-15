// ===== VISUALIZATIONS & EXPORT =====
// Charts, calendar views, insights, and PDF export

Object.assign(MoodTracker, {
    // Show visualization modal
    showVisualization() {
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.innerHTML = `
            <div class="modal-content mood-viz-content">
                <div class="modal-header">
                    <h2>📊 Your Patterns</h2>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
                </div>
                
                <!-- Quick Stats Bar -->
                <div class="quick-stats">
                    <div class="stat-card">
                        <div class="stat-icon">🔥</div>
                        <div class="stat-value">${QuickCheck.calculateStreak()}</div>
                        <div class="stat-label">Day Streak</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📝</div>
                        <div class="stat-value">${this.checkIns.length}</div>
                        <div class="stat-label">Total Logs</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">😊</div>
                        <div class="stat-value">${this.getAverageMood()}</div>
                        <div class="stat-label">Avg Mood</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⚡</div>
                        <div class="stat-value">${this.getAverageEnergy()}</div>
                        <div class="stat-label">Avg Energy</div>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div class="viz-actions">
                    <button class="btn btn-primary" onclick="MoodTracker.showExportModal()">
                        📄 Export for Therapy
                    </button>
                    <button class="btn btn-secondary" onclick="MoodStorage.exportData()">
                        💾 Backup Data
                    </button>
                    <button class="btn btn-secondary" onclick="MoodStorage.importData()">
                        📥 Import Data
                    </button>
                </div>
                
                <!-- Tabs -->
                <div class="viz-tabs">
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
                
                <div id="vizContent">
                    ${this.renderTrendsView()}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    getAverageMood() {
        const last7Days = this.getCheckInsFromLastDays(7);
        if (last7Days.length === 0) return '-';
        
        const moods = last7Days
            .filter(c => c.mood || c.moodOverall)
            .map(c => c.mood || c.moodOverall);
        
        if (moods.length === 0) return '-';
        
        const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
        return avg.toFixed(1);
    },
    
    getAverageEnergy() {
        const last7Days = this.getCheckInsFromLastDays(7);
        if (last7Days.length === 0) return '-';
        
        const energyLevels = last7Days
            .filter(c => c.energyLevel || c.energyOverall)
            .map(c => c.energyLevel || c.energyOverall);
        
        if (energyLevels.length === 0) return '-';
        
        const avg = energyLevels.reduce((a, b) => a + b, 0) / energyLevels.length;
        return avg.toFixed(1);
    },
    
    switchVizTab(tab, button) {
        document.querySelectorAll('.viz-tab').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
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
        
        return `
            <div class="trends-container">
                <h3 style="margin-bottom: 20px;">Last 14 Days</h3>
                <div style="background: var(--bg-main); padding: 20px; border-radius: 10px;">
                    <p style="color: var(--text-light);">You have ${last14Days.length} check-ins in the last 14 days.</p>
                    <p style="margin-top: 10px;">Average mood: ${this.getAverageMood()}/5</p>
                </div>
            </div>
        `;
    },
    
    renderCalendarView() {
        return `
            <div style="text-align: center; padding: 40px; color: var(--text-light);">
                <div style="font-size: 3em; margin-bottom: 15px;">📅</div>
                <p>Calendar view coming soon!</p>
            </div>
        `;
    },
    
    renderInsightsView() {
        const last30Days = this.getCheckInsFromLastDays(30);
        
        if (last30Days.length < 5) {
            return `
                <div style="text-align: center; padding: 40px; color: var(--text-light);">
                    <div style="font-size: 3em; margin-bottom: 15px;">💡</div>
                    <p>Not enough data yet! Complete more check-ins to see insights.</p>
                </div>
            `;
        }
        
        // Sort check-ins by timestamp (newest first)
        const sortedCheckIns = [...last30Days].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        return `
            <div class="insights-view">
                <h3 style="margin-bottom: 20px;">Recent Check-Ins</h3>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${sortedCheckIns.map(checkIn => {
                        const date = new Date(checkIn.timestamp);
                        const dateStr = date.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                        });
                        
                        const mood = checkIn.mood || checkIn.moodOverall || '-';
                        const energy = checkIn.energyLevel || checkIn.energyOverall || '-';
                        const moodEmoji = mood !== '-' ? ['😔', '😐', '😊', '😃', '🤩'][mood - 1] : '';
                        const energyEmoji = energy !== '-' ? ['💤', '😴', '😐', '⚡', '🚀'][energy - 1] : '';
                        
                        return `
                            <div style="background: var(--bg-main); padding: 15px; border-radius: 10px; border: 2px solid var(--border); transition: all 0.2s;">
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                                    <div>
                                        <div style="font-weight: 600; color: var(--text);">${checkIn.checkInType || 'Check-in'}</div>
                                        <div style="font-size: 0.85em; color: var(--text-light);">${dateStr}</div>
                                    </div>
                                    <button class="btn btn-secondary btn-sm" onclick="MoodTracker.showEditCheckInModal('${checkIn.id}')" style="padding: 6px 12px;">
                                        ✏️ Edit
                                    </button>
                                </div>
                                ${mood !== '-' ? `
                                    <div style="margin-bottom: 8px;">
                                        <span style="color: var(--text-light); font-size: 0.9em;">Mood:</span>
                                        <span style="margin-left: 8px; font-weight: 600;">${moodEmoji} ${mood}/5</span>
                                    </div>
                                ` : ''}
                                ${energy !== '-' ? `
                                    <div style="margin-bottom: 8px;">
                                        <span style="color: var(--text-light); font-size: 0.9em;">Energy:</span>
                                        <span style="margin-left: 8px; font-weight: 600;">${energyEmoji} ${energy}/5</span>
                                    </div>
                                ` : ''}
                                ${checkIn.note ? `
                                    <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 6px; font-size: 0.9em; color: var(--text);">
                                        ${checkIn.note}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },
    
    // Show edit modal for a check-in
    showEditCheckInModal(checkInId) {
        console.log('✏️ Editing check-in:', checkInId);
        
        const checkIn = this.checkIns.find(c => c.id === checkInId);
        if (!checkIn) {
            this.showToast('❌ Check-in not found');
            return;
        }
        
        const date = new Date(checkIn.timestamp);
        const dateTimeValue = date.toISOString().slice(0, 16); // Format for datetime-local input
        
        const hasMood = checkIn.mood !== undefined || checkIn.moodOverall !== undefined;
        const hasEnergy = checkIn.energyLevel !== undefined || checkIn.energyOverall !== undefined;
        const hasNote = checkIn.note !== undefined;
        
        const currentMood = checkIn.mood || checkIn.moodOverall || 3;
        const currentEnergy = checkIn.energyLevel || checkIn.energyOverall || 3;
        const currentNote = checkIn.note || '';
        
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.id = 'editCheckInModal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>✏️ Edit Check-In</h2>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
                </div>
                
                <div class="form-group">
                    <label>Date & Time:</label>
                    <input type="datetime-local" id="editTimestamp" value="${dateTimeValue}" 
                           style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                </div>
                
                ${hasMood ? `
                    <div class="form-group">
                        <label>Mood: <span id="editMoodEmoji" style="font-size: 1.5em; margin-left: 10px;">${['😔', '😐', '😊', '😃', '🤩'][currentMood - 1]}</span></label>
                        <input type="range" id="editMood" min="1" max="5" value="${currentMood}" 
                               oninput="document.getElementById('editMoodEmoji').textContent = ['😔', '😐', '😊', '😃', '🤩'][this.value - 1]"
                               style="width: 100%;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: var(--text-light); margin-top: 5px;">
                            <span>😔 Very Low</span>
                            <span>🤩 Very High</span>
                        </div>
                    </div>
                ` : ''}
                
                ${hasEnergy ? `
                    <div class="form-group">
                        <label>Energy: <span id="editEnergyEmoji" style="font-size: 1.5em; margin-left: 10px;">${['💤', '😴', '😐', '⚡', '🚀'][currentEnergy - 1]}</span></label>
                        <input type="range" id="editEnergy" min="1" max="5" value="${currentEnergy}"
                               oninput="document.getElementById('editEnergyEmoji').textContent = ['💤', '😴', '😐', '⚡', '🚀'][this.value - 1]"
                               style="width: 100%;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: var(--text-light); margin-top: 5px;">
                            <span>💤 Exhausted</span>
                            <span>🚀 Energized</span>
                        </div>
                    </div>
                ` : ''}
                
                ${hasNote ? `
                    <div class="form-group">
                        <label>Note:</label>
                        <textarea id="editNote" rows="4" 
                                  style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; resize: vertical;">${currentNote}</textarea>
                    </div>
                ` : ''}
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn btn-danger" onclick="MoodTracker.deleteCheckIn('${checkInId}')" style="flex: 1;">
                        🗑️ Delete
                    </button>
                    <button class="btn btn-primary" onclick="MoodTracker.saveEditedCheckIn('${checkInId}')" style="flex: 2;">
                        💾 Save Changes
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    // Save edited check-in
    saveEditedCheckIn(checkInId) {
        console.log('💾 Saving edited check-in:', checkInId);
        
        const checkIn = this.checkIns.find(c => c.id === checkInId);
        if (!checkIn) {
            this.showToast('❌ Check-in not found');
            return;
        }
        
        // Get new values from form
        const newTimestamp = document.getElementById('editTimestamp')?.value;
        const newMood = document.getElementById('editMood')?.value;
        const newEnergy = document.getElementById('editEnergy')?.value;
        const newNote = document.getElementById('editNote')?.value;
        
        // Update check-in object
        if (newTimestamp) {
            checkIn.timestamp = new Date(newTimestamp).toISOString();
        }
        
        if (newMood) {
            if (checkIn.mood !== undefined) {
                checkIn.mood = parseInt(newMood);
            } else if (checkIn.moodOverall !== undefined) {
                checkIn.moodOverall = parseInt(newMood);
            }
        }
        
        if (newEnergy) {
            if (checkIn.energyLevel !== undefined) {
                checkIn.energyLevel = parseInt(newEnergy);
            } else if (checkIn.energyOverall !== undefined) {
                checkIn.energyOverall = parseInt(newEnergy);
            }
        }
        
        if (newNote !== undefined) {
            checkIn.note = newNote;
        }
        
        // Save to storage
        this.save();
        
        // Re-detect patterns with updated data
        this.detectPatterns();
        
        // Close modal
        document.getElementById('editCheckInModal')?.remove();
        
        // Refresh the insights view
        const vizContent = document.getElementById('vizContent');
        if (vizContent) {
            vizContent.innerHTML = this.renderInsightsView();
        }
        
        this.showToast('✅ Check-in updated!');
        console.log('✅ Check-in saved successfully');
    },
    
    // Delete check-in
    deleteCheckIn(checkInId) {
        console.log('🗑️ Deleting check-in:', checkInId);
        
        if (!confirm('Are you sure you want to delete this check-in? This cannot be undone.')) {
            return;
        }
        
        // Remove from array
        this.checkIns = this.checkIns.filter(c => c.id !== checkInId);
        
        // Save to storage
        this.save();
        
        // Close any open modals
        document.getElementById('editCheckInModal')?.remove();
        
        // Refresh the insights view
        const vizContent = document.getElementById('vizContent');
        if (vizContent) {
            vizContent.innerHTML = this.renderInsightsView();
        }
        
        this.showToast('🗑️ Check-in deleted');
        console.log('✅ Check-in deleted successfully');
    },
    
    // Export modal
    showExportModal() {
        const modal = MoodUI.createModal('📄 Export for Therapy', `
            <div style="margin-bottom: 20px;">
                <label>Date Range:</label>
                <select id="exportDateRange" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; margin-top: 8px;">
                    <option value="7">Last 7 days</option>
                    <option value="14" selected>Last 2 weeks</option>
                    <option value="30">Last month</option>
                </select>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label>Notes for Therapist (optional):</label>
                <textarea id="therapistNotes" placeholder="Add any context or questions..." rows="4" 
                          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; margin-top: 8px; resize: vertical;"></textarea>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="MoodTracker.generateSimplePDF()" style="flex: 1;">Generate PDF</button>
            </div>
        `);
        
        document.body.appendChild(modal);
    },
    
    generateSimplePDF() {
        const dateRange = parseInt(document.getElementById('exportDateRange').value);
        const therapistNotes = document.getElementById('therapistNotes').value;
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);
        
        const filteredCheckIns = this.checkIns.filter(c => {
            const checkInDate = new Date(c.timestamp);
            return checkInDate >= startDate && checkInDate <= endDate;
        });
        
        if (filteredCheckIns.length === 0) {
            this.showToast('⚠️ No check-ins found in this date range');
            return;
        }
        
        // Check if jsPDF is available
        if (typeof window.jspdf === 'undefined') {
            this.showToast('⚠️ PDF library not loaded. Please refresh the page.');
            return;
        }
        
        this.showToast('📄 Generating PDF...');
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        let yPosition = 20;
        
        // Header
        doc.setFontSize(20);
        doc.setTextColor(102, 126, 234);
        doc.text('Mood Tracking Report', 105, yPosition, { align: 'center' });
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, 105, yPosition, { align: 'center' });
        yPosition += 15;
        
        // Overview
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text('Overview', 20, yPosition);
        yPosition += 8;
        
        doc.setFontSize(10);
        doc.text(`Total Check-Ins: ${filteredCheckIns.length}`, 20, yPosition);
        yPosition += 6;
        doc.text(`Average Mood: ${this.getAverageMood()}/5`, 20, yPosition);
        yPosition += 10;
        
        // Therapist Notes
        if (therapistNotes && therapistNotes.trim() !== '') {
            doc.setFontSize(14);
            doc.text('Notes for Discussion', 20, yPosition);
            yPosition += 8;
            
            doc.setFontSize(10);
            const noteLines = doc.splitTextToSize(therapistNotes, 160);
            noteLines.forEach(line => {
                doc.text(line, 20, yPosition);
                yPosition += 6;
            });
        }
        
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Controlled Chaos - Mood Tracking Report', 105, 280, { align: 'center' });
        
        // Save
        const filename = `mood-tracking-${startDate.toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        
        document.querySelector('.mood-check-in-modal').remove();
        this.showToast('✅ PDF downloaded!');
        
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    }
});
