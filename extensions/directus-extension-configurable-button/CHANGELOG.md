# Changelog

All notable changes to the Configurable Button Display extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2025-12-11

### Added
- **New Action Type: `create_item_single`** - Create item only if it doesn't already exist (prevents duplicates)
  - Checks for existing items using configurable `lookup_filter` before creating
  - If item exists: Shows info notification and navigates to existing item
  - If item doesn't exist: Opens create drawer with prefilled values
  - Auto-generates lookup filter from `prefill` values if `lookup_filter` not specified
  - Useful for one-to-one relationships where each parent should have only one child entry

**Action Config Example:**
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

**Configuration Options:**
- `collection` (required): Target collection name
- `prefill` (optional): Fields to pre-fill in the create form
- `lookup_filter` (optional): Directus filter to check for existing items. If omitted, auto-generates from `prefill` values
- `existing_message` (optional): Message shown when item already exists (default: "Item already exists")

---

## [1.2.0] - 2025-12-02

### Added
- **New Action Type: `review_outputs`** - Launch configurable review interface for task outputs
  - Opens dedicated review page with gallery or table layout
  - Supports programmatic filtering (works around Directus URL limitation)
  - Configurable CRUD permissions (edit, delete, create)
  - Bulk approve/reject/delete operations
  - Statistics panel with pending/approved/rejected counts
  - Layout switcher (gallery ↔ table)
  - Works seamlessly with new Review Module extension

**Action Config Example:**
```json
{
  "action_type": "review_outputs",
  "action_config": {
    "collection": "design_directions",
    "layout": "gallery",
    "filter": {"task_id": {"_eq": "{id}"}},
    "fields": ["name", "rationale"],
    "allow_edit": true,
    "allow_delete": true,
    "allow_create": false,
    "title": "Review Design Directions"
  }
}
```

### Changed
- Version bumped to 1.2.0 (minor feature addition)

---

## [1.1.2] - 2025-12-02

### Fixed
- **Template Variable Interpolation**: Fixed `{id}` and other template variables not being replaced with actual values
  - Added `getItemWithId()` helper that fetches item ID via API when not available in props
  - Template variables like `{id}`, `{status}`, etc. now work correctly in all action configs
  - Fixed `props.field` access (was incorrectly using `props.field.field` when `props.field` is a string)

### Removed
- **Collection Filtering**: Removed filter functionality from `navigate_collection` and `open_drawer` actions
  - Research confirmed Directus 11 admin UI does NOT support URL-based filtering (platform limitation)
  - Filters in URLs are ignored by Directus collection views (confirmed by maintainers since 2021)
  - `buildDirectusFilter()` helper function removed (no longer needed)
  - Actions now navigate to collections without filter parameters

### Documentation
- Updated `ISSUE_001_ID_INTERPOLATION.md` with resolution details and Directus limitation findings
- Added comprehensive research notes on Directus filtering capabilities

---

## [1.1.1] - 2025-12-02

### Fixed
- **Navigate Collection filters**: Fixed filter query building for `navigate_collection` and `open_drawer` actions
  - Now properly flattens nested Directus filter objects (e.g., `{"task_id": {"_eq": "4"}}`)
  - Generates correct query params: `filter[task_id][_eq]=4` instead of `filter[task_id]={"_eq":"4"}`
  - "View Results" button now correctly filters task_results by task_id
- **Navigation paths**: Changed `/collections/` to `/content/` for Directus 11 compatibility

### Added
- `buildDirectusFilter()` helper function for recursive filter flattening

---

## [1.1.0] - 2025-12-02

### Added
- **Security**: URL validation for link actions to prevent XSS attacks via `javascript:` and `data:` protocols
- **Security**: SSRF protection for webhook actions - blocks internal network URLs (localhost, 192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- **Security**: HTML escaping in template interpolation to prevent XSS vulnerabilities
- **Accessibility**: ARIA attributes (`aria-label`, `aria-busy`, `role="button"`) for better screen reader support
- **Performance**: AbortController for API request cancellation when props change
- **Performance**: Memory leak fix - properly cleanup watchers and abort controllers on component unmount
- **Code Quality**: Constants for operator strings (OPERATORS.EQ, OPERATORS.NEQ, etc.)
- **Code Quality**: DRY helper function `createEnhancedItem()` to eliminate duplicated logic
- **Testing**: Production-ready test suite (23 tests) covering security, operators, and edge cases

### Changed
- **Breaking**: Webhook actions now reject internal network URLs by default (security improvement)
- **Performance**: Inline styles moved to CSS classes for better CSP compatibility
- **Code Quality**: Strict equality operators (`===`, `!==`) instead of loose equality (`==`, `!=`)
- **Code Quality**: All debug `console.log` statements removed from production code

### Fixed
- Type coercion bugs in equality operators (e.g., `"1" == 1` now correctly returns `false`)
- Memory leaks from uncleaned watchers and pending API requests
- Potential XSS vulnerabilities in template interpolation
- Potential SSRF vulnerabilities in webhook actions
- Potential tabnabbing attacks in link actions (added `window.opener = null`)

### Security Notes

⚠️ **Breaking Change**: Webhook actions now block internal network URLs. If you need to call internal webhooks (e.g., `http://localhost:3000`), you'll need to:
1. Use a different action type (e.g., Flow actions)
2. Or modify the `handleWebhookAction` function to allow specific internal URLs

This is a security-critical change to prevent Server-Side Request Forgery (SSRF) attacks.

---

## [1.0.1] - 2025-12-01

### Added
- Initial public release
- 6 action types: link, webhook, flow, navigate_collection, navigate_module, open_drawer
- State-driven visibility with 11 operators
- AND/OR logic support
- Template interpolation
- 3 layout modes
- Confirmation dialogs
- Comprehensive demo environment

### Documentation
- README.md - Complete feature documentation
- CAPABILITIES.md - Feature reference guide
- IMPLEMENTATION.md - Technical implementation details
- QUICK_START.md - Quick setup guide
- EXPORT_GUIDE.md - Export and installation instructions
- Demo setup scripts and sample data

---

## Migration Guide: 1.0.1 → 1.1.0

### For Most Users
No changes needed! The improvements are backward compatible.

### If You Use Webhook Actions
If your button configs use webhook actions that target internal URLs (e.g., `http://localhost:3001/webhook`), these will now be blocked.

**Option 1**: Use external URLs
```json
{
  "action_type": "webhook",
  "action_config": {
    "url": "https://your-external-api.com/webhook"
  }
}
```

**Option 2**: Use Flow actions instead
Create a Directus flow that calls your internal webhook, then use:
```json
{
  "action_type": "flow",
  "action_config": {
    "flow_id": "your-flow-uuid"
  }
}
```

### If You Use Custom Operator Logic
If you've extended the operator logic, update to use the new constants:
```javascript
// Before
case 'eq':
  return itemValue == value;

// After
case OPERATORS.EQ:
  return itemValue === value;
```
