# Colex Button System Bundle

Complete button system for Directus with configurable actions, webhooks, dependencies, context sync, and review workflows.

## What's Included

This bundle packages 5 extensions into a single deployment:

### 1. Configurable Button Display
**Type:** Display
**Name:** `configurable-button`

Dynamic button display component that renders action buttons based on configurable_buttons collection data.

**Features:**
- 5 action types supported:
  - `link` - Open external URL in new tab
  - `webhook` - Call external API via SSRF-protected proxy
  - `navigate_collection` - Navigate to Directus collection
  - `review_outputs` - Open HITL review module
  - `create_item_single` - Create item with pre-filled values
- Template variable interpolation (`{id}`, `{project_id}`, etc.)
- SSRF protection for webhook URLs (blocks private IPs)
- Confirmation dialogs (optional per button)
- Loading states and error handling
- Visibility and disabled conditions

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

## Action Types Reference

The configurable button display supports 5 action types. Each button must specify an `action_type` and `action_config`.

### 1. Link - Open External URL

Opens a URL in a new tab or current window.

**Configuration:**
```json
{
  "action_type": "link",
  "action_config": {
    "url": "https://example.com/report/{id}",
    "new_tab": true
  }
}
```

**Use cases:** Documentation links, external dashboards, generated reports

---

### 2. Webhook - Call External API

Makes HTTP request via SSRF-protected server-side proxy.

**Configuration:**
```json
{
  "action_type": "webhook",
  "action_config": {
    "url": "{webhook_url}",
    "method": "POST",
    "body": {
      "task_id": "{id}",
      "project_id": "{project_id}"
    }
  }
}
```

**Security:** Automatically blocks private IPs (127.0.0.0/8, 10.0.0.0/8, 169.254.0.0/16, etc.)

**Use cases:** Trigger AI/ML models, external automation, third-party APIs

---

### 3. Navigate Collection - Navigate to Directus Collection

Navigates to a collection view in Directus admin.

**Configuration:**
```json
{
  "action_type": "navigate_collection",
  "action_config": {
    "collection": "tasks",
    "filter": {
      "project_id": "{project_id}"
    }
  }
}
```

**Use cases:** View related tasks, navigate to project items, show filtered data

---

### 4. Review Outputs - Open HITL Review Module

Opens the review module to approve/reject task outputs.

**Configuration:**
```json
{
  "action_type": "review_outputs",
  "action_config": {
    "collection": "{output_collection}",
    "layout": "gallery",
    "filter": {
      "task_id": "{id}",
      "output_status": {"_in": ["pending"]}
    },
    "fields": ["thumbnail", "title", "output_status"],
    "allow_edit": true,
    "title": "Review Generated Designs"
  }
}
```

**Layouts:** `gallery` (for images), `table` (for data)

**Required:** Output collection must have `output_status` field (pending/approved/rejected)

**Use cases:** Review AI-generated content, approve designs, validate data

---

### 5. Create Item Single - Create Item with Prefill

Opens a drawer to create a new item with pre-filled values.

**Configuration:**
```json
{
  "action_type": "create_item_single",
  "action_config": {
    "collection": "{output_collection}",
    "prefill": {
      "project_id": "{project_id}",
      "task_id": "{id}",
      "status": "pending"
    }
  }
}
```

**Use cases:** Fill forms with context, create related records, initialize data

---

### Template Variables

All action configs support template variable interpolation using `{field_name}` syntax:

- `{id}` - Task ID
- `{project_id}` - Project ID
- `{name}` - Task name
- `{status}` - Task status
- `{output_collection}` - Output collection name
- `{webhook_url}` - Webhook URL
- Any other field from the task or button_context

## Docker Deployment

The bundle is mounted in docker-compose:

```yaml
volumes:
  - ../extensions/colex-button-system-bundle:/directus/extensions/colex-button-system-bundle
```

This single mount replaces 5 individual extension mounts, simplifying deployment.

## Distribution

### Creating Distribution Package

To create a distributable package for sharing or deploying to other Directus instances:

**Method 1: Using export script (recommended)**
```bash
cd extensions/colex-button-system-bundle
./export-bundle.sh
```

**Method 2: Using npm commands**
```bash
cd extensions/colex-button-system-bundle
npm run export  # Creates both .tgz and .zip
# or
npm run pack    # Creates only .tgz
```

This creates:
- `colex-button-system-bundle-1.0.0.tgz` (npm package format)
- `colex-button-system-bundle-1.0.0.zip` (zip archive format)

### What's Included in the Package

The distribution package contains only what Directus needs to run:
- ✅ `package.json` - Extension manifest with metadata
- ✅ `dist/app.js` - Frontend components (52KB)
- ✅ `dist/api.js` - Backend hooks and endpoints (6.5KB)

**NOT included** (not needed for deployment):
- ❌ `src/` - Source code
- ❌ `node_modules/` - Dependencies
- ❌ `test/` - Test files
- ❌ Development files (`.gitignore`, `tsconfig.json`, etc.)

### Installing from Package

#### Method 1: From .tgz (recommended)

```bash
# Extract package
tar -xzf colex-button-system-bundle-1.0.0.tgz

# Rename extracted folder
mv package colex-button-system-bundle

# Move to Directus extensions directory
mv colex-button-system-bundle /path/to/directus/extensions/

# Restart Directus to load the extension
cd /path/to/directus
docker-compose restart directus
```

#### Method 2: From .zip

```bash
# Extract package
unzip colex-button-system-bundle-1.0.0.zip

# Move to Directus extensions directory
mv colex-button-system-bundle /path/to/directus/extensions/

# Restart Directus
cd /path/to/directus
docker-compose restart directus
```

### Verifying Installation

After restarting Directus, check the logs to confirm the bundle loaded:

```bash
docker-compose logs directus | grep -i "colex-button-system-bundle"
```

You should see:
```
INFO: Loaded extensions: colex-button-system-bundle, ...
```

In the Directus admin UI:
- Configurable buttons will appear in task collections
- Review module will be available via button actions
- Hooks will automatically process tasks

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
