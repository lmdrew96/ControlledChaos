// storage.js - Data persistence (localStorage + Google Drive sync)

// Application data structure
let appData = {
    tasks: [],
    deadlines: [],
    errandTasks: [],
    projects: [],
    schedule: JSON.parse(JSON.stringify(defaultSchedule)), // Deep copy from data.js
    scheduleOverrides: {},
    templates: [],
    settings: {
        workerUrl: '',
        clientId: '',
        apiKey: '',
        maxDailyWorkMinutes: 90,  // Default to 90 minutes
        shifts7CalendarUrl: '',
        autoSync7Shifts: true,
        lastSync7Shifts: null,
        // Location settings
        homeLocationAddress: '',
        schoolLocationAddress: '',
        workLocationAddress: '',
        homeLocationCoords: null,
        schoolLocationCoords: null,
        workLocationCoords: null,
        lastLocationCheck: null
    },
    currentLocation: 'home',
    lastSync: null,
    userEmail: null,
    googleAccessToken: null
};

// Google Drive integration variables
let googleAccessToken = null;
let driveFileId = null;
let isOnline = navigator.onLine;
let pendingChanges = false;
let gapiInitialized = false;
let userEmail = null;
let driveAuthError = false;

const DRIVE_FILE_NAME = 'controlled-chaos-data.json';

// ===== TOKEN EXPIRATION HANDLING =====

// Show session expired banner
function showSessionExpiredBanner() {
    const banner = document.getElementById('sessionExpiredBanner');
    if (banner) {
        banner.style.display = 'block';
        // Push content down so banner doesn't overlap
        document.body.style.paddingTop = '80px';
    }
}

// Hide session expired banner
function hideSessionExpiredBanner() {
    const banner = document.getElementById('sessionExpiredBanner');
    if (banner) {
        banner.style.display = 'none';
        document.body.style.paddingTop = '0';
    }
}

// Handle token expiration
function handleTokenExpiration() {
    console.log('🔴 [AUTH] Token expired - signing user out');
    
    // Clear auth data
    googleAccessToken = null;
    userEmail = null;
    
    // Save cleared state
    saveData();
    
    // Update UI
    updateSignInUI();
    
    // Show banner
    showSessionExpiredBanner();
    
    // Show toast
    showToast('⚠️ Google Drive session expired. Please sign in again.');
}

// Check if error is token expiration
function isTokenExpiredError(error) {
    if (!error) return false;
    
    const errorString = error.toString().toLowerCase();
    const errorMessage = error.message ? error.message.toLowerCase() : '';
    
    return errorString.includes('401') || 
           errorString.includes('unauthorized') ||
           errorString.includes('invalid_grant') ||
           errorString.includes('token') && errorString.includes('expired') ||
           errorMessage.includes('401') ||
           errorMessage.includes('unauthorized');
}

