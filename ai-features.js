// ai-features.js - AI and Claude API features

// ===== CLAUDE API =====
async function callClaudeAPI(messages, systemPrompt = '') {
    console.log('🤖 [CLAUDE API] Starting API call...');
    
    // Check if user is signed in to Google Drive
    if (!isDriveAvailable() || !userEmail) {
        console.error('❌ [CLAUDE API] Not signed in to Google Drive');
        alert('Please sign in to Google Drive to use AI features!');
        throw new Error('Not signed in to Google Drive');
    }
    
    console.log('🤖 [CLAUDE API] User email:', userEmail);
    
    // Get Google access token
    const googleToken = gapi.auth.getToken()?.access_token;
    if (!googleToken) {
        console.error('❌ [CLAUDE API] No Google access token');
        alert('Please sign in to Google Drive to use AI features!');
        throw new Error('No Google access token');
    }
    
    console.log('🤖 [CLAUDE API] Google token exists:', !!googleToken);
    
    // Load allowlist
    const allowlist = await getAllowlist();
    console.log('🤖 [CLAUDE API] Allowlist loaded:', allowlist);
    
    // Use Vercel edge function endpoint
    const apiUrl = '/api/claude';
    console.log('🤖 [CLAUDE API] API URL:', apiUrl);

    // Create the actual API call function to be queued
    const makeAPICall = async () => {
        const maxRetries = 3;
        const delays = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`🤖 [CLAUDE API] Attempt ${attempt + 1}/${maxRetries}`);
                
                // Show retry message if not first attempt
                if (attempt > 0) {
                    showToast(`Hmm, Claude is thinking slowly... retrying (${attempt}/${maxRetries})...`);
                }
                
                const requestBody = {
                    userEmail: userEmail,
                    googleToken: googleToken,
                    allowlist: allowlist,
                    model: 'claude-sonnet-4-5-20250929',
                    max_tokens: 2000,
                    system: systemPrompt,
                    messages: messages
                };
                
                console.log('🤖 [CLAUDE API] Request body:', {
                    userEmail: requestBody.userEmail,
                    hasGoogleToken: !!requestBody.googleToken,
                    hasAllowlist: !!requestBody.allowlist,
                    model: requestBody.model,
                    max_tokens: requestBody.max_tokens,
                    systemPromptLength: systemPrompt.length,
                    messagesCount: messages.length
                });
                
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                console.log('🤖 [CLAUDE API] Response status:', response.status);
                console.log('🤖 [CLAUDE API] Response headers:', Object.fromEntries(response.headers.entries()));

                // Check for 503 Service Unavailable
                if (response.status === 503) {
                    console.warn('⚠️ [CLAUDE API] Service unavailable (503)');
                    const errorBody = await response.clone().text();
                    console.log('🔴 [CLAUDE API] 503 Error body:', errorBody);
                    // If this is the last attempt, throw error
                    if (attempt === maxRetries - 1) {
                        throw new Error('Service temporarily unavailable after multiple retries');
                    }
                    
                    // Wait before retrying with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, delays[attempt]));
                    continue; // Retry
                }

                // For other errors, get the response text for better error messages
                const responseText = await response.text();
                console.log('🤖 [CLAUDE API] Response headers:', {
                    'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
                    'x-ratelimit-limit': response.headers.get('x-ratelimit-limit'),
                    'x-ratelimit-reset': response.headers.get('x-ratelimit-reset'),
                    'retry-after': response.headers.get('retry-after')
                });
                console.log('🤖 [CLAUDE API] Response body:', responseText);
                
                if (!response.ok) {
                    console.error('❌ [CLAUDE API] Request failed:', response.status, responseText);
                    throw new Error(`API call failed (${response.status}): ${responseText}`);
                }

                // Success! Parse and return
                const data = JSON.parse(responseText);
                console.log('✅ [CLAUDE API] Success! Response:', data);
                
                // Show success message if we had to retry
                if (attempt > 0) {
                    showToast('✅ Got it! Claude responded successfully.');
                }
                
                return data.content[0].text;
                
            } catch (error) {
                console.error(`❌ [CLAUDE API] Attempt ${attempt + 1} failed:`, error);
                
                // If this is the last attempt, throw the error
                if (attempt === maxRetries - 1) {
                    console.error('❌ [CLAUDE API] All retries exhausted');
                    throw error;
                }
                
                // For network errors or 503s, wait and retry
                if (error.message.includes('503') || error.message.includes('fetch')) {
                    await new Promise(resolve => setTimeout(resolve, delays[attempt]));
                    continue;
                }
                
                // For other errors, throw immediately
                throw error;
            }
        }
    };

    // Queue the request instead of calling directly
    const description = messages[0]?.content?.substring(0, 50) + '...' || 'API Request';
    return await apiQueue.queueRequest(makeAPICall, description);
}

