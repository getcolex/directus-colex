# Review Module Extension

Configurable review interface for task outputs triggered by configurable buttons.

## Features

- **Gallery Layout** - Grid view for images with thumbnails, lightbox, and metadata
- **Table Layout** - Sortable table view for structured data
- **Configurable Permissions** - Control edit, delete, and create capabilities per button
- **Bulk Operations** - Approve, reject, or delete multiple items at once
- **Programmatic Filtering** - Works around Directus URL filtering limitation
- **Dynamic Fields** - Automatically detects and displays relevant fields
- **Status Management** - Visual indicators for pending, approved, and rejected items

## Installation

```bash
cd extensions/directus-extension-review-module
npm install
npm run build
```

Restart Directus after building.

## Usage

### 1. Create Button Configuration

In the `configurable_buttons` collection, create a button with `action_type: "review_outputs"`:

```json
{
  "button_label": "Review Images",
  "button_icon": "photo_library",
  "button_color": "primary",
  "action_type": "review_outputs",
  "action_config": {
    "collection": "design_directions",
    "layout": "gallery",
    "filter": {
      "task_id": { "_eq": "{id}" },
      "output_status": { "_in": ["pending", "rejected"] }
    },
    "fields": ["name", "rationale", "style_description"],
    "allow_edit": true,
    "allow_delete": true,
    "allow_create": false,
    "title": "Review Design Directions"
  }
}
```

### 2. Attach Button to Collection

Use the configurable button display extension on your tasks collection:

1. Go to Settings → Data Model → tasks
2. Add field or edit existing field
3. Choose "Configurable Button" display
4. Enter button configuration IDs: `["example-review-gallery"]`

### 3. Click Button to Review

When you click the button, it navigates to `/review?collection=...&filter=...&layout=...`

The review interface loads with:
- Filtered outputs from the specified collection
- Gallery or table layout
- Approve/reject/delete actions based on permissions
- Statistics panel showing totals

## Action Config Options

### Required Fields

- `collection` (string) - Collection name containing outputs (e.g., "design_directions")
- `layout` (string) - Layout type: "gallery" or "table"

### Optional Fields

- `filter` (object) - Directus filter object (supports `{id}` and other template variables)
- `fields` (array) - Fields to display (auto-detects if empty)
- `allow_edit` (boolean) - Enable approve/reject actions (default: true)
- `allow_delete` (boolean) - Enable delete action (default: false)
- `allow_create` (boolean) - Enable create new output (default: false)
- `title` (string) - Page title (default: "Review Outputs")

## Gallery Layout

Best for:
- Images
- Design directions
- Visual content

Features:
- Auto-detects image fields (url, image, thumbnail_url, file)
- Grid layout with responsive columns
- Lightbox on click
- Status badges
- Metadata display
- Checkbox selection

## Table Layout

Best for:
- Structured data
- Text content
- Tabular information

Features:
- Directus native v-table styling
- Sortable columns
- Row selection
- Inline actions
- Auto-generated headers from fields

## Template Variables

Use template variables in filters to reference the current item:

```json
{
  "filter": {
    "task_id": { "_eq": "{id}" },
    "user_id": { "_eq": "{user_created}" },
    "status": { "_eq": "{status}" }
  }
}
```

Supported variables:
- `{id}` - Item ID
- `{status}` - Item status
- `{field_name}` - Any field from the item

## Example Configurations

See `EXAMPLE_BUTTON_CONFIGS.json` for complete examples:

1. **Review Images (Gallery)** - Design directions with edit/delete/create
2. **Review Data (Table)** - Test outputs with edit only
3. **View All Results (Gallery)** - Read-only view of all outputs
4. **Review Inquiries (Table)** - Shipping inquiries with create capability

## Architecture

```
Configurable Button
    ↓
handleReviewOutputsAction()
    ↓
Router.push('/review?params...')
    ↓
Review Module (module.vue)
    ├── useOutputs() - Fetch data via API
    ├── useApproval() - Approve/reject/delete actions
    └── Layout Component
        ├── GalleryLayout.vue
        │   └── ImageCard.vue
        └── TableLayout.vue
```

## Troubleshooting

### Button doesn't appear
- Check visibility_condition matches item state
- Verify button config ID is in buttonConfigIds array
- Check browser console for errors

### "No collection specified" error
- Ensure `collection` is set in action_config
- Check that collection exists in Directus

### Images don't load
- Verify image field contains valid file ID or URL
- Check Directus file permissions
- Supported field names: url, image, thumbnail_url, file

### Filter doesn't work
- Template variables need curly braces: `{id}` not `id`
- Verify item has the field being referenced
- Check browser network tab for API request

### Actions don't work
- Check permissions in action_config
- Verify user has permission to update the collection
- Check that output_status field exists in collection

## Development

Watch mode for live reloading:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Requirements

- Directus 10.8.0 or higher
- Output collections must have:
  - `output_status` field (enum: pending, approved, rejected)
  - `reviewed_at` field (timestamp)
- Configurable button extension v1.1.2 or higher

## License

Same as parent project.
