# Multi-Tenancy Specification

**Version:** 2.0
**Date:** 2024-12-31
**Status:** Ready for Implementation

---

## Overview

Row-level multi-tenancy for Directus with:

- **Tenant isolation**: Users only see data from their company
- **User isolation**: Optional, via restricted role/policy
- **Tenant types**: Categories (shipping, branding) with collection visibility
- **Auto-schema**: New collections automatically get tenant fields

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PLATFORM ADMIN                          │
│                   (tenant_id = NULL)                        │
│               Sees all data, all collections                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      TENANT TYPES                           │
│                                                             │
│   shipping                      branding                    │
│   ├── shipments                 ├── campaigns               │
│   ├── carriers                  ├── brand_assets            │
│   ├── projects (shared)         ├── projects (shared)       │
│   └── tasks (shared)            └── tasks (shared)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        TENANTS                              │
│                 Acme Shipping │ Brand Co                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     USERS + POLICIES                        │
│                                                             │
│   Shipping_Tenant_Admin    │    Branding_Tenant_Admin       │
│   Shipping_Tenant_User     │    Branding_Tenant_User        │
│   Shipping_Tenant_Restricted│   Branding_Tenant_Restricted  │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### `tenant_types`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | PK. `shipping`, `branding`, `default` |
| `name` | string | Display name |
| `description` | text | Optional |
| `visible_collections` | json | Array of collection names this type can access |

**Example:**
```json
{
  "id": "shipping",
  "name": "Shipping Company",
  "visible_collections": ["shipments", "carriers", "projects", "tasks", "clients"]
}
```

### `tenants`

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid | PK |
| `name` | string | Required |
| `slug` | string | Unique, URL-safe |
| `tenant_type` | string | FK → tenant_types.id |
| `status` | enum | `active`, `suspended`, `archived` |
| `date_created` | timestamp | Auto |
| `date_updated` | timestamp | Auto |

### `directus_users` (add field)

| Field | Type | Notes |
|-------|------|-------|
| `tenant_id` | uuid | FK → tenants. **NULL = Platform Admin** |

### Auto-Added Fields (all new collections)

| Field | Type | Notes |
|-------|------|-------|
| `tenant_id` | uuid | FK → tenants |
| `user_created` | uuid | FK → directus_users, special: user-created |

---

## Roles & Policies

### Policy Naming Convention

```
{TenantType}_{RoleLevel}
```

**Examples:**
- `Shipping_Tenant_Admin`
- `Shipping_Tenant_User`
- `Shipping_Tenant_Restricted`
- `Branding_Tenant_Admin`
- `Branding_Tenant_User`
- `Branding_Tenant_Restricted`
- `Platform_Admin`

### Policy Matrix

| Policy | Collections | Row Filter |
|--------|-------------|------------|
| `Platform_Admin` | All | None (sees all) |
| `Shipping_Tenant_Admin` | Shipping + shared | `tenant_id = $CURRENT_USER.tenant_id` |
| `Shipping_Tenant_User` | Shipping + shared | `tenant_id = $CURRENT_USER.tenant_id` |
| `Shipping_Tenant_Restricted` | Shipping + shared | `tenant_id = ... AND user_created = $CURRENT_USER` |
| `Branding_Tenant_Admin` | Branding + shared | `tenant_id = $CURRENT_USER.tenant_id` |
| `Branding_Tenant_User` | Branding + shared | `tenant_id = $CURRENT_USER.tenant_id` |
| `Branding_Tenant_Restricted` | Branding + shared | `tenant_id = ... AND user_created = $CURRENT_USER` |

### Permission Filter Templates

**Tenant Admin / Tenant User:**
```json
{
  "tenant_id": { "_eq": "$CURRENT_USER.tenant_id" }
}
```

**Tenant Restricted:**
```json
{
  "_and": [
    { "tenant_id": { "_eq": "$CURRENT_USER.tenant_id" } },
    { "user_created": { "_eq": "$CURRENT_USER" } }
  ]
}
```

