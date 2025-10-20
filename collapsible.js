// collapsible.js - Handle collapsible sections in settings

/**
 * Initialize all collapsible sections
 */
function initializeCollapsibleSections() {
    const sections = document.querySelectorAll('.collapsible-section');
    
    sections.forEach(section => {
        const header = section.querySelector('.collapsible-header');
        
        if (header) {
            header.addEventListener('click', () => {
                toggleCollapsibleSection(section);
            });
            
            // Add keyboard support
            header.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCollapsibleSection(section);
                }
            });
            
            // Make header focusable
            header.setAttribute('tabindex', '0');
            header.setAttribute('role', 'button');
            header.setAttribute('aria-expanded', section.classList.contains('expanded'));
        }
    });
    
    console.log('✅ Collapsible sections initialized:', sections.length);
}

/**
 * Toggle a collapsible section
 * @param {HTMLElement} section - The section to toggle
 */
function toggleCollapsibleSection(section) {
    const isExpanded = section.classList.contains('expanded');
    const header = section.querySelector('.collapsible-header');
    
    if (isExpanded) {
        section.classList.remove('expanded');
        if (header) {
            header.setAttribute('aria-expanded', 'false');
        }
    } else {
        section.classList.add('expanded');
        if (header) {
            header.setAttribute('aria-expanded', 'true');
        }
    }
}

/**
 * Expand a specific collapsible section by ID
 * @param {string} sectionId - The ID of the section to expand
 */
function expandCollapsibleSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section && !section.classList.contains('expanded')) {
        toggleCollapsibleSection(section);
    }
}

/**
 * Collapse a specific collapsible section by ID
 * @param {string} sectionId - The ID of the section to collapse
 */
function collapseCollapsibleSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section && section.classList.contains('expanded')) {
        toggleCollapsibleSection(section);
    }
}

/**
 * Expand all collapsible sections
 */
function expandAllSections() {
    const sections = document.querySelectorAll('.collapsible-section');
    sections.forEach(section => {
        if (!section.classList.contains('expanded')) {
            toggleCollapsibleSection(section);
        }
    });
}

/**
 * Collapse all collapsible sections
 */
function collapseAllSections() {
    const sections = document.querySelectorAll('.collapsible-section');
    sections.forEach(section => {
        if (section.classList.contains('expanded')) {
            toggleCollapsibleSection(section);
        }
    });
}

/**
 * Update section badge based on configuration status
 * @param {string} sectionId - The ID of the section
 * @param {string} status - 'configured', 'required', or 'optional'
 */
function updateSectionBadge(sectionId, status) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    const badge = section.querySelector('.section-badge');
    if (!badge) return;
    
    // Remove all status classes
    badge.classList.remove('configured', 'required', 'optional');
    
    // Add new status class
    badge.classList.add(status);
    
    // Update badge text
    const statusText = {
        'configured': '✓ Configured',
        'required': '⚠ Required',
        'optional': 'Optional'
    };
    
    badge.textContent = statusText[status] || status;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCollapsibleSections);
} else {
    // DOM already loaded
    initializeCollapsibleSections();
}
