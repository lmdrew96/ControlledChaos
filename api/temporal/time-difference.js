// Vercel Serverless Function - Calculate Time Difference
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

function formatDuration(seconds) {
  const absSeconds = Math.abs(seconds);
  
  const days = Math.floor(absSeconds / 86400);
  const hours = Math.floor((absSeconds % 86400) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const secs = Math.floor(absSeconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);
  
  return parts.join(', ');
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
    const { timestamp1, timestamp2, unit, timezone } = request.body || {};
    
    if (!timestamp1 || !timestamp2) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: timestamp1 and timestamp2' 
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    const tz = timezone || 'America/New_York';
    const date1 = parseTimestamp(timestamp1, tz);
    const date2 = parseTimestamp(timestamp2, tz);
    
    const seconds = Math.floor((date2 - date1) / 1000);
    const formatted = formatDuration(seconds);
    const is_negative = seconds < 0;
    
    let requested_unit = null;
    if (unit && unit !== 'auto') {
      const absSeconds = Math.abs(seconds);
      switch (unit) {
        case 'seconds':
          requested_unit = absSeconds;
          break;
        case 'minutes':
          requested_unit = absSeconds / 60;
          break;
        case 'hours':
          requested_unit = absSeconds / 3600;
          break;
        case 'days':
          requested_unit = absSeconds / 86400;
          break;
      }
    }
    
    const result = {
      seconds,
      formatted,
      requested_unit,
      is_negative
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
      error: 'Failed to calculate time difference',
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
