# Outputs Editing & Display Improvements

**Date:** 2026-01-11
**Status:** ✅ COMPLETE

## Problem

1. Outputs are read-only - users can't edit content inline
2. Users can't delete individual items (rows, list items, swatches, images)
3. Colors and images output types not rendering
4. Form submissions display as raw JSON instead of formatted table
5. Task configuration missing output_type selector

## Solution

Inline editing for all output types with hover-to-delete for list-like items.

## Output Types & Edit Interfaces

| Type | Display | Edit Trigger | Edit Interface | Delete |
|------|---------|--------------|----------------|--------|
| table | Sortable table | Click cell | `contenteditable` cell | Hover row → "×" |
| text | Rendered markdown | Click content | `<textarea>` with preview | N/A (single block) |
| list | Styled list items | Click item | Inline `<input>` | Hover item → "×" |
| json | Syntax-highlighted | Click content | `<textarea>` | N/A (single block) |
| colors | Color swatches | Click swatch | `<input type="color">` + hex input | Hover swatch → "×" |
| images | Image gallery | Click to replace | `<input type="file">` | Hover image → "×" |
| form_submission | Render as table | Same as table | Same as table | Same as table |
| generated_image | Single image | Click to replace | `<input type="file">` | N/A (single item) |

## Technical Approach

### No External Libraries
- Color picker: `<input type="color">`
- Text/markdown: `<textarea>` with preview toggle
- JSON: `<textarea>` with CSS syntax highlighting (existing)
- Tables: Native `contenteditable` on cells
- Images: Native `<input type="file">` + existing Directus upload

### Data Flow
1. User edits inline → Update local state immediately (optimistic UI)
2. Debounce 500ms → Call `api.updateOutput(outputId, data)`
3. Show subtle "Saving..." indicator → "Saved" on success
4. On error → Revert local state, show error toast

### Delete Flow
1. Hover item → Show "×" button on right side
2. Click "×" → Remove from local state immediately
3. Debounce → Save updated output to API
4. For tables: entire row deleted
5. For lists/colors/images: individual item deleted

### Task Configuration
Add `output_type` dropdown to task edit/create form:
- Options: table, text, list, json, colors, images
- Links to existing `output_schema` field for structure definition

## Files to Modify

- `/Users/parijat/Documents/prototypes/template-builder.html`

## Implementation Order (TDD)

### Phase 1: Fix Broken Renderers
1. Fix `renderColors()` - colors not displaying
2. Fix `renderImages()` - images not displaying
3. Fix `renderFormData()` - use table renderer instead of JSON

### Phase 2: Task Configuration
4. Add `output_type` dropdown to task edit form
5. Wire up to API (save/load)

### Phase 3: Inline Editing
6. Table cells - contenteditable with save
7. Text/markdown - textarea editor
8. List items - inline input editor
9. JSON - textarea editor
10. Colors - color picker
11. Images - file input replacement

### Phase 4: Delete Functionality
12. Hover-to-reveal delete button CSS
13. Table row deletion
14. List item deletion
15. Color swatch deletion
16. Image deletion

### Phase 5: Persistence
17. `api.updateOutput()` function
18. Debounced save with optimistic UI
19. Error handling and rollback

## Success Criteria

- [x] All 7 output types render correctly
- [x] All output types are editable inline
- [x] Users can delete items from tables, lists, colors, images
- [x] Changes persist to API
- [x] Task configuration includes output_type dropdown
- [x] Form submissions display as editable tables

## Out of Scope

- Bulk operations (multi-select delete)
- Undo/redo for edits
- Version history
- Export/download functionality
- Rich markdown editor (YAGNI - can add later)
