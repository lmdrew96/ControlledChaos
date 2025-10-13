// Vercel Edge Function - Anthropic API Proxy with Multi-User Auth
export const config = {
  runtime: 'edge',
};

// Hardcoded owner - can never be locked out
const OWNER_EMAIL = 'lmdrew96@gmail.com';

export default async function handler(request) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, authorization',
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
    // Get server-side API key from environment
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (!ANTHROPIC_API_KEY || !ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
      console.error('Server API key not configured or invalid');
      return new Response(JSON.stringify({ 
        error: 'Server configuration error',
        details: 'API key not properly configured on server'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    // Parse request body
    const requestBody = await request.json();
    const { userEmail, googleToken, allowlist, ...aiRequestData } = requestBody;
    
    // Verify Google OAuth token and extract email
    const verifiedEmail = await verifyGoogleToken(googleToken);
    if (!verifiedEmail || verifiedEmail !== userEmail) {
      console.log('Authentication failed:', { verifiedEmail, userEmail });
      return new Response(JSON.stringify({ 
        error: 'Authentication failed',
        details: 'Please sign in with Google Drive'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    // Check authorization
    const isOwner = verifiedEmail === OWNER_EMAIL;
    const isAllowed = allowlist?.allowedUsers?.includes(verifiedEmail);
    
    if (!isOwner && !isAllowed) {
      console.log('User not authorized:', verifiedEmail);
      return new Response(JSON.stringify({ 
        error: 'Access denied',
        details: 'This app is invite-only. Contact the owner for access.'
      }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    console.log('User authorized:', verifiedEmail, isOwner ? '(owner)' : '(allowed)');
    
    // User is authorized - forward request to Anthropic with server key
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(aiRequestData),
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
    
    // Parse and clean the response
    const parsedData = JSON.parse(data);
    
    // Strip markdown code fences if present
    if (parsedData.content?.[0]?.text) {
      let text = parsedData.content[0].text;
      
      // Remove markdown code fences using simple string operations
      if (text.startsWith('```')) {
        const firstNewline = text.indexOf('\n');
        if (firstNewline > -1) {
          text = text.substring(firstNewline + 1);
        }
      }
      if (text.endsWith('```')) {
        const lastBackticks = text.lastIndexOf('```');
        text = text.substring(0, lastBackticks);
      }
      
      parsedData.content[0].text = text.trim();
    }
    
    // Return the cleaned response
    return new Response(JSON.stringify(parsedData), {
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

// Verify Google OAuth token
async function verifyGoogleToken(token) {
  if (!token) {
    console.log('No token provided');
    return null;
  }
  
  try {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`
    );
    
    if (!response.ok) {
      console.log('Token verification failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('Token verified for:', data.email);
    return data.email || null;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}
