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
        
        return `
            <div class="insights-view">
                <h3 style="margin-bottom: 20px;">Last 30 Days Insights</h3>
                <div style="background: var(--bg-main); padding: 20px; border-radius: 10px;">
                    <p>Total check-ins: ${last30Days.length}</p>
                </div>
            </div>
        `;
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
