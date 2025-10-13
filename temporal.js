// Temporal API Client - Frontend module for Controlled Chaos
// Connects to Vercel API routes that communicate with the FastMCP temporal server

/**
 * Get the current time in a specified timezone
 * @param {string} timezone - Optional timezone (defaults to 'UTC')
 * @returns {Promise<Object>} Current time information
 */
export async function getCurrentTime(timezone = 'UTC') {
  try {
    const url = new URL('/api/temporal/current-time', window.location.origin);
    if (timezone) {
      url.searchParams.set('timezone', timezone);
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to get current time');
    }
    
    return data;
  } catch (error) {
    console.error('Error getting current time:', error);
    return {
      error: true,
      message: error.message || 'Failed to get current time'
    };
  }
}

/**
 * Calculate time elapsed since a given timestamp
 * @param {string} timestamp - Timestamp in format "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"
 * @param {string} timezone - Optional timezone (defaults to 'UTC')
 * @returns {Promise<Object>} Time elapsed information
 */
export async function getTimeSince(timestamp, timezone = 'UTC') {
  try {
    const response = await fetch('/api/temporal/time-since', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ timestamp, timezone }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to calculate time since');
    }
    
    return data;
  } catch (error) {
    console.error('Error calculating time since:', error);
    return {
      error: true,
      message: error.message || 'Failed to calculate time since'
    };
  }
}

/**
 * Calculate the difference between two timestamps
 * @param {string} timestamp1 - First timestamp
 * @param {string} timestamp2 - Second timestamp
 * @param {string} unit - Unit for the result (seconds, minutes, hours, days, weeks, months, years)
 * @param {string} timezone - Optional timezone (defaults to 'UTC')
 * @returns {Promise<Object>} Time difference information
 */
export async function getTimeDifference(timestamp1, timestamp2, unit = 'seconds', timezone = 'UTC') {
  try {
    const response = await fetch('/api/temporal/time-difference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ timestamp1, timestamp2, unit, timezone }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to calculate time difference');
    }
    
    return data;
  } catch (error) {
    console.error('Error calculating time difference:', error);
    return {
      error: true,
      message: error.message || 'Failed to calculate time difference'
    };
  }
}

/**
 * Parse and convert a timestamp between timezones
 * @param {string} timestamp - Timestamp to parse
 * @param {string} sourceTimezone - Source timezone (defaults to 'UTC')
 * @param {string} targetTimezone - Target timezone (defaults to 'UTC')
 * @returns {Promise<Object>} Parsed timestamp information
 */
export async function parseTimestamp(timestamp, sourceTimezone = 'UTC', targetTimezone = 'UTC') {
  try {
    const response = await fetch('/api/temporal/parse-timestamp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        timestamp, 
        source_timezone: sourceTimezone, 
        target_timezone: targetTimezone 
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to parse timestamp');
    }
    
    return data;
  } catch (error) {
    console.error('Error parsing timestamp:', error);
    return {
      error: true,
      message: error.message || 'Failed to parse timestamp'
    };
  }
}

/**
 * Add time to a timestamp
 * @param {string} timestamp - Base timestamp
 * @param {number} duration - Amount to add (can be negative to subtract)
 * @param {string} unit - Unit of duration (seconds, minutes, hours, days, weeks, months, years)
 * @param {string} timezone - Optional timezone (defaults to 'UTC')
 * @returns {Promise<Object>} New timestamp information
 */
export async function addTime(timestamp, duration, unit = 'seconds', timezone = 'UTC') {
  try {
    const response = await fetch('/api/temporal/add-time', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ timestamp, duration, unit, timezone }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add time');
    }
    
    return data;
  } catch (error) {
    console.error('Error adding time:', error);
    return {
      error: true,
      message: error.message || 'Failed to add time'
    };
  }
}

/**
 * Get contextual information about a timestamp
 * @param {string} timestamp - Timestamp to analyze
 * @param {string} timezone - Optional timezone (defaults to 'UTC')
 * @returns {Promise<Object>} Timestamp context information
 */
export async function getTimestampContext(timestamp, timezone = 'UTC') {
  try {
    const response = await fetch('/api/temporal/timestamp-context', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ timestamp, timezone }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to get timestamp context');
    }
    
    return data;
  } catch (error) {
    console.error('Error getting timestamp context:', error);
    return {
      error: true,
      message: error.message || 'Failed to get timestamp context'
    };
  }
}

/**
 * Format a duration in seconds to a human-readable string
 * @param {number} seconds - Duration in seconds
 * @param {string} style - Format style ('long', 'short', 'narrow')
 * @returns {Promise<Object>} Formatted duration
 */
export async function formatDuration(seconds, style = 'long') {
  try {
    const response = await fetch('/api/temporal/format-duration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seconds, style }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to format duration');
    }
    
    return data;
  } catch (error) {
    console.error('Error formatting duration:', error);
    return {
      error: true,
      message: error.message || 'Failed to format duration'
    };
  }
}

// Export all functions as a default object as well
export default {
  getCurrentTime,
  getTimeSince,
  getTimeDifference,
  parseTimestamp,
  addTime,
  getTimestampContext,
  formatDuration
};