async function testAPIConnection() {
    const btn = document.getElementById('testApiBtn');
    const resultDiv = document.getElementById('apiTestResult');
    
    // Show loading
    btn.disabled = true;
    btn.textContent = '⏳ Testing...';
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#f0f9ff';
    resultDiv.style.border = '1px solid #3b82f6';
    resultDiv.style.color = '#1e40af';
    resultDiv.innerHTML = 'Testing API connection...';
    
    try {
        // Step 1: Check if settings exist
        console.log('🔧 [API TEST] Step 1: Checking settings...');
        console.log('🔧 [API TEST] Worker URL:', appData.settings?.workerUrl || 'NOT SET');
        console.log('🔧 [API TEST] Worker Password exists:', !!appData.settings?.workerPassword);
        console.log('🔧 [API TEST] API Key exists:', !!appData.settings?.apiKey);
        console.log('🔧 [API TEST] API Key starts with sk-ant-:', appData.settings?.apiKey?.startsWith('sk-ant-'));
        
        if (!appData.settings?.workerUrl) {
            throw new Error('Worker URL not configured');
        }
        
        if (!appData.settings?.workerPassword) {
            throw new Error('Worker Password not configured');
        }
        
        if (!appData.settings?.apiKey) {
            throw new Error('API Key not configured');
        }
        
        if (!appData.settings.apiKey.startsWith('sk-ant-')) {
            throw new Error('API Key format invalid (should start with sk-ant-)');
        }
        
        resultDiv.innerHTML = '✅ Settings validated<br>🔄 Making test API call...';
        
        // Step 2: Make a simple test call
        console.log('🔧 [API TEST] Step 2: Making test API call...');
        
        const response = await callClaudeAPI([{
            role: 'user',
            content: 'Reply with just the word "SUCCESS" and nothing else.'
        }], 'You are a test bot. Reply with exactly the word SUCCESS.');
        
        console.log('🔧 [API TEST] Response:', response);
        
        // Step 3: Check response
        if (response && response.toLowerCase().includes('success')) {
            resultDiv.style.background = '#f0fdf4';
            resultDiv.style.border = '1px solid #22c55e';
            resultDiv.style.color = '#15803d';
            resultDiv.innerHTML = `
                ✅ <strong>API Connection Successful!</strong><br>
                <small>Worker URL: ${appData.settings.workerUrl}</small><br>
                <small>API Response: "${response}"</small>
            `;
            
            showToast('✅ API connection working!');
        } else {
            throw new Error(`Unexpected response: ${response}`);
        }
        
    } catch (error) {
        console.error('❌ [API TEST] Failed:', error);
        
        resultDiv.style.background = '#fef2f2';
        resultDiv.style.border = '1px solid #ef4444';
        resultDiv.style.color = '#991b1b';
        resultDiv.innerHTML = `
            ❌ <strong>API Test Failed</strong><br>
            <small>${error.message}</small><br>
            <small>Check console for details (F12)</small>
        `;
        
        // Show detailed error info in console
        console.log('🔧 [API TEST] Detailed Error Info:');
        console.log('- Worker URL:', appData.settings?.workerUrl);
        console.log('- Worker Password length:', appData.settings?.workerPassword?.length || 0);
        console.log('- API Key prefix:', appData.settings?.apiKey?.substring(0, 10) || 'NOT SET');
        console.log('- CLOUDFLARE_WORKER_URL global:', CLOUDFLARE_WORKER_URL);
        console.log('- Error stack:', error.stack);
    } finally {
        btn.disabled = false;
        btn.textContent = '🔧 Test API Connection';
    }
}

