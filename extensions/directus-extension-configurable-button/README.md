# Configurable Button Display Extension for Directus

**Version**: 1.0.0
**Last Updated**: December 1, 2025
**Status**: ✅ Core Implementation Complete, 🚧 Configuration In Progress

A powerful state-driven button display extension that enables dynamic action buttons with visibility conditions, confirmations, and multiple action types. **Each row displays only the buttons contextually relevant to its current state**, not all configured buttons.

---

## 📋 Current Implementation Status

### ✅ Completed Features
- [x] **Core Display Component**: Vue 3 component with proper prop handling
- [x] **State-Driven Visibility**: Filter buttons per row based on item field values
- [x] **Multiple Button Configs**: Support for 10+ button configurations per field
- [x] **Conditional Disabling**: Disable buttons based on conditions
- [x] **9 Action Types**: Links, Webhooks, Flows, Navigation, Modules, Drawers, Create Item, Create Item Single, Review Outputs
- [x] **Template Interpolation**: Use `{field_name}` syntax for dynamic values
- [x] **Confirmation Dialogs**: Optional pre-action confirmations
- [x] **Multiple Layouts**: Horizontal, Vertical, or Dropdown menu
- [x] **Loading States**: Visual feedback during async operations
- [x] **Toast Notifications**: Success/error messages
- [x] **API Integration**: Fetch button configs from `configurable_buttons` collection
- [x] **Error Handling**: Graceful fallbacks and user-friendly error messages

### 🚧 In Progress
- [ ] **Button Label Optimization**: Full labels showing (currently truncated)
- [ ] **Button Configuration UI**: Streamline creating button configs in Directus
- [ ] **Documentation Examples**: Add more real-world workflow examples

### 🔮 Future Enhancements
- [ ] **Multi-Tenant Isolation**: Optional tenant_id filtering
- [ ] **Batch Actions**: Select multiple items and execute button action
- [ ] **Keyboard Shortcuts**: Quick access to primary buttons
- [ ] **Button Grouping**: Organize buttons into categories
- [ ] **Permission-Based Visibility**: Hide buttons based on user roles

---

## 🎯 Core Concept: Contextual Button Display

**IMPORTANT**: This extension shows different buttons for each row based on the row's current state.

**Example**: In a tasks collection with 10 button configurations:
- Task #1 (`status: "new"`) → Shows only "Start" and "Archive" buttons
- Task #2 (`status: "in_progress"`) → Shows only "Submit" and "Mark Complete" buttons
- Task #3 (`status: "awaiting_approval"`) → Shows only "Approve" and "Reject" buttons
- Task #4 (`status: "done"`) → Shows only "View Results" button

Each button configuration has a `visibility_condition` that determines **when it appears**. The display component evaluates these conditions against each row's data.

---

## 🏗️ Technical Specification

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Directus Admin UI (Collection View)                    │
│  ┌──────────┬──────────┬───────────────────────────┐   │
│  │ Desc     │ Priority │ Status                    │   │
│  ├──────────┼──────────┼───────────────────────────┤   │
│  │ Task 1   │ high     │ [Start] [Archive]         │◄──┼── Visibility evaluated
│  │ Task 2   │ medium   │ [Submit] [Complete]       │◄──┼── per row's status
│  │ Task 3   │ critical │ [Approve] [Reject]        │◄──┼──
│  └──────────┴──────────┴───────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
           ▲
           │ Fetches button configs on mount
           │
┌──────────┴──────────────────────────────────────────────┐
│  configurable_buttons Collection                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ID: uuid-1                                       │   │
│  │ Label: "Start"                                   │   │
│  │ Icon: "play_arrow"                               │   │
│  │ visibility_condition: {                          │   │
│  │   field: "status",                               │   │
│  │   operator: "eq",                                │   │
│  │   value: "new"                                   │   │
│  │ }                                                │   │
│  │ action_type: "webhook"                           │   │
│  │ action_config: { url: "/api/start", ... }       │   │
│  └──────────────────────────────────────────────────┘   │
│  ... (9 more button configurations)                     │
└─────────────────────────────────────────────────────────┘
```

### Component Flow

1. **Mount**: Display component mounts for each row
2. **Fetch Configs**: Load all button configurations once (using UUIDs from display options)
3. **Filter Per Row**: For each row, evaluate `visibility_condition` against row's data
4. **Render**: Display only buttons where condition evaluates to `true`
5. **User Click**: Execute action (with optional confirmation)
6. **Refresh**: Re-evaluate visibility after state changes

### Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/index.js` | Extension registration, display options | 70 |
| `src/display.vue` | Main Vue component (template + logic) | 537 |
| `package.json` | Dependencies and build config | ~50 |

