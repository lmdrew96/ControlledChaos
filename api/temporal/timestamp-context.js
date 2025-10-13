// Vercel Serverless Function - Get Timestamp Context
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

function getTimeOfDay(hour) {
  if (hour >= 0 && hour < 6) return 'late_night';
  if (hour >= 6 && hour < 9) return 'early_morning';
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'late_night';
}

function getTypicalActivity(hour) {
  if (hour >= 0 && hour < 6) return 'sleeping';
  if (hour >= 6 && hour < 9) return 'morning_routine';
  if (hour >= 9 && hour < 12) return 'work_time';
  if (hour >= 12 && hour < 13) return 'lunch_time';
  if (hour >= 13 && hour < 17) return 'work_time';
  if (hour >= 17 && hour < 19) return 'commute_time';
  if (hour >= 19 && hour < 21) return 'dinner_time';
  if (hour >= 21 && hour < 23) return 'evening_leisure';
  return 'sleeping';
}

function getRelativeDay(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffDays = Math.floor((targetDay - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  return null;
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
    const date = parseTimestamp(timestamp, tz);
    
    // Get day of week
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long'
    });
    const day_of_week = dayFormatter.format(date);
    
    // Get hour in 24-hour format
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      hour12: false
    });
    const hourStr = timeFormatter.format(date);
    const hour_24 = parseInt(hourStr, 10);
    
    // Determine if weekend
    const is_weekend = day_of_week === 'Saturday' || day_of_week === 'Sunday';
    
    // Determine if business hours (Mon-Fri 9-5)
    const is_business_hours = !is_weekend && hour_24 >= 9 && hour_24 < 17;
    
    const result = {
      time_of_day: getTimeOfDay(hour_24),
      day_of_week,
      is_weekend,
      is_business_hours,
      hour_24,
      typical_activity: getTypicalActivity(hour_24),
      relative_day: getRelativeDay(date)
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
      error: 'Failed to get timestamp context',
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
