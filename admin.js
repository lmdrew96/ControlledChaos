// admin.js - Admin Panel for Managing User Access

// Hardcoded owner email
const OWNER_EMAIL = 'lmdrew96@gmail.com';

// Admin config file name in Google Drive
const ADMIN_CONFIG_FILENAME = 'controlled-chaos-admin.json';

// Cache for allowlist
let cachedAllowlist = null;
let allowlistLastLoaded = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load allowlist from Google Drive
 * Creates default config if not found
 */
async function loadAllowlist(forceRefresh = false) {
    console.log('📋 [ADMIN] Loading allowlist...');
    
    // Check cache first
    if (!forceRefresh && cachedAllowlist && allowlistLastLoaded) {
        const age = Date.now() - allowlistLastLoaded;
        if (age < CACHE_DURATION) {
            console.log('📋 [ADMIN] Using cached allowlist');
            return cachedAllowlist;
        }
    }
    
    if (!isDriveAvailable()) {
        console.error('❌ [ADMIN] Google Drive not available');
        return getDefaultAllowlist();
    }
    
    try {
        // Search for admin config file
        const response = await gapi.client.drive.files.list({
            q: `name='${ADMIN_CONFIG_FILENAME}' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });
        
        const files = response.result.files;
        
        if (files && files.length > 0) {
            // File exists - load it
            const fileId = files[0].id;
            const fileResponse = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            
            const allowlist = JSON.parse(fileResponse.body);
            console.log('✅ [ADMIN] Loaded allowlist from Drive:', allowlist);
            
            // Update cache
            cachedAllowlist = allowlist;
            allowlistLastLoaded = Date.now();
            
            return allowlist;
        } else {
            // File doesn't exist - create default
            console.log('📝 [ADMIN] Admin config not found, creating default...');
            const defaultAllowlist = getDefaultAllowlist();
            await saveAllowlist(defaultAllowlist);
            return defaultAllowlist;
        }
    } catch (error) {
        console.error('❌ [ADMIN] Error loading allowlist:', error);
        return getDefaultAllowlist();
    }
}

/**
 * Get default allowlist (owner only)
 */
function getDefaultAllowlist() {
    return {
        owner: OWNER_EMAIL,
        allowedUsers: [OWNER_EMAIL],
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Save allowlist to Google Drive
 */
async function saveAllowlist(allowlist) {
    console.log('💾 [ADMIN] Saving allowlist...');
    
    if (!isDriveAvailable()) {
        console.error('❌ [ADMIN] Google Drive not available');
        throw new Error('Google Drive not available');
    }
    
    try {
        // Update timestamp
        allowlist.lastUpdated = new Date().toISOString();
        
        // Search for existing file
        const response = await gapi.client.drive.files.list({
            q: `name='${ADMIN_CONFIG_FILENAME}' and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        });
        
        const files = response.result.files;
        const content = JSON.stringify(allowlist, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        
        if (files && files.length > 0) {
            // Update existing file
            const fileId = files[0].id;
            
            const metadata = {
                name: ADMIN_CONFIG_FILENAME,
                mimeType: 'application/json'
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${gapi.auth.getToken().access_token}`
                },
                body: form
            });
            
            console.log('✅ [ADMIN] Updated allowlist in Drive');
        } else {
            // Create new file
            const metadata = {
                name: ADMIN_CONFIG_FILENAME,
                mimeType: 'application/json'
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);
            
            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gapi.auth.getToken().access_token}`
                },
                body: form
            });
            
            console.log('✅ [ADMIN] Created allowlist in Drive');
        }
        
        // Update cache
        cachedAllowlist = allowlist;
        allowlistLastLoaded = Date.now();
        
        return true;
    } catch (error) {
        console.error('❌ [ADMIN] Error saving allowlist:', error);
        throw error;
    }
}

/**
 * Add user to allowlist
 */
async function addAllowedUser(email) {
    console.log('➕ [ADMIN] Adding user:', email);
    
    const allowlist = await loadAllowlist(true); // Force refresh
    
    // Check if already exists
    if (allowlist.allowedUsers.includes(email)) {
        console.log('⚠️ [ADMIN] User already in allowlist');
        return false;
    }
    
    // Check limit (4 users max)
    if (allowlist.allowedUsers.length >= 4) {
        console.log('⚠️ [ADMIN] Maximum users reached');
        throw new Error('Maximum 4 users allowed');
    }
    
    // Add user
    allowlist.allowedUsers.push(email);
    await saveAllowlist(allowlist);
    
    console.log('✅ [ADMIN] User added successfully');
    return true;
}

/**
 * Remove user from allowlist
 */
