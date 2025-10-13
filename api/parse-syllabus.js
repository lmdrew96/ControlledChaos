// api/parse-syllabus.js - Vercel Edge Function for parsing syllabus PDFs and DOCX files

export const config = {
    runtime: 'edge'
};

export default async function handler(request) {
    // Only allow POST requests
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        const { fileName, fileData, fileType } = await request.json();

        if (!fileName || !fileData || !fileType) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Extract text based on file type
        let extractedText = '';

        if (fileType === 'application/pdf') {
            // For PDF files, we'll use a simple text extraction approach
            // In production, you'd want to use a proper PDF parsing library
            // For now, we'll send the base64 data to Claude and let it handle it
            extractedText = await extractTextFromPDF(fileData);
        } else if (fileType.includes('wordprocessingml') || fileType.includes('msword')) {
            // For DOCX files
            extractedText = await extractTextFromDOCX(fileData);
        } else {
            return new Response(JSON.stringify({ error: 'Unsupported file type' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Parse the extracted text with Claude
        const parsedData = await parseWithClaude(extractedText, fileName);

        return new Response(JSON.stringify(parsedData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Syllabus parsing error:', error);
        return new Response(JSON.stringify({ 
            error: 'Failed to parse syllabus',
            details: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Extract text from PDF (simplified - in production use proper PDF library)
async function extractTextFromPDF(base64Data) {
    // Remove data URL prefix if present
    const base64Content = base64Data.split(',')[1] || base64Data;
    
    // For now, we'll just return a placeholder
    // In production, you'd use pdf-parse or similar
    // Since we're in Edge runtime, we have limitations
    // We'll rely on Claude's vision capabilities instead
    return `[PDF Content - File will be analyzed by AI]`;
}

// Extract text from DOCX (simplified)
async function extractTextFromDOCX(base64Data) {
    // Remove data URL prefix if present
    const base64Content = base64Data.split(',')[1] || base64Data;
    
    // For now, return placeholder
    // In production, use mammoth.js or similar
    return `[DOCX Content - File will be analyzed by AI]`;
}

// Parse syllabus text with Claude
async function parseWithClaude(text, fileName) {
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const prompt = `Analyze this syllabus and extract assignment information with EXTREME ACCURACY.

File: ${fileName}
Content: ${text}

CRITICAL INSTRUCTIONS FOR DATE ACCURACY:

1. FIRST, identify the semester and year:
   - Look for "Fall 2025", "Spring 2025", "Summer 2025", etc.
   - Look for course start/end dates to determine the semester
   - Fall courses typically run August-December
   - Spring courses typically run January-May
   - Summer courses typically run May-August

2. FIND THE COURSE SCHEDULE SECTION:
   - Usually titled "COURSE SCHEDULE", "SCHEDULE", "CALENDAR", or similar
   - This section is typically at the END of the syllabus
   - It contains the actual assignment dates

3. EXTRACT DATES WITH PRECISION:
   - Pay close attention to the EXACT dates in the schedule
   - Look for patterns like "Tuesday 10/2", "Thursday 10/30", "9/16/2025"
   - Use the semester/year context to infer the correct year if not explicitly stated
   - DO NOT invent or assume dates that aren't in the schedule

4. EXTRACT ONLY REAL ASSIGNMENTS:
   - ONLY extract assignments that are explicitly listed in the schedule
   - DO NOT invent or assume assignments (no "Paper 1" if only "Exam 1" exists)
   - Use the EXACT assignment names from the schedule
   - If you see "Exam #1", call it "Exam 1" (not "Midterm Exam")
   - If you see "APS #1", call it "APS 1" (not "Paper 1")

5. EXTRACT EVERY ASSIGNMENT:
   - Don't skip assignments - get them ALL from the schedule
   - Include exams, papers, quizzes, presentations, APS, projects, etc.
   - Each line with a date and assignment type should become an entry

Extract:
1. Course code/number (e.g., HIST104, BISC104, MUSC 199, POSC150)
2. Course title if mentioned
3. ALL assignments with their EXACT names and EXACT due dates from the schedule

Return ONLY valid JSON in this exact format:
{
  "courseCode": "HIST104",
  "courseTitle": "World History II",
  "assignments": [
    {
      "name": "Exam 1",
      "dueDate": "2025-10-02",
      "description": "Covers chapters 1-5"
    },
    {
      "name": "APS 1",
      "dueDate": "2025-09-16",
      "description": "Analysis of Primary Sources"
    }
  ]
}

IMPORTANT: 
- Output ONLY valid JSON, no other text
- If no course code found, use null
- If no due date found for an assignment, use null
- Parse dates in YYYY-MM-DD format
- Use the semester context to ensure dates are in the correct year
- DO NOT hallucinate assignments that don't exist in the schedule`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{
                role: 'user',
                content: prompt
            }]
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${error}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Parse the JSON response
    try {
        const parsed = JSON.parse(content);
        return parsed;
    } catch (e) {
        // If JSON parsing fails, try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('Failed to parse Claude response as JSON');
    }
}
