// templates.js - Template management functions

function createTasksFromTemplate(templateIndex) {
    const template = appData.templates[templateIndex];
    if (!template) {
        alert('Template not found!');
        return;
    }
    
    // Ask for due date
    const dueDateStr = prompt(`When are these ${template.name} tasks due? (YYYY-MM-DD or MM/DD)`);
    if (!dueDateStr) return;
    
    // Parse date
    let dueDate;
    if (dueDateStr.includes('-')) {
        dueDate = dueDateStr; // Already in YYYY-MM-DD format
    } else {
        // Convert MM/DD to YYYY-MM-DD
        const [month, day] = dueDateStr.split('/');
        const year = new Date().getFullYear();
        dueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Create tasks from template
    let createdCount = 0;
    template.tasks.forEach(taskTitle => {
        addTask({
            title: taskTitle,
            energy: 'medium',
            location: template.category === 'History' || template.category === 'Politics' || template.category === 'Bio' || template.category === 'Beatles' ? 'school' : 'anywhere',
            timeEstimate: 30,
            dueDate: dueDate,
            category: template.category
        });
        createdCount++;
    });
    
    // Show success message
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
    
    showToast(`✅ Created ${createdCount} tasks from ${template.name}!`);
}
