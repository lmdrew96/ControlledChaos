// api-queue.js - Smart request queue for Claude API

class APIQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.currentRequest = null;
    }

    async queueRequest(requestFn, description = 'API Request') {
        return new Promise((resolve, reject) => {
            const request = {
                id: Date.now() + Math.random(),
                requestFn,
                description,
                resolve,
                reject,
                retries: 0,
                maxRetries: 3
            };
            
            this.queue.push(request);
            console.log(`📋 [QUEUE] Added: ${description} (queue length: ${this.queue.length})`);
            
            // Show queue status to user
            if (this.queue.length > 1) {
                showToast(`⏳ ${description} added to queue (position ${this.queue.length})`, 'info');
            }
            
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        
        this.isProcessing = true;
        const request = this.queue[0];
        this.currentRequest = request;
        
        console.log(`🔄 [QUEUE] Processing: ${request.description} (${this.queue.length} remaining)`);
        
        try {
            const result = await request.requestFn();
            
            // Success! Remove from queue and resolve
            this.queue.shift();
            request.resolve(result);
            
            console.log(`✅ [QUEUE] Completed: ${request.description}`);
            
        } catch (error) {
            console.error(`❌ [QUEUE] Failed: ${request.description}`, error);
            
            // Retry logic
            if (request.retries < request.maxRetries && error.message.includes('503')) {
                request.retries++;
                const delay = Math.min(5000 * Math.pow(2, request.retries - 1), 20000);
                
                console.log(`🔄 [QUEUE] Retrying ${request.description} in ${delay/1000}s (attempt ${request.retries}/${request.maxRetries})`);
                showToast(`⏳ Retrying ${request.description}... (${request.retries}/${request.maxRetries})`, 'info');
                
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // Don't remove from queue, will retry
                this.isProcessing = false;
                this.processQueue();
                return;
            }
            
            // Out of retries, reject and remove
            this.queue.shift();
            request.reject(error);
        }
        
        this.currentRequest = null;
        this.isProcessing = false;
        
        // Wait between requests to avoid rate limits
        if (this.queue.length > 0) {
            console.log(`⏳ [QUEUE] Waiting 1.5s before next request...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // Process next
        this.processQueue();
    }

    getQueueStatus() {
        return {
            length: this.queue.length,
            current: this.currentRequest?.description || null,
            isProcessing: this.isProcessing
        };
    }

    clearQueue() {
        console.warn('⚠️ [QUEUE] Clearing queue');
        this.queue.forEach(req => req.reject(new Error('Queue cleared')));
        this.queue = [];
    }
}

// Create singleton instance
const apiQueue = new APIQueue();

// Export for use in other files
if (typeof window !== 'undefined') {
    window.apiQueue = apiQueue;
}