### Key Functions

- **`fetchButtonConfigs()`** (line 122): Fetches button configs from API once on mount
- **`evaluateCondition()`** (line 225): Evaluates visibility/disabled conditions against item data
- **`visibleButtons`** (line 272): Computed property that filters buttons by visibility condition
- **`handleButtonClick()`** (line 301): Executes button action with confirmation if needed

---

## Features

- ✅ **State-Driven Visibility**: Show/hide buttons based on item field values
- ✅ **Contextual Per Row**: Each row shows only relevant buttons, not all configurations
- ✅ **Multiple Buttons**: Assign multiple button configurations to a single field
- ✅ **Conditional Disabling**: Disable buttons based on conditions
- ✅ **9 Action Types**: Links, Webhooks, Flows, Navigation, Modules, Drawers, Create Item, Create Item Single, Review Outputs
- ✅ **Template Interpolation**: Use `{field_name}` syntax for dynamic values
- ✅ **Confirmation Dialogs**: Optional pre-action confirmations
- ✅ **Multiple Layouts**: Horizontal, Vertical, or Dropdown menu
- ✅ **Loading States**: Visual feedback during async operations
- ✅ **Toast Notifications**: Success/error messages
- 🚧 **Multi-Tenant Support**: Optional tenant isolation (planned)

## Installation

The extension is already built and ready to use. Directus will automatically load it on restart.

To restart Directus:
```bash
docker-compose restart
```

## Setup

### 1. Create the Button Configuration Collection

First, import the collection schema:

```bash
# The schema file is at: schemas/configurable_buttons.json
# Import it via Directus Settings > Data Model > Import Schema
```

Or create it manually with these fields:
- `name` (string) - Configuration name
- `button_label` (string) - Text on button
- `button_icon` (string) - Material icon name
- `button_color` (dropdown) - primary, secondary, success, warning, danger, info
- `visibility_condition` (JSON) - When to show button
- `disabled_condition` (JSON) - When to disable button
- `require_confirmation` (boolean) - Show confirm dialog
- `confirmation_message` (string) - Confirmation text
- `action_type` (dropdown) - Type of action
- `action_config` (JSON) - Action-specific settings

### 2. Create Button Configurations

Navigate to the `configurable_buttons` collection and create button configs.

**Example: "Start Processing" Button**
```json
{
  "name": "Start Processing Button",
  "button_label": "Start Processing",
  "button_icon": "play_arrow",
  "button_color": "primary",
  "visibility_condition": {
    "field": "status",
    "operator": "eq",
    "value": "pending"
  },
  "action_type": "webhook",
  "action_config": {
    "url": "https://api.example.com/start-task",
    "method": "POST",
    "payload": {
      "order_id": "{id}",
      "status": "{status}"
    },
    "success_message": "Task started successfully!",
    "error_message": "Failed to start task"
  }
}
```

**Example: "View Results" Button**
```json
{
  "name": "View Results Button",
  "button_label": "View Results",
  "button_icon": "visibility",
  "button_color": "success",
  "visibility_condition": {
    "field": "status",
    "operator": "in",
    "value": ["completed", "approved"]
  },
  "action_type": "navigate_collection",
  "action_config": {
    "collection": "task_results",
    "filters": {
      "order_id": { "_eq": "{id}" }
    },
    "layout": "tabular"
  }
}
```

### 3. Add Display to a Field

1. Go to **Settings > Data Model**
2. Select your collection (e.g., `orders`)
3. Select a field (e.g., `status`)
4. In the **Display** tab, select **Configurable Button**
5. Select button configurations to use
6. Choose layout (horizontal, vertical, dropdown)
7. Save

