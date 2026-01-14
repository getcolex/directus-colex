# Unified Workspace UI Design

**Date:** 2026-01-13
**Status:** Design phase

## Page Structure

```
┌─────────────────┐         ┌─────────────────┐
│  Projects Page  │ ──────► │   Workspace     │
│  (select/create)│         │ (tasks+outputs) │
└─────────────────┘         └─────────────────┘
```

Two pages total:
1. **Projects Page** - List all projects, create new, select one
2. **Workspace Page** - Unified task+output view for selected project

## Problem

Current UI has fragmented navigation:
- Projects, Tasks, and Outputs live on separate pages
- Users must mentally connect "this output came from that task"
- Task schema (columns) feels disconnected from output data
- Editing tasks happens in a separate modal, away from the output

## Solution

Unified workspace where **each output card IS the task view**:
- Task config, controls, and output all in one place
- Left sidebar for task navigation
- Project selection as entry point

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Logo]  Project: Kenzai Brand Strategy  [Switch Project ▼]  [AI]  │
├────────────────┬────────────────────────────────────────────────────┤
│                │                                                    │
│  TASKS         │  ┌──────────────────────────────────────────────┐  │
│                │  │ 1. Brand Research                            │  │
│  ○ Brand       │  │ ─────────────────────────────────────────── │  │
│    Research    │  │ Research competitor brands, positioning,     │  │
│                │  │ and visual identity in the premium puzzle    │  │
│  ○ Competitor  │  │ market.                                      │  │
│    Analysis    │  │                                              │  │
│                │  │ [Edit Task] [Run] ──── Tool: Research        │  │
│  ● Cultural    │  │ ─────────────────────────────────────────── │  │
│    Tensions    │  │                                              │  │
│                │  │ ┌─────────────────────────────────────────┐  │  │
│  ○ Occasion    │  │ │  OUTPUT TABLE                           │  │  │
│    Mapping     │  │ │  competitor | positioning | price_range │  │  │
│                │  │ │  ─────────────────────────────────────  │  │  │
│                │  │ │  Ugears     | STEM/DIY     | ₹2500-5000 │  │  │
│  [+ Add Task]  │  │ │  Robotime   | Family fun   | ₹1500-3000 │  │  │
│                │  │ │  ...                                    │  │  │
│                │  │ └─────────────────────────────────────────┘  │  │
│                │  │                              [+ Add Column]  │  │
│                │  └──────────────────────────────────────────────┘  │
│                │                                                    │
│                │  [+ Add Task Here]                                 │
│                │                                                    │
│                │  ┌──────────────────────────────────────────────┐  │
│                │  │ 2. Cultural Tensions                         │  │
│                │  │ ─────────────────────────────────────────── │  │
│                │  │ Identify 6 cultural tensions the brand       │  │
│                │  │ could address...                             │  │
│                │  │                                              │  │
│                │  │ [Edit Task] [Run]                            │  │
│                │  │ ─────────────────────────────────────────── │  │
│                │  │                                              │  │
│                │  │  ┌─────────────────────────────────────┐     │  │
│                │  │  │  Not yet run                        │     │  │
│                │  │  │  Click "Run" to generate output     │     │  │
│                │  │  └─────────────────────────────────────┘     │  │
│                │  └──────────────────────────────────────────────┘  │
│                │                                                    │
└────────────────┴────────────────────────────────────────────────────┘
```

## Projects Page

Entry point for the app. Shows all projects with ability to create new ones.

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Logo]  Template Builder                              [+ New]      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Your Projects                                                      │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ 🎯 Kenzai       │  │ 🛒 E-commerce   │  │ 📱 App Launch   │     │
│  │ Brand Strategy  │  │ Product Desc    │  │ Marketing       │     │
│  │                 │  │                 │  │                 │     │
│  │ 5 tasks         │  │ 3 tasks         │  │ 8 tasks         │     │
│  │ 3 outputs       │  │ 1 output        │  │ 0 outputs       │     │
│  │                 │  │                 │  │                 │     │
│  │ Updated 2h ago  │  │ Updated 1d ago  │  │ Created today   │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                     │
│  ┌─────────────────┐                                               │
│  │ + Create New    │                                               │
│  │   Project       │                                               │
│  │                 │                                               │
│  │ Start from      │                                               │
│  │ scratch or      │                                               │
│  │ use a template  │                                               │
│  └─────────────────┘                                               │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  Templates                                                          │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ 🔍 Brand        │  │ 📝 Product      │  │ 🏢 Company      │     │
│  │ Research Kit    │  │ Descriptions    │  │ Enrichment      │     │
│  │                 │  │                 │  │                 │     │
│  │ 6 tasks         │  │ 4 tasks         │  │ 3 tasks         │     │
│  │ [Use Template]  │  │ [Use Template]  │  │ [Use Template]  │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Project Card
- Project name and icon/emoji
- Task count and output count
- Last updated timestamp
- Click to open workspace

### Create New
- Option to start blank
- Option to use template
- Opens modal or inline form for name/description

### Templates Section
- Pre-built project templates
- Shows task count
- [Use Template] creates new project from template

---

## Workspace Page

## Components

### 1. Project Selector (Top Bar)
- Shows current project name
- Dropdown to switch projects
- Link to create new project
- AI sidebar toggle on right

### 2. Task Navigation (Left Sidebar)
- List of tasks in order
- Visual status indicator:
  - ○ Empty (not run)
  - ● Has output
  - ◐ Running
  - ⚠ Needs review
- Click to scroll main area to that task
- Drag to reorder tasks
- [+ Add Task] button at bottom

### 3. Task Cards (Main Area)
Each card contains:

**Header Section:**
- Task number and name (editable inline)
- Description (editable inline, click to expand)

**Controls Row:**
- [Edit Task] - expands inline editor
- [Run] - executes task
- Tool mode badge (Research/Generate/etc)
- Output type badge (Table/Text/etc)

**Output Section:**
- If not run: Empty state with prompt
- If has output: Rendered output (table, text, images, etc)
- For tables: [+ Add Column] button (triggers enrichment flow)

**Between Cards:**
- [+ Add Task Here] button (subtle, appears on hover)

### 4. Inline Task Editor
When [Edit Task] clicked, card expands to show:
```
┌────────────────────────────────────────────────────┐
│ Task Name: [Brand Research                      ]  │
│ Description:                                       │
│ [Research competitor brands, positioning, and   ]  │
│ [visual identity in the premium puzzle market.  ]  │
│                                                    │
│ Type: [Agent ▼]  Tools: [Research ▼]              │
│ Output: [Table ▼]  ☑ Requires approval            │
│                                                    │
│ [Cancel] [Save Changes]                            │
└────────────────────────────────────────────────────┘
```

### 5. Empty State (Task Not Run)
```
┌─────────────────────────────────────────┐
│                                         │
│     📋 No output yet                    │
│                                         │
│     Run this task to generate results   │
│                                         │
│            [Run Task]                   │
│                                         │
└─────────────────────────────────────────┘
```

## User Flows

### View Project
1. User lands on project selector (or last viewed project)
2. Selects project
3. Sees all tasks as cards with their outputs
4. Can scroll through or use left nav to jump

### Edit Task
1. Click [Edit Task] on any card
2. Card expands inline with editable fields
3. Make changes
4. Click [Save] or [Cancel]
5. Card collapses back

### Run Task
1. Click [Run] on task card
2. Button shows spinner, status changes to "Running"
3. Output section shows streaming progress (if applicable)
4. When complete, output renders in place
5. Left nav status updates to ●

### Add Task
1. Click [+ Add Task Here] between cards
2. New card appears with empty state
3. Inline editor is open by default
4. Fill in details, save
5. Card shows empty output state, ready to run

### Add Column to Table (Enrichment)
1. Click [+ Add Column] on table output
2. AI sidebar focuses with context
3. User describes what columns to add
4. AI enriches data, table updates
5. Task schema updated (visible as new columns)

### Reorder Tasks
1. Drag task in left sidebar
2. Cards reorder in main area
3. Task numbers update

## State Management

```javascript
// Current state
let currentProjectId = null;
let tasks = [];           // Tasks with their latest output embedded
let expandedTaskId = null; // Which task is in edit mode

