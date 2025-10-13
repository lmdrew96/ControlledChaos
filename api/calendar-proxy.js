// Vercel Edge Function - Calendar Proxy for CORS
export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  
  // Only allow GET
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
  
  // Get the calendar URL from query parameter
  const url = new URL(request.url);
  const calendarUrl = url.searchParams.get('url');
  
  if (!calendarUrl) {
    return new Response('Missing calendar URL parameter', {
      status: 400,
      headers: corsHeaders,
    });
  }
  
  try {
    console.log('Fetching calendar from:', calendarUrl);
    
    // Fetch the calendar
    const response = await fetch(calendarUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch calendar: ${response.statusText}`);
    }
    
    const icsData = await response.text();
    
    console.log('Successfully fetched calendar, size:', icsData.length, 'bytes');
    
    // Return the calendar data with CORS headers
    return new Response(icsData, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
      },
    });
    
  } catch (error) {
    console.error('Calendar proxy error:', error);
    
    return new Response(`Failed to fetch calendar: ${error.message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
}