## Condition Syntax

Conditions evaluate against the current item's field values.

### Operators

- `eq` - Equal to
- `neq` - Not equal to
- `in` - Value in array
- `nin` - Value not in array
- `gt` - Greater than
- `gte` - Greater than or equal to
- `lt` - Less than
- `lte` - Less than or equal to
- `contains` - String contains
- `null` - Value is null
- `nnull` - Value is not null

### Single Condition
```json
{
  "field": "status",
  "operator": "eq",
  "value": "pending"
}
```

### Multiple Conditions (AND)
```json
{
  "and": [
    { "field": "status", "operator": "eq", "value": "pending" },
    { "field": "assigned_to", "operator": "nnull" }
  ]
}
```

### Multiple Conditions (OR)
```json
{
  "or": [
    { "field": "status", "operator": "eq", "value": "approved" },
    { "field": "status", "operator": "eq", "value": "completed" }
  ]
}
```

## Action Types

### 1. External Link
```json
{
  "action_type": "link",
  "action_config": {
    "url": "https://example.com/order/{id}",
    "new_tab": true
  }
}
```

### 2. Webhook
```json
{
  "action_type": "webhook",
  "action_config": {
    "url": "https://api.example.com/endpoint",
    "method": "POST",
    "payload": {
      "order_id": "{id}",
      "user": "{user_id}"
    },
    "success_message": "Success!",
    "error_message": "Failed!"
  }
}
```

### 3. Trigger Directus Flow
```json
{
  "action_type": "flow",
  "action_config": {
    "flow_id": "your-flow-uuid",
    "payload": {
      "item_id": "{id}"
    }
  }
}
```

### 4. Navigate to Collection
```json
{
  "action_type": "navigate_collection",
  "action_config": {
    "collection": "tasks",
    "filters": {
      "order_id": { "_eq": "{id}" }
    },
    "layout": "tabular"
  }
}
```

### 5. Navigate to Module
```json
{
  "action_type": "navigate_module",
  "action_config": {
    "path": "/hitl-approval/{id}"
  }
}
```

### 6. Open Drawer
```json
{
  "action_type": "open_drawer",
  "action_config": {
    "collection": "task_results",
    "item_id": "{task_result_id}",
    "mode": "view"
  }
}
```

### 7. Create Item
```json
{
  "action_type": "create_item",
  "action_config": {
    "collection": "design_outputs",
    "prefill": {
      "task_id": "{id}",
      "status": "pending"
    }
  }
}
```

### 8. Create Item Single (Prevents Duplicates)
Creates an item only if one doesn't already exist. If an item exists, navigates to the existing item instead.

```json
{
  "action_type": "create_item_single",
  "action_config": {
    "collection": "design_outputs",
    "prefill": {
      "task_id": "{id}"
    },
    "lookup_filter": {
      "task_id": { "_eq": "{id}" }
    },
    "existing_message": "Output already exists for this task"
  }
}
```

**Configuration:**
- `collection` (required): Target collection name
- `prefill` (optional): Fields to pre-fill in the create form
- `lookup_filter` (optional): Filter to check for existing items. If omitted, auto-generates from `prefill` values
- `existing_message` (optional): Message shown when item already exists (default: "Item already exists")

**Behavior:**
1. Checks if an item exists matching the `lookup_filter`
2. If exists → Shows info notification and navigates to the existing item
3. If not exists → Opens create drawer with prefilled values

### 9. Review Outputs
```json
{
  "action_type": "review_outputs",
  "action_config": {
    "collection": "design_outputs",
    "layout": "gallery",
    "filter": { "task_id": { "_eq": "{id}" } },
    "allow_edit": true,
    "allow_delete": false,
    "title": "Review Outputs"
  }
}
```

## Template Interpolation

Use `{field_name}` syntax anywhere in your configuration to insert item values:

- Button labels: `"Process Order #{id}"`
- URLs: `"https://example.com/order/{id}"`
- Payloads: `{ "order_id": "{id}", "status": "{status}" }`
- Messages: `"Are you sure you want to process order {id}?"`

