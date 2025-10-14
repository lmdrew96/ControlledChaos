// ===== MOOD TRACKER STORAGE =====
// Data management, edit, delete, export, and import functionality

const MoodStorage = {
    // Edit existing check-in
    editCheckIn(checkInId, updates) {
        const index = MoodTracker.checkIns.findIndex(c => c.id === checkInId);
        if (index !== -1) {
            MoodTracker.checkIns[index] = {
                ...MoodTracker.checkIns[index],
                ...updates,
                editedAt: new Date().toISOString()
            };
            MoodTracker.save();
            return true;
        }
        return false;
    },

    // Delete check-in
    deleteCheckIn(checkInId) {
        const index = MoodTracker.checkIns.findIndex(c => c.id === checkInId);
        if (index !== -1) {
            MoodTracker.checkIns.splice(index, 1);
            MoodTracker.save();
            return true;
        }
        return false;
    },

    // Show edit modal
    showEditModal(checkInId) {
        const checkIn = MoodTracker.checkIns.find(c => c.id === checkInId);
        if (!checkIn) return;

        const modal = MoodUI.createModal('Edit Check-In', `
            <div class="form-group">
                <label>Mood:</label>
                ${MoodUI.moodSelector('editMood')}
            </div>
            
            <div class="form-group">
                <label>Energy:</label>
                ${MoodUI.energySelector('editEnergy')}
            </div>
            
            <div class="form-group">
                <label>Note:</label>
                <textarea id="editNote" rows="3" style="width: 100%; padding: 12px; border: 2px solid var(--border); border-radius: 8px; resize: vertical;">${checkIn.note || ''}</textarea>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="MoodStorage.saveEdit('${checkInId}')" style="flex: 1;">Save Changes</button>
            </div>
        `);

        document.body.appendChild(modal);
        MoodUI.initSelectors(modal);

        // Pre-select current values
        if (checkIn.mood || checkIn.moodOverall) {
            const moodValue = checkIn.mood || checkIn.moodOverall;
            const moodBtn = modal.querySelector(`.mood-emoji-btn[data-mood="${moodValue}"]`);
            if (moodBtn) moodBtn.classList.add('selected');
        }

        if (checkIn.energyLevel || checkIn.energyOverall) {
            const energyInput = modal.querySelector('#editEnergy');
            if (energyInput) energyInput.value = checkIn.energyLevel || checkIn.energyOverall;
        }
    },

    saveEdit(checkInId) {
        const modal = document.querySelector('.mood-check-in-modal');
        const mood = MoodUI.getSelectedMood(modal, 'editMood');
        const energyInput = document.getElementById('editEnergy');
        const energy = energyInput ? parseInt(energyInput.value) : null;
        const note = document.getElementById('editNote').value.trim();

        const updates = {};
        if (mood) updates.mood = mood;
        if (energy) updates.energyLevel = energy;
        if (note) updates.note = note;

        if (this.editCheckIn(checkInId, updates)) {
            modal.remove();
            MoodTracker.showToast('✓ Check-in updated');
            
            // Refresh visualization if open
            const vizModal = document.querySelector('.modal.active');
            if (vizModal && vizModal.querySelector('#vizContent')) {
                MoodTracker.showVisualization();
            }
        }
    },

    // Export all data as JSON
    exportData() {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            checkIns: MoodTracker.checkIns,
            settings: MoodTracker.settings
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mood-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        MoodTracker.showToast('✓ Data exported!');
    },

    // Import data from JSON
    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    
                    // Merge with existing data (don't overwrite)
                    const existingIds = new Set(MoodTracker.checkIns.map(c => c.id));
                    const newCheckIns = data.checkIns.filter(c => !existingIds.has(c.id));
                    
                    MoodTracker.checkIns.push(...newCheckIns);
                    MoodTracker.save();
                    
                    MoodTracker.showToast(`✓ Imported ${newCheckIns.length} check-ins!`);
                } catch (err) {
                    MoodTracker.showToast('❌ Invalid file format');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
};
