# Output Enrichment Feature Design

**Date:** 2026-01-13
**Status:** Ready for implementation

## Problem

Users reviewing outputs often find missing data (e.g., a competitors table missing website URLs). Currently, they have no way to:
1. Add missing fields to existing output data
2. Update the task schema so future runs include the new fields

## Solution

Add an "Add Missing Data" flow that:
1. Lets users describe missing fields in natural language via AI sidebar
2. Enriches existing output records with new data
3. Updates the task's `form_schema` for future runs
4. Template only updates when user explicitly saves

## User Flow

```
User clicks "Add Missing Data" on output card
    ↓
Output card gets "selected" state (visual highlight)
AI sidebar input focuses with hint: "Describe what's missing..."
    ↓
User types: "I need website URL and founding year for each competitor"
    ↓
AI parses → determines new fields: {website_url: URL, founding_year: number}
    ↓
1. UPDATE TASK: PATCH /items/tb_tasks/{id} with updated form_schema
    ↓
2. ENRICH OUTPUT: POST /template-builder/enrich-output
    ↓
3. UPDATE OUTPUT: PATCH /items/tb_outputs/{id} with enriched data
    ↓
Output refreshes with new columns. Chat shows confirmation.
```

## Data Model

### Task Schema Update

```javascript
// Before
form_schema: {
  columns: ["name", "description", "pricing"]
}

// After adding website_url and founding_year
form_schema: {
  columns: ["name", "description", "pricing", "website_url", "founding_year"],
  field_types: {
    website_url: "url",
    founding_year: "number"
  }
}
```

### New Endpoint

```
POST /template-builder/enrich-output
{
  output_id: 123,
  task_id: 45,
  new_fields: [
    { name: "website_url", type: "url", description: "Company website" },
    { name: "founding_year", type: "number", description: "Year founded" }
  ]
}

Response:
{
  success: true,
  enriched_count: 5,
  task_updated: true,
  data: { ... updated output data ... }
}
```

## Frontend Changes

### 1. Output Card Button

Add "Add Missing Data" button to output card header:

```html
<button class="btn btn-ghost btn-icon add-missing-data-btn"
        data-output-id="123"
        data-task-id="45"
        title="Add missing data">
  <svg><!-- plus icon --></svg>
</button>
```

### 2. Selected Output State

```css
.output-section.selected {
  border: 2px solid var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}
```

### 3. Context Tracking

```javascript
let selectedOutputId = null;
let selectedOutputTaskId = null;

function selectOutputForEnrichment(outputId, taskId, outputName) {
  selectedOutputId = outputId;
  selectedOutputTaskId = taskId;

  // Highlight output card
  document.querySelectorAll('.output-section').forEach(el => el.classList.remove('selected'));
  document.querySelector(`[data-output-id="${outputId}"]`).classList.add('selected');

  // Update context badge
  updateContextBadge({ output: outputName });

  // Focus AI input with hint
  aiInput.placeholder = `Describe what's missing from "${outputName}"...`;
  aiInput.focus();
}

function clearOutputSelection() {
  selectedOutputId = null;
  selectedOutputTaskId = null;
  document.querySelectorAll('.output-section').forEach(el => el.classList.remove('selected'));
  updateContextBadge({ output: null });
  aiInput.placeholder = 'Ask AI anything...';
}
```

### 4. Chat Payload Update

```javascript
// In sendMessage()
const payload = {
  message: text,
  projectId: currentProjectId,
  conversationHistory: messages,
  // Enrichment context when output is selected
  enrichmentContext: selectedOutputId ? {
    output_id: selectedOutputId,
    task_id: selectedOutputTaskId
  } : null
};
```

### 5. Post-Enrichment Refresh

After enrichment completes:
- Clear `selectedOutputId`
- Call `renderOutputsView()` to refresh with new data
- Remove "selected" highlight

## Backend Changes

### Enrich Output Endpoint

```typescript
router.post('/enrich-output', async (req, res) => {
  const { output_id, task_id, new_fields } = req.body;

  // 1. Fetch current task and output
  const task = await ItemsService('tb_tasks').readOne(task_id);
  const output = await ItemsService('tb_outputs').readOne(output_id);

  // 2. Update task's form_schema with new fields
  const currentSchema = task.form_schema || { columns: [], field_types: {} };
  new_fields.forEach(f => {
    if (!currentSchema.columns.includes(f.name)) {
      currentSchema.columns.push(f.name);
      currentSchema.field_types[f.name] = f.type;
    }
  });
  await ItemsService('tb_tasks').updateOne(task_id, { form_schema: currentSchema });

  // 3. Call Claude to enrich existing data
  const enrichedData = await callClaude({
    prompt: buildEnrichmentPrompt(output.data, new_fields, task),
    tools: getToolsForMode(task.tool_mode)
  });

  // 4. Merge enriched data into output
  const mergedData = mergeOutputData(output.data, enrichedData);
  await ItemsService('tb_outputs').updateOne(output_id, { data: mergedData });

  // 5. Return result
  res.json({
    success: true,
    enriched_count: countRecords(mergedData),
    task_updated: true,
    data: mergedData
  });
});
```

### Chat Handler Update

```typescript
// In /chat handler
if (req.body.enrichmentContext) {
  // Parse user message for field requests
  const fields = await parseFieldsFromMessage(message, outputData);

  // Call enrich-output
  const result = await enrichOutput(
    enrichmentContext.output_id,
    enrichmentContext.task_id,
    fields
  );

  // Return conversational response
  return res.json({
    response: `Added ${fields.map(f => f.name).join(', ')} to ${result.enriched_count} records. Task updated for future runs.`,
    enrichment_result: result
  });
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `/Users/parijat/Documents/prototypes/template-builder.html` | Add button to output cards, selected state CSS, context tracking, chat payload update, output refresh after enrichment |
| `extensions/directus-extension-endpoint-template-builder/src/index.ts` | Add `/enrich-output` endpoint, update `/chat` to handle enrichment context |

## New Functions

### Frontend
- `selectOutputForEnrichment(outputId, taskId, outputName)` - Select output for enrichment
- `clearOutputSelection()` - Clear selection state
- Update `sendMessage()` to include enrichment context

### Backend
- `parseFieldsFromMessage(message, existingData)` - AI extracts field definitions from natural language
- `buildEnrichmentPrompt(data, fields, task)` - Constructs Claude prompt for enrichment
- `mergeOutputData(existing, enriched)` - Merges new fields into output data

## Implementation Plan

Use TDD approach with task agents:

1. **Backend Tests & Implementation** (Agent 1)
   - Write failing tests for `/enrich-output` endpoint
   - Write failing tests for field parsing
   - Implement to make tests pass

2. **Frontend Implementation** (Agent 2)
   - Add button and CSS to output cards
   - Add selection tracking and context
   - Update chat payload
   - Add refresh after enrichment

## Success Criteria

- [ ] "Add Missing Data" button visible on output cards
- [ ] Clicking button selects output and focuses AI input
- [ ] User can describe missing fields in natural language
- [ ] AI parses fields and enriches output data
- [ ] Task's form_schema is updated with new fields
- [ ] Output view refreshes to show new columns
- [ ] Future task runs include the new fields
- [ ] Template only updates when explicitly saved
