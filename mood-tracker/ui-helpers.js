// ===== MOOD TRACKER UI HELPERS =====
// Reusable UI components and modal templates

const MoodUI = {
    // Reusable modal template
    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal active mood-check-in-modal';
        modal.innerHTML = `
            <div class="modal-content mood-modal-content">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
                </div>
                ${content}
            </div>
        `;
        return modal;
    },

    // Mood selector component (reusable)
    moodSelector(id = 'moodSelect') {
        return `
            <div class="mood-selector">
                <div class="mood-selector-emojis">
                    <button class="mood-emoji-btn" data-mood="1" data-id="${id}">😔</button>
                    <button class="mood-emoji-btn" data-mood="2" data-id="${id}">😐</button>
                    <button class="mood-emoji-btn" data-mood="3" data-id="${id}">😊</button>
                    <button class="mood-emoji-btn" data-mood="4" data-id="${id}">😃</button>
                    <button class="mood-emoji-btn" data-mood="5" data-id="${id}">🤩</button>
                </div>
            </div>
        `;
    },

    // Energy selector component (reusable)
    energySelector(id = 'energySelect') {
        return `
            <div class="energy-selector">
                <input type="range" id="${id}" min="1" max="5" value="3" step="1" class="energy-slider">
                <div class="energy-labels">
                    <span class="energy-label" data-value="1">💤</span>
                    <span class="energy-label" data-value="2">😴</span>
                    <span class="energy-label active" data-value="3">😐</span>
                    <span class="energy-label" data-value="4">⚡</span>
                    <span class="energy-label" data-value="5">🚀</span>
                </div>
            </div>
        `;
    },

    // Initialize mood/energy selectors after modal is added to DOM
    initSelectors(modalElement) {
        // Mood emoji selection
        modalElement.querySelectorAll('.mood-emoji-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                modalElement.querySelectorAll(`.mood-emoji-btn[data-id="${id}"]`).forEach(b => {
                    b.classList.remove('selected');
                });
                this.classList.add('selected');
            });
        });

        // Energy slider
        modalElement.querySelectorAll('.energy-slider').forEach(slider => {
            const updateLabels = () => {
                const value = slider.value;
                const labels = slider.parentElement.querySelectorAll('.energy-label');
                labels.forEach(label => {
                    label.classList.toggle('active', label.dataset.value === value);
                });
            };
            
            slider.addEventListener('input', updateLabels);
            updateLabels();
        });
    },

    // Get selected mood value
    getSelectedMood(modalElement, id = 'moodSelect') {
        const selected = modalElement.querySelector(`.mood-emoji-btn[data-id="${id}"].selected`);
        return selected ? parseInt(selected.dataset.mood) : null;
    }
};
