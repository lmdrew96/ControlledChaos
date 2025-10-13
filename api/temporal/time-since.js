// Vercel Serverless Function - Calculate Time Since
export const config = {
  runtime: 'nodejs'
};

function parseTimestamp(timestamp, timezone) {
  // Parse "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD" format
  const parts = timestamp.trim().split(' ');
  const datePart = parts[0];
  const timePart = parts[1] || '00:00:00';
  
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  
  // Create date string in ISO format for the timezone
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  
  // Parse in the specified timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Create a date object and adjust for timezone
  const date = new Date(dateStr);
  return date;
}

function formatDuration(seconds) {
  const absSeconds = Math.abs(seconds);
  
  const days = Math.floor(absSeconds / 86400);
  const hours = Math.floor((absSeconds % 86400) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  
  if (parts.length === 0) {
    return 'less than a minute';
  }
  
  return parts.join(', ') + ' ago';
}

function getContext(seconds) {
  const absSeconds = Math.abs(seconds);
  const days = absSeconds / 86400;
  
  if (absSeconds < 3600) return 'within the hour';
  if (absSeconds < 86400) return 'earlier today';
  if (days < 2) return 'yesterday';
  if (days < 7) return 'this week';
  if (days < 30) return 'this month';
  if (days < 365) return 'this year';
  return 'over a year ago';
}

export default async function handler(request) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
  
  try {
    // Get request body
    const { timestamp, timezone } = request.body || {};
    
    if (!timestamp) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameter: timestamp' 
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    const tz = timezone || 'America/New_York';
    const pastDate = parseTimestamp(timestamp, tz);
    const now = new Date();
    
    const seconds = Math.floor((now - pastDate) / 1000);
    const formatted = formatDuration(seconds);
    const context = getContext(seconds);
    
    const result = {
      seconds,
      formatted,
      context
    };
    
    // Return the result
    return new Response(JSON.stringify({
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
    
  } catch (error) {
    console.error('Temporal API error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to calculate time since',
      details: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
