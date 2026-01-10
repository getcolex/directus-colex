# Plan: Template Builder Demo Polish

## Goal
Make the template builder demo solid for sales, user testing, and technical proof-of-concept by ensuring all three user flows work end-to-end.

## User Flows That Must Work

### Flow 1: Create from Scratch
```
User describes goal → AI generates tasks → User runs tasks → See outputs
```

### Flow 2: Use Template
```
Pick template → Tasks created → Customize/Edit → Fill forms → Run AI tasks → See outputs
```

### Flow 3: Chat-driven
```
Chat with AI → AI suggests/creates tasks → User approves → Execute → Review
```

## Architecture

### Data Model Enhancement

**tb_tasks - Add fields:**
```
output_type: enum ['table', 'text', 'list', 'json', 'colors']
output_schema: JSON (optional - defines columns for table, fields for structured)
```

**tb_outputs - Already has:**
```
output_type: string
data: JSON
```

### Task Execution Flow

```
User clicks "Run Task"
       ↓
Frontend calls /template-builder/execute-task
       ↓
Backend gathers context:
  1. Task description & output_type
  2. Previous task outputs (from tb_outputs for same project)
  3. Form submissions (from tb_outputs where type='form_submission')
       ↓
Builds prompt for Claude Code:
  "You are executing task: {name}
   Description: {description}

   Context from previous tasks:
   - {form_data}
   - {previous_outputs}

   Produce output as: {output_type}
   Format: {output_schema if defined}"
       ↓
Claude Code executes with tools (research, scrape, etc.)
       ↓
Response parsed and stored in tb_outputs
       ↓
Frontend renders based on output_type
```

### Output Renderers

| Type | Rendering |
|------|-----------|
| `table` | Sortable HTML table with headers |
| `text` | Markdown → HTML with formatting |
| `list` | Checkbox-style list items |
| `json` | Syntax-highlighted code view |
| `colors` | Color swatches with hex codes |

---

## Implementation Phases

### Phase A: Core Data Model (30 min)

**A1. Add output_type field to tb_tasks in Directus**
- Field: `output_type`
- Type: string (dropdown)
- Options: table, text, list, json, colors
- Default: text

**A2. Add output_schema field to tb_tasks**
- Field: `output_schema`
- Type: JSON
- Optional - for defining table columns, etc.

**A3. Update frontend task creation UI**
- Add output type dropdown to inline task form
- Add output type dropdown to edit task modal
- Default based on task type (form→structured, agent→text)

**A4. Update generate-tasks endpoint**
- Include output_type in generated tasks
- Infer from task description (research→table, write→text, etc.)

### Phase B: Execution Context (45 min)

**B1. Modify execute-task endpoint to gather context**
```typescript
// Get all previous outputs for this project
const previousOutputs = await outputsService.readByQuery({
  filter: { project_id: { _eq: projectId } },
  sort: ['date_created']
});

// Get task details including output_type
const task = await tasksService.readOne(taskId);
```

**B2. Build contextual prompt**
```typescript
const prompt = `
You are executing a task in a workflow.

## Task
Name: ${task.name}
Description: ${task.description}

## Context from Previous Tasks
${previousOutputs.map(o => formatOutput(o)).join('\n')}

## Required Output Format
Type: ${task.output_type}
${task.output_schema ? `Schema: ${JSON.stringify(task.output_schema)}` : ''}

## Instructions
- Execute the task using the context provided
- Return output in the specified format
- For 'table': Return JSON array of objects
- For 'text': Return markdown text
- For 'list': Return JSON array of strings
- For 'colors': Return JSON object with color names and hex values
`;
```

**B3. Parse response based on output_type**
- Extract JSON for structured types
- Keep markdown for text type
- Validate against schema if provided

### Phase C: Output Rendering (30 min)

**C1. Create renderOutput() function**
```javascript
function renderOutput(output) {
  switch (output.output_type) {
    case 'table': return renderTable(output.data);
    case 'text': return renderMarkdown(output.data);
    case 'list': return renderList(output.data);
    case 'json': return renderJSON(output.data);
    case 'colors': return renderColors(output.data);
    case 'form_submission': return renderFormData(output.data);
    default: return renderJSON(output.data);
  }
}
```

**C2. Implement individual renderers**
- `renderTable()` - HTML table with sortable headers
- `renderMarkdown()` - Parse markdown to HTML
- `renderList()` - Checklist-style items
- `renderJSON()` - Syntax highlighted, collapsible
- `renderColors()` - Visual swatches with copy buttons
- `renderFormData()` - Key-value pairs with labels

**C3. Update Outputs view**
- Replace current raw display with renderOutput()
- Add output type icon/label
- Show task name that produced it

**C4. Add inline output preview on task cards**
- When task is done, show collapsed preview
- Click to expand or go to Outputs tab

### Phase D: Flow Testing & Polish (30 min)

**D1. Test Flow 1: Create from Scratch**
- [ ] Create new project from scratch
- [ ] Describe a goal in natural language
- [ ] AI generates appropriate tasks with output_types
- [ ] Run each task in sequence
- [ ] Verify outputs render correctly
- [ ] Verify context flows between tasks

**D2. Test Flow 2: Use Template**
- [ ] Create project from Brand Research Kit template
- [ ] Verify tasks have correct output_types
- [ ] Fill out form task
- [ ] Run AI tasks that use form data
- [ ] Verify outputs reference form inputs

**D3. Test Flow 3: Chat-driven**
- [ ] Start chat conversation
- [ ] Ask AI to add/modify tasks
- [ ] Verify tasks created correctly
- [ ] Execute via chat commands
- [ ] Review outputs

**D4. Fix discovered issues**
- Document any bugs found
- Fix critical issues
- Note non-critical for later

---

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/setup-template-builder-schema.js` | Add output_type, output_schema fields |
| `extensions/.../src/index.ts` | Update execute-task with context |
| `template-builder.html` | Output type UI, renderers |

## Success Criteria

- [ ] All 3 flows work end-to-end without errors
- [ ] Form data flows into subsequent AI tasks
- [ ] Outputs render visually (not just raw JSON)
- [ ] Demo is compelling for sales/investors
- [ ] UX is clear enough for user testing

## Decisions Made

- **Output types**: table, text, list, json, colors (expandable later)
- **Context passing**: All previous outputs passed to each task
- **Execution**: Real Claude Code CLI via proxy server
- **Rendering**: Frontend-side rendering (no server-side HTML)
