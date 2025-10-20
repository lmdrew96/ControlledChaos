// location.js - Manual location detection for location-aware task suggestions

// ===== HAVERSINE DISTANCE CALCULATION =====
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c; // Distance in meters
}

// ===== GEOCODING =====
async function geocodeAddress(address) {
    if (!address || address.trim() === '') {
        return null;
    }
    
    try {
        // Use Nominatim (OpenStreetMap) geocoding API
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'ControlledChaos/1.0' // Required by Nominatim
            }
        });
        
        if (!response.ok) {
            throw new Error(`Geocoding failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
        
        return null;
    } catch (error) {
        console.error('❌ [LOCATION] Geocoding error:', error);
        return null;
    }
}

// ===== GET CURRENT LOCATION =====
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported by this browser'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                let errorMessage = 'Unknown error';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Location permission denied';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Location information unavailable';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Location request timed out';
                        break;
                }
                reject(new Error(errorMessage));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

// ===== DETERMINE LOCATION =====
function determineLocation(currentLat, currentLng) {
    const settings = appData.settings || {};
    
    // Check if we have saved location coordinates
    const homeCoords = settings.homeLocationCoords;
    const schoolCoords = settings.schoolLocationCoords;
    const workCoords = settings.workLocationCoords;
    
    const locations = [];
    
    // Calculate distances to each saved location
    if (homeCoords && homeCoords.lat && homeCoords.lng) {
        const distance = calculateDistance(currentLat, currentLng, homeCoords.lat, homeCoords.lng);
        locations.push({ name: 'home', distance, icon: '🏠' });
    }
    
    if (schoolCoords && schoolCoords.lat && schoolCoords.lng) {
        const distance = calculateDistance(currentLat, currentLng, schoolCoords.lat, schoolCoords.lng);
        locations.push({ name: 'school', distance, icon: '🏫' });
    }
    
    if (workCoords && workCoords.lat && workCoords.lng) {
        const distance = calculateDistance(currentLat, currentLng, workCoords.lat, workCoords.lng);
        locations.push({ name: 'work', distance, icon: '💼' });
    }
    
    // Sort by distance
    locations.sort((a, b) => a.distance - b.distance);
    
    // Check if within 800 meters (0.5 miles) of any location
    const THRESHOLD = 800; // meters
    
    if (locations.length > 0 && locations[0].distance <= THRESHOLD) {
        // Priority order: school > work > home (if multiple matches)
        const nearbyLocations = locations.filter(loc => loc.distance <= THRESHOLD);
        
        // Check for school first (time-sensitive)
        const school = nearbyLocations.find(loc => loc.name === 'school');
        if (school) return school.name;
        
        // Then work
        const work = nearbyLocations.find(loc => loc.name === 'work');
        if (work) return work.name;
        
        // Finally home
        const home = nearbyLocations.find(loc => loc.name === 'home');
        if (home) return home.name;
    }
    
    // Not near any saved location - check if in commute time
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    
    // Weekday commute times (7-9 AM, 4-7 PM)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        if ((hour >= 7 && hour < 9) || (hour >= 16 && hour < 19)) {
            return 'commute';
        }
    }
    
    // Default to "anywhere"
    return 'anywhere';
}

// ===== UPDATE CURRENT LOCATION =====
async function updateCurrentLocation() {
    const button = document.getElementById('checkLocationBtn');
    const settings = appData.settings || {};
    
    // Check if user has set up any locations
    const hasLocations = settings.homeLocationAddress || 
                        settings.schoolLocationAddress || 
                        settings.workLocationAddress;
    
    if (!hasLocations) {
        showToast('⚠️ Please set up your locations in Settings first');
        // Switch to settings tab
        const settingsTab = document.querySelector('[data-tab="settings"]');
        if (settingsTab) {
            settingsTab.click();
            // Scroll to location settings
            setTimeout(() => {
                const locationSettings = document.getElementById('locationSettingsSection');
                if (locationSettings) {
                    locationSettings.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 300);
        }
        return;
    }
    
    // Show privacy modal on first use
    const hasSeenPrivacyModal = localStorage.getItem('locationPrivacyAcknowledged');
    if (!hasSeenPrivacyModal) {
        const acknowledged = await showLocationPrivacyModal();
        if (!acknowledged) {
            return; // User declined
        }
        localStorage.setItem('locationPrivacyAcknowledged', 'true');
    }
    
    // Update button to show loading
    if (button) {
        button.innerHTML = '⏳ Checking...';
        button.disabled = true;
    }
    
    try {
        // Get current location from browser
        const coords = await getCurrentLocation();
        
        // Determine which location we're at
        const location = determineLocation(coords.lat, coords.lng);
        
        // Update app data
        appData.currentLocation = location;
        appData.settings.lastLocationCheck = new Date().toISOString();
        
        // Save data
        saveData();
        
        // Update button display
        updateLocationButton(location);
        
        // Show toast notification
        const locationNames = {
            'home': 'Home',
            'school': 'School',
            'work': 'Work',
            'commute': 'Commuting',
            'anywhere': 'Unknown location'
        };
        
        showToast(`📍 Location updated: ${locationNames[location]}`);
        
        // Trigger UI updates
        setLocation(location);
        updateUI();
        
    } catch (error) {
        console.error('❌ [LOCATION] Error:', error);
        
        // Handle permission denied
        if (error.message.includes('denied')) {
            showLocationPermissionDeniedModal();
        } else {
            showToast(`❌ ${error.message}`);
        }
        
        // Reset button
        if (button) {
            const currentLoc = appData.currentLocation || 'home';
            updateLocationButton(currentLoc);
        }
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// ===== UPDATE LOCATION BUTTON DISPLAY =====
function updateLocationButton(location) {
    const button = document.getElementById('checkLocationBtn');
    if (!button) return;
    
    const locationConfig = {
        'home': { icon: '🏠', name: 'Home', color: '#8b5cf6' },
        'school': { icon: '🏫', name: 'School', color: '#10b981' },
        'work': { icon: '💼', name: 'Work', color: '#f59e0b' },
        'commute': { icon: '🚗', name: 'Commuting', color: '#3b82f6' },
        'anywhere': { icon: '📍', name: 'Unknown', color: '#6b7280' }
    };
    
    const config = locationConfig[location] || locationConfig['anywhere'];
    
    button.innerHTML = `${config.icon} ${config.name}`;
    button.style.background = `linear-gradient(135deg, ${config.color}, ${adjustColor(config.color, -20)})`;
    button.style.color = 'white';
    button.style.border = 'none';
    
    // Add timestamp
    const lastCheck = appData.settings?.lastLocationCheck;
    if (lastCheck) {
        const timeAgo = getTimeAgo(new Date(lastCheck));
        button.title = `Last updated ${timeAgo}`;
    }
}

// ===== HELPER: ADJUST COLOR BRIGHTNESS =====
function adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ===== HELPER: GET TIME AGO =====
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

// ===== PRIVACY MODAL =====
function showLocationPrivacyModal() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>📍 Location Privacy</h2>
                </div>
                <div style="padding: 20px;">
                    <p style="margin-bottom: 15px;">
                        This app will ask for your location to help suggest tasks based on where you are.
                    </p>
                    <div style="background: rgba(102, 126, 234, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <strong>🔒 Your Privacy:</strong>
                        <ul style="margin: 10px 0 0 20px; line-height: 1.6;">
                            <li>Location is only checked when you click the button</li>
                            <li>Never checked automatically</li>
                            <li>Stored locally on your device only</li>
                            <li>Never sent to any server</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button class="btn btn-primary" onclick="this.closest('.modal').remove(); arguments[0](true)" style="flex: 1;">
                            ✅ I Understand
                        </button>
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove(); arguments[0](false)" style="flex: 1;">
                            ❌ Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add click handlers
        const buttons = modal.querySelectorAll('button');
        buttons[0].onclick = () => { modal.remove(); resolve(true); };
        buttons[1].onclick = () => { modal.remove(); resolve(false); };
        
        document.body.appendChild(modal);
    });
}

// ===== PERMISSION DENIED MODAL =====
function showLocationPermissionDeniedModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>⚠️ Location Permission Denied</h2>
            </div>
            <div style="padding: 20px;">
                <p style="margin-bottom: 15px;">
                    You've denied location access. You can still manually select your location:
                </p>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 20px 0;">
                    <button class="btn btn-secondary" onclick="manualSelectLocation('home'); this.closest('.modal').remove();">
                        🏠 Home
                    </button>
                    <button class="btn btn-secondary" onclick="manualSelectLocation('school'); this.closest('.modal').remove();">
                        🏫 School
                    </button>
                    <button class="btn btn-secondary" onclick="manualSelectLocation('work'); this.closest('.modal').remove();">
                        💼 Work
                    </button>
                    <button class="btn btn-secondary" onclick="manualSelectLocation('commute'); this.closest('.modal').remove();">
                        🚗 Commute
                    </button>
                </div>
                <p style="font-size: 0.9em; color: var(--text-light); margin-top: 15px;">
                    💡 To enable automatic detection, allow location access in your browser settings.
                </p>
                <button class="btn btn-primary" onclick="this.closest('.modal').remove()" style="width: 100%; margin-top: 15px;">
                    Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ===== MANUAL LOCATION SELECTION =====
function manualSelectLocation(location) {
    appData.currentLocation = location;
    appData.settings.lastLocationCheck = new Date().toISOString();
    saveData();
    
    updateLocationButton(location);
    setLocation(location);
    updateUI();
    
    const locationNames = {
        'home': 'Home',
        'school': 'School',
        'work': 'Work',
        'commute': 'Commuting'
    };
    
    showToast(`📍 Location set to: ${locationNames[location]}`);
}

// ===== GEOCODE AND SAVE LOCATION ADDRESSES =====
async function geocodeAndSaveLocations() {
    const settings = appData.settings || {};
    
    // Get addresses from inputs
    const homeAddress = document.getElementById('homeLocationAddress')?.value.trim();
    const schoolAddress = document.getElementById('schoolLocationAddress')?.value.trim();
    const workAddress = document.getElementById('workLocationAddress')?.value.trim();
    
    let geocodedCount = 0;
    
    // Geocode home address if changed
    if (homeAddress && homeAddress !== settings.homeLocationAddress) {
        showToast('🔍 Geocoding home address...');
        const coords = await geocodeAddress(homeAddress);
        if (coords) {
            settings.homeLocationCoords = coords;
            settings.homeLocationAddress = homeAddress;
            geocodedCount++;
        } else {
            showToast('⚠️ Could not find home address');
        }
    }
    
    // Geocode school address if changed
    if (schoolAddress && schoolAddress !== settings.schoolLocationAddress) {
        showToast('🔍 Geocoding school address...');
        const coords = await geocodeAddress(schoolAddress);
        if (coords) {
            settings.schoolLocationCoords = coords;
            settings.schoolLocationAddress = schoolAddress;
            geocodedCount++;
        } else {
            showToast('⚠️ Could not find school address');
        }
    }
    
    // Geocode work address if changed
    if (workAddress && workAddress !== settings.workLocationAddress) {
        showToast('🔍 Geocoding work address...');
        const coords = await geocodeAddress(workAddress);
        if (coords) {
            settings.workLocationCoords = coords;
            settings.workLocationAddress = workAddress;
            geocodedCount++;
        } else {
            showToast('⚠️ Could not find work address');
        }
    }
    
    if (geocodedCount > 0) {
        showToast(`✅ Geocoded ${geocodedCount} location(s)`);
    }
    
    appData.settings = settings;
}

// ===== INITIALIZE LOCATION BUTTON =====
function initializeLocationButton() {
    const button = document.getElementById('checkLocationBtn');
    if (!button) return;
    
    // Set initial display
    const currentLocation = appData.currentLocation || 'home';
    updateLocationButton(currentLocation);
    
    // Add click handler
    button.addEventListener('click', updateCurrentLocation);
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLocationButton);
} else {
    initializeLocationButton();
}
