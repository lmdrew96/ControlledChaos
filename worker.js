// Cloudflare Worker - Anthropic API Proxy & Calendar Proxy
// This proxies requests from your app to the Anthropic API and calendar feeds with CORS headers

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Define CORS headers for reuse
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, X-API-Key, authorization',
    };
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...corsHeaders,
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    
    // ===== CALENDAR PROXY ROUTE =====
    if (url.pathname === '/api/calendar-proxy') {
      const canvasUrl = url.searchParams.get('url');
      
      if (!canvasUrl) {
        return new Response('Missing calendar URL', { 
          status: 400,
          headers: corsHeaders 
        });
      }

      try {
        const response = await fetch(canvasUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch calendar: ${response.statusText}`);
        }
        
        const icsData = await response.text();
        
        return new Response(icsData, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/calendar; charset=utf-8',
          }
        });
      } catch (error) {
        return new Response(`Failed to fetch calendar: ${error.message}`, {
          status: 500,
          headers: corsHeaders
        });
      }
    }
    
    // ===== CLAUDE API ROUTE =====

    // Only allow POST requests for Claude API
    if (request.method !== 'POST') {
      console.log('Method not allowed:', request.method);
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        }
      });
    }

    // Password protection
    const authHeader = request.headers.get("authorization");
    const expectedAuth = `Bearer ${env.WORKER_PASSWORD}`;

    if (!authHeader || authHeader !== expectedAuth) {
      console.log("Unauthorized access attempt");
      return new Response(JSON.stringify({
        error: "Unauthorized",
        details: "Invalid or missing worker password"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    try {
      // Get API key from Cloudflare secret first, then fall back to header
      const apiKey = env.ANTHROPIC_API_KEY || 
                     request.headers.get('x-api-key') || 
                     request.headers.get('X-API-Key');
      
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
            ...corsHeaders,
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
            ...corsHeaders,
          },
        });
      }

      // Get the request body
      const body = await request.text();
      console.log('Request body length:', body.length);

      // Forward to Anthropic API with timeout handling
      console.log('Forwarding request to Anthropic API...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 second timeout (Cloudflare limit is 60s)

      let response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
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
        
      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          console.error('Request timed out after 55 seconds');
          return new Response(JSON.stringify({ 
            error: 'Request timeout',
            details: 'The request to Anthropic took too long'
          }), {
            status: 504,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          });
        }
        
        throw error;
      }

      console.log('Anthropic API response status:', response.status);

      // Get response from Anthropic
      const data = await response.text();
      
      // Log error responses for debugging
      if (!response.ok) {
        console.error('Anthropic API error:', response.status, data);
        // Return error responses as-is
        return new Response(data, {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }

      // Parse the successful response
      const parsedData = JSON.parse(data);
      
      // Quick markdown stripping without heavy regex
      if (parsedData.content?.[0]?.text) {
        let text = parsedData.content[0].text;
        
        // Simple trim of markdown fences
        if (text.startsWith('```')) {
          const firstNewline = text.indexOf('\n');
          text = text.substring(firstNewline + 1);
        }
        if (text.endsWith('```')) {
          const lastBackticks = text.lastIndexOf('```');
          text = text.substring(0, lastBackticks);
        }
        
        parsedData.content[0].text = text.trim();
      }
      
      // Return the cleaned response with CORS headers
      return new Response(JSON.stringify(parsedData), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
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
          ...corsHeaders,
        },
      });
    }
  },
};
// Updated Thu Oct  9 11:30:33 EDT 2025
