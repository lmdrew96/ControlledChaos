// Vercel Edge Function - Anthropic API Proxy
export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, X-API-Key, authorization',
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
  
  // Password protection
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.WORKER_PASSWORD}`;
  
  if (!authHeader || authHeader !== expectedAuth) {
    console.log('Unauthorized access attempt');
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      details: 'Invalid or missing worker password'
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
  
  try {
    // Get API key from environment or header
    const apiKey = process.env.ANTHROPIC_API_KEY || 
                   request.headers.get('x-api-key') || 
                   request.headers.get('X-API-Key');
    
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return new Response(JSON.stringify({ 
        error: 'Invalid API key format',
        details: 'Anthropic API keys should start with "sk-ant-"'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    // Get request body
    const body = await request.text();
    
    // Forward to Anthropic with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: body,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const data = await response.text();
    
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, data);
      return new Response(data, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    // Return success
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
    
  } catch (error) {
    console.error('Edge function error:', error);
    
    if (error.name === 'AbortError') {
      return new Response(JSON.stringify({ 
        error: 'Request timeout',
        details: 'The request took too long'
      }), {
        status: 504,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
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
