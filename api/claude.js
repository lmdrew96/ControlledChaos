// Vercel Edge Function - Anthropic API Proxy with Multi-User Auth
export const config = {
  runtime: 'edge',
};

// Content Security Policy
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://accounts.google.com https://apis.google.com https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' https://cdn.jsdelivr.net data:",
  "img-src 'self' data: https:",
  "connect-src 'self' https://api.anthropic.com https://www.googleapis.com https://accounts.google.com https://oauth2.googleapis.com",
  "frame-src https://accounts.google.com",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join('; ');

// Hardcoded owner - can never be locked out
const OWNER_EMAIL = 'lmdrew96@gmail.com';

// Simple in-memory rate limiting (resets on deployment)
const rateLimits = new Map();

function checkRateLimit(email) {
  const now = Date.now();
  const userLimits = rateLimits.get(email) || { count: 0, resetTime: now + 3600000 }; // 1 hour
  
  if (now > userLimits.resetTime) {
    userLimits.count = 0;
    userLimits.resetTime = now + 3600000;
  }
  
  if (userLimits.count >= 50) { // 50 requests per hour
    return false;
  }
  
  userLimits.count++;
  rateLimits.set(email, userLimits);
  return true;
}

export default async function handler(request) {
  // CORS headers - Restricted to your Vercel domain for security
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://controlled-chaos-zeta.vercel.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, authorization',
    'Content-Security-Policy': CSP_HEADER,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
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
    
    // Parse request body with size limit
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1048576) { // 1MB limit
      return new Response(JSON.stringify({ 
        error: 'Request too large',
        details: 'Request body exceeds 1MB limit'
      }), {
        status: 413,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    const requestBody = await request.json();
    const { userEmail, googleToken, allowlist, ...aiRequestData } = requestBody;
    
    // Input validation and sanitization
    if (!userEmail || typeof userEmail !== 'string' || !userEmail.includes('@')) {
      return new Response(JSON.stringify({ 
        error: 'Invalid email',
        details: 'Valid email address required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    if (!googleToken || typeof googleToken !== 'string') {
      return new Response(JSON.stringify({ 
        error: 'Invalid token',
        details: 'Valid authentication token required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    // Sanitize email (basic XSS prevention)
    const sanitizedEmail = userEmail.trim().toLowerCase().replace(/[<>]/g, '');
    
    // Verify Google OAuth token and extract email
    const verifiedEmail = await verifyGoogleToken(googleToken);
    if (!verifiedEmail || verifiedEmail.toLowerCase() !== sanitizedEmail) {
      console.log('Authentication failed:', { verifiedEmail, sanitizedEmail });
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
    
    // Check authorization with sanitized email
    const isOwner = verifiedEmail.toLowerCase() === OWNER_EMAIL.toLowerCase();
    const isAllowed = allowlist?.allowedUsers?.some(
      email => email.toLowerCase() === verifiedEmail.toLowerCase()
    );
    
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
    
    // Check rate limit
    if (!checkRateLimit(verifiedEmail)) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded',
        details: 'You can make 50 AI requests per hour. Try again later.'
      }), { 
        status: 429, 
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        }
      });
    }
    
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

// Verify Google OAuth token with enhanced security
async function verifyGoogleToken(token) {
  if (!token || typeof token !== 'string') {
    console.log('No token provided or invalid type');
    return null;
  }
  
  // Basic token format validation
  if (token.length < 20 || token.length > 2048) {
    console.log('Token length invalid');
    return null;
  }
  
  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log('Token verification failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    // Validate token data
    if (!data.email || !data.email_verified) {
      console.log('Email not verified or missing');
      return null;
    }
    
    // Check token expiration
    if (data.exp && parseInt(data.exp) < Math.floor(Date.now() / 1000)) {
      console.log('Token expired');
      return null;
    }
    
    console.log('Token verified for:', data.email);
    return data.email || null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Token verification timeout');
    } else {
      console.error('Token verification error:', error);
    }
    return null;
  }
}