### Presets (Auto-populate on create)

```json
{
  "tenant_id": "$CURRENT_USER.tenant_id"
}
```

---

## Hook: `directus-hook-tenancy`

### Events

| Event | Action |
|-------|--------|
| `collections.create` | Add `tenant_id` and `user_created` fields |
| `items.create` | Auto-populate `tenant_id` if not set |
| `items.update` | Block cross-tenant mutation |
| `items.delete` | Block cross-tenant mutation |

### Skip Collections

- System: `directus_*` (except `directus_users`, `directus_files`)
- Meta: `tenants`, `tenant_types`

### Platform Admin Bypass

Skip all checks when:
- `accountability.admin === true`
- `user.tenant_id === null`

---

## Migration Script

**File:** `scripts/setup-multi-tenancy.mjs`

### Steps

1. Authenticate with Directus
2. Create `tenant_types` collection
3. Create `tenants` collection
4. Add `tenant_id` to `directus_users`
5. Seed tenant types with `visible_collections`
6. Seed default tenant
7. Create roles (one per tenant type × role level)
8. Create policies with permissions per `visible_collections`
9. Add `tenant_id`, `user_created` to existing custom collections
10. Log summary

### Usage

```bash
cd multi-tenancy

DIRECTUS_URL=http://localhost:8055 \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=yourpassword \
node scripts/setup-multi-tenancy.mjs
```

### Configuration

Script reads tenant types from config:

```javascript
const TENANT_TYPES = [
  {
    id: 'default',
    name: 'Default',
    visible_collections: ['projects', 'tasks', 'clients', 'templates']
  },
  {
    id: 'shipping',
    name: 'Shipping Company',
    visible_collections: ['projects', 'tasks', 'clients', 'shipments', 'carriers']
  },
  {
    id: 'branding',
    name: 'Branding Agency',
    visible_collections: ['projects', 'tasks', 'clients', 'campaigns', 'brand_assets']
  }
];

const ROLE_LEVELS = ['Tenant_Admin', 'Tenant_User', 'Tenant_Restricted'];
```

### Generated Policies

For each tenant type, script creates 3 policies:

```
shipping:
  ├── Shipping_Tenant_Admin (all CRUD on visible_collections)
  ├── Shipping_Tenant_User (read + limited write)
  └── Shipping_Tenant_Restricted (+ user_created filter)
```

---

## Folder Structure

```
multi-tenancy/
├── SPEC.md
├── scripts/
│   └── setup-multi-tenancy.mjs
├── extensions/
│   └── directus-hook-tenancy/
│       ├── package.json
│       └── src/
│           └── index.js
└── tests/
    ├── hook.test.js
    └── integration.test.js
```

---

## Adding a New Tenant Type

1. Add to `tenant_types` collection:
   ```json
   {
     "id": "marketing",
     "name": "Marketing Agency",
     "visible_collections": ["projects", "tasks", "campaigns", "analytics"]
   }
   ```

2. Run script to generate policies:
   ```bash
   node scripts/add-tenant-type.mjs --type=marketing
   ```

   Or manually create:
   - `Marketing_Tenant_Admin`
   - `Marketing_Tenant_User`
   - `Marketing_Tenant_Restricted`

---

## Adding a New Collection

1. Create collection in Directus (hook auto-adds tenant fields)
2. Add collection to relevant `tenant_types.visible_collections`
3. Add permissions to relevant policies

**Or:** Run helper script:
```bash
node scripts/add-collection-to-type.mjs --collection=invoices --types=shipping,branding
```

---

## Environment Variables

```env
PLATFORM_ADMIN_ROLE_ID=<uuid>  # Set after migration
```

---

## Testing Strategy

### Unit Tests (`tests/hook.test.js`)

- Adds fields on collection create
- Skips system/meta collections
- Auto-populates tenant_id on create
- Blocks cross-tenant update/delete
- Platform admin bypasses all

