// settings-sync.js - Secure settings sync with encryption

// ===== ENCRYPTION UTILITIES =====

/**
 * Generate a deterministic encryption key from user's Google account
 * Uses the user's email as a seed for key derivation
 */
async function deriveEncryptionKey(userEmail) {
    const encoder = new TextEncoder();
    const data = encoder.encode(userEmail + '-controlled-chaos-v4');
    
    // Hash the email to create a consistent key
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // Import as a CryptoKey for AES-GCM
    return await crypto.subtle.importKey(
        'raw',
        hashBuffer,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt sensitive data using AES-GCM
 */
async function encryptData(plaintext, key) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    // Generate a random IV (initialization vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);
    
    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt sensitive data using AES-GCM
 */
async function decryptData(encryptedBase64, key) {
    try {
        // Convert from base64
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        
        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const encryptedData = combined.slice(12);
        
        // Decrypt
        const decryptedData = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encryptedData
        );
        
        // Convert back to string
        const decoder = new TextDecoder();
        return decoder.decode(decryptedData);
    } catch (error) {
        console.error('❌ [DECRYPT] Failed to decrypt data:', error);
        throw new Error('Decryption failed - data may be corrupted');
    }
}

// ===== SETTINGS SYNC FUNCTIONS =====

const SETTINGS_FILE_NAME = 'controlled-chaos-settings.json';
let settingsFileId = null;

/**
 * Encrypt sensitive settings fields
 */
async function encryptSettings(settings, userEmail) {
    if (!userEmail) {
        throw new Error('User email required for encryption');
    }
    
    const key = await deriveEncryptionKey(userEmail);
    const encrypted = { ...settings };
    
    // Encrypt sensitive fields
    if (settings.apiKey) {
        encrypted.apiKey = await encryptData(settings.apiKey, key);
        encrypted.apiKey_encrypted = true;
    }
    
    if (settings.workerPassword) {
        encrypted.workerPassword = await encryptData(settings.workerPassword, key);
        encrypted.workerPassword_encrypted = true;
    }
    
    if (settings.clientId) {
        encrypted.clientId = await encryptData(settings.clientId, key);
        encrypted.clientId_encrypted = true;
    }
    
    // Non-sensitive fields remain unencrypted
    // workerUrl, maxDailyWorkMinutes, etc.
    
    return encrypted;
}

/**
 * Decrypt sensitive settings fields
 */
async function decryptSettings(encryptedSettings, userEmail) {
    if (!userEmail) {
        throw new Error('User email required for decryption');
    }
    
    const key = await deriveEncryptionKey(userEmail);
    const decrypted = { ...encryptedSettings };
    
    // Decrypt sensitive fields if they were encrypted
    if (encryptedSettings.apiKey_encrypted && encryptedSettings.apiKey) {
        try {
            decrypted.apiKey = await decryptData(encryptedSettings.apiKey, key);
            delete decrypted.apiKey_encrypted;
        } catch (error) {
            console.error('❌ Failed to decrypt API key');
            decrypted.apiKey = '';
        }
    }
    
    if (encryptedSettings.workerPassword_encrypted && encryptedSettings.workerPassword) {
        try {
            decrypted.workerPassword = await decryptData(encryptedSettings.workerPassword, key);
            delete decrypted.workerPassword_encrypted;
        } catch (error) {
            console.error('❌ Failed to decrypt worker password');
            decrypted.workerPassword = '';
        }
    }
    
    if (encryptedSettings.clientId_encrypted && encryptedSettings.clientId) {
        try {
            decrypted.clientId = await decryptData(encryptedSettings.clientId, key);
            delete decrypted.clientId_encrypted;
        } catch (error) {
            console.error('❌ Failed to decrypt client ID');
            decrypted.clientId = '';
        }
    }
    
    return decrypted;
}

/**
 * Save settings to Google Drive with encryption
 */
async function saveSettingsToDrive() {
    // Check if Drive is available using the same check as storage.js
    if (!isDriveAvailable()) {
        console.log('ℹ️ [SETTINGS SYNC] Drive not available');
        return false;
    }
    
    if (!userEmail) {
        console.log('ℹ️ [SETTINGS SYNC] User email not available');
        return false;
    }
    
    try {
        console.log('💾 [SETTINGS SYNC] Encrypting and saving settings to Drive...');
        
        // Encrypt sensitive settings
        const encryptedSettings = await encryptSettings(appData.settings, userEmail);
        
        // Add metadata
        const settingsData = {
            settings: encryptedSettings,
            lastSync: new Date().toISOString(),
            version: '4.0',
            encrypted: true
        };
        
        const content = JSON.stringify(settingsData, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        
        // Search for existing settings file
        const searchResponse = await gapi.client.drive.files.list({
            q: `name='${SETTINGS_FILE_NAME}' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });
        
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            settingsFileId = searchResponse.result.files[0].id;
        }
        
        const metadata = {
            name: SETTINGS_FILE_NAME,
            mimeType: 'application/json'
        };
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);
        
        const method = settingsFileId ? 'PATCH' : 'POST';
        const url = settingsFileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${settingsFileId}?uploadType=multipart`
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
            settingsFileId = result.id;
            console.log('✅ [SETTINGS SYNC] Settings saved and encrypted in Drive');
            updateSyncIndicator('synced');
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ [SETTINGS SYNC] Failed to save settings:', error);
        return false;
    }
}

/**
 * Load settings from Google Drive with decryption
 */
async function loadSettingsFromDrive() {
    // Check if Drive is available using the same check as storage.js
    if (!isDriveAvailable()) {
        console.log('ℹ️ [SETTINGS SYNC] Drive not available');
        return null;
    }
    
    if (!userEmail) {
        console.log('ℹ️ [SETTINGS SYNC] User email not available');
        return null;
    }
    
    try {
        console.log('📥 [SETTINGS SYNC] Loading settings from Drive...');
        
        // Search for settings file
        const response = await gapi.client.drive.files.list({
            q: `name='${SETTINGS_FILE_NAME}' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });
        
        if (!response.result.files || response.result.files.length === 0) {
            console.log('ℹ️ [SETTINGS SYNC] No settings file found in Drive');
            return null;
        }
        
        settingsFileId = response.result.files[0].id;
        
        // Download file content
        const fileResponse = await gapi.client.drive.files.get({
            fileId: settingsFileId,
            alt: 'media'
        });
        
        const settingsData = JSON.parse(fileResponse.body);
        
        // Decrypt settings if encrypted
        let settings = settingsData.settings;
        if (settingsData.encrypted) {
            console.log('🔓 [SETTINGS SYNC] Decrypting settings...');
            settings = await decryptSettings(settings, userEmail);
        }
        
        console.log('✅ [SETTINGS SYNC] Settings loaded and decrypted from Drive');
        console.log('📥 [SETTINGS SYNC] Last sync:', settingsData.lastSync);
        
        return settings;
    } catch (error) {
        console.error('❌ [SETTINGS SYNC] Failed to load settings:', error);
        return null;
    }
}

/**
 * Update sync indicator UI
 * NOTE: This function is used ONLY during active sync operations.
 * The main sync indicator state is managed by updateSignInUI() in storage.js
 */
function updateSyncIndicator(status) {
    const syncIndicator = document.getElementById('syncIndicator');
    if (!syncIndicator) return;
    
    switch (status) {
        case 'synced':
            syncIndicator.textContent = '☁️ Synced';
            syncIndicator.style.backgroundColor = '#e6f4ea';
            syncIndicator.style.color = '#1e8e3e';
            syncIndicator.style.border = '1px solid #34a853';
            syncIndicator.title = 'Settings synced to Google Drive';
            break;
        case 'syncing':
            syncIndicator.textContent = '⏳ Syncing...';
            syncIndicator.style.backgroundColor = '#e8f0fe';
            syncIndicator.style.color = '#1967d2';
            syncIndicator.style.border = '1px solid #4285f4';
            syncIndicator.title = 'Syncing settings...';
            break;
        case 'local':
            syncIndicator.textContent = '💾 Local Only';
            syncIndicator.style.backgroundColor = '#fef7e0';
            syncIndicator.style.color = '#b45309';
            syncIndicator.style.border = '1px solid #fbbc04';
            syncIndicator.title = 'Settings saved locally only - sign in to sync';
            break;
        case 'error':
            syncIndicator.textContent = '⚠️ Sync Error';
            syncIndicator.style.backgroundColor = '#fce8e6';
            syncIndicator.style.color = '#c5221f';
            syncIndicator.style.border = '1px solid #ea4335';
            syncIndicator.title = 'Failed to sync - click Settings to retry';
            break;
    }
}

/**
 * Force re-sync settings (for troubleshooting)
 */
async function forceResyncSettings() {
    // Check if Drive is available using the same check as storage.js
    if (!isDriveAvailable()) {
        console.log('❌ [FORCE RESYNC] Drive not available');
        alert('Google Drive is not available. Please check your connection and try again.');
        return;
    }
    
    if (!userEmail) {
        console.log('❌ [FORCE RESYNC] User not signed in');
        alert('Please sign in to Google Drive first! Click the "Sign in with Google" button in Settings.');
        return;
    }
    
    console.log('✅ [FORCE RESYNC] Auth checks passed - userEmail:', userEmail);
    
    updateSyncIndicator('syncing');
    
    try {
        // Save current settings to Drive
        const saved = await saveSettingsToDrive();
        
        if (saved) {
            showToast('✅ Settings re-synced successfully!');
            
            // Show confetti for first-time setup
            if (!localStorage.getItem('firstSyncComplete')) {
                confetti({
                    particleCount: 150,
                    spread: 100,
                    origin: { y: 0.6 }
                });
                localStorage.setItem('firstSyncComplete', 'true');
            }
        } else {
            updateSyncIndicator('error');
            showToast('⚠️ Failed to sync settings');
        }
    } catch (error) {
        console.error('❌ [FORCE RESYNC] Error:', error);
        updateSyncIndicator('error');
        showToast('⚠️ Sync failed: ' + error.message);
    }
}

/**
 * Reset all settings (with confirmation)
 */
function resetAllSettings() {
    if (!confirm('⚠️ Reset ALL settings?\n\nThis will:\n- Clear all API keys and credentials\n- Reset preferences to defaults\n- Delete settings from Google Drive\n\nThis cannot be undone!')) {
        return;
    }
    
    // Clear settings
    appData.settings = {
        workerUrl: '',
        workerPassword: '',
        clientId: '',
        apiKey: '',
        maxDailyWorkMinutes: 90
    };
    
    // Clear from localStorage
    saveToLocalStorage();
    
    // Clear from Drive if signed in
    if (isDriveAvailable() && settingsFileId) {
        gapi.client.drive.files.delete({
            fileId: settingsFileId
        }).then(() => {
            console.log('✅ Settings file deleted from Drive');
            settingsFileId = null;
        }).catch(error => {
            console.error('❌ Failed to delete settings from Drive:', error);
        });
    }
    
    // Clear UI
    populateSettingsInputs();
    
    // Update globals
    CLOUDFLARE_WORKER_URL = '';
    GOOGLE_CLIENT_ID = '';
    
    updateSyncIndicator('local');
    showToast('✅ All settings reset');
}

// ===== AUTO-IMPORT CALENDAR FEATURE =====

// Initialize auto-import UI
function initializeAutoImportUI() {
    const checkbox = document.getElementById('autoImportEnabled');
    const urlSection = document.getElementById('autoImportUrlSection');
    const urlInput = document.getElementById('autoImportCalendarUrl');
    
    if (!checkbox || !urlSection || !urlInput) {
        console.log('⚠️ [AUTO-IMPORT] UI elements not found, skipping initialization');
        return;
    }
    
    // Load saved settings
    const settings = appData.settings || {};
    if (settings.autoImportEnabled) {
        checkbox.checked = true;
        urlSection.style.display = 'block';
        urlInput.value = settings.autoImportCalendarUrl || '';
    }
    
    // Toggle URL section when checkbox changes
    checkbox.addEventListener('change', () => {
        urlSection.style.display = checkbox.checked ? 'block' : 'none';
        if (!checkbox.checked) {
            urlInput.value = '';
        }
    });
    
    console.log('✅ [AUTO-IMPORT] UI initialized');
}

// Save auto-import settings
function saveAutoImportSettings() {
    const checkbox = document.getElementById('autoImportEnabled');
    const urlInput = document.getElementById('autoImportCalendarUrl');
    
    if (!checkbox || !urlInput) {
        console.log('⚠️ [AUTO-IMPORT] UI elements not found, skipping save');
        return;
    }
    
    if (!appData.settings) {
        appData.settings = {};
    }
    
    const wasEnabled = appData.settings.autoImportEnabled || false;
    const isEnabled = checkbox.checked;
    const calendarUrl = urlInput.value.trim();
    
    // Validate URL if enabled
    if (isEnabled && !calendarUrl) {
        alert('Please enter a calendar feed URL!');
        checkbox.checked = false;
        return;
    }
    
    if (isEnabled && !calendarUrl.includes('.ics')) {
        alert('Please enter a valid .ics calendar feed URL!');
        return;
    }
    
    appData.settings.autoImportEnabled = isEnabled;
    appData.settings.autoImportCalendarUrl = isEnabled ? calendarUrl : '';
    
    // Show feedback
    if (isEnabled && !wasEnabled) {
        console.log('✅ [AUTO-IMPORT] Auto-import enabled for:', calendarUrl);
        showToast('🤖 Auto-import enabled! Calendar will update daily at 6 AM.');
    } else if (!isEnabled && wasEnabled) {
        console.log('📴 [AUTO-IMPORT] Auto-import disabled');
        showToast('📴 Auto-import disabled');
    }
}

// Manual trigger for auto-import (for testing)
async function manualTriggerAutoImport() {
    const settings = appData.settings || {};
    
    if (!settings.autoImportEnabled || !settings.autoImportCalendarUrl) {
        alert('Auto-import is not enabled. Please enable it in Settings first.');
        return;
    }
    
    console.log('🔄 [AUTO-IMPORT] Manually triggering auto-import...');
    showToast('🔄 Checking for new assignments...');
    
    try {
        const calendarUrl = settings.autoImportCalendarUrl;
        
        // Fetch the calendar directly
        const proxyUrl = `/api/calendar-proxy?url=${encodeURIComponent(calendarUrl)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error('Failed to fetch calendar');
        }
        
        const icsData = await response.text();
        
        // Parse and import
        const events = parseICSData(icsData);
        const categorizedEvents = categorizeEvents(events);
        
        // Check for unmapped course codes
        const unmappedCodes = [...new Set(
            categorizedEvents
                .map(e => extractCourseCode(e.summary))
                .filter(code => code && !getCourseMappingForCode(code))
        )];
        
        if (unmappedCodes.length > 0) {
            showCourseMappingModal(unmappedCodes, (mappings) => {
                showImportPreview(categorizedEvents);
            });
        } else {
            showImportPreview(categorizedEvents);
        }
        
        console.log('✅ [AUTO-IMPORT] Manual trigger completed');
    } catch (error) {
        console.error('❌ [AUTO-IMPORT] Manual trigger failed:', error);
        showToast('❌ Auto-import failed. Please try again.');
    }
}
