// Cloudflare Worker - Anthropic API Proxy (with better error handling)

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    try {
      // Get the API key from request header (case-insensitive)
      const apiKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key');
      
      if (!apiKey) {
        console.error('No API key provided in request');
        return new Response(JSON.stringify({ 
          error: 'API key required',
          details: 'Please add your Anthropic API key in Settings'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Validate API key format
      if (!apiKey.startsWith('sk-ant-')) {
        console.error('Invalid API key format');
        return new Response(JSON.stringify({ 
          error: 'Invalid API key format',
          details: 'API key should start with sk-ant-'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Get the request body
      const body = await request.text();
      
      if (!body) {
        return new Response(JSON.stringify({ error: 'Request body required' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      console.log('Forwarding request to Anthropic API...');

      // Forward to Anthropic API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: body,
      });

      // Get response from Anthropic
      const data = await response.text();
      
      console.log(`Anthropic API response status: ${response.status}`);
      
      // If Anthropic returned an error, pass it through
      if (!response.ok) {
        console.error('Anthropic API error:', data);
        return new Response(data, {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Return successful response with CORS headers
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        details: error.message,
        hint: 'Check your API key in Settings'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