// ===== BRAIN DUMP =====
async function processBrainDump() {
    const text = document.getElementById('brainDumpText').value.trim();
    if (!text) return;

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '🧠 Processing...';

    try {
        // Build template context
        let templateContext = `The user has these task templates:

1. **Errands & Stops**: For shopping/errands (use simple names like "grocery", "pharmacy", not full sentences)
2. **Bio Weekly Work**: For weekly biology coursework
3. **Beatles Weekly Work**: For weekly Beatles discussion tasks`;

        // Add custom templates if they exist
        if (appData.templates && appData.templates.length > 0) {
            const customTemplates = appData.templates.filter(t => t.custom);
            if (customTemplates.length > 0) {
                templateContext += '\n' + customTemplates.map((t, i) => 
                    `${i + 4}. **${t.name}**: Custom template`
                ).join('\n');
        }
        }

        const systemPrompt = `You are an ADHD-friendly task organizer. Parse the user's brain dump into clear, actionable tasks.

${templateContext}

**IMPORTANT RULES:**

1. **For errands/shopping tasks** (grocery, store, pharmacy, post office, gas, etc.):
   - Use location: "errands"
   - Use simple, short names (e.g., "grocery", "pharmacy", "gas")
   - NOT full sentences like "Go to grocery store" or "Pick up prescription"
   - These are stops to make while out

2. **For course-related tasks**, detect the course and include a courseId:
   - Biology/Bio tasks: courseId: "bio"
   - Beatles/Music tasks: courseId: "beatles"
   - History/World History tasks: courseId: "history"
   - Politics/US Politics tasks: courseId: "politics"
   - If no course detected: courseId: null

3. **For all tasks**:
   - Create as individual tasks
   - Determine energy level (high/medium/low)
   - Determine location (home/school/work/anywhere)
   - Estimate time in minutes
   - Include courseId if course-related

**Examples:**

Input: "buy groceries, pick up prescription, Beatles discussion post, study for bio exam"
Output: 
- Task 1: title: "grocery", location: "errands", energy: "medium", timeEstimate: 20, courseId: null
- Task 2: title: "pharmacy", location: "errands", energy: "low", timeEstimate: 10, courseId: null
- Task 3: title: "Beatles discussion post", location: "anywhere", energy: "medium", timeEstimate: 20, courseId: "beatles"
- Task 4: title: "Study for bio exam", location: "school", energy: "high", timeEstimate: 60, courseId: "bio"

Input: "write essay for history, fill up gas tank"
Output:
- Task 1: title: "Write essay for history", location: "home", energy: "high", timeEstimate: 90, courseId: "history"
- Task 2: title: "gas", location: "errands", energy: "low", timeEstimate: 10, courseId: null

Return ONLY valid JSON array of tasks, no other text:
[{"title": "...", "energy": "...", "location": "...", "timeEstimate": 30, "courseId": null}]`;

        const response = await callClaudeAPI([{
            role: 'user',
            content: text
        }], systemPrompt);

        const tasks = JSON.parse(response);
        
        let errandCount = 0;
        let courseTaskCount = 0;
        let regularCount = 0;
        
        tasks.forEach(task => {
            // Track what type of task this is
            if (task.location === 'errands') {
                errandCount++;
            } else if (task.courseId) {
                courseTaskCount++;
            } else {
                regularCount++;
            }
            
            addTask(task);
        });

        closeModal('brainDumpModal');
        document.getElementById('brainDumpText').value = '';
        
        // Show summary of what was created
        let summary = `Created ${tasks.length} task${tasks.length !== 1 ? 's' : ''}:\n`;
        if (errandCount > 0) summary += `\n🏪 ${errandCount} errand${errandCount !== 1 ? 's' : ''}`;
        if (courseTaskCount > 0) summary += `\n🎓 ${courseTaskCount} course task${courseTaskCount !== 1 ? 's' : ''}`;
        if (regularCount > 0) summary += `\n📝 ${regularCount} other task${regularCount !== 1 ? 's' : ''}`;
        
        showToast(summary);
        
        confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.6 }
        });
    } catch (error) {
        console.error('Brain dump error:', error);
        alert('Failed to process brain dump. Check your API configuration.');
    } finally {
        btn.disabled = false;
        btn.textContent = '✨ Organize My Chaos';
    }
}

// ===== STUCK HELPER =====
async function showStuck() {
    const incompleteTasks = appData.tasks.filter(t => !t.completed);
    
    if (incompleteTasks.length === 0) {
        alert('No tasks to help with! Add some tasks first.');
        return;
    }

    const modal = document.getElementById('stuckModal');
    const content = document.getElementById('stuckContent');
    
    content.innerHTML = `
        <p>Select a task you're stuck on:</p>
        <div style="margin: 20px 0;">
            ${incompleteTasks.map(task => `
                <button class="btn btn-secondary" onclick="getStuckHelp('${task.id}')" 
                        style="width: 100%; margin: 5px 0; text-align: left;">
                    ${task.title}
                </button>
            `).join('')}
        </div>
    `;
    
    modal.classList.add('active');
}