// Sign in from the expired session banner
function signInFromBanner() {
    // Hide the banner
    hideSessionExpiredBanner();
    
    // Switch to Settings tab
    const settingsTab = document.querySelector('[data-tab="settings"]');
    if (settingsTab) {
        settingsTab.click();
    }
    
    // Scroll to sign-in section
    setTimeout(() => {
        const signInSection = document.querySelector('.card');
        if (signInSection) {
            signInSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 300);
    
    showToast('👇 Please sign in with Google below');
}

// ===== CHECK IF DRIVE IS AVAILABLE =====
function isDriveAvailable() {
    // Primary check: Do we have an access token?
    // This is what actually matters for Drive API calls via fetch()
    if (!googleAccessToken) {
        return false;
    }
    
    // Secondary check: Is gapi available? (optional, for gapi.client.drive calls)
    // If gapi timed out, we can still use fetch() with the token
    if (!gapi || !gapi.client) {
        console.log('ℹ️ [DRIVE] GAPI not fully initialized, but token available - using fetch fallback');
        return true; // Token is enough for fetch-based API calls
    }
    
    return true;
}

// ===== LOCALSTORAGE FUNCTIONS =====
function saveToLocalStorage() {
    try {
        const dataToSave = {
            ...appData,
            lastLocalSave: new Date().toISOString()
        };
        localStorage.setItem('controlledChaosData', JSON.stringify(dataToSave));
        console.log('💾 [LOCALSTORAGE] Data saved to localStorage');
        return true;
    } catch (error) {
        console.error('❌ [LOCALSTORAGE] Failed to save to localStorage:', error);
        return false;
    }
}

function loadFromLocalStorage() {
    try {
        const savedData = localStorage.getItem('controlledChaosData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            console.log('📥 [LOCALSTORAGE] Data loaded from localStorage');
            console.log('📥 [LOCALSTORAGE] Last local save:', parsedData.lastLocalSave);
            return parsedData;
        }
        return null;
    } catch (error) {
        console.error('❌ [LOCALSTORAGE] Failed to load from localStorage:', error);
        return null;
    }
}

// ===== GOOGLE DRIVE API FUNCTIONS =====
function initGoogleAPI() {
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: '', // Not needed for OAuth flow
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
            });
            gapiInitialized = true;
            console.log('Google API initialized');
        } catch (error) {
            console.error('Error initializing Google API:', error);
        }
    });
}

async function handleGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR-CLIENT-ID-HERE.apps.googleusercontent.com') {
        alert('Please configure your Google Client ID in Settings first!');
        showSettings();
        return;
    }

    try {
        console.log('🔐 [SIGN IN] Button clicked');
        
        const client = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
            callback: async (response) => {
                if (response.access_token) {
                    googleAccessToken = response.access_token;
                    gapi.client.setToken({ access_token: googleAccessToken });
                    
                    // Get user info
                    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                        headers: { Authorization: `Bearer ${googleAccessToken}` }
                    }).then(r => r.json());
                    
                    userEmail = userInfo.email;
                    
                    console.log('✅ [SIGN IN] Email:', userEmail);
                    console.log('✅ [SIGN IN] Token obtained');
                    
                    // Save to appData AND localStorage
                    appData.userEmail = userEmail;
                    appData.googleAccessToken = googleAccessToken;
                    localStorage.setItem('googleAccessToken', googleAccessToken);
                    localStorage.setItem('userEmail', userEmail);
                    
                    console.log('💾 [SIGN IN] Email and token saved to localStorage and appData');
                    
                    // Hide session expired banner if it was showing
                    hideSessionExpiredBanner();
                    
                    // Update UI immediately - don't wait for page refresh
                    updateSignInUI();
                    
                    console.log('✅ [SIGN IN] UI updated');
                    
                    // Show toast notification
                    showToast(`✅ Signed in as ${userEmail}`);
                    
                    // Load encrypted settings from Drive FIRST
                    console.log('🔓 [SIGN IN] Loading encrypted settings from Drive...');
                    const driveSettings = await loadSettingsFromDrive();
                    if (driveSettings) {
                        // Merge Drive settings with local settings
                        appData.settings = { ...appData.settings, ...driveSettings };
                        
                        // Update global variables
                        if (driveSettings.clientId) GOOGLE_CLIENT_ID = driveSettings.clientId;
                        
                        console.log('✅ [SIGN IN] Settings loaded and decrypted from Drive');
                    }
                    
                    // Load data from Drive (tasks, deadlines, etc.)
                    await loadDataFromDrive();
                    
                    // Explicitly populate settings inputs
                    populateSettingsInputs();
                    
                    updateUI();
                    
                    console.log('✅ [SIGN IN] Complete - settings and data loaded');
                }
            }
        });
        client.requestAccessToken();
    } catch (error) {
        console.error('❌ [SIGN IN] Failed:', error);
        alert('Failed to sign in. Please try again.');
    }
}

