// Vercel Serverless Function - Format Duration
export const config = {
  runtime: 'nodejs'
};

function formatDuration(seconds, style = 'full') {
  const absSeconds = Math.abs(seconds);
  const isNegative = seconds < 0;
  
  const days = Math.floor(absSeconds / 86400);
  const hours = Math.floor((absSeconds % 86400) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const secs = Math.floor(absSeconds % 60);
  
  let result = '';
  
  if (style === 'full') {
    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);
    result = parts.join(', ');
  } else if (style === 'compact') {
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    result = parts.join(' ');
  } else if (style === 'minimal') {
    const h = String(days * 24 + hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    const s = String(secs).padStart(2, '0');
    result = `${h}:${m}:${s}`;
  }
  
  return isNegative ? `-${result}` : result;
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
    const { seconds, style } = body;
    
    if (seconds === undefined) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameter: seconds' 
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    const formatted = formatDuration(seconds, style || 'full');
    
    // Return the result
    return new Response(JSON.stringify({
      content: [{
        type: 'text',
        text: formatted
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
      error: 'Failed to format duration',
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
