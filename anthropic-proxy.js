// Cloudflare Worker - Anthropic API Proxy
// This worker acts as a secure proxy to the Anthropic API
// It adds CORS headers and forwards requests

export default {
  async fetch(request, env) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow POST requests to /api/claude
    if (request.method !== 'POST' || !request.url.endsWith('/api/claude')) {
      return new Response('Not Found', { status: 404 });
    }

    try {
      // Get the API key from the request header
      const apiKey = request.headers.get('x-api-key');
      
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key required' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Get the request body
      const body = await request.json();

      // Forward the request to Anthropic API
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      // Get the response from Anthropic
      const responseData = await anthropicResponse.json();

      // Return the response with CORS headers
      return new Response(JSON.stringify(responseData), {
        status: anthropicResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
