# Junk Journal — Feature Spec

## Status
Backend & MCP: ✅ Shipped
UI: 🔧 Needs work — this doc covers the vision and UI requirements

## The Problem
The brain dump feature is built for productivity: dump scattered thoughts → AI parses them into tasks and events. But not every thought is a task. Some thoughts are raw material for *writing* — literary analysis fragments, half-formed theses, quotes, reactions, philosophical tangents. These creative fragments need a home that doesn't try to turn them into action items.

## The Vision

### Brain Dump vs. Junk Journal

| | Brain Dump | Junk Journal |
|---|---|---|
| **Purpose** | Clear your head → extract tasks/events | Capture a thought → save for later writing |
| **Energy** | Productive, functional | Creative, reflective |
| **AI parsing** | Yes — parsed into tasks, events, reminders | **No** — raw storage only, `parsed` stays `false` |
| **Prompt framing** | "What's on your mind?" | "Capture a thought" / "Save this for later" |
| **Downstream use** | ControlledChaos task system | Cosma → Substack drafting pipeline |
| **Examples** | "Need to submit LING 202 paper by Friday" | "Whitman's cataloguing feels like ADHD pattern-matching — the list as coping mechanism?" |

The junk journal is the messy drawer of creative fragments. Cosma (Claude Cowork) is the one who rifles through the drawer and says "these five scraps are all about the same theme" when it's time to write.

### What It Is
- A low-friction capture tool for typed thoughts
- Raw material for essays, literary analysis, opinion pieces, philosophy
- Accessible via the app UI and via MCP (`cc_brain_dump` with `category: "junk_journal"`)
- Visible in Mirror Day view as its own kind (`journal`)

### What It Is Not
- Not a notes app — no rich text, no folders, no organization
- Not a replacement for local files (PDFs, screenshots, voice memos live in a `brain/` folder on disk)
- Not a drafting tool — drafting happens in Cosma using junk journal entries as *input*

## Backend (Already Implemented)

### Schema
`brain_dumps` table has a `category` column: `"braindump"` (default) | `"junk_journal"`

### MCP Tools
- `cc_brain_dump` — accepts optional `category` param, defaults to `"braindump"`
- `cc_list_brain_dumps` — accepts optional `category` filter
- `cc_get_mirror_day` — separates brain dumps (`dump` kind) from junk journal (`journal` kind)

### Key Rule
Junk journal entries must **never** trigger AI parsing. When `category = "junk_journal"`:
- `parsed` stays `false`
- No task extraction
- No event creation
- The AI response field stays `null`

## UI Requirements

### 1. Separate Entry Points
The junk journal should **not** be a dropdown toggle on the brain dump form. It needs its own entry point — a different button, tab, or mode that signals "this is creative capture, not task capture."

Options to consider (pick one):
- A tab or toggle at the top of the brain dump view: `Brain Dump | Junk Journal`
- A separate card/button on the dashboard
- A different icon in the nav or quick-action menu

### 2. Visual Distinction
The junk journal entry experience should *feel* different:
- **Different placeholder text:** Not "What's on your mind?" — something like "Capture a thought..." or "Save this for later..."
- **Different color accent or icon:** Distinguish it from the brain dump's visual treatment. Consider using a warmer tone (amber from the brand palette `#DFA649`?) vs. the brain dump's existing style.
- **No AI parsing indicator:** Brain dumps might show a "parsing..." or "extracted 3 tasks" state. Junk journal should show nothing like that — just a simple "Saved ✓" confirmation.

### 3. Optional Tags
Not required for v1, but consider: a simple free-text tag field on junk journal entries. Examples: `whitman`, `vertexism`, `language-identity`, `control-systems`.

Purpose: when Cosma queries `cc_list_brain_dumps(category: "junk_journal")` to assemble a Substack draft, tags make it easier to cluster related fragments. This could be as simple as a comma-separated text field stored in a `tags` column or in the existing `ai_response` jsonb field.

If implementing tags:
- Add optional `tags` param to `cc_brain_dump` MCP tool
- Add optional `tags` filter to `cc_list_brain_dumps` MCP tool
- UI: small tag input below the text area, chips-style

### 4. Mirror Day Integration
Already works — junk journal entries show as `journal` kind in the Mirror view. No changes needed unless the visual treatment in Mirror should also be distinct (different icon/color from brain dumps).

### 5. List View
`cc_list_brain_dumps` already supports category filtering. The app's brain dump list view (if one exists) should either:
- Have a filter/tab to toggle between brain dumps and junk journal entries
- Or show them interleaved with a visual indicator of which is which

## The Pipeline (For Context)

```
Nae has a thought
    ↓
Types it into Junk Journal (app) or cc_brain_dump(category: "junk_journal") via MCP
    ↓
Entry sits in brain_dumps table with category = "junk_journal"
    ↓
[Time passes — fragments accumulate]
    ↓
Nae wants to write a Substack piece
    ↓
Opens Cosma (Cowork) → "I want to write about [topic]"
    ↓
Cosma queries cc_list_brain_dumps(category: "junk_journal") + scans local brain/ folder
    ↓
Cosma assembles a structured starting point from matching fragments
    ↓
Nae writes the actual piece with her voice
```

## References
- ChaosPatch: `c4655ce2` (controlledchaos project) — original patch with context notes
- ADHDesigns brand palette: Amber `#DFA649`, Sage Teal `#8CBDB9`, Deep Teal `#244952`
- nd-design skill — consult for neurodivergent-centered UI patterns if needed
