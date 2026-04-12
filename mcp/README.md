# ControlledChaos MCP Server 🌀

An MCP (Model Context Protocol) server that gives Claude direct access to your ControlledChaos task manager. Manage tasks, calendar events, brain dumps, and goals from Claude Code, Claude Desktop, or Claude.ai.

## Tools Available

| Tool | What it does |
|---|---|
| `cc_list_tasks` | List/filter tasks by status, priority, category, energy |
| `cc_create_task` | Create a new task with all fields |
| `cc_update_task` | Update any field on an existing task |
| `cc_complete_task` | Quick-complete a task |
| `cc_delete_task` | Permanently delete a task |
| `cc_brain_dump` | Save a raw brain dump for later AI parsing |
| `cc_list_calendar` | List calendar events in a date range |
| `cc_create_event` | Create a new calendar event |
| `cc_list_goals` | List active goals |
| `cc_get_daily_stats` | Today's productivity snapshot |
| `cc_create_goal` | Create a new goal with title, description, target date |
| `cc_update_goal` | Update any field on an existing goal |
| `cc_delete_goal` | Permanently delete a goal (unlinks tasks) |
| `cc_update_event` | Update a ControlledChaos-created calendar event |
| `cc_delete_event` | Permanently delete a ControlledChaos-created event |
| `cc_list_brain_dumps` | List past brain dumps with filters |
| `cc_search_tasks` | Search tasks by text across titles/descriptions |

## Setup

### 1. Install Dependencies

```bash
cd mcp
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Environment Variables

The server needs two env vars:

- `DATABASE_URL` — Your Neon Postgres connection string (same as the main app's `.env.local`)
- `CC_USER_ID` — Your Clerk user ID from ControlledChaos

**How to find your Clerk user ID:**
1. Open ControlledChaos in your browser
2. Open DevTools → Console
3. Run: `await window.Clerk?.user?.id`
4. Or check the Clerk dashboard under Users

### 4. Connect to Claude

#### Claude Code (WebStorm / Terminal)

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "controlledchaos": {
      "command": "node",
      "args": ["mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "your-neon-connection-string",
        "CC_USER_ID": "your-clerk-user-id"
      }
    }
  }
}
```

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "controlledchaos": {
      "command": "node",
      "args": ["/full/path/to/ControlledChaos/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "your-neon-connection-string",
        "CC_USER_ID": "your-clerk-user-id"
      }
    }
  }
}
```

#### Claude.ai (HTTP mode)

Start the server in HTTP mode:

```bash
DATABASE_URL=your-url CC_USER_ID=your-id TRANSPORT=http npm start
```

Then connect at `http://localhost:3100/mcp` in Claude.ai's MCP settings.

## Example Usage

Once connected, just talk naturally to Claude:

- *"What tasks do I have pending?"*
- *"Create a task: Study for Archaeology midterm, school category, high energy, deadline April 5"*
- *"Complete task `abc-123-def`"*
- *"What's on my calendar this week?"*
- *"Brain dump: need to email Dr. Keegan about recommendation letter, buy groceries, finish Substack draft, Hen & Ink meeting prep"*
- *"How's my day looking?"* (triggers daily stats)

## Development

```bash
# Watch mode for development
npm run dev

# Run in HTTP mode for testing
npm run start:http
```

## Architecture

```
mcp/
├── src/
│   ├── index.ts      # Entry point — stdio + HTTP transport
│   ├── db.ts         # Neon Postgres connection
│   ├── helpers.ts    # Markdown formatters for responses
│   └── tools.ts      # All 17 tool registrations
├── package.json
└── tsconfig.json
```

The server connects directly to your Neon Postgres database (same one the main app uses) and scopes all queries to your user ID. No API middleman — just direct DB access.
