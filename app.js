// app.js - Main application initialization and coordination

// Configuration variables (will be loaded from settings)
let CLOUDFLARE_WORKER_URL = 'https://controlled-chaos-api.lmdrew.workers.dev';
let GOOGLE_CLIENT_ID = '593850134085-21comnf9tcgcjqp7jnkvum180ksebid7.apps.googleusercontent.com';

// ===== APPLICATION INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 [INIT] Application starting...');
    
    // Sync indicator setup
    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) {
        syncIndicator.addEventListener('click', () => {
            console.log('🖱️ Sync indicator clicked - opening Settings');
            handleMoreMenuClick('settings');
        });
        console.log('✅ Sync indicator click handler attached');
    } else {
        console.error('❌ Sync indicator element not found');
    }
    
    // Initialize tab navigation (which also initializes More menu)
    initializeTabs();
    
    // Initialize daily schedule with day tabs
    initializeDailySchedule();
    
    // Initialize Google API
    initGoogleAPI();
    
    // Wait for gapi to initialize before attempting any Drive operations
    console.log('⏳ [INIT] Waiting for gapi to initialize...');
    await waitForGapiInit();
    console.log('✅ [INIT] gapi initialized, proceeding with session restore');
    
    // Now restore session
    await restoreSession();
    
    // Initialize auto-import UI after data is loaded
    if (typeof initializeAutoImportUI === 'function') {
        initializeAutoImportUI();
    }
    
    // Run safety migration for phone -> errands
    migratePhoneToErrands();
    
    updateUI();
    
    // Set up auto-refresh
    setupAutoRefresh();
    
    // Set default location
    setLocation('home');
    
    // Restore font preference
    if (localStorage.getItem('dyslexiaFont') === 'true') {
        document.body.classList.add('dyslexia-font');
    }
    
    // Set default energy if not already set
    if (!appData.userEnergy) {
        setUserEnergy('medium');
    } else {
        // Restore saved energy state
        document.querySelectorAll('.energy-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.energy === appData.userEnergy);
        });
    }
    
    // Check if configured
    if (!CLOUDFLARE_WORKER_URL || CLOUDFLARE_WORKER_URL === 'YOUR-WORKER-URL-HERE/api/claude' ||
        !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR-CLIENT-ID-HERE.apps.googleusercontent.com') {
        document.getElementById('configWarning').style.display = 'block';
    } else {
        document.getElementById('configWarning').style.display = 'none';
    }
    
    // Initialize Due Soon banner
    updateDueSoonBanner();
    
    // Initialize admin panel (if user is owner)
    await initializeAdminPanel();
    
    console.log('✅ [INIT] Application ready');
    
    // Check for auto-import after a short delay
    setTimeout(checkAutoImport, 2000);
});

// ===== AUTO-IMPORT CHECK =====
async function checkAutoImport() {
    const settings = appData.settings || {};
    
    if (!settings.autoImportEnabled || !settings.autoImportCalendarUrl) {
        return; // Auto-import not enabled
    }
    
    // Check last import time
    const lastImport = localStorage.getItem('lastAutoImport');
    const now = new Date();
    const lastImportDate = lastImport ? new Date(lastImport) : null;
    
    // Only auto-import once per day
    if (lastImportDate) {
        const hoursSinceLastImport = (now - lastImportDate) / (1000 * 60 * 60);
        if (hoursSinceLastImport < 23) {
            console.log('⏭️ [AUTO-IMPORT] Skipping - last import was', Math.round(hoursSinceLastImport), 'hours ago');
            return;
        }
    }
    
    console.log('🤖 [AUTO-IMPORT] Running automatic calendar import...');
    
    try {
        // Temporarily set the calendar URL
        const urlInput = document.getElementById('calendarFeedUrl');
        if (!urlInput) return;
        
        const originalValue = urlInput.value;
        urlInput.value = settings.autoImportCalendarUrl;
        
        // Run import silently (don't show confetti)
        await importCalendarFeed();
        
        // Update last import time
        localStorage.setItem('lastAutoImport', now.toISOString());
        
        // Restore original value
        urlInput.value = originalValue;
        
        console.log('✅ [AUTO-IMPORT] Completed successfully');
        showToast('🤖 Calendar automatically updated with new assignments!');
    } catch (error) {
        console.error('❌ [AUTO-IMPORT] Failed:', error);
    }
}

// ===== MODAL CLOSE HANDLERS =====
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});