function handleGoogleSignOut() {
    console.log('🚪 [SIGN OUT] Button clicked');
    
    if (googleAccessToken) {
        google.accounts.oauth2.revoke(googleAccessToken);
    }
    
    // Clear stored credentials
    googleAccessToken = null;
    driveFileId = null;
    settingsFileId = null;
    userEmail = null;
    localStorage.removeItem('googleAccessToken');
    localStorage.removeItem('userEmail');
    
    console.log('💾 [SIGN OUT] Credentials cleared from localStorage');
    
    // Update UI immediately
    updateSignInUI();
    
    console.log('✅ [SIGN OUT] UI updated');
    console.log('✅ [SIGN OUT] Completed');
    
    showToast('👋 Signed out - settings remain in localStorage');
}

function updateSignInUI() {
    console.log('🎨 [AUTH UI] Updating sign-in UI...');
    console.log('🎨 [AUTH UI] googleAccessToken exists:', !!googleAccessToken);
    console.log('🎨 [AUTH UI] userEmail:', userEmail);
    
    if (googleAccessToken && userEmail) {
        console.log('🎨 [AUTH UI] Showing signed-in state for:', userEmail);
        
        // Update Settings tab UI
        const signInSettings = document.getElementById('googleSignInSettings');
        const accountInfo = document.getElementById('googleAccountInfo');
        const emailDisplay = document.getElementById('userEmailDisplay');
        
        if (signInSettings) signInSettings.style.display = 'none';
        if (accountInfo) accountInfo.style.display = 'block';
        if (emailDisplay) {
            emailDisplay.textContent = userEmail;
            console.log('🎨 [AUTH UI] Email display updated to:', userEmail);
        }
        
        // Update sync indicator
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.style.display = 'block';
            syncIndicator.textContent = '☁️ Synced';
            syncIndicator.style.backgroundColor = '#e6f4ea';
            syncIndicator.style.color = '#1e8e3e';
            syncIndicator.style.border = '1px solid #34a853';
        }
    } else {
        console.log('🎨 [UPDATE UI] Showing signed-out state');
        
        // Update Settings tab UI
        const signInSettings = document.getElementById('googleSignInSettings');
        const accountInfo = document.getElementById('googleAccountInfo');
        
        if (signInSettings) signInSettings.style.display = 'block';
        if (accountInfo) accountInfo.style.display = 'none';
        
        // Update sync indicator
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.style.display = 'block';
            syncIndicator.textContent = '💾 Local Only';
            syncIndicator.style.backgroundColor = '#fef7e0';
            syncIndicator.style.color = '#b45309';
            syncIndicator.style.border = '1px solid #fbbc04';
        }
    }
}

