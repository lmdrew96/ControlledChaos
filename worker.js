// Cloudflare Worker - Anthropic API Proxy
// This proxies requests from your app to the Anthropic API with CORS headers

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-api-key, X-API-Key',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      console.log('Method not allowed:', request.method);
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    try {
      // Get the API key from the request header (case-insensitive)
      const apiKey = request.headers.get('x-api-key') || request.headers.get('X-API-Key');
      
      console.log('API Key present:', !!apiKey);
      console.log('API Key starts with sk-ant-:', apiKey?.startsWith('sk-ant-'));
      
      if (!apiKey) {
        console.error('No API key provided in request headers');
        return new Response(JSON.stringify({ 
          error: 'API key required',
          details: 'Please provide your Anthropic API key in the x-api-key header'
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
        console.error('Invalid API key format. Key should start with sk-ant-');
        return new Response(JSON.stringify({ 
          error: 'Invalid API key format',
          details: 'Anthropic API keys should start with "sk-ant-"'
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
      console.log('Request body length:', body.length);

      // Forward to Anthropic API
      console.log('Forwarding request to Anthropic API...');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: body,
      });

      console.log('Anthropic API response status:', response.status);

      // Get response from Anthropic
      const data = await response.text();
      
      // Log error responses for debugging
      if (!response.ok) {
        console.error('Anthropic API error:', response.status, data);
      }
      
      // Return with CORS headers
      return new Response(data, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (error) {
      console.error('Worker error:', error.message, error.stack);
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        details: error.message,
        type: error.name
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
// Updated Thu Oct  9 11:30:33 EDT 2025
 # Add empty line to trigger workflow
