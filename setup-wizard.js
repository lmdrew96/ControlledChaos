// ===== INITIAL SETUP WIZARD =====
// User-friendly onboarding flow for first-time setup

const SetupWizard = {
    currentStep: 0,
    steps: [
        'welcome',
        'courses',
        'schedule',
        'templates',
        'mood-tracker',
        'preferences',
        'complete'
    ],
    
    data: {
        courses: [],
        scheduleBlocks: [],
        templates: [],
        enableMoodTracker: true,
        maxWorkTime: 90,
        useDyslexicFont: false
    },
    
    start() {
        this.currentStep = 0;
        this.showStep('welcome');
    },
    
    showStep(stepName) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'setupWizardModal';
        
        let content = '';
        
        switch(stepName) {
            case 'welcome':
                content = this.renderWelcomeStep();
                break;
            case 'courses':
                content = this.renderCoursesStep();
                break;
            case 'schedule':
                content = this.renderScheduleStep();
                break;
            case 'templates':
                content = this.renderTemplatesStep();
                break;
            case 'mood-tracker':
                content = this.renderMoodTrackerStep();
                break;
            case 'preferences':
                content = this.renderPreferencesStep();
                break;
            case 'complete':
                content = this.renderCompleteStep();
                break;
        }
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                ${content}
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    renderWelcomeStep() {
        return `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 4em; margin-bottom: 20px;">🌀</div>
                <h2 style="color: var(--primary); margin-bottom: 15px;">Welcome to Controlled Chaos!</h2>
                <p style="font-size: 1.1em; color: var(--text-light); margin-bottom: 25px; line-height: 1.6;">
                    Let's set up your ADHD-friendly productivity workspace.<br>
                    This will take about <strong>5 minutes</strong>.
                </p>
                
                <div style="text-align: left; background: rgba(102, 126, 234, 0.1); padding: 20px; border-radius: 10px; margin-bottom: 25px;">
                    <h3 style="margin-bottom: 15px;">📋 We'll set up:</h3>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        <li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.1);">📚 Your courses</li>
                        <li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.1);">📅 Your weekly schedule</li>
                        <li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.1);">📝 Task templates</li>
                        <li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.1);">💜 Mood tracking (optional)</li>
                        <li style="padding: 8px 0;">🎨 Your preferences</li>
                    </ul>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary" onclick="document.getElementById('setupWizardModal').remove()" style="flex: 1;">
                        Maybe Later
                    </button>
                    <button class="btn btn-primary" onclick="SetupWizard.nextStep()" style="flex: 2;">
                        Let's Go! 🚀
                    </button>
                </div>
            </div>
        `;
    },
    
    renderCoursesStep() {
        return `
            <div class="modal-header">
                <h2>📚 Step 1: Your Courses</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 1 of 5</div>
            </div>
            
            <p style="color: var(--text-light); margin-bottom: 20px;">
                Add the classes you're taking this semester. You can always add more later!
            </p>
            
            <div id="setupCoursesList" style="margin-bottom: 20px;">
                <!-- Courses will be added here -->
            </div>
            
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <input type="text" id="setupCourseName" placeholder="Course name (e.g., Biology 101)" 
                       style="flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                <button class="btn btn-primary" onclick="SetupWizard.addCourse()">
                    ➕ Add
                </button>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 25px;">
                <button class="btn btn-secondary" onclick="SetupWizard.prevStep()">
                    ← Back
                </button>
                <button class="btn btn-primary" onclick="SetupWizard.nextStep()" style="flex: 1;">
                    Next: Schedule →
                </button>
            </div>
            
            <p style="text-align: center; margin-top: 15px; color: var(--text-light); font-size: 0.85em;">
                Skip this if you want - you can add courses anytime in Settings
            </p>
        `;
    },
    
    renderScheduleStep() {
        return `
            <div class="modal-header">
                <h2>📅 Step 2: Weekly Schedule</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 2 of 5</div>
            </div>
            
            <p style="color: var(--text-light); margin-bottom: 20px;">
                When are your classes? Add your recurring weekly schedule.
            </p>
            
            <div id="setupScheduleList" style="margin-bottom: 20px; max-height: 300px; overflow-y: auto;">
                <!-- Schedule blocks will be added here -->
            </div>
            
            <button class="btn btn-secondary" onclick="SetupWizard.showAddScheduleBlock()" style="width: 100%; margin-bottom: 20px;">
                ➕ Add Time Block
            </button>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" onclick="SetupWizard.prevStep()">
                    ← Back
                </button>
                <button class="btn btn-primary" onclick="SetupWizard.nextStep()" style="flex: 1;">
                    Next: Templates →
                </button>
            </div>
            
            <p style="text-align: center; margin-top: 15px; color: var(--text-light); font-size: 0.85em;">
                Or skip and add schedule blocks later in the Schedule tab
            </p>
        `;
    },
    
    renderTemplatesStep() {
        return `
            <div class="modal-header">
                <h2>📝 Step 3: Task Templates</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 3 of 5</div>
            </div>
            
            <p style="color: var(--text-light); margin-bottom: 20px;">
                Create templates for recurring weekly tasks (readings, problem sets, etc.)
            </p>
            
            <div style="background: rgba(102, 126, 234, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <strong>💡 Pro tip:</strong> Templates let you create all your weekly tasks with one click!
            </div>
            
            <div id="setupTemplatesList" style="margin-bottom: 20px;">
                <!-- Templates will be added here -->
            </div>
            
            <button class="btn btn-secondary" onclick="SetupWizard.showAddTemplate()" style="width: 100%; margin-bottom: 20px;">
                ➕ Create Template
            </button>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" onclick="SetupWizard.prevStep()">
                    ← Back
                </button>
                <button class="btn btn-primary" onclick="SetupWizard.nextStep()" style="flex: 1;">
                    Next: Mood Tracking →
                </button>
            </div>
            
            <p style="text-align: center; margin-top: 15px; color: var(--text-light); font-size: 0.85em;">
                Skip for now - you can create templates anytime in Settings
            </p>
        `;
    },
    
    renderMoodTrackerStep() {
        return `
            <div class="modal-header">
                <h2>💜 Step 4: Mood Tracking</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 4 of 5</div>
            </div>
            
            <p style="color: var(--text-light); margin-bottom: 20px;">
                Track your mood and energy levels. Helps identify patterns and supports therapy discussions.
            </p>
            
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <div style="font-size: 2em; margin-bottom: 10px;">📊</div>
                <h3 style="margin-bottom: 10px;">Features Include:</h3>
                <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
                    <li>Quick mood & energy check-ins</li>
                    <li>Pattern detection (hypomania, depression, mixed states)</li>
                    <li>Visual trends and insights</li>
                    <li>Export reports for therapy</li>
                </ul>
            </div>
            
            <label style="display: flex; align-items: center; gap: 12px; padding: 15px; background: var(--bg-main); border-radius: 8px; cursor: pointer; margin-bottom: 20px;">
                <input type="checkbox" id="setupEnableMoodTracker" checked style="width: 24px; height: 24px;">
                <span style="font-weight: 600;">Enable Mood Tracking</span>
            </label>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" onclick="SetupWizard.prevStep()">
                    ← Back
                </button>
                <button class="btn btn-primary" onclick="SetupWizard.nextStep()" style="flex: 1;">
                    Next: Preferences →
                </button>
            </div>
        `;
    },
    
    renderPreferencesStep() {
        return `
            <div class="modal-header">
                <h2>🎨 Step 5: Preferences</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 5 of 5</div>
            </div>
            
            <p style="color: var(--text-light); margin-bottom: 20px;">
                Customize your experience. All of these can be changed later!
            </p>
            
            <div class="form-group">
                <label style="font-weight: 600; margin-bottom: 10px; display: block;">Max Daily Work Time</label>
                <p style="color: var(--text-light); font-size: 0.9em; margin-bottom: 10px;">
                    How many minutes of focused work per day? Be realistic!
                </p>
                <input type="number" id="setupMaxWorkTime" value="90" min="30" max="300" step="15"
                       style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                <small style="color: var(--text-light); margin-top: 5px; display: block;">
                    Recommended: 60-120 minutes
                </small>
            </div>
            
            <label style="display: flex; align-items: center; gap: 12px; padding: 15px; background: var(--bg-main); border-radius: 8px; cursor: pointer; margin-bottom: 20px;">
                <input type="checkbox" id="setupDyslexicFont" style="width: 24px; height: 24px;">
                <div>
                    <div style="font-weight: 600;">Use Dyslexia-Friendly Font</div>
                    <div style="font-size: 0.85em; color: var(--text-light);">OpenDyslexic font for easier reading</div>
                </div>
            </label>
            
            <div style="display: flex; gap: 10px; margin-top: 25px;">
                <button class="btn btn-secondary" onclick="SetupWizard.prevStep()">
                    ← Back
                </button>
                <button class="btn btn-primary" onclick="SetupWizard.nextStep()" style="flex: 1;">
                    Finish Setup! 🎉
                </button>
            </div>
        `;
    },
    
    renderCompleteStep() {
        return `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 4em; margin-bottom: 20px;">🎉</div>
                <h2 style="color: var(--primary); margin-bottom: 15px;">You're All Set!</h2>
                <p style="font-size: 1.1em; color: var(--text-light); margin-bottom: 25px; line-height: 1.6;">
                    Controlled Chaos is ready to help you manage your beautiful mess!
                </p>
                
                <div style="text-align: left; background: rgba(102, 126, 234, 0.1); padding: 20px; border-radius: 10px; margin-bottom: 25px;">
                    <h3 style="margin-bottom: 15px;">🚀 Quick Start Tips:</h3>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        <li style="padding: 8px 0;">💡 Use <strong>Brain Dump</strong> when overwhelmed</li>
                        <li style="padding: 8px 0;">✨ Try <strong>Pick For Me</strong> when you can't decide</li>
                        <li style="padding: 8px 0;">📅 Check your <strong>Schedule</strong> tab for what's next</li>
                        <li style="padding: 8px 0;">💜 Log quick moods throughout the day</li>
                    </ul>
                </div>
                
                <button class="btn btn-primary" onclick="SetupWizard.complete()" style="width: 100%; padding: 15px; font-size: 1.1em;">
                    Start Using Controlled Chaos! 🌀
                </button>
            </div>
        `;
    },
    
    addCourse() {
        const input = document.getElementById('setupCourseName');
        const name = input.value.trim();
        if (!name) return;
        
        this.data.courses.push(name);
        input.value = '';
        this.updateCoursesList();
    },
    
    updateCoursesList() {
        const list = document.getElementById('setupCoursesList');
        if (!list) return;
        
        if (this.data.courses.length === 0) {
            list.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 20px;">No courses added yet</p>';
            return;
        }
        
        list.innerHTML = this.data.courses.map((course, index) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-main); border-radius: 6px; margin-bottom: 8px;">
                <span>${course}</span>
                <button class="btn btn-secondary btn-sm" onclick="SetupWizard.removeCourse(${index})">Remove</button>
            </div>
        `).join('');
    },
    
    removeCourse(index) {
        this.data.courses.splice(index, 1);
        this.updateCoursesList();
    },
    
    showAddScheduleBlock() {
        alert('Schedule block creation coming in next step! For now, you can skip this and add blocks later in the Schedule tab.');
    },
    
    showAddTemplate() {
        alert('Template creation coming in next step! For now, you can skip this and create templates later in Settings.');
    },
    
    nextStep() {
        // Save current step data
        this.saveCurrentStep();
        
        // Move to next step
        this.currentStep++;
        if (this.currentStep >= this.steps.length) {
            this.currentStep = this.steps.length - 1;
        }
        
        // Close current modal and show next
        document.getElementById('setupWizardModal')?.remove();
        this.showStep(this.steps[this.currentStep]);
    },
    
    prevStep() {
        this.currentStep--;
        if (this.currentStep < 0) this.currentStep = 0;
        
        document.getElementById('setupWizardModal')?.remove();
        this.showStep(this.steps[this.currentStep]);
    },
    
    saveCurrentStep() {
        const stepName = this.steps[this.currentStep];
        
        if (stepName === 'mood-tracker') {
            this.data.enableMoodTracker = document.getElementById('setupEnableMoodTracker')?.checked ?? true;
        }
        
        if (stepName === 'preferences') {
            this.data.maxWorkTime = parseInt(document.getElementById('setupMaxWorkTime')?.value) || 90;
            this.data.useDyslexicFont = document.getElementById('setupDyslexicFont')?.checked ?? false;
        }
    },
    
    complete() {
        // Apply all settings (without duplicating existing data)
        
        // Courses - only add if they don't exist
        if (this.data.courses.length > 0) {
            const existingCourses = loadData().courses || [];
            const existingNames = existingCourses.map(c => c.name.toLowerCase());
            
            this.data.courses.forEach(courseName => {
                if (!existingNames.includes(courseName.toLowerCase())) {
                    existingCourses.push({
                        id: Date.now().toString() + Math.random(),
                        name: courseName
                    });
                }
            });
            
            const data = loadData();
            data.courses = existingCourses;
            saveData(data);
        }
        
        // Mood tracker
        const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
        settings.moodTrackerEnabled = this.data.enableMoodTracker;
        settings.maxWorkTime = this.data.maxWorkTime;
        localStorage.setItem('appSettings', JSON.stringify(settings));
        
        // Apply dyslexic font if selected
        if (this.data.useDyslexicFont) {
            document.body.classList.add('dyslexic-font');
        }
        
        // Close modal
        document.getElementById('setupWizardModal')?.remove();
        
        // Show success message
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
        
        // Reload page to apply changes
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
};

// Global function to start wizard
function startInitialSetup() {
    SetupWizard.start();
}
