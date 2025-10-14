// projects.js - Project management functions

// ===== PROJECT CRUD OPERATIONS =====
function showCreateProjectModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'createProjectModal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>➕ Create New Project</h2>
                <button class="close-modal" onclick="closeCreateProjectModal()">&times;</button>
            </div>
            
            <div class="form-group">
                <label for="projectName">Project Name *</label>
                <input type="text" id="projectName" placeholder="e.g., Portfolio Website" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div class="form-group">
                <label for="projectDescription">Description *</label>
                <textarea id="projectDescription" placeholder="What is this project about?" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; min-height: 80px;"></textarea>
            </div>
            
            <div class="form-group">
                <label for="projectCategory">Category *</label>
                <input type="text" id="projectCategory" placeholder="e.g., Personal, School, Work" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
            </div>
            
            <div class="form-group">
                <label for="projectStatus">Status *</label>
                <select id="projectStatus" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                    <option value="planning">Planning</option>
                    <option value="active" selected>Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="createProjectFromModal()">
                    💾 Create Project
                </button>
                <button class="btn btn-secondary" onclick="closeCreateProjectModal()">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('projectName').focus(), 100);
}

function createProjectFromModal() {
    const name = document.getElementById('projectName').value.trim();
    const description = document.getElementById('projectDescription').value.trim();
    const category = document.getElementById('projectCategory').value.trim();
    const status = document.getElementById('projectStatus').value;
    
    if (!name) {
        alert('Please enter a project name');
        return;
    }
    
    if (!description) {
        alert('Please enter a description');
        return;
    }
    
    if (!category) {
        alert('Please enter a category');
        return;
    }
    
    const newProject = {
        id: Date.now(),
        name: name,
        description: description,
        category: category,
        status: status,
        progress: 0,
        tasks: [],
        createdAt: new Date().toISOString()
    };
    
    appData.projects.push(newProject);
    saveData();
    renderProjects();
    closeCreateProjectModal();
    
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
    
    showToast(`✅ Created project: ${name}`);
}

function closeCreateProjectModal() {
    const modal = document.getElementById('createProjectModal');
    if (modal) {
        modal.remove();
    }
}

// ===== PROJECT TASK MANAGEMENT =====
function calculateProjectProgress(project) {
    if (!project.tasks || project.tasks.length === 0) return 0;
    const completedTasks = project.tasks.filter(t => t.completed).length;
    return Math.round((completedTasks / project.tasks.length) * 100);
}

function updateProjectProgress(projectId) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project) {
        project.progress = calculateProjectProgress(project);
        saveData();
        renderProjects();
    }
}

function toggleProjectTask(projectId, taskIndex) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project && project.tasks[taskIndex]) {
        project.tasks[taskIndex].completed = !project.tasks[taskIndex].completed;
        updateProjectProgress(projectId);
        
        if (project.tasks[taskIndex].completed) {
            confetti({
                particleCount: 50,
                spread: 60,
                origin: { y: 0.6 }
            });
        }
    }
}

function addProjectTask(projectId, taskText) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project && taskText.trim()) {
        project.tasks.push({
            text: taskText.trim(),
            completed: false
        });
        updateProjectProgress(projectId);
    }
}

function editProjectTask(projectId, taskIndex, newText) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project && project.tasks[taskIndex] && newText.trim()) {
        project.tasks[taskIndex].text = newText.trim();
        saveData();
        renderProjects();
    }
}

function deleteProjectTask(projectId, taskIndex) {
    const project = appData.projects.find(p => p.id === projectId);
    if (project && project.tasks[taskIndex]) {
        if (confirm('Delete this task?')) {
            project.tasks.splice(taskIndex, 1);
            updateProjectProgress(projectId);
        }
    }
}

function showProjectModal(projectId) {
    const project = appData.projects.find(p => p.id === projectId);
    if (!project) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'projectModal';
    
    const completedCount = project.tasks.filter(t => t.completed).length;
    const totalCount = project.tasks.length;
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${project.name}</h2>
                <button class="close-modal" onclick="closeProjectModal()">&times;</button>
            </div>
            <p style="color: var(--text-light); margin-bottom: 10px;">${project.description}</p>
            <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                <span class="status-badge status-${project.status}">${project.status}</span>
                <span class="category-badge">${project.category}</span>
            </div>
            
            <div class="project-tasks-list" id="projectTasksList">
                ${project.tasks.map((task, index) => `
                    <div class="project-task-item ${task.completed ? 'completed' : ''}">
                        <input type="checkbox" 
                               ${task.completed ? 'checked' : ''}
                               onchange="toggleProjectTask(${projectId}, ${index})"
                               class="task-checkbox">
                        <span class="project-task-text" 
                              contenteditable="true"
                              onblur="editProjectTask(${projectId}, ${index}, this.textContent)"
                              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                              >${task.text}</span>
                        <button class="task-delete-btn" 
                                onclick="deleteProjectTask(${projectId}, ${index})"
                                title="Delete task">×</button>
                    </div>
                `).join('')}
            </div>
            
            <div class="add-task-section">
                <input type="text" 
                       id="newProjectTaskInput" 
                       placeholder="Add new task..."
                       onkeydown="if(event.key==='Enter'){addProjectTaskFromInput(${projectId})}"
                       style="flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                <button class="btn btn-primary" onclick="addProjectTaskFromInput(${projectId})">
                    + Add
                </button>
            </div>
            
            <div class="project-progress-summary">
                <strong>Progress: ${project.progress}%</strong> (${completedCount}/${totalCount} tasks complete)
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeProjectModal();
        }
    });
    
    // Close on ESC key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeProjectModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function addProjectTaskFromInput(projectId) {
    const input = document.getElementById('newProjectTaskInput');
    if (input && input.value.trim()) {
        addProjectTask(projectId, input.value);
        input.value = '';
        input.focus();
    }
}

function closeProjectModal() {
    const modal = document.getElementById('projectModal');
    if (modal) {
        modal.remove();
    }
}

// ===== CLEAR ALL PROJECTS =====
function clearAllProjects() {
    if (!appData.projects || appData.projects.length === 0) {
        showToast('No projects to clear!');
        return;
    }
    
    const count = appData.projects.length;
    if (confirm(`⚠️ Clear ALL ${count} project${count !== 1 ? 's' : ''}?\n\nThis cannot be undone.`)) {
        appData.projects = [];
        saveData();
        renderProjects();
        showToast(`✅ Cleared ${count} project${count !== 1 ? 's' : ''}`);
    }
}