async function loadDataFromDrive() {
    if (!isDriveAvailable()) {
        if (!driveAuthError) {
            console.log('ℹ️ [DRIVE] Not authenticated - using localStorage');
            driveAuthError = true;
        }
        return null;
    }

    try {
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.textContent = '⏳ Loading from Drive...';
        }
        
        // Search for existing file using fetch API (works even when GAPI times out)
        const searchParams = new URLSearchParams({
            q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });
        
        const searchResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?${searchParams}`,
            {
                headers: {
                    'Authorization': `Bearer ${googleAccessToken}`
                }
            }
        );
        
        if (!searchResponse.ok) {
            // Check for token expiration
            if (searchResponse.status === 401 || searchResponse.status === 403) {
                handleTokenExpiration();
                throw new Error('Token expired');
            }
            throw new Error(`Drive API error: ${searchResponse.status}`);
        }
        
        const searchResult = await searchResponse.json();

        if (searchResult.files && searchResult.files.length > 0) {
            driveFileId = searchResult.files[0].id;
            
            // Download file content using fetch API
            const fileResponse = await fetch(
                `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
                {
                    headers: {
                        'Authorization': `Bearer ${googleAccessToken}`
                    }
                }
            );
            
            if (!fileResponse.ok) {
                // Check for token expiration
                if (fileResponse.status === 401 || fileResponse.status === 403) {
                    handleTokenExpiration();
                    throw new Error('Token expired');
                }
                throw new Error(`Drive download error: ${fileResponse.status}`);
            }
            
            const fileContent = await fileResponse.text();
            
            // Parse and load data
            const loadedData = JSON.parse(fileContent);
            
            // CRITICAL: Apply settings FIRST before updating appData
            if (loadedData.settings) {
                if (loadedData.settings.workerUrl) {
                    CLOUDFLARE_WORKER_URL = loadedData.settings.workerUrl;
                }
                if (loadedData.settings.clientId) {
                    GOOGLE_CLIENT_ID = loadedData.settings.clientId;
                }
            }
            
            // Now update appData
            appData = loadedData;
            appData.lastSync = new Date().toISOString();
            
            console.log('📥 [DRIVE] Loaded settings:', {
                hasWorkerUrl: !!appData.settings?.workerUrl,
                hasClientId: !!appData.settings?.clientId,
                hasWorkerPassword: !!appData.settings?.workerPassword
            });
            
            // Populate settings input fields after loading from Drive
            populateSettingsInputs();
            
            driveAuthError = false; // Reset flag on success
            
            const syncIndicator = document.getElementById('syncIndicator');
            if (syncIndicator) {
                syncIndicator.textContent = '☁️ Synced';
                syncIndicator.style.color = '#34a853';
            }
        }
    } catch (error) {
        if (error.status === 401) {
            console.log('⚠️ [DRIVE] Token expired - please re-authenticate');
            driveAuthError = true;
            const syncIndicator = document.getElementById('syncIndicator');
            if (syncIndicator) {
                syncIndicator.textContent = '💾 Local Only';
                syncIndicator.style.color = '#fbbc04';
                syncIndicator.title = 'Drive sync disconnected - click Settings to re-authenticate';
            }
        } else {
            console.error('❌ [DRIVE] Load error:', error);
            showUserFriendlyError(error);
        }
        return null;
    }
}

