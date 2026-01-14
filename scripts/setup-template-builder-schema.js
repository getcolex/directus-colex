#!/usr/bin/env node
/**
 * Setup Template Builder Schema
 *
 * Creates the required collections for the template builder:
 * - tb_projects: User projects
 * - tb_tasks: Tasks within projects (M2O relationship)
 * - tb_templates: Reusable workflow templates
 * - tb_outputs: Task execution results
 * - tb_conversations: AI chat history
 *
 * Usage:
 *   node scripts/setup-template-builder-schema.js
 *
 * Environment:
 *   DIRECTUS_URL - Directus instance URL (default: http://localhost:8056)
 *   ADMIN_EMAIL - Admin email (default: admin@example.com)
 *   ADMIN_PASSWORD - Admin password (default: admin123)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8056';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function getToken() {
  const response = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.data.access_token;
}

async function collectionExists(token, collection) {
  const response = await fetch(`${DIRECTUS_URL}/collections/${collection}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

async function createCollection(token, collection, meta = {}) {
  console.log(`Creating collection: ${collection}...`);

  const response = await fetch(`${DIRECTUS_URL}/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      collection,
      meta: {
        icon: meta.icon || 'folder',
        note: meta.note || '',
        ...meta,
      },
      schema: {},
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create collection ${collection}: ${response.status} ${text}`);
  }

  console.log(`  ✓ Collection ${collection} created`);
  return response.json();
}

async function createField(token, collection, field) {
  console.log(`  Adding field: ${field.field}...`);

  const response = await fetch(`${DIRECTUS_URL}/fields/${collection}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(field),
  });

  if (!response.ok) {
    const text = await response.text();
    // Ignore "already exists" errors
    if (text.includes('already exists')) {
      console.log(`    (field already exists, skipping)`);
      return;
    }
    throw new Error(`Failed to create field ${field.field}: ${response.status} ${text}`);
  }

  console.log(`    ✓ ${field.field}`);
}

async function createRelation(token, relation) {
  console.log(`Creating relation: ${relation.collection}.${relation.field} -> ${relation.related_collection}...`);

  const response = await fetch(`${DIRECTUS_URL}/relations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(relation),
  });

  if (!response.ok) {
    const text = await response.text();
    if (text.includes('already exists')) {
      console.log(`  (relation already exists, skipping)`);
      return;
    }
    throw new Error(`Failed to create relation: ${response.status} ${text}`);
  }

  console.log(`  ✓ Relation created`);
}

async function setupSchema() {
  console.log('🚀 Setting up Template Builder schema...\n');
  console.log(`Directus URL: ${DIRECTUS_URL}`);

  const token = await getToken();
  console.log('✓ Authenticated\n');

  // ===== tb_projects =====
  if (!(await collectionExists(token, 'tb_projects'))) {
    await createCollection(token, 'tb_projects', {
      icon: 'folder_special',
      note: 'User projects for the template builder',
    });

    await createField(token, 'tb_projects', {
      field: 'name',
      type: 'string',
      meta: { interface: 'input', required: true, width: 'full' },
      schema: { is_nullable: false },
    });

    await createField(token, 'tb_projects', {
      field: 'status',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Draft', value: 'draft' },
            { text: 'Active', value: 'active' },
            { text: 'Completed', value: 'completed' },
          ],
        },
        width: 'half',
      },
      schema: { default_value: 'draft' },
    });

    await createField(token, 'tb_projects', {
      field: 'description',
      type: 'text',
      meta: { interface: 'input-multiline', width: 'full' },
    });
  } else {
    console.log('Collection tb_projects already exists, skipping...\n');
  }

  // ===== tb_tasks =====
  if (!(await collectionExists(token, 'tb_tasks'))) {
    await createCollection(token, 'tb_tasks', {
      icon: 'task_alt',
      note: 'Tasks within projects',
    });

    await createField(token, 'tb_tasks', {
      field: 'name',
      type: 'string',
      meta: { interface: 'input', required: true, width: 'full' },
      schema: { is_nullable: false },
    });

    await createField(token, 'tb_tasks', {
      field: 'description',
      type: 'text',
      meta: { interface: 'input-multiline', width: 'full' },
    });

    await createField(token, 'tb_tasks', {
      field: 'action_type',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'AI Agent', value: 'agent' },
            { text: 'Form Input', value: 'form' },
            { text: 'Manual Review', value: 'review' },
          ],
        },
        width: 'half',
      },
      schema: { default_value: 'agent' },
    });

    await createField(token, 'tb_tasks', {
      field: 'tool_mode',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Research', value: 'research' },
            { text: 'Generate', value: 'generate' },
            { text: 'Scrape', value: 'scrape' },
          ],
        },
        width: 'half',
      },
    });

    await createField(token, 'tb_tasks', {
      field: 'needs_review',
      type: 'boolean',
      meta: { interface: 'boolean', width: 'half' },
      schema: { default_value: true },
    });

    await createField(token, 'tb_tasks', {
      field: 'status',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Pending', value: 'pending' },
            { text: 'Running', value: 'running' },
            { text: 'Done', value: 'done' },
          ],
        },
        width: 'half',
      },
      schema: { default_value: 'pending' },
    });

    await createField(token, 'tb_tasks', {
      field: 'sort_order',
      type: 'integer',
      meta: { interface: 'input', hidden: true },
      schema: { default_value: 0 },
    });

    // Form schema for form-type tasks (JSON array of field definitions)
    await createField(token, 'tb_tasks', {
      field: 'form_schema',
      type: 'json',
      meta: {
        interface: 'input-code',
        options: { language: 'json' },
        width: 'full',
        note: 'JSON schema for form fields. Example: [{"name":"company_name","label":"Company Name","type":"text","required":true}]',
      },
    });

    // Output type for how to display task results
    await createField(token, 'tb_tasks', {
      field: 'output_type',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Table', value: 'table' },
            { text: 'Text', value: 'text' },
            { text: 'List', value: 'list' },
            { text: 'JSON', value: 'json' },
            { text: 'Colors', value: 'colors' },
          ],
        },
        width: 'half',
        note: 'How to display task output',
      },
      schema: { default_value: 'text' },
    });

    // Output schema for defining output structure (e.g., table columns)
    await createField(token, 'tb_tasks', {
      field: 'output_schema',
      type: 'json',
      meta: {
        interface: 'input-code',
        options: { language: 'json' },
        width: 'full',
        note: 'Optional JSON schema defining output structure (e.g., table columns). Example: {"columns": [{"key": "name", "label": "Name"}, {"key": "value", "label": "Value"}]}',
      },
    });

    // Create project_id field for M2O relation (integer to match tb_projects.id)
    await createField(token, 'tb_tasks', {
      field: 'project_id',
      type: 'integer',
      meta: { interface: 'select-dropdown-m2o', width: 'half', special: ['m2o'] },
      schema: { is_nullable: true },
    });

    // Create M2O relation to projects
    await createRelation(token, {
      collection: 'tb_tasks',
      field: 'project_id',
      related_collection: 'tb_projects',
      meta: { one_field: 'tasks', sort_field: 'sort_order' },
    });
  } else {
    console.log('Collection tb_tasks already exists, skipping...\n');
  }

  // ===== tb_templates =====
  if (!(await collectionExists(token, 'tb_templates'))) {
    await createCollection(token, 'tb_templates', {
      icon: 'content_copy',
      note: 'Reusable workflow templates',
    });

    await createField(token, 'tb_templates', {
      field: 'name',
      type: 'string',
      meta: { interface: 'input', required: true, width: 'full' },
      schema: { is_nullable: false },
    });

    await createField(token, 'tb_templates', {
      field: 'description',
      type: 'text',
      meta: { interface: 'input-multiline', width: 'full' },
    });

    await createField(token, 'tb_templates', {
      field: 'icon',
      type: 'string',
      meta: { interface: 'input', width: 'half' },
      schema: { default_value: '📋' },
    });

    await createField(token, 'tb_templates', {
      field: 'tasks',
      type: 'json',
      meta: { interface: 'input-code', options: { language: 'json' }, width: 'full' },
    });
  } else {
    console.log('Collection tb_templates already exists, skipping...\n');
  }

  // ===== tb_outputs =====
  if (!(await collectionExists(token, 'tb_outputs'))) {
    await createCollection(token, 'tb_outputs', {
      icon: 'output',
      note: 'Task execution results',
    });

    // FK fields for relations (integer to match parent tables' integer ids)
    await createField(token, 'tb_outputs', {
      field: 'project_id',
      type: 'integer',
      meta: { interface: 'select-dropdown-m2o', width: 'half', special: ['m2o'] },
      schema: { is_nullable: true },
    });

    await createField(token, 'tb_outputs', {
      field: 'task_id',
      type: 'integer',
      meta: { interface: 'select-dropdown-m2o', width: 'half', special: ['m2o'] },
      schema: { is_nullable: true },
    });

    await createField(token, 'tb_outputs', {
      field: 'output_type',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Text', value: 'text' },
            { text: 'Table', value: 'table' },
            { text: 'List', value: 'list' },
            { text: 'Structured', value: 'structured' },
          ],
        },
        width: 'half',
      },
    });

    await createField(token, 'tb_outputs', {
      field: 'data',
      type: 'json',
      meta: { interface: 'input-code', options: { language: 'json' }, width: 'full' },
    });

    // Relations (these also create the FK fields)
    await createRelation(token, {
      collection: 'tb_outputs',
      field: 'project_id',
      related_collection: 'tb_projects',
      meta: { one_field: 'outputs' },
      schema: { on_delete: 'SET NULL' },
    });

    await createRelation(token, {
      collection: 'tb_outputs',
      field: 'task_id',
      related_collection: 'tb_tasks',
      meta: { one_field: 'outputs' },
      schema: { on_delete: 'SET NULL' },
    });
  } else {
    console.log('Collection tb_outputs already exists, skipping...\n');
  }

  // ===== tb_blackboard =====
  if (!(await collectionExists(token, 'tb_blackboard'))) {
    await createCollection(token, 'tb_blackboard', {
      icon: 'dashboard',
      note: 'Shared knowledge space for data flow between tasks (Blackboard Architecture)',
    });

    // FK field for relation (integer to match tb_projects.id)
    await createField(token, 'tb_blackboard', {
      field: 'project_id',
      type: 'integer',
      meta: { interface: 'select-dropdown-m2o', width: 'half', special: ['m2o'] },
      schema: { is_nullable: false, is_unique: true }, // One blackboard per project
    });

    // Entries: Record<string, BlackboardEntry>
    await createField(token, 'tb_blackboard', {
      field: 'entries',
      type: 'json',
      meta: {
        interface: 'input-code',
        options: { language: 'json' },
        width: 'full',
        note: 'Key-value store of BlackboardEntry objects',
      },
      schema: { default_value: '{}' },
    });

    // Conflicts: Conflict[]
    await createField(token, 'tb_blackboard', {
      field: 'conflicts',
      type: 'json',
      meta: {
        interface: 'input-code',
        options: { language: 'json' },
        width: 'full',
        note: 'Array of pending/resolved conflicts',
      },
      schema: { default_value: '[]' },
    });

    // Create M2O relation to projects
    await createRelation(token, {
      collection: 'tb_blackboard',
      field: 'project_id',
      related_collection: 'tb_projects',
      meta: { one_field: 'blackboard' },
      schema: { on_delete: 'CASCADE' }, // Delete blackboard when project deleted
    });
  } else {
    console.log('Collection tb_blackboard already exists, skipping...\n');
  }

  // ===== tb_conversations =====
  if (!(await collectionExists(token, 'tb_conversations'))) {
    await createCollection(token, 'tb_conversations', {
      icon: 'chat',
      note: 'AI chat history per project',
    });

    // FK field for relation (integer to match tb_projects.id)
    await createField(token, 'tb_conversations', {
      field: 'project_id',
      type: 'integer',
      meta: { interface: 'select-dropdown-m2o', width: 'half', special: ['m2o'] },
      schema: { is_nullable: true },
    });

    await createField(token, 'tb_conversations', {
      field: 'messages',
      type: 'json',
      meta: { interface: 'input-code', options: { language: 'json' }, width: 'full' },
    });

    await createRelation(token, {
      collection: 'tb_conversations',
      field: 'project_id',
      related_collection: 'tb_projects',
      meta: { one_field: 'conversations' },
      schema: { on_delete: 'SET NULL' },
    });
  } else {
    console.log('Collection tb_conversations already exists, skipping...\n');
  }

  console.log('\n✅ Schema setup complete!');
  console.log('\nCollections created:');
  console.log('  - tb_projects');
  console.log('  - tb_tasks (M2O → tb_projects)');
  console.log('  - tb_templates');
  console.log('  - tb_outputs (M2O → tb_projects, tb_tasks)');
  console.log('  - tb_blackboard (M2O → tb_projects, unique per project)');
  console.log('  - tb_conversations (M2O → tb_projects)');
}

setupSchema().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
