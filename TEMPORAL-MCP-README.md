# Temporal MCP Client Integration

This document describes the MCP (Model Context Protocol) client integration for the Controlled Chaos app, connecting to the temporal awareness FastMCP server.

## Overview

The temporal MCP client allows the Controlled Chaos app to interact with time-related functionality through a FastMCP server deployed at `https://passage-of-time-mcp-9u8l.onrender.com`.

## Architecture

```
Frontend (temporal.js)
    ↓
Vercel API Routes (/api/temporal/*)
    ↓
MCP Client (@modelcontextprotocol/sdk)
    ↓
FastMCP Server (SSE Transport)
    ↓
Temporal Tools
```

## Files Created

### Backend (Vercel API Routes)

All API routes are located in `/api/temporal/` and follow the Vercel Edge Function pattern:

1. **current-time.js** - GET endpoint
   - Query param: `timezone` (optional, defaults to 'UTC')
   - Returns current time information

2. **time-since.js** - POST endpoint
   - Body: `{ timestamp, timezone }`
   - Returns time elapsed since the given timestamp

3. **time-difference.js** - POST endpoint
   - Body: `{ timestamp1, timestamp2, unit, timezone }`
   - Returns difference between two timestamps

4. **parse-timestamp.js** - POST endpoint
   - Body: `{ timestamp, source_timezone, target_timezone }`
   - Parses and converts timestamps between timezones

5. **add-time.js** - POST endpoint
   - Body: `{ timestamp, duration, unit, timezone }`
   - Adds/subtracts time from a timestamp

6. **timestamp-context.js** - POST endpoint
   - Body: `{ timestamp, timezone }`
   - Returns contextual information about a timestamp

7. **format-duration.js** - POST endpoint
   - Body: `{ seconds, style }`
   - Formats duration in seconds to human-readable string

### Frontend Module

**temporal.js** - Frontend JavaScript module with exported functions:
- `getCurrentTime(timezone)`
- `getTimeSince(timestamp, timezone)`
- `getTimeDifference(timestamp1, timestamp2, unit, timezone)`
- `parseTimestamp(timestamp, sourceTimezone, targetTimezone)`
- `addTime(timestamp, duration, unit, timezone)`
- `getTimestampContext(timestamp, timezone)`
- `formatDuration(seconds, style)`

## Usage Examples

### Import the module

```javascript
import { getCurrentTime, getTimeSince, formatDuration } from './temporal.js';
```

### Get current time

```javascript
const result = await getCurrentTime('America/New_York');
console.log(result);
```

### Calculate time since a date

```javascript
const result = await getTimeSince('2024-01-01 00:00:00', 'UTC');
console.log(result);
```

### Format a duration

```javascript
const result = await formatDuration(3661, 'long');
// Returns: "1 hour, 1 minute, 1 second"
```

### Calculate time difference

```javascript
const result = await getTimeDifference(
  '2024-01-01 00:00:00',
  '2024-12-31 23:59:59',
  'days',
  'UTC'
);
console.log(result);
```

## Timestamp Format

The FastMCP server expects timestamps in one of these formats:
- `"YYYY-MM-DD HH:MM:SS"` (e.g., "2024-01-15 14:30:00")
- `"YYYY-MM-DD"` (e.g., "2024-01-15")

## Error Handling

All functions return an object with an `error` property if something goes wrong:

```javascript
const result = await getCurrentTime();
if (result.error) {
  console.error('Error:', result.message);
} else {
  // Use result.content or other properties
}
```

## Dependencies

- `@modelcontextprotocol/sdk` - MCP client library for connecting to FastMCP servers

## Deployment Notes

- The API routes use Vercel Edge Functions (runtime: 'edge')
- CORS is enabled for all routes
- Each API route creates a new MCP client connection and closes it after use
- The FastMCP server uses SSE (Server-Sent Events) transport

## Testing

To test the integration locally:

1. Start the Vercel dev server:
   ```bash
   vercel dev
   ```

2. Test an endpoint:
   ```bash
   curl http://localhost:3000/api/temporal/current-time?timezone=UTC
   ```

3. Or use the frontend module in your app:
   ```javascript
   import { getCurrentTime } from './temporal.js';
   const time = await getCurrentTime();
   console.log(time);
   ```

## Troubleshooting

- **Connection errors**: Verify the FastMCP server is running at `https://passage-of-time-mcp-9u8l.onrender.com`
- **CORS issues**: All routes include proper CORS headers, but verify your domain is allowed
- **Timestamp format errors**: Ensure timestamps follow the required format
- **Timezone errors**: Use valid IANA timezone names (e.g., 'America/New_York', 'UTC', 'Europe/London')

## Future Enhancements

Possible improvements:
- Connection pooling for MCP clients
- Caching for frequently requested data
- Batch operations for multiple timestamps
- WebSocket transport option
- Rate limiting and request throttling