async function saveDataToDrive() {
    if (!isDriveAvailable()) {
        if (!driveAuthError) {
            console.log('ℹ️ [DRIVE] Not authenticated - using localStorage only');
            driveAuthError = true;
        }
        return; // Fail silently
    }
    
    // Show saving indicator
    showSavingIndicator('💾 Saving...');

    try {
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.textContent = '⏳ Saving to Drive...';
        }
        
        appData.lastSync = new Date().toISOString();
        const content = JSON.stringify(appData, null, 2);
        
        const blob = new Blob([content], { type: 'application/json' });

        const metadata = {
            name: DRIVE_FILE_NAME,
            mimeType: 'application/json'
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const method = driveFileId ? 'PATCH' : 'POST';
        const url = driveFileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const response = await fetch(url, {
            method: method,
            headers: {
                Authorization: `Bearer ${googleAccessToken}`
            },
            body: form
        });

        if (!response.ok) {
            // Check for token expiration
            if (response.status === 401 || response.status === 403) {
                handleTokenExpiration();
                throw new Error('Token expired');
            }
            throw new Error(`Drive API error: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.id) {
            driveFileId = result.id;
            pendingChanges = false;
            driveAuthError = false; // Reset flag on success
            const syncIndicator = document.getElementById('syncIndicator');
            if (syncIndicator) {
                syncIndicator.textContent = '☁️ Synced';
                syncIndicator.style.color = '#34a853';
            }
            hideSavingIndicator(true);
        } else {
            hideSavingIndicator(false);
        }
    } catch (error) {
        // Check if error is token expiration
        if (isTokenExpiredError(error)) {
            handleTokenExpiration();
        } else {
            console.error('❌ [DRIVE] Save error:', error);
            showUserFriendlyError(error);
        }
        pendingChanges = true;
        hideSavingIndicator(false);
    }
}

// ===== UNIFIED SAVE FUNCTION =====
// Auto-save on changes - saves to BOTH localStorage AND Drive
function saveData() {
    // ALWAYS save to localStorage first (instant backup)
    const localSaveSuccess = saveToLocalStorage();
    
    // Then save to Drive (may fail if offline/not signed in)
    saveDataToDrive();
    
    if (localSaveSuccess && !googleAccessToken) {
        // Show indicator that we saved locally but not to Drive
        showSavingIndicator('💾 Saved locally');
        setTimeout(() => {
            const indicator = document.querySelector('.saving-indicator');
            if (indicator) {
                indicator.classList.remove('visible');
            }
        }, 2000);
    }
}

// ===== INITIALIZE DEFAULT DATA =====
function initializeDefaultData() {
    console.log('🔧 [INIT] Checking for default data initialization...');
    
    // Initialize deadlines if empty
    if (!appData.deadlines || appData.deadlines.length === 0) {
        console.log('📝 [INIT] Loading default deadlines...');
        appData.deadlines = defaultDeadlines.map((d, index) => ({
            id: `deadline_${Date.now()}_${index}`,
            title: d.name,
            dueDate: d.date,
            category: d.category,
            class: d.class,
            completed: false,
            createdAt: new Date().toISOString()
        }));
        console.log(`✅ [INIT] Loaded ${appData.deadlines.length} deadlines`);
    }
    
    // Initialize projects if empty
    if (!appData.projects || appData.projects.length === 0) {
        console.log('📝 [INIT] Loading default projects...');
        appData.projects = JSON.parse(JSON.stringify(defaultProjects)); // Deep copy
        console.log(`✅ [INIT] Loaded ${appData.projects.length} projects`);
    }
    
    // Initialize templates if empty
    if (!appData.templates || appData.templates.length === 0) {
        console.log('📝 [INIT] Loading default templates...');
        appData.templates = JSON.parse(JSON.stringify(defaultTemplates)); // Deep copy
        console.log(`✅ [INIT] Loaded ${appData.templates.length} templates`);
    }
    
    // Save to localStorage after initialization
    saveToLocalStorage();
}

// ===== SESSION RESTORE =====
async function restoreSession() {
    console.log('🔄 [RESTORE SESSION] Starting session restoration...');
    
    // STEP 1: Try to load from localStorage FIRST (fastest recovery)
    const localData = loadFromLocalStorage();
    if (localData) {
        console.log('📥 [RESTORE SESSION] Found localStorage backup, loading immediately...');
        appData = localData;
        
        // Ensure projects array exists (for backward compatibility)
        if (!appData.projects) {
            appData.projects = [];
        }
        
        // Apply settings from localStorage
        if (localData.settings) {
            if (localData.settings.clientId) {
                GOOGLE_CLIENT_ID = localData.settings.clientId;
            }
        }
        
        // Populate settings input fields
        populateSettingsInputs();
        
        // Initialize default data if needed
        initializeDefaultData();
        
        // Update UI immediately with localStorage data
        updateUI();
        console.log('✅ [RESTORE SESSION] UI updated with localStorage data');
    } else {
        // No localStorage data - initialize with defaults
        console.log('📝 [RESTORE SESSION] No localStorage data, initializing defaults...');
        initializeDefaultData();
    }
    
    // STEP 2: Check for saved Google session
    const savedToken = localStorage.getItem('googleAccessToken');
    const savedEmail = localStorage.getItem('userEmail');
    
    console.log('🔄 [RESTORE SESSION] Saved token exists:', !!savedToken);
    console.log('🔄 [RESTORE SESSION] Saved email:', savedEmail);
    
    if (savedToken && savedEmail) {
        // Restore credentials from localStorage
        googleAccessToken = savedToken;
        userEmail = savedEmail;
        
        // Also save to appData
        appData.userEmail = savedEmail;
        appData.googleAccessToken = savedToken;
        
        console.log('🔄 [RESTORE SESSION] Token and email restored from localStorage');
        
        // Update UI to show signed-in state immediately
        updateSignInUI();
        console.log('🔄 [RESTORE SESSION] UI updated to show signed-in state');
        
        // STEP 3: Wait for gapi to initialize before attempting Drive operations
        console.log('🔄 [RESTORE SESSION] Waiting for gapi to initialize...');
        await waitForGapiInit();
        
        // Set token for gapi
        gapi.client.setToken({ access_token: googleAccessToken });
        console.log('🔄 [RESTORE SESSION] Token set for gapi client');
        
        // STEP 4: Try to load encrypted settings from Drive
        try {
            console.log('🔓 [RESTORE SESSION] Loading encrypted settings from Drive...');
            const driveSettings = await loadSettingsFromDrive();
            if (driveSettings) {
                // Merge Drive settings with local settings (Drive takes precedence)
                appData.settings = { ...appData.settings, ...driveSettings };
                
                // Update global variables
                if (driveSettings.clientId) GOOGLE_CLIENT_ID = driveSettings.clientId;
                
                // Populate settings inputs with decrypted values
                populateSettingsInputs();
                
                console.log('✅ [RESTORE SESSION] Settings loaded and decrypted from Drive');
            }
        } catch (error) {
            console.error('❌ [RESTORE SESSION] Failed to load settings from Drive:', error);
        }
        
        // STEP 5: Try to load data from Drive (tasks, deadlines, etc.)
        try {
            console.log('🔄 [RESTORE SESSION] Attempting to load data from Drive...');
            await loadDataFromDrive();
            
            // Update UI with Drive data (may be newer than localStorage)
            updateUI();
            console.log('✅ [RESTORE SESSION] UI updated with Drive data');
        } catch (error) {
            console.error('❌ [RESTORE SESSION] Failed to load from Drive:', error);
            // Token might be expired, clear it
            handleGoogleSignOut();
            
            // But we still have localStorage data, so user can continue working
            console.log('ℹ️ [RESTORE SESSION] Continuing with localStorage data');
        }
    } else {
        console.log('ℹ️ [RESTORE SESSION] No saved Google session found');
        
        // Still update UI to show signed-out state
        updateSignInUI();
    }
}

// Helper function to wait for gapi initialization
function waitForGapiInit() {
    return new Promise((resolve) => {
        if (gapiInitialized) {
            resolve();
            return;
        }
        
        const checkInterval = setInterval(() => {
            if (gapiInitialized) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            console.log('ℹ️ [GAPI] Initialization timeout - proceeding anyway');
            resolve();
        }, 10000);
    });
}

// ===== USER-FRIENDLY ERROR MESSAGES =====
function showUserFriendlyError(error) {
    const errorMessages = {
        'Network error': '🌐 Connection issue. Check your internet and try again.',
        'Token expired': '⚠️ Session expired. Please sign in again.',
        'Rate limit': '⏱️ Too many requests. Take a break and try again in a bit.',
        '401': '🔐 Authentication failed. Please sign in again.',
        '403': '🚫 Access denied. Check your permissions.',
        '404': '❓ Resource not found.',
        '429': '⏱️ Rate limit exceeded. Slow down a bit.',
        '500': '⚙️ Server error. Try again in a moment.',
        '503': '🔧 Service temporarily unavailable.',
        'default': '❌ Something went wrong. Try refreshing the page.'
    };
    
    const errorString = error.toString().toLowerCase();
    const errorMessage = error.message ? error.message.toLowerCase() : '';
    
    // Find matching error message
    let message = errorMessages.default;
    for (const [key, value] of Object.entries(errorMessages)) {
        if (key === 'default') continue;
        if (errorString.includes(key.toLowerCase()) || errorMessage.includes(key.toLowerCase())) {
            message = value;
            break;
        }
    }
    
    showToast(message);
    return message;
}

// ===== SAVING INDICATOR FUNCTIONS =====
function showSavingIndicator(message = '💾 Saving...') {
    const indicator = document.querySelector('.saving-indicator');
    if (!indicator) {
        const newIndicator = document.createElement('div');
        newIndicator.className = 'saving-indicator';
        newIndicator.textContent = message;
        document.body.appendChild(newIndicator);
    } else {
        indicator.textContent = message;
        indicator.className = 'saving-indicator visible';
    }
}

function hideSavingIndicator(success = true, message = null) {
    const indicator = document.querySelector('.saving-indicator');
    if (indicator) {
        if (message) {
            indicator.textContent = message;
        } else {
            indicator.textContent = success ? '✅ Saved!' : '⚠️ Save failed';
        }
        indicator.className = `saving-indicator visible ${success ? 'success' : 'error'}`;
        
        setTimeout(() => {
            indicator.classList.remove('visible');
        }, 2000);
    }
}

// ===== ONLINE/OFFLINE DETECTION =====
window.addEventListener('online', () => {
    isOnline = true;
    if (pendingChanges && googleAccessToken) {
        saveDataToDrive();
    }
});

window.addEventListener('offline', () => {
    isOnline = false;
});

// ===== RESET ALL APP DATA =====
// Reset ALL app data except API configuration
async function confirmResetAllAppData() {
    // First confirmation
    const firstConfirm = confirm(
        "⚠️ RESET ALL APP DATA?\n\n" +
        "This will permanently delete:\n" +
        "• All tasks, deadlines, and errands\n" +
        "• All projects\n" +
        "• Your entire schedule\n" +
        "• All mood tracker data\n" +
        "• Course mappings\n" +
        "• Task templates\n\n" +
        "Your API keys and account settings will be preserved.\n\n" +
        "This CANNOT be undone!\n\n" +
        "Click OK to continue, Cancel to keep your data."
    );
    
    if (!firstConfirm) {
        return;
    }
    
    // Second confirmation - make them type
    const typedConfirmation = prompt(
        "⚠️ FINAL WARNING ⚠️\n\n" +
        "Type exactly: RESET EVERYTHING\n\n" +
        "This will delete all your productivity data."
    );
    
    if (typedConfirmation !== "RESET EVERYTHING") {
        if (typedConfirmation !== null) {
            alert("❌ Reset cancelled. Text didn't match.");
        }
        return;
    }
    
    try {
        // Preserve API configuration and Google auth
        const preservedSettings = appData.settings ? { ...appData.settings } : {};
        const preservedEmail = userEmail;
        const preservedToken = googleAccessToken;
        
        // Clear main app data
        appData = {
            tasks: [],
            deadlines: [],
            errandTasks: [],
            projects: [],
            schedule: JSON.parse(JSON.stringify(defaultSchedule)),
            scheduleOverrides: {},
            templates: [],
            settings: preservedSettings,
            currentLocation: 'home',
            lastSync: null,
            userEmail: preservedEmail,
            googleAccessToken: preservedToken
        };
        
        // Save empty data to localStorage
        saveToLocalStorage();
        
        // CRITICAL: Sync empty data to Google Drive BEFORE reloading
        if (isDriveAvailable()) {
            console.log('🔄 [RESET] Syncing empty data to Google Drive...');
            showToast('🔄 Clearing Google Drive data...');
            
            // Wait for Drive sync to complete
            await saveDataToDrive();
            
            console.log('✅ [RESET] Empty data synced to Drive');
        }
        
        // Clear mood tracker
        if (typeof MoodTracker !== 'undefined') {
            MoodTracker.checkIns = [];
            MoodTracker.lastPatternAlert = null;
            MoodTracker.save();
        }
        
        alert(
            "✅ All App Data Reset\n\n" +
            "All productivity data has been deleted from both local storage and Google Drive.\n" +
            "Your API keys and settings are preserved.\n\n" +
            "The app will now reload."
        );
        
        // Reload page
        window.location.reload();
        
    } catch (error) {
        console.error('Error resetting app data:', error);
        alert("❌ Error resetting data. Please try again.");
    }
}
