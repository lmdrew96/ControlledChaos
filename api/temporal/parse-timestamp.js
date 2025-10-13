// Vercel Serverless Function - Parse Timestamp
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
    const body = await request.json();
    const { timestamp, source_timezone, target_timezone } = body;
    
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
    
    const tz = target_timezone || source_timezone || 'America/New_York';
    const date = parseTimestamp(timestamp, tz);
    
    // ISO format
    const iso = date.toISOString();
    
    // Unix timestamp
    const unix = Math.floor(date.getTime() / 1000);
    
    // Human-friendly format
    const humanFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const human = humanFormatter.format(date);
    
    // Day of week
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long'
    });
    const day_of_week = dayFormatter.format(date);
    
    // Date only (YYYY-MM-DD)
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const dateParts = dateFormatter.formatToParts(date);
    const year = dateParts.find(p => p.type === 'year').value;
    const month = dateParts.find(p => p.type === 'month').value;
    const day = dateParts.find(p => p.type === 'day').value;
    const dateOnly = `${year}-${month}-${day}`;
    
    // Time only (HH:MM:SS)
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const timeParts = timeFormatter.formatToParts(date);
    const hour = timeParts.find(p => p.type === 'hour').value;
    const minute = timeParts.find(p => p.type === 'minute').value;
    const second = timeParts.find(p => p.type === 'second').value;
    const timeOnly = `${hour}:${minute}:${second}`;
    
    const result = {
      iso,
      unix,
      human,
      timezone: tz,
      day_of_week,
      date: dateOnly,
      time: timeOnly
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
      error: 'Failed to parse timestamp',
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
