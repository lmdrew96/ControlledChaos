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
        apiKey: ''
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

// ===== CHECK IF DRIVE IS AVAILABLE =====
function isDriveAvailable() {
    if (!gapi || !gapi.client || !gapi.client.drive) {
        return false;
    }
    
    // Check if we have a valid access token
    const token = gapi.auth2?.getAuthInstance()?.currentUser?.get()?.getAuthResponse()?.access_token;
    return !!token && !!googleAccessToken;
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
                    
                    // Update UI immediately - don't wait for page refresh
                    updateSignInUI();
                    
                    console.log('✅ [SIGN IN] UI updated');
                    
                    // Show toast notification
                    showToast(`✅ Signed in as ${userEmail}`);
                    
                    // Load data from Drive
                    await loadDataFromDrive();
                    updateUI();
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
    userEmail = null;
    localStorage.removeItem('googleAccessToken');
    localStorage.removeItem('userEmail');
    
    console.log('💾 [SIGN OUT] Credentials cleared from localStorage');
    
    // Update UI immediately
    updateSignInUI();
    
    console.log('✅ [SIGN OUT] UI updated');
    console.log('✅ [SIGN OUT] Completed');
    
    showToast('👋 Signed out successfully');
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
        
        // Search for existing file
        const response = await gapi.client.drive.files.list({
            q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });

        if (response.result.files && response.result.files.length > 0) {
            driveFileId = response.result.files[0].id;
            
            // Download file content
            const fileResponse = await gapi.client.drive.files.get({
                fileId: driveFileId,
                alt: 'media'
            });
            
            // Parse and load data
            const loadedData = JSON.parse(fileResponse.body);
            
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
            console.error('❌ [DRIVE] Save error:', error);
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
            if (localData.settings.workerUrl) {
                CLOUDFLARE_WORKER_URL = localData.settings.workerUrl;
            }
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
        console.log('🔄 [RESTORE SESSION] userEmail is now:', userEmail);
        console.log('🔄 [RESTORE SESSION] appData.userEmail is now:', appData.userEmail);
        
        // Update UI to show signed-in state immediately
        updateSignInUI();
        console.log('🔄 [RESTORE SESSION] UI updated to show signed-in state');
        
        // STEP 3: Wait for gapi to initialize before attempting Drive operations
        console.log('🔄 [RESTORE SESSION] Waiting for gapi to initialize...');
        await waitForGapiInit();
        
        // Set token for gapi
        gapi.client.setToken({ access_token: googleAccessToken });
        console.log('🔄 [RESTORE SESSION] Token set for gapi client');
        
        // STEP 4: Try to load from Drive (in background, may update if newer)
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
