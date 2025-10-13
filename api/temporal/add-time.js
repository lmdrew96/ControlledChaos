// Vercel Serverless Function - Add Time
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
  
  // Create date string in ISO format
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  
  const date = new Date(dateStr);
  return date;
}

function formatTimestamp(date, timezone) {
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
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;
  const second = parts.find(p => p.type === 'second').value;
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function getDescription(date, timezone) {
  const now = new Date();
  const diffMs = date - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  const timeStr = timeFormatter.format(date);
  
  if (diffDays === 0) return `today at ${timeStr}`;
  if (diffDays === 1) return `tomorrow at ${timeStr}`;
  if (diffDays === -1) return `yesterday at ${timeStr}`;
  if (diffDays > 1 && diffDays < 7) return `in ${diffDays} days at ${timeStr}`;
  if (diffDays < -1 && diffDays > -7) return `${Math.abs(diffDays)} days ago at ${timeStr}`;
  
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  return `${dateFormatter.format(date)} at ${timeStr}`;
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
    const { timestamp, duration, unit, timezone } = request.body || {};
    
    if (!timestamp || duration === undefined) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: timestamp and duration' 
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    const tz = timezone || 'America/New_York';
    const date = parseTimestamp(timestamp, tz);
    
    // Convert duration to milliseconds based on unit
    let durationMs = 0;
    const unitType = unit || 'seconds';
    
    switch (unitType) {
      case 'seconds':
        durationMs = duration * 1000;
        break;
      case 'minutes':
        durationMs = duration * 60 * 1000;
        break;
      case 'hours':
        durationMs = duration * 60 * 60 * 1000;
        break;
      case 'days':
        durationMs = duration * 24 * 60 * 60 * 1000;
        break;
      case 'weeks':
        durationMs = duration * 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        durationMs = duration * 1000;
    }
    
    // Add duration to date
    const newDate = new Date(date.getTime() + durationMs);
    
    const result = {
      result: formatTimestamp(newDate, tz),
      iso: newDate.toISOString(),
      description: getDescription(newDate, tz)
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
      error: 'Failed to add time',
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
