# Google Drive Integration Guide for Controlled Chaos v4

This guide explains how to integrate Google Drive sync into the existing v4 HTML file.

## Configuration Constants (Add at top of script section)

```javascript
// CONFIGURATION - Replace these with your actual values
const CLOUDFLARE_WORKER_URL = 'YOUR-WORKER-URL-HERE/api/claude';
const GOOGLE_CLIENT_ID = 'YOUR-CLIENT-ID-HERE.apps.googleusercontent.com';
const DRIVE_FILE_NAME = 'controlled-chaos-data.json';
```

## Add Google API Script (in <head> section)

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script src="https://apis.google.com/js/api.js"></script>
```

## Add Sign In Button (in header section, after header-buttons)

```html
<div id="googleSignIn" style="text-align: center; margin-top: 20px;">
    <button class="btn btn-primary" onclick="handleGoogleSignIn()">
        🔐 Sign in with Google
    </button>
    <p style="color: var(--text-light); font-size: 0.9em; margin-top: 10px;">
        Sign in to sync your data across devices
    </p>
</div>

<div id="syncStatus" style="display: none; text-align: center; margin-top: 20px;">
    <p style="color: var(--success);">
        ✅ Signed in as <span id="userEmail"></span>
    </p>
    <button class="btn btn-secondary" onclick="handleGoogleSignOut()">Sign Out</button>
</div>
```

## Replace localStorage Functions

### 1. Replace `loadData()` function:

```javascript
// Google Drive integration
let googleAccessToken = null;
let driveFileId = null;
let isOnline = navigator.onLine;
let pendingChanges = false;

// Initialize Google API
function initGoogleAPI() {
    gapi.load('client', async () => {
        await gapi.client.init({
            apiKey: '', // Not needed for OAuth
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
    });
}

// Handle Google Sign In
async function handleGoogleSignIn() {
    const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (response) => {
            if (response.access_token) {
                googleAccessToken = response.access_token;
                gapi.client.setToken({ access_token: googleAccessToken });
                
                // Get user info
                const userInfo = await getUserInfo();
                document.getElementById('userEmail').textContent = userInfo.email;
                document.getElementById('googleSignIn').style.display = 'none';
                document.getElementById('syncStatus').style.display = 'block';
                
                // Load data from Drive
                await loadDataFromDrive();
                
                showToast('✅ Signed in! Data synced from Google Drive');
            }
        },
    });
    client.requestAccessToken();
}

// Handle Google Sign Out
function handleGoogleSignOut() {
    google.accounts.oauth2.revoke(googleAccessToken, () => {
        googleAccessToken = null;
        driveFileId = null;
        gapi.client.setToken(null);
        
        document.getElementById('googleSignIn').style.display = 'block';
        document.getElementById('syncStatus').style.display = 'none';
        
        showToast('👋 Signed out');
    });
}

// Get user info
async function getUserInfo() {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
    });
    return await response.json();
}

// Load data from Google Drive
async function loadDataFromDrive() {
    try {
        // Check if file ID is stored locally
        driveFileId = localStorage.getItem('driveFileId');
        
        if (!driveFileId) {
            // Search for existing file
            const response = await gapi.client.drive.files.list({
                q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
                spaces: 'drive',
                fields: 'files(id, name)',
            });
            
            if (response.result.files.length > 0) {
                driveFileId = response.result.files[0].id;
                localStorage.setItem('driveFileId', driveFileId);
            }
        }
        
        if (driveFileId) {
            // File exists, download it
            const response = await gapi.client.drive.files.get({
                fileId: driveFileId,
                alt: 'media',
            });
            
            appData = JSON.parse(response.body);
            render();
        } else {
            // No file exists, create one with current data
            await saveDataToDrive();
        }
    } catch (error) {
        console.error('Error loading from Drive:', error);
        showToast('⚠️ Could not load from Drive, using local data');
        loadDataLocal();
    }
}

