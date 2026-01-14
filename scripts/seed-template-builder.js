#!/usr/bin/env node
/**
 * Seed Template Builder Templates
 *
 * Creates 4 starter templates matching the prototype:
 * - Brand Research Kit
 * - Product Descriptions
 * - Company Enrichment
 * - Content Calendar
 *
 * Usage:
 *   node scripts/seed-template-builder.js
 *
 * Environment:
 *   DIRECTUS_URL - Directus instance URL (default: http://localhost:8056)
 *   ADMIN_EMAIL - Admin email (default: admin@example.com)
 *   ADMIN_PASSWORD - Admin password (default: admin123)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8056';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const TEMPLATES = [
  {
    name: 'Brand Research Kit',
    description: 'Research competitors and analyze brand positioning',
    icon: '🔬',
    tasks: [
      {
        name: 'Competitor Analysis',
        description: 'Research top 5 competitors in the market',
        action_type: 'agent',
        tool_mode: 'research',
        needs_review: true,
      },
      {
        name: 'Brand Voice Review',
        description: 'Analyze existing brand voice and messaging',
        action_type: 'agent',
        tool_mode: 'research',
        needs_review: true,
      },
      {
        name: 'Market Positioning',
        description: 'Define market positioning based on research',
        action_type: 'agent',
        tool_mode: 'generate',
        needs_review: true,
      },
    ],
  },
  {
    name: 'Product Descriptions',
    description: 'Generate compelling product descriptions for e-commerce',
    icon: '📝',
    tasks: [
      {
        name: 'Gather Product Info',
        description: 'Collect product specifications and features',
        action_type: 'form',
        tool_mode: null,
        needs_review: false,
      },
      {
        name: 'Generate Descriptions',
        description: 'Create SEO-optimized product descriptions',
        action_type: 'agent',
        tool_mode: 'generate',
        needs_review: true,
      },
      {
        name: 'Final Review',
        description: 'Human review and approval of descriptions',
        action_type: 'review',
        tool_mode: null,
        needs_review: true,
      },
    ],
  },
  {
    name: 'Company Enrichment',
    description: 'Enrich company data with additional information',
    icon: '🏢',
    tasks: [
      {
        name: 'Scrape Company Website',
        description: 'Extract key information from company website',
        action_type: 'agent',
        tool_mode: 'scrape',
        needs_review: false,
      },
      {
        name: 'Find Social Profiles',
        description: 'Locate LinkedIn, Twitter, and other social profiles',
        action_type: 'agent',
        tool_mode: 'research',
        needs_review: false,
      },
      {
        name: 'Consolidate Data',
        description: 'Merge and format all collected data',
        action_type: 'agent',
        tool_mode: 'generate',
        needs_review: true,
      },
    ],
  },
  {
    name: 'Content Calendar',
    description: 'Plan and generate content for social media',
    icon: '📅',
    tasks: [
      {
        name: 'Research Trending Topics',
        description: 'Find trending topics in your industry',
        action_type: 'agent',
        tool_mode: 'research',
        needs_review: true,
      },
      {
        name: 'Generate Post Ideas',
        description: 'Create content ideas based on trends',
        action_type: 'agent',
        tool_mode: 'generate',
        needs_review: true,
      },
      {
        name: 'Schedule Posts',
        description: 'Review and schedule content',
        action_type: 'review',
        tool_mode: null,
        needs_review: true,
      },
    ],
  },
  {
    name: 'Tools Benchmark',
    description: 'Test all available AI tools one by one - search, scrape, images, http, calculate',
    icon: '🧪',
    tasks: [
      {
        name: 'Test Search Tool',
        description: 'Search for "best practices for API design 2024" using Exa semantic search',
        action_type: 'agent',
        tool_mode: 'research',
        needs_review: false,
      },
      {
        name: 'Test Scrape Tool',
        description: 'Scrape the website https://example.com and extract its content as markdown',
        action_type: 'agent',
        tool_mode: 'scrape',
        needs_review: false,
      },
      {
        name: 'Test Stock Images Tool',
        description: 'Find 5 stock photos of "modern office workspace" from Pexels',
        action_type: 'agent',
        tool_mode: 'generate',
        needs_review: false,
      },
      {
        name: 'Test HTTP GET Tool',
        description: 'Make an HTTP GET request to https://httpbin.org/json and show the response',
        action_type: 'agent',
        tool_mode: 'research',
        needs_review: false,
      },
      {
        name: 'Test Calculate Tool',
        description: 'Calculate the result of: (15 * 3.14159) ** 2 / 4 + 12',
        action_type: 'agent',
        tool_mode: 'research',
        needs_review: false,
      },
      {
        name: 'Benchmark Summary',
        description: 'Review all tool test results and summarize performance',
        action_type: 'review',
        tool_mode: null,
        needs_review: true,
      },
    ],
  },
];

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

async function getExistingTemplates(token) {
  const response = await fetch(`${DIRECTUS_URL}/items/tb_templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch templates: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.data || [];
}

async function createTemplate(token, template) {
  console.log(`  Creating template: ${template.name}...`);

  const response = await fetch(`${DIRECTUS_URL}/items/tb_templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(template),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create template ${template.name}: ${response.status} ${text}`);
  }

  console.log(`    ✓ ${template.name}`);
  return response.json();
}

async function seedTemplates() {
  console.log('🌱 Seeding Template Builder templates...\n');
  console.log(`Directus URL: ${DIRECTUS_URL}`);

  const token = await getToken();
  console.log('✓ Authenticated\n');

  // Check existing templates
  const existing = await getExistingTemplates(token);
  const existingNames = existing.map((t) => t.name);

  console.log(`Found ${existing.length} existing templates`);

  let created = 0;
  let skipped = 0;

  for (const template of TEMPLATES) {
    if (existingNames.includes(template.name)) {
      console.log(`  Skipping: ${template.name} (already exists)`);
      skipped++;
    } else {
      await createTemplate(token, template);
      created++;
    }
  }

  console.log(`\n✅ Seeding complete!`);
  console.log(`   Created: ${created} templates`);
  console.log(`   Skipped: ${skipped} templates (already existed)`);
}

seedTemplates().catch((err) => {
  console.error('❌ Seeding failed:', err.message);
  process.exit(1);
});