// Each task object:
{
  id: 123,
  name: "Brand Research",
  description: "...",
  action_type: "agent",
  tool_mode: "research",
  output_type: "table",
  needs_review: false,
  status: "done",        // pending, running, done, review
  sort_order: 1,
  output: {              // Latest output (null if not run)
    id: 456,
    data: { content: [...] },
    date_created: "..."
  }
}
```

## Navigation Changes

### Remove
- Separate "Tasks" tab/page
- Separate "Outputs" tab/page
- Task edit modal

### Keep
- Projects list/selector
- AI sidebar (now contextual to selected task/output)
- Templates (for creating new projects)

### New
- Unified workspace view
- Left task navigation sidebar
- Inline task editor
- Between-card add buttons

## Implementation Plan

### Phase 1: Layout Restructure
- Create new workspace layout (sidebar + main)
- Project selector in top bar
- Basic task card structure

### Phase 2: Task Cards
- Render tasks as cards with output
- Empty state for unrun tasks
- Inline task editing

### Phase 3: Navigation & Interactions
- Left sidebar with task list
- Click to scroll
- Drag to reorder
- Add task between cards

### Phase 4: Polish
- Status indicators
- Running state animations
- Keyboard shortcuts
- Mobile responsiveness

## Success Criteria

- [ ] User can see task and its output in one place
- [ ] Editing task happens inline on the card
- [ ] Adding columns shows schema is part of task
- [ ] Navigation via sidebar works smoothly
- [ ] Adding tasks between existing ones works
- [ ] Reordering tasks updates both sidebar and main area
