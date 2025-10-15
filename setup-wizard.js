// ===== INITIAL SETUP WIZARD =====
// User-friendly onboarding flow for first-time setup

const SetupWizard = {
    currentStep: 0,
    steps: [
        'welcome',
        'courses',
        'schedule',
        'templates',
        'projects',
        'mood-tracker',
        'preferences',
        'complete'
    ],
    
    data: {
        courses: [],
        scheduleBlocks: [],
        templates: [],
        projects: [],
        enableMoodTracker: true,
        maxWorkTime: 90,
        useDyslexicFont: false
    },
    
    start() {
        this.currentStep = 0;
        this.showStep('welcome');
    },
    
    close() {
        document.getElementById('setupWizardModal')?.remove();
        document.getElementById('scheduleBlockForm')?.remove();
        document.getElementById('templateForm')?.remove();
        document.getElementById('projectForm')?.remove();
    },
    
    showStep(stepName) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'setupWizardModal';
        
        // Add click handler to close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.close();
            }
        });
        
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
            case 'projects':
                content = this.renderProjectsStep();
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
                        <li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.1);">💻 Your projects</li>
                        <li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.1);">💜 Mood tracking (optional)</li>
                        <li style="padding: 8px 0;">🎨 Your preferences</li>
                    </ul>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary" onclick="SetupWizard.close()" style="flex: 1;">
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
            <div class="modal-header" style="position: relative;">
                <button onclick="SetupWizard.close()" style="position: absolute; top: 0; right: 0; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-light); padding: 5px 10px;">&times;</button>
                <h2>📚 Step 1: Your Courses</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 1 of 6</div>
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
            <div class="modal-header" style="position: relative;">
                <button onclick="SetupWizard.close()" style="position: absolute; top: 0; right: 0; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-light); padding: 5px 10px;">&times;</button>
                <h2>📅 Step 2: Weekly Schedule</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 2 of 6</div>
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
            <div class="modal-header" style="position: relative;">
                <button onclick="SetupWizard.close()" style="position: absolute; top: 0; right: 0; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-light); padding: 5px 10px;">&times;</button>
                <h2>📝 Step 3: Task Templates</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 3 of 6</div>
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
                    Next: Projects →
                </button>
            </div>
            
            <p style="text-align: center; margin-top: 15px; color: var(--text-light); font-size: 0.85em;">
                Skip for now - you can create templates anytime in Settings
            </p>
        `;
    },
    
    renderProjectsStep() {
        return `
            <div class="modal-header" style="position: relative;">
                <button onclick="SetupWizard.close()" style="position: absolute; top: 0; right: 0; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-light); padding: 5px 10px;">&times;</button>
                <h2>💻 Step 4: Projects</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 4 of 6</div>
            </div>
            
            <p style="color: var(--text-light); margin-bottom: 20px;">
                Set up your coding or personal projects. Each project can have its own task checklist.
            </p>
            
            <div id="setupProjectsList" style="margin-bottom: 20px; max-height: 300px; overflow-y: auto;">
                <!-- Projects will be added here -->
            </div>
            
            <button class="btn btn-secondary" onclick="SetupWizard.showAddProject()" style="width: 100%; margin-bottom: 20px;">
                ➕ Add Project
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
                Skip for now - you can add projects anytime in the Projects tab
            </p>
        `;
    },
    
    renderMoodTrackerStep() {
        return `
            <div class="modal-header" style="position: relative;">
                <button onclick="SetupWizard.close()" style="position: absolute; top: 0; right: 0; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-light); padding: 5px 10px;">&times;</button>
                <h2>💜 Step 5: Mood Tracking</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 5 of 6</div>
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
            <div class="modal-header" style="position: relative;">
                <button onclick="SetupWizard.close()" style="position: absolute; top: 0; right: 0; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-light); padding: 5px 10px;">&times;</button>
                <h2>🎨 Step 6: Preferences</h2>
                <div style="color: var(--text-light); font-size: 0.9em;">Step 6 of 6</div>
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
        const blockForm = document.createElement('div');
        blockForm.id = 'scheduleBlockForm';
        blockForm.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 25px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10001; max-width: 400px; width: 90%;';
        
        blockForm.innerHTML = `
            <h3 style="margin-bottom: 15px;">Add Schedule Block</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Day:</label>
                <select id="blockDay" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                </select>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Title:</label>
                <input type="text" id="blockTitle" placeholder="e.g., Biology 101" 
                       style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Start:</label>
                    <input type="time" id="blockStart" value="09:00"
                           style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
                </div>
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">End:</label>
                    <input type="time" id="blockEnd" value="10:00"
                           style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
                </div>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" onclick="document.getElementById('scheduleBlockForm').remove()" style="flex: 1;">
                    Cancel
                </button>
                <button class="btn btn-primary" onclick="SetupWizard.saveScheduleBlock()" style="flex: 1;">
                    Add Block
                </button>
            </div>
        `;
        
        document.body.appendChild(blockForm);
    },
    
    saveScheduleBlock() {
        const day = document.getElementById('blockDay').value;
        const title = document.getElementById('blockTitle').value.trim();
        const start = document.getElementById('blockStart').value;
        const end = document.getElementById('blockEnd').value;
        
        if (!title) {
            alert('Please enter a title for the schedule block');
            return;
        }
        
        this.data.scheduleBlocks.push({
            day,
            title,
            start,
            end
        });
        
        document.getElementById('scheduleBlockForm').remove();
        this.updateScheduleList();
    },
    
    updateScheduleList() {
        const list = document.getElementById('setupScheduleList');
        if (!list) return;
        
        if (this.data.scheduleBlocks.length === 0) {
            list.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 20px;">No schedule blocks added yet</p>';
            return;
        }
        
        list.innerHTML = this.data.scheduleBlocks.map((block, index) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-main); border-radius: 6px; margin-bottom: 8px;">
                <div>
                    <div style="font-weight: 600;">${block.title}</div>
                    <div style="font-size: 0.85em; color: var(--text-light);">
                        ${block.day} ${block.start} - ${block.end}
                    </div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="SetupWizard.removeScheduleBlock(${index})">Remove</button>
            </div>
        `).join('');
    },
    
    removeScheduleBlock(index) {
        this.data.scheduleBlocks.splice(index, 1);
        this.updateScheduleList();
    },
    
    showAddTemplate() {
        const templateForm = document.createElement('div');
        templateForm.id = 'templateForm';
        templateForm.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 25px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10001; max-width: 400px; width: 90%;';
        
        templateForm.innerHTML = `
            <h3 style="margin-bottom: 15px;">Create Template</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Template Name:</label>
                <input type="text" id="templateName" placeholder="e.g., Weekly Readings" 
                       style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Tasks (one per line):</label>
                <textarea id="templateTasks" rows="5" placeholder="Read Chapter 3&#10;Complete problem set&#10;Submit assignment"
                          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; resize: vertical;"></textarea>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" onclick="document.getElementById('templateForm').remove()" style="flex: 1;">
                    Cancel
                </button>
                <button class="btn btn-primary" onclick="SetupWizard.saveTemplate()" style="flex: 1;">
                    Create
                </button>
            </div>
        `;
        
        document.body.appendChild(templateForm);
    },
    
    saveTemplate() {
        const name = document.getElementById('templateName').value.trim();
        const tasksText = document.getElementById('templateTasks').value.trim();
        
        if (!name) {
            alert('Please enter a template name');
            return;
        }
        
        if (!tasksText) {
            alert('Please enter at least one task');
            return;
        }
        
        const tasks = tasksText.split('\n').filter(t => t.trim() !== '').map(t => t.trim());
        
        this.data.templates.push({
            name,
            tasks
        });
        
        document.getElementById('templateForm').remove();
        this.updateTemplatesList();
    },
    
    updateTemplatesList() {
        const list = document.getElementById('setupTemplatesList');
        if (!list) return;
        
        if (this.data.templates.length === 0) {
            list.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 20px;">No templates created yet</p>';
            return;
        }
        
        list.innerHTML = this.data.templates.map((template, index) => `
            <div style="padding: 12px; background: var(--bg-main); border-radius: 6px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-weight: 600;">${template.name}</div>
                    <button class="btn btn-secondary btn-sm" onclick="SetupWizard.removeTemplate(${index})">Remove</button>
                </div>
                <div style="font-size: 0.85em; color: var(--text-light);">
                    ${template.tasks.length} task${template.tasks.length !== 1 ? 's' : ''}
                </div>
            </div>
        `).join('');
    },
    
    removeTemplate(index) {
        this.data.templates.splice(index, 1);
        this.updateTemplatesList();
    },
    
    showAddProject() {
        const projectForm = document.createElement('div');
        projectForm.id = 'projectForm';
        projectForm.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 25px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10001; max-width: 400px; width: 90%;';
        
        projectForm.innerHTML = `
            <h3 style="margin-bottom: 15px;">Add Project</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Project Name:</label>
                <input type="text" id="projectName" placeholder="e.g., Portfolio Website" 
                       style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Description (optional):</label>
                <textarea id="projectDescription" rows="3" placeholder="Brief description of the project"
                          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; resize: vertical;"></textarea>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Initial Tasks (optional, one per line):</label>
                <textarea id="projectTasks" rows="4" placeholder="Set up repository&#10;Design mockups&#10;Build homepage"
                          style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; resize: vertical;"></textarea>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary" onclick="document.getElementById('projectForm').remove()" style="flex: 1;">
                    Cancel
                </button>
                <button class="btn btn-primary" onclick="SetupWizard.saveProject()" style="flex: 1;">
                    Add Project
                </button>
            </div>
        `;
        
        document.body.appendChild(projectForm);
    },
    
    saveProject() {
        const name = document.getElementById('projectName').value.trim();
        const description = document.getElementById('projectDescription').value.trim();
        const tasksText = document.getElementById('projectTasks').value.trim();
        
        if (!name) {
            alert('Please enter a project name');
            return;
        }
        
        const tasks = tasksText ? tasksText.split('\n').filter(t => t.trim() !== '').map(t => t.trim()) : [];
        
        this.data.projects.push({
            name,
            description,
            tasks
        });
        
        document.getElementById('projectForm').remove();
        this.updateProjectsList();
    },
    
    updateProjectsList() {
        const list = document.getElementById('setupProjectsList');
        if (!list) return;
        
        if (this.data.projects.length === 0) {
            list.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 20px;">No projects created yet</p>';
            return;
        }
        
        list.innerHTML = this.data.projects.map((project, index) => `
            <div style="padding: 12px; background: var(--bg-main); border-radius: 6px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-weight: 600;">${project.name}</div>
                    <button class="btn btn-secondary btn-sm" onclick="SetupWizard.removeProject(${index})">Remove</button>
                </div>
                ${project.description ? `<div style="font-size: 0.85em; color: var(--text-light); margin-bottom: 5px;">${project.description}</div>` : ''}
                <div style="font-size: 0.85em; color: var(--text-light);">
                    ${project.tasks.length} task${project.tasks.length !== 1 ? 's' : ''}
                </div>
            </div>
        `).join('');
    },
    
    removeProject(index) {
        this.data.projects.splice(index, 1);
        this.updateProjectsList();
    },
    
    nextStep() {
        this.saveCurrentStep();
        
        this.currentStep++;
        if (this.currentStep >= this.steps.length) {
            this.currentStep = this.steps.length - 1;
        }
        
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
        console.log('SetupWizard.complete() called');
        console.log('Wizard data:', this.data);
        
        try {
            // 1. Courses - only add if they don't exist
            if (this.data.courses.length > 0) {
                console.log('Saving courses:', this.data.courses);
                const data = loadData();
                const existingCourses = data.courses || [];
                const existingNames = existingCourses.map(c => c.name.toLowerCase());
                
                this.data.courses.forEach(courseName => {
                    if (!existingNames.includes(courseName.toLowerCase())) {
                        existingCourses.push({
                            id: Date.now().toString() + Math.random(),
                            name: courseName
                        });
                    }
                });
                
                data.courses = existingCourses;
                saveData(data);
                console.log('Courses saved successfully');
            }
            
            // 2. Schedule blocks - only add if they don't exist
            if (this.data.scheduleBlocks.length > 0) {
                console.log('Saving schedule blocks:', this.data.scheduleBlocks);
                const data = loadData();
                const existingSchedule = data.schedule || [];
                
                this.data.scheduleBlocks.forEach(block => {
                    const exists = existingSchedule.some(s => 
                        s.day === block.day && 
                        s.title === block.title && 
                        s.start === block.start &&
                        s.end === block.end
                    );
                    
                    if (!exists) {
                        existingSchedule.push({
                            id: Date.now().toString() + Math.random(),
                            day: block.day,
                            title: block.title,
                            start: block.start,
                            end: block.end,
                            recurring: true
                        });
                    }
                });
                
                data.schedule = existingSchedule;
                saveData(data);
                console.log('Schedule blocks saved successfully');
            }
            
            // 3. Templates - only add if they don't exist
            if (this.data.templates.length > 0) {
                console.log('Saving templates:', this.data.templates);
                const data = loadData();
                const existingTemplates = data.templates || [];
                const existingNames = existingTemplates.map(t => t.name.toLowerCase());
                
                this.data.templates.forEach(template => {
                    if (!existingNames.includes(template.name.toLowerCase())) {
                        existingTemplates.push({
                            id: Date.now().toString() + Math.random(),
                            name: template.name,
                            tasks: template.tasks
                        });
                    }
                });
                
                data.templates = existingTemplates;
                saveData(data);
                console.log('Templates saved successfully');
            }
            
            // 4. Projects - only add if they don't exist
            if (this.data.projects.length > 0) {
                console.log('Saving projects:', this.data.projects);
                const data = loadData();
                const existingProjects = data.projects || [];
                const existingNames = existingProjects.map(p => p.name.toLowerCase());
                
                this.data.projects.forEach(project => {
                    if (!existingNames.includes(project.name.toLowerCase())) {
                        existingProjects.push({
                            id: Date.now().toString() + Math.random(),
                            name: project.name,
                            description: project.description || '',
                            tasks: project.tasks.map(taskText => ({
                                id: Date.now().toString() + Math.random(),
                                text: taskText,
                                completed: false
                            }))
                        });
                    }
                });
                
                data.projects = existingProjects;
                saveData(data);
                console.log('Projects saved successfully');
            }
            
            // 5. Mood tracker & preferences
            console.log('Saving preferences');
            const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
            settings.moodTrackerEnabled = this.data.enableMoodTracker;
            settings.maxWorkTime = this.data.maxWorkTime;
            localStorage.setItem('appSettings', JSON.stringify(settings));
            console.log('Preferences saved successfully');
            
            // 6. Apply dyslexic font if selected
            if (this.data.useDyslexicFont) {
                document.body.classList.add('dyslexic-font');
            }
            
            // Show confetti
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }
            
            // Close modal
            this.close();
            
            console.log('Setup complete! Reloading page...');
            
            // Reload page to apply changes
            setTimeout(() => {
                window.location.reload();
            }, 1000);
            
        } catch (error) {
            console.error('Error in SetupWizard.complete():', error);
            alert('There was an error saving your setup. Please try again or check the console for details.');
        }
    }
};

// Global function to start wizard
function startInitialSetup() {
    SetupWizard.start();
}
