// api/parse-syllabus.js - Vercel Edge Function for parsing syllabus PDFs and DOCX files

export const config = {
    runtime: 'nodejs'
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

        // Parse the document with Claude (sending actual content)
        const parsedData = await parseWithClaude(fileData, fileType, fileName);

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

// Parse syllabus document with Claude (sending actual document)
async function parseWithClaude(base64Data, fileType, fileName) {
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Remove data URL prefix if present
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

    // Determine media type for Claude API
    let mediaType;
    if (fileType === 'application/pdf') {
        mediaType = 'application/pdf';
    } else if (fileType.includes('wordprocessingml') || fileType.includes('msword')) {
        mediaType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
        throw new Error('Unsupported file type');
    }

    const prompt = `Analyze this syllabus and extract assignment information with EXTREME ACCURACY.

CRITICAL INSTRUCTIONS:

1. IDENTIFY THE SEMESTER & YEAR FIRST:
   - Look at the document header for "Fall 2025", "Spring 2025", etc.
   - Look for the course start date (e.g., "Tuesday 8/26")
   - Fall = August-December
   - Spring = January-May
   - This tells you what YEAR the dates are in!

2. FIND THE COURSE SCHEDULE:
   - Usually at the end of the syllabus
   - Has dates and assignment names listed chronologically
   - Example: "Tuesday 10/2 **Exam # 1**"
   - Example: "**Tuesday 9/16** Exam Preparation **APS #1: 19-21**"

3. EXTRACT DATES WITH EXTREME PRECISION:
   - Use ONLY the exact dates you see in the schedule
   - If the schedule says "Thursday 10/2", the date is October 2nd in the semester year
   - If semester is Fall 2025, then "10/2" = 2025-10-02
   - If semester is Spring 2025, then "2/5" = 2025-02-05
   - DO NOT guess or invent dates

4. EXTRACT ONLY REAL ASSIGNMENTS:
   - ONLY extract assignments explicitly listed in the schedule section
   - If you see "Exam #1" or "Exam # 1", call it "Exam 1"
   - If you see "APS #1", call it "APS 1"
   - If you see "Final Exam", call it "Final Exam"
   - DO NOT invent: papers, presentations, or assignments not in the schedule
   - Count the assignments - if there are 4 APS mentioned, there should be exactly 4 APS in your output

5. GET EVERY SINGLE ASSIGNMENT:
   - Don't skip any assignment from the schedule
   - Include: Exams, APS, Papers, Projects, Presentations, Quizzes (if graded)
   - Extract descriptions from nearby text (chapter numbers, topics, etc.)

EXAMPLE from HIST 104:
If you see in the schedule:
- "Tuesday 9/16 Exam Preparation **APS #1: 19-21**"
- "Thursday 10/2 **Exam # 1**"
- "Tuesday 9/30 Exam Preparation **APS # 2: 22-24**"
- "Thursday 10/30 Exam # 2"
- "Tuesday 10/28 Exam Prep **APS # 3: 25-29**"
- "Tuesday 12/2 Exam Prep **APS # 4: 30-34**"
- "Thursday 12/11 Final Exam"

And the semester is Fall 2025, you should extract:
- APS 1, due 2025-09-16
- APS 2, due 2025-09-30
- Exam 1, due 2025-10-02
- APS 3, due 2025-10-28
- Exam 2, due 2025-10-30
- APS 4, due 2025-12-02
- Final Exam, due 2025-12-11

Return ONLY valid JSON in this exact format:
{
  "courseCode": "HIST104",
  "courseTitle": "World History II",
  "assignments": [
    {
      "name": "APS 1",
      "dueDate": "2025-09-16",
      "description": "Analysis of Primary Sources - Chapters 19-21"
    },
    {
      "name": "Exam 1",
      "dueDate": "2025-10-02",
      "description": "First examination"
    }
  ]
}

CRITICAL REMINDERS:
- Output ONLY JSON, nothing else
- Use semester year for all dates (Fall 2025 = year is 2025)
- Extract ONLY assignments from the schedule - don't make up extras
- Use exact assignment names from the document
- If you're unsure about a date, set it to null rather than guessing
- Dates must be in YYYY-MM-DD format`;

    // Build the message content with document
    const messageContent = [
        {
            type: "document",
            source: {
                type: "base64",
                media_type: mediaType,
                data: base64Content
            }
        },
        {
            type: "text",
            text: prompt
        }
    ];

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
                content: messageContent
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
