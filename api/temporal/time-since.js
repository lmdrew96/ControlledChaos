// Vercel Edge Function - Calculate Time Since via MCP
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export const config = {
  runtime: 'edge',
};

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
    const { timestamp, timezone } = body;
    
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
    
    // Call the calculate_time_since tool
    const result = await client.callTool({
      name: 'calculate_time_since',
      arguments: { 
        timestamp,
        timezone: timezone || 'UTC'
      }
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
      error: 'Failed to calculate time since',
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
