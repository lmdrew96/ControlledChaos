// sanitize.js - Input sanitization utilities for security

/**
 * Sanitize HTML to prevent XSS attacks
 * @param {string} input - Raw input string
 * @returns {string} - Sanitized string
 */
function sanitizeHTML(input) {
    if (typeof input !== 'string') return '';
    
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };
    
    return input.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Sanitize text for safe display (removes HTML but preserves newlines)
 * @param {string} input - Raw input string
 * @returns {string} - Sanitized string
 */
function sanitizeText(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>]/g, '');
}

/**
 * Sanitize email address
 * @param {string} email - Email address
 * @returns {string} - Sanitized email
 */
function sanitizeEmail(email) {
    if (typeof email !== 'string') return '';
    return email.trim().toLowerCase().replace(/[<>"']/g, '');
}

/**
 * Sanitize URL to prevent javascript: and data: URLs
 * @param {string} url - URL string
 * @returns {string} - Sanitized URL or empty string if invalid
 */
function sanitizeURL(url) {
    if (typeof url !== 'string') return '';
    
    const trimmed = url.trim();
    
    // Block dangerous protocols
    if (trimmed.match(/^(javascript|data|vbscript):/i)) {
        console.warn('Blocked dangerous URL protocol:', trimmed.substring(0, 20));
        return '';
    }
    
    // Only allow http, https, and relative URLs
    if (!trimmed.match(/^(https?:\/\/|\/)/i) && trimmed.length > 0) {
        console.warn('Invalid URL format:', trimmed.substring(0, 20));
        return '';
    }
    
    return trimmed;
}

/**
 * Validate and sanitize file path (for calendar URLs, etc.)
 * @param {string} path - File path or URL
 * @returns {string} - Sanitized path
 */
function sanitizePath(path) {
    if (typeof path !== 'string') return '';
    
    // Remove any path traversal attempts
    return path.replace(/\.\./g, '').trim();
}

/**
 * Sanitize number input
 * @param {any} input - Input value
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {number} defaultValue - Default value if invalid
 * @returns {number} - Sanitized number
 */
function sanitizeNumber(input, min = -Infinity, max = Infinity, defaultValue = 0) {
    const num = parseFloat(input);
    
    if (isNaN(num)) return defaultValue;
    if (num < min) return min;
    if (num > max) return max;
    
    return num;
}

/**
 * Sanitize string length
 * @param {string} input - Input string
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Truncated string
 */
function sanitizeLength(input, maxLength = 1000) {
    if (typeof input !== 'string') return '';
    return input.substring(0, maxLength);
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} - True if valid format
 */
function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate URL format
 * @param {string} url - URL string
 * @returns {boolean} - True if valid format
 */
function isValidURL(url) {
    if (typeof url !== 'string') return false;
    
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Sanitize object for localStorage (prevent prototype pollution)
 * @param {any} obj - Object to sanitize
 * @returns {any} - Sanitized object
 */
function sanitizeStorageObject(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    
    // Create a new object without prototype
    const sanitized = Object.create(null);
    
    for (const key in obj) {
        // Skip prototype properties
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        
        // Skip dangerous keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            console.warn('Blocked dangerous key in storage object:', key);
            continue;
        }
        
        // Recursively sanitize nested objects
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitized[key] = sanitizeStorageObject(obj[key]);
        } else {
            sanitized[key] = obj[key];
        }
    }
    
    return sanitized;
}

/**
 * Create safe innerHTML content
 * @param {string} html - HTML content
 * @returns {string} - Sanitized HTML safe for innerHTML
 */
function createSafeHTML(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sanitizeHTML,
        sanitizeText,
        sanitizeEmail,
        sanitizeURL,
        sanitizePath,
        sanitizeNumber,
        sanitizeLength,
        isValidEmail,
        isValidURL,
        sanitizeStorageObject,
        createSafeHTML
    };
}