async function getStuckHelp(taskId) {
    const task = appData.tasks.find(t => t.id === taskId);
    if (!task) return;

    const content = document.getElementById('stuckContent');
    content.innerHTML = `
        <h3>${task.title}</h3>
        <p>🤔 Breaking this down into tiny steps...</p>
    `;

    try {
        // Find next available time block
        const nextBlock = findNextAvailableBlock(task);
        
        const scheduleContext = nextBlock.available 
            ? `Next available time: ${nextBlock.day} ${nextBlock.time} at ${nextBlock.location} (${nextBlock.duration} minutes available)`
            : 'No clear free time found soon - user may need to make time';
        
        const systemPrompt = `You are an ADHD coach helping break down tasks. The user is stuck on a task.

Task: ${task.title}
Time estimate: ${task.timeEstimate ? task.timeEstimate + ' minutes' : 'not specified'}
Location needed: ${task.location}

${scheduleContext}

Break this down into 2-4 TINY, actionable subtasks. Each step should be:
- Completable in under 15 minutes
- Require zero decision-making
- Be physically actionable
- Build momentum toward completing the parent task

Return ONLY valid JSON array, no other text:
[{"title": "specific action step", "timeEstimate": 10, "energy": "low"}]

Example for "Write essay":
[
  {"title": "Open document and write thesis sentence", "timeEstimate": 5, "energy": "low"},
  {"title": "Write 3 bullet points for intro", "timeEstimate": 10, "energy": "medium"},
  {"title": "Expand bullets into full paragraphs", "timeEstimate": 15, "energy": "medium"}
]`;

        const response = await callClaudeAPI([{
            role: 'user',
            content: `I'm stuck on: ${task.title}`
        }], systemPrompt);

        // Parse the JSON response
        const subtasks = JSON.parse(response);
        
        let scheduleInfo = '';
        if (nextBlock.available) {
            scheduleInfo = `
                <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                    <strong>📅 Your next good time for this:</strong><br>
                    ${nextBlock.day} ${nextBlock.time} at ${nextBlock.location}<br>
                    <small>(${nextBlock.duration} minutes available)</small>
                </div>
            `;
        }

        // Display the breakdown with option to create tasks
        content.innerHTML = `
            <h3>${task.title}</h3>
            ${scheduleInfo}
            <div style="background: var(--bg-main); padding: 20px; border-radius: 10px; margin: 20px 0;">
                <h4 style="margin-bottom: 15px;">🎯 Here's your breakdown:</h4>
                ${subtasks.map((subtask, i) => `
                    <div style="padding: 12px; background: white; border-radius: 8px; margin: 10px 0; border-left: 4px solid var(--primary);">
                        <div style="font-weight: 600; margin-bottom: 5px;">
                            ${i + 1}. ${subtask.title}
                        </div>
                        <div style="font-size: 0.85em; color: var(--text-light);">
                            ⏱️ ${subtask.timeEstimate} min | ⚡ ${subtask.energy} energy
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-success" onclick="createSubtasksFromBreakdown('${task.id}', ${JSON.stringify(subtasks).replace(/"/g, '&quot;')})">
                    ✨ Create These Subtasks
                </button>
                <button class="btn btn-secondary" onclick="closeModal('stuckModal')">
                    Not now
                </button>
            </div>
        `;
    } catch (error) {
        console.error('Stuck help error:', error);
        content.innerHTML = `
            <h3>${task.title}</h3>
            <p style="color: var(--danger);">Failed to get help. Check your API configuration.</p>
            <button class="btn btn-secondary" onclick="closeModal('stuckModal')">Close</button>
        `;
    }
}

function createSubtasksFromBreakdown(parentTaskId, subtasks) {
    const parentTask = appData.tasks.find(t => t.id === parentTaskId);
    if (!parentTask) return;
    
    // Mark parent task as broken down
    parentTask.brokenDown = true;
    parentTask.subtaskIds = [];
    
    // Create each subtask
    subtasks.forEach((subtask, index) => {
        const newTask = {
            title: subtask.title,
            energy: subtask.energy || 'low',
            location: parentTask.location,
            timeEstimate: subtask.timeEstimate || 10,
            parentTaskId: parentTaskId,
            parentTaskTitle: parentTask.title,
            subtaskIndex: index + 1,
            subtaskTotal: subtasks.length,
            courseId: parentTask.courseId || null,
            dueDate: parentTask.dueDate || null
        };
        
        addTask(newTask);
        parentTask.subtaskIds.push(newTask.id);
    });
    
    saveData();
    renderTasks();
    closeModal('stuckModal');
    
    // Show success message
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
    
    showToast(`✅ Created ${subtasks.length} subtasks! Check them off as you go.`);
}