async function removeAllowedUser(email) {
    console.log('➖ [ADMIN] Removing user:', email);
    
    // Prevent removing owner
    if (email === OWNER_EMAIL) {
        console.log('⚠️ [ADMIN] Cannot remove owner');
        throw new Error('Cannot remove the owner');
    }
    
    const allowlist = await loadAllowlist(true); // Force refresh
    
    // Remove user
    allowlist.allowedUsers = allowlist.allowedUsers.filter(u => u !== email);
    await saveAllowlist(allowlist);
    
    console.log('✅ [ADMIN] User removed successfully');
    return true;
}

/**
 * Check if current user is owner
 */
function isOwner(email) {
    return email === OWNER_EMAIL;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Initialize admin panel (called on app load)
 */
async function initializeAdminPanel() {
    console.log('🔐 [ADMIN] Initializing admin panel...');
    
    if (!isDriveAvailable() || !userEmail) {
        console.log('⚠️ [ADMIN] Not signed in, skipping admin panel');
        return;
    }
    
    const currentUser = userEmail;
    const userIsOwner = isOwner(currentUser);
    
    console.log('🔐 [ADMIN] Current user:', currentUser, userIsOwner ? '(owner)' : '(not owner)');
    
    if (userIsOwner) {
        // Show admin panel
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) {
            adminPanel.style.display = 'block';
            await loadAndDisplayAllowlist();
        }
    }
}

/**
 * Load and display allowlist in UI
 */
async function loadAndDisplayAllowlist() {
    console.log('📋 [ADMIN] Loading and displaying allowlist...');
    
    try {
        const allowlist = await loadAllowlist();
        const container = document.getElementById('allowed-users-list');
        
        if (!container) {
            console.error('❌ [ADMIN] Container not found');
            return;
        }
        
        container.innerHTML = allowlist.allowedUsers.map(email => {
            const userIsOwner = email === OWNER_EMAIL;
            return `
                <div class="user-item">
                    <span class="user-email">${email}</span>
                    <span class="user-badge">${userIsOwner ? 'Owner' : 'Authorized'}</span>
                    <button 
                        onclick="removeUser('${email}')" 
                        class="remove-btn"
                        ${userIsOwner ? 'disabled' : ''}
                    >
                        Remove
                    </button>
                </div>
            `;
        }).join('');
        
        // Update user count
        const userCount = document.getElementById('user-count');
        if (userCount) {
            userCount.textContent = allowlist.allowedUsers.length;
        }
        
        console.log('✅ [ADMIN] Allowlist displayed');
    } catch (error) {
        console.error('❌ [ADMIN] Error displaying allowlist:', error);
        showToast('❌ Failed to load user list');
    }
}

/**
 * Add user (called from UI)
 */
async function addUser() {
    const emailInput = document.getElementById('new-user-email');
    const email = emailInput.value.trim().toLowerCase();
    
    // Validate
    if (!isValidEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    try {
        // Load current allowlist
        const allowlist = await loadAllowlist(true);
        
        // Check duplicate
        if (allowlist.allowedUsers.includes(email)) {
            alert('This user is already authorized');
            return;
        }
        
        // Check limit (4 users max)
        if (allowlist.allowedUsers.length >= 4) {
            alert('Maximum 4 users allowed');
            return;
        }
        
        // Add user
        await addAllowedUser(email);
        
        // Clear input and refresh display
        emailInput.value = '';
        await loadAndDisplayAllowlist();
        
        // Show success
        showToast('✅ User added successfully!');
        
        // Confetti!
        if (typeof confetti !== 'undefined') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    } catch (error) {
        console.error('❌ [ADMIN] Error adding user:', error);
        alert('Failed to add user: ' + error.message);
    }
}

/**
 * Remove user (called from UI)
 */
async function removeUser(email) {
    // Prevent removing owner
    if (email === OWNER_EMAIL) {
        alert('Cannot remove the owner');
        return;
    }
    
    // Confirm
    if (!confirm(`Remove access for ${email}?`)) {
        return;
    }
    
    try {
        // Remove user
        await removeAllowedUser(email);
        
        // Refresh display
        await loadAndDisplayAllowlist();
        
        // Show success
        showToast('✅ User removed');
    } catch (error) {
        console.error('❌ [ADMIN] Error removing user:', error);
        alert('Failed to remove user: ' + error.message);
    }
}

/**
 * Get allowlist with caching (for API calls)
 */
async function getAllowlist(forceRefresh = false) {
    return await loadAllowlist(forceRefresh);
}

/**
 * Invalidate allowlist cache
 */
function invalidateAllowlistCache() {
    cachedAllowlist = null;
    allowlistLastLoaded = null;
}