### Integration Tests (`tests/integration.test.js`)

- Shipping user cannot see branding collections
- Tenant A cannot see Tenant B data
- Restricted user only sees own items
- Platform admin sees all
- New collection gets tenant fields

---

## Code Reference

| Source | Use For |
|--------|---------|
| `/Users/parijat/Desktop/Directus/extensions/hooks/enforce-tenant-scope/index.js` | Hook logic |
| `/Users/parijat/Desktop/Directus/schemas/multi-tenant/tenants.json` | Collection schema |

---

## Shareable Collections (Templates Pattern)

Some collections like `templates` need platform-controlled visibility. Platform admin decides which tenants/tenant types can see each item.

### Additional Fields for Shareable Collections

| Field | Type | Notes |
|-------|------|-------|
| `visibility` | enum | `global`, `by_tenant_type`, `by_tenant`, `private` |
| `visible_to_tenant_types` | json | Array of tenant_type IDs. Used when `visibility = by_tenant_type` |
| `visible_to_tenants` | M2M | Relation to `tenants`. Used when `visibility = by_tenant` |

### Visibility Modes

| Mode | Who Sees |
|------|----------|
| `global` | All tenants |
| `by_tenant_type` | Tenants matching types in `visible_to_tenant_types` |
| `by_tenant` | Specific tenants in `visible_to_tenants` |
| `private` | Only owning tenant (standard tenant isolation) |

### Example: Template Record

```json
{
  "id": "tpl-001",
  "name": "Brand Guidelines Checklist",
  "tenant_id": null,
  "visibility": "by_tenant_type",
  "visible_to_tenant_types": ["branding", "marketing"],
  "visible_to_tenants": []
}
```

### Permission Filter for Shareable Collections

```json
{
  "_or": [
    { "visibility": { "_eq": "global" } },
    {
      "_and": [
        { "visibility": { "_eq": "by_tenant_type" } },
        { "visible_to_tenant_types": { "_contains": "$CURRENT_USER.tenant.tenant_type" } }
      ]
    },
    {
      "_and": [
        { "visibility": { "_eq": "by_tenant" } },
        { "visible_to_tenants": { "tenants_id": { "_eq": "$CURRENT_USER.tenant_id" } } }
      ]
    },
    {
      "_and": [
        { "visibility": { "_eq": "private" } },
        { "tenant_id": { "_eq": "$CURRENT_USER.tenant_id" } }
      ]
    },
    { "tenant_id": { "_eq": "$CURRENT_USER.tenant_id" } }
  ]
}
```

### UI for Platform Admin

```
┌─────────────────────────────────────────────────────────────┐
│ Template: Brand Guidelines Checklist                        │
├─────────────────────────────────────────────────────────────┤
│ Visibility: [By Tenant Type ▼]                              │
│                                                             │
│   ○ Global (all tenants see this)                          │
│   ● By Tenant Type                                         │
│   ○ Specific Tenants                                       │
│   ○ Private (owner tenant only)                            │
│                                                             │
│ Visible to types: ☑ Branding  ☑ Marketing  ☐ Shipping      │
└─────────────────────────────────────────────────────────────┘
```

### Junction Table for M2M

```yaml
templates_visible_to_tenants:
  id: integer (PK, auto)
  templates_id: uuid (FK → templates.id)
  tenants_id: uuid (FK → tenants.id)
```

### Collections Using This Pattern

- `templates`
- (future) `workflows`, `presets`, `dashboard_templates`

---

## Summary

| Component | Count |
|-----------|-------|
| New collections | 2 (`tenant_types`, `tenants`) + junction tables as needed |
| New fields | 1 on `directus_users`, 2 auto-added per collection |
| Shareable fields | 3 (`visibility`, `visible_to_tenant_types`, `visible_to_tenants`) |
| Policies | `(tenant_types × 3) + 1 platform` |
| Scripts | 1 main setup + optional helpers |
| Hook | 1 |