## Real-World Example: Order Workflow

**Scenario**: Orders go through states: pending → processing → awaiting_approval → approved → completed

### Button 1: Start Processing
- **Visible when**: `status = "pending"`
- **Action**: Webhook to start task
- **Label**: "Start Processing"
- **Color**: Primary

### Button 2: Submit for Approval
- **Visible when**: `status = "processing"`
- **Action**: Update status + navigate to approval
- **Label**: "Submit for Approval"
- **Color**: Warning

### Button 3: Review & Approve
- **Visible when**: `status = "awaiting_approval"`
- **Action**: Open drawer with approval interface
- **Label**: "Review"
- **Color**: Warning
- **Confirmation**: Yes

### Button 4: View Results
- **Visible when**: `status IN ["approved", "completed"]`
- **Action**: Navigate to results collection
- **Label**: "View Results"
- **Color**: Success

## Troubleshooting

### Buttons not appearing
1. Check visibility conditions against item data
2. Verify button configs are selected in display options
3. Check browser console for errors

### Actions not working
1. Check action_config JSON is valid
2. Verify template interpolation fields exist on item
3. Check Network tab for API errors
4. Verify webhook URLs are accessible

### Tenant isolation
- Add `tenant_id` to button configs to restrict to specific tenants
- Ensure tenant_id field exists and is properly configured

## Development

To rebuild after making changes:

```bash
cd extensions/directus-extension-configurable-button
npm run build
# Restart Directus
docker-compose restart
```

For development with auto-reload:
```bash
npm run dev
```

## Support

For issues or questions, please refer to:
- Directus Documentation: https://docs.directus.io
- Extension Documentation: https://docs.directus.io/extensions

---

## 📝 Change Log

### 2025-12-01 - Version 1.0.1 (Critical Fix)
- 🐛 **CRITICAL FIX**: Fixed visibility filtering bug where all buttons showed on all rows
  - **Issue**: `visibleButtons` and `isButtonDisabled` used `props.item` instead of `enhancedItem`
  - **Location**: `display.vue` lines 337 and 355
  - **Root Cause**: `props.item` doesn't contain the `status` field - it's in `props.value`
  - **Solution**: Created `enhancedItem` that merges `props.item` + `props.value` for evaluation
  - **Impact**: Buttons now correctly filter based on each row's status
- ✅ **Added**: Comprehensive test suite (70+ tests)
  - `tests/bugReproduction.test.js` - Documents the bug and verifies the fix
  - `tests/evaluateCondition.test.js` - Unit tests for all condition operators
  - `tests/README.md` - Test documentation and setup instructions
- ✅ **Added**: Enhanced console logging for debugging visibility filtering
- ✅ **Added**: JSON parsing for `visibility_condition`, `disabled_condition`, `action_config` fields
- ✅ **Added**: Explicit `fields` parameter in API requests to fetch JSON fields

### 2025-12-01 - Version 1.0.0
- ✅ **Fixed**: "layout is not defined" error by adding `toRefs` for proper Vue 3 prop handling
- ✅ **Implemented**: Core display component with state-driven visibility
- ✅ **Added**: Support for 10+ button configurations per field
- ✅ **Added**: Visibility condition evaluation per row (contextual button display)
- ✅ **Added**: Template interpolation for dynamic values
- ✅ **Added**: 6 action types: link, webhook, flow, navigate_collection, navigate_module, open_drawer
- ✅ **Added**: Confirmation dialogs with custom messages
- ✅ **Added**: Multiple layout options (horizontal, vertical, dropdown)
- ✅ **Added**: Loading states and toast notifications
- 📝 **Documentation**: Added comprehensive README with technical specification
- 📝 **Documentation**: Clarified that buttons are contextual per row, not showing all configs

### Next Steps
1. ✅ **COMPLETED**: Fix visibility filtering (v1.0.1)
2. Verify each task shows different buttons based on status (user testing)
3. Optimize button labels to show full text
4. Add 2 missing visibility conditions for "View Related" and "Archive" buttons
5. Add more real-world workflow examples

---

## License

MIT