// Save data to Google Drive
async function saveDataToDrive() {
    if (!googleAccessToken) {
        // Not signed in, save locally
        saveDataLocal();
        return;
    }
    
    if (!isOnline) {
        // Offline, queue the change
        pendingChanges = true;
        saveDataLocal();
        return;
    }
    
    try {
        const content = JSON.stringify(appData);
        const blob = new Blob([content], { type: 'application/json' });
        
        if (driveFileId) {
            // Update existing file
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${googleAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: blob,
            });
        } else {
            // Create new file
            const metadata = {
                name: DRIVE_FILE_NAME,
                mimeType: 'application/json',
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);
            
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${googleAccessToken}`,
                },
                body: form,
            });
            
            const result = await response.json();
            driveFileId = result.id;
            localStorage.setItem('driveFileId', driveFileId);
        }
        
        pendingChanges = false;
    } catch (error) {
        console.error('Error saving to Drive:', error);
        pendingChanges = true;
        saveDataLocal();
    }
}

// Local storage fallback
function loadDataLocal() {
    const saved = localStorage.getItem('controlledChaosV4');
    if (saved) {
        const parsed = JSON.parse(saved);
        appData = { ...appData, ...parsed };
    }
    
    const dyslexiaFont = localStorage.getItem('dyslexiaFont') === 'true';
    if (dyslexiaFont) {
        document.body.classList.add('dyslexia-font');
    }
}

function saveDataLocal() {
    localStorage.setItem('controlledChaosV4', JSON.stringify(appData));
}

// Replace all saveData() calls with saveDataToDrive()
function saveData() {
    saveDataToDrive();
}

// Replace loadData() function
function loadData() {
    if (googleAccessToken) {
        loadDataFromDrive();
    } else {
        loadDataLocal();
    }
}

// Monitor online/offline status
window.addEventListener('online', async () => {
    isOnline = true;
    if (pendingChanges && googleAccessToken) {
        showToast('🔄 Back online! Syncing changes...');
        await saveDataToDrive();
        showToast('✅ Changes synced!');
    }
});

window.addEventListener('offline', () => {
    isOnline = false;
    showToast('📴 Offline mode - changes will sync when back online');
});
```

## Update API Calls to Use Cloudflare Worker

### Replace all `fetch('https://api.anthropic.com/v1/messages'` with:

```javascript
fetch(CLOUDFLARE_WORKER_URL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': appData.apiKey,
    },
    body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [/* your messages */]
    })
})
```

### Update these functions:
1. `processBrainDump()` - Change API endpoint
2. `breakDownTask()` - Change API endpoint

## Update window.onload

```javascript
window.onload = () => {
    // Initialize Google API
    initGoogleAPI();
    
    // Check if already signed in
    const storedFileId = localStorage.getItem('driveFileId');
    if (storedFileId) {
        // Try to restore session (user will need to sign in again)
        document.getElementById('googleSignIn').style.display = 'block';
    } else {
        loadDataLocal();
    }
    
    updateCurrentDate();
    updateCurrentBlockDisplay();
    renderSchedule();
    renderTasks();
    
    // Update every minute
    setInterval(() => {
        updateCurrentDate();
        updateCurrentBlockDisplay();
        renderSchedule();
        if (appData.currentLocation) {
            showContextAndSuggestion();
        }
    }, 60000);
    
    // Show welcome message
    if (!appData.apiKey) {
        setTimeout(() => {
            showToast('💡 Tip: Add your Anthropic API key in Settings for smart features!');
        }, 2000);
    }
};
```

## Summary of Changes

1. **Add configuration constants** at the top of the script
2. **Add Google API scripts** to the head
3. **Add sign-in UI** to the header
4. **Replace localStorage** with Google Drive API calls
5. **Update API endpoints** to use Cloudflare Worker
6. **Add offline support** with pending changes queue
7. **Update initialization** to check for existing session

## Testing Checklist

- [ ] Sign in with Google works
- [ ] Data saves to Google Drive
- [ ] Data loads from Google Drive on refresh
- [ ] Works offline (queues changes)
- [ ] Syncs when back online
- [ ] AI features work through Cloudflare Worker
- [ ] Sign out works correctly
- [ ] Multiple devices stay in sync

## Security Notes

- API key is stored in Google Drive (encrypted by Google)
- Access token is never stored permanently
- Cloudflare Worker doesn't store any data
- All data stays in user's Google Drive
