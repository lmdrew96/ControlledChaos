// api/auto-import-trigger.js - Backend endpoint to trigger auto-imports

export const config = {
    runtime: 'edge'
};

export default async function handler(request) {
    // Only allow POST requests
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    try {
        console.log('🤖 [AUTO-IMPORT] Trigger endpoint called');
        
        // This is a simple trigger endpoint
        // The actual import happens client-side when users load the app
        // This endpoint just confirms the cron job ran
        
        const timestamp = new Date().toISOString();
        
        return new Response(JSON.stringify({ 
            success: true,
            message: 'Auto-import trigger received',
            timestamp: timestamp
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        console.error('❌ [AUTO-IMPORT] Trigger error:', error);
        return new Response(JSON.stringify({ 
            error: 'Auto-import trigger failed',
            details: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
