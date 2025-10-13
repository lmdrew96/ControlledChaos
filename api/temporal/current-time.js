// Vercel Edge Function - Get Current Time via MCP
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

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
  
  try {
    // Get timezone from query parameter (optional)
    const url = new URL(request.url);
    const timezone = url.searchParams.get('timezone') || 'UTC';
    
    // Create MCP client
    const transport = new SSEClientTransport(
      new URL('https://passage-of-time-mcp-9u8l.onrender.com/sse')
    );
    const client = new Client({
      name: 'controlled-chaos-temporal-client',
      version: '1.0.0',
    }, {
      capabilities: {}
    });
    
    // Connect to MCP server
    await client.connect(transport);
    
    // Call the get_current_time tool
    const result = await client.callTool({
      name: 'get_current_time',
      arguments: { timezone }
    });
    
    // Close the connection
    await client.close();
    
    // Return the result
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
    
  } catch (error) {
    console.error('Temporal API error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to get current time',
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
