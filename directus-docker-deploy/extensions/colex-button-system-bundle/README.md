# Colex Button System Bundle

Complete button system for Directus with configurable actions, webhooks, dependencies, context sync, and review workflows.

## What's Included

This bundle packages 5 extensions into a single deployment:

### 1. Configurable Button Display
**Type:** Display
**Name:** `configurable-button`

Dynamic button display component that renders action buttons based on configurable_buttons collection data.

**Features:**
- Multiple action types: flow, webhook, link, navigate, create_item, review_outputs
- Template variable interpolation from button_context
- SSRF protection for webhook URLs
- Webhook tracking (status, response, errors)
- Loading states and error handling

### 2. Populate Button Context Hook
**Type:** Hook
**Name:** `populate-button-context`

Automatically syncs task fields to button_context JSON field for button display.

**Features:**
- Auto-populates on create/update
- Syncs: status, project_id, action_type, action_config, output_collection, etc.
- Supports tasks and shipping_tasks collections
- Handles JSON field parsing

### 3. Task Dependency Hook
**Type:** Hook
**Name:** `task-dependency-v2`

Automatically updates dependent tasks to 'ready' when all dependencies complete.

**Features:**
- Watches for tasks marked as 'done'
- Resolves dependencies by task name
- Updates dependent tasks from 'new' to 'ready'
- Supports tasks and shipping_tasks collections

### 4. Webhook Proxy Endpoint
**Type:** Endpoint
**Name:** `webhook-proxy`

Server-side webhook proxy to bypass CORS restrictions.

**Features:**
- Server-side execution (no browser CORS issues)
- SSRF protection (blocks private IPs, localhost, link-local)
- 30-second timeout with AbortController
- Full response passthrough (status, headers, body)
- Audit logging

### 5. Review Module
**Type:** Module
**Name:** `review-module`

Configurable review interface for task outputs.

**Features:**
- Gallery layout for images
- Table layout for structured data
- Form layout for creating outputs
- Bulk approve/reject/delete actions
- Hidden from sidebar (accessed via buttons)

## Installation

### Development

```bash
cd extensions/colex-button-system-bundle
npm install
npm run dev  # Watch mode with auto-rebuild
```

### Production

```bash
cd extensions/colex-button-system-bundle
npm install
npm run build
```

The bundle builds to:
- `dist/app.js` (~52K) - Frontend components
- `dist/api.js` (~6K) - Backend hooks and endpoints

## Docker Deployment

The bundle is mounted in docker-compose:

```yaml
volumes:
  - ../extensions/colex-button-system-bundle:/directus/extensions/colex-button-system-bundle
```

This single mount replaces 5 individual extension mounts, simplifying deployment.

## Benefits Over Individual Extensions

✅ **Simpler deployment** - One bundle vs 5 separate extensions
✅ **Shared dependencies** - Reduced duplication
✅ **Atomic updates** - All components update together
✅ **Easier versioning** - Single version number
✅ **Faster builds** - Build once instead of 5 times

## Rebuilding After Changes

```bash
npm run build
docker-compose restart directus  # or docker compose restart directus
```

## Source Structure

```
src/
├── configurable-button/
│   ├── index.ts
│   └── display.vue
├── populate-button-context/
│   └── index.js
├── task-dependency-v2/
│   └── index.js
├── webhook-proxy/
│   └── index.js
└── review-module/
    ├── index.ts
    ├── module.vue
    ├── components/
    ├── composables/
    └── layouts/
```

## Version

1.0.0

## Host Requirement

Directus ^11.0.0
