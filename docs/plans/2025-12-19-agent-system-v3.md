# Agent Orchestration System v3 - Template-Based Architecture

**Date**: December 19, 2025
**Status**: Phase 1 Complete, Architecture Revised
**Timeline**: 10-12 days across 4 phases

---

## Executive Summary

Production-ready agent orchestration platform that enables rapid agent creation through templates while maintaining production-grade reliability.

**Vision**: Directus becomes an agent creation platform - define agents in a few words, test easily, deploy fast.

**Key Architectural Decisions** (from brainstorming session):
1. ✅ Template-based development with local testing
2. ✅ Schema contracts owned by agents (not orchestrator)
3. ✅ Two-dimensional classification system
4. ✅ Firecrawl for web scraping
5. ✅ n8n integration for complex workflows

---

## Two-Dimensional Classification System

### Dimension 1: Directus Integration (Fixed - 3 Types)

**Where/when the agent runs in Directus:**

| Type | Trigger | UI Location | Payload |
|------|---------|-------------|---------|
| **Task Agent** | Task action_type | Task detail page "Run" button | Task data + project context |
| **Enrichment Agent** | Manual button | Item detail page "Enrich" button | Item data from collection |
| **Cron Agent** | Schedule or manual | Agent registry "Run Now" button | Minimal (agent config only) |

**Stored in**: `agent_registry.agent_type` field

**Purpose**: Determines orchestrator routing and UI integration

---

### Dimension 2: Implementation Pattern (Flexible - Many Templates)

**How the agent actually works internally:**

| Template | Purpose | Dependencies | Use Case |
|----------|---------|--------------|----------|
| **web-scraper** | Extract data from websites | Firecrawl + Claude | Company research, lead enrichment |
| **search-enricher** | Search APIs + LLM extraction | Exa/Google + Claude | Market research, news monitoring |
| **api-caller** | External API + transformation | HTTP client + Claude | CRM sync, data validation |
| **data-transformer** | Pure LLM processing | Claude only | Text summarization, categorization |

**Stored in**: `agent_registry.template_type` field (optional metadata)

**Purpose**: Determines agent implementation, but all templates follow same contract

---

## Architecture Principles (Informed by Research)

### 1. Schema Contract Pattern (Avoids "God Service" Anti-Pattern)

**Problem**: Orchestrator with field mapping = tight coupling, schema drift hell
**Solution**: Agents own their schema contracts

**Agent declares contract** (`config/schema.yaml`):
```yaml
version: "1.0.0"
name: "company-scraper"
type: "task"

input:
  directus_fields:
    - name: source_url        # Directus field name
      maps_to: website        # Agent's internal variable
      type: url
      required: true
    - name: company_name
      maps_to: companyName
      type: string
      required: false

output:
  directus_collection: scraped_companies
  fields:
    - name: funding_round     # Directus field
      from: funding           # Agent's internal variable
      type: string
    - name: employee_count
      from: teamSize
      type: integer

dependencies:
  - firecrawl: "^1.0.0"
  - anthropic: "^0.20.0"
```

**Orchestrator is dumb** (just validates and routes):
```javascript
// 1. GET agent's schema contract
const schema = await fetch(`${agent.endpoint_url}/schema`);

// 2. Validate Directus data has required fields
validateSchema(directusItem, schema.input);

// 3. Call agent with raw Directus data (NO MAPPING)
const result = await agent.execute({
  directus_item: directusItem,
  context: { item_id, collection, tenant_id }
});

// 4. Validate output
validateSchema(result, schema.output);
```

**Benefits**:
- Single owner: Agent owns mapping logic
- Version controlled: Schema lives with agent code
- Fail fast: Runtime validation catches mismatches
- Self-documenting: New devs read schema to understand agent

**Sources**: [Microsoft Microservices Anti-patterns](https://www.infoq.com/articles/seven-uservices-antipatterns/), [Orchestration Saga Pattern](https://medium.com/gett-engineering/architectural-patterns-orchestration-saga-0d03894ce9e8)

### 2. Template-Based Development (Cookiecutter Pattern)

**Every template includes**:
- `config/schema.yaml` - Schema contract
- `src/agent.js` - Main logic with TODOs
- `src/lib/schema.js` - Validation/mapping helpers
- `test/local-test.js` - Local testing harness
- `scripts/deploy.js` - Auto-registration in Directus
- `README.md` - Template-specific guide

**Developer workflow**:
```bash
# 1. Generate from template
npx create-directus-agent my-scraper --template web-scraper --type task

# 2. Edit src/agent.js (customize logic)
# 3. Test locally
npm run test:local -- --item-id 123

# 4. Deploy & register
npm run deploy  # Builds, registers in agent_registry, starts service
```

**Sources**: [Cookiecutter Django](https://github.com/cookiecutter/cookiecutter-django), [Google's Context-Aware Framework](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)

### 3. Technology Stack (Based on 2025 Production Patterns)

**Core Stack**:
- **Directus 11.12.0** - Agent management platform
- **PostgreSQL** - Data layer
- **Node.js/TypeScript** - Agent runtime
- **Docker** - Deployment

**Agent Implementation**:
- **Firecrawl API** - Web scraping (42.7K stars, Y Combinator)
  - Handles anti-bot, JS rendering, proxies automatically
  - Returns LLM-ready markdown
  - `/agent` endpoint for complex navigation
- **Anthropic Claude** - LLM processing (direct SDK, no framework)
- **Exa/Google Search API** - Search capabilities

**Complex Workflows**:
- **n8n** - For multi-app workflows (email, CRM, etc.)
  - Register n8n workflows as agents in Directus
  - 4,991+ community templates
  - Visual builder + code when needed

**Observability**:
- **OpenTelemetry traces** - Trace IDs for debugging
- **Circuit breakers** - Prevent cascading failures
- **Cost tracking** - LLM tokens → USD

**Why NOT LangGraph/CrewAI**:
- Simple agents don't need heavy frameworks
- Direct Claude SDK for tool calling when needed
- Avoid framework lock-in
- Easier to debug and maintain

**Sources**: [Firecrawl](https://github.com/firecrawl/firecrawl), [n8n AI Workflows](https://n8n.io/workflows/categories/ai/), [AI Agent Framework Comparison](https://blog.n8n.io/ai-agent-frameworks/)

---

## Phase 1: Resilient Foundation ✅ COMPLETE

### What Was Built (Dec 18-19, 2025)

**1. Enhanced Collections**:
- ✅ `agent_registry` - Health checks, circuit breakers, cost tracking
- ✅ `agent_runs` - Trace IDs, tokens, cost, quality scores
- ✅ `enrichment_history` - Field-level versioning with rollback

**2. Orchestrator Extension** (`directus-extension-endpoint-orchestrator`):
- ✅ Circuit breakers (CLOSED/OPEN/HALF_OPEN)
- ✅ Exponential backoff retries (3 attempts, jitter)
- ✅ Health check routing
- ✅ Cost tracking (tokens → USD)
- ✅ Incremental enrichment (7-day window)
- ✅ Output validation
- ✅ Trace IDs (OpenTelemetry pattern)

**3. Endpoints**:
- ✅ `GET /orchestrator/health` - Health check
- ✅ `POST /orchestrator/execute` - Execute agent
- ✅ `POST /orchestrator/enrichment/rollback` - Rollback enrichments

**4. Testing Results**:
```bash
$ curl http://localhost:8055/orchestrator/health
{"status":"healthy","service":"orchestrator","version":"2.0.0"}
```

**Status**: Production-ready orchestrator with industry-standard resilience patterns.

---

## Phase 2: Agent Template System (3-4 days)

### Deliverables

1. **Template Repository** (`/agent-templates/`)
2. **Template CLI** (`create-directus-agent`)
3. **Web Scraper Template** (complete example)
4. **Schema Validation Library**
5. **Local Testing Harness**
6. **Deployment Automation**

### Template Repository Structure

```
/agent-templates/
  base/
    package.json.template
    src/
      lib/
        schema.js              # Schema validation/mapping
        directus-client.js     # Directus API client
        logger.js              # Structured logging
    test/
      local-test.js            # Local testing harness
    scripts/
      deploy.js                # Register in Directus
      start.js                 # Production server
    docker/
      Dockerfile
      docker-compose.yml

  web-scraper/
    config/
      schema.yaml              # Schema contract
      firecrawl.yaml           # Firecrawl settings
    src/
      agent.js                 # Main logic
      scraper.js               # Firecrawl integration
    examples/
      test-data.json           # Example Directus items
      expected-output.json     # Example results
    README.md

  search-enricher/
    config/
      schema.yaml
      search.yaml              # Exa/Google settings
    src/
      agent.js
      searcher.js
    examples/
      ...

  api-caller/
    config/
      schema.yaml
    src/
      agent.js
      api-client.js
    examples/
      ...
```

### Template CLI (`npx create-directus-agent`)

**Usage**:
```bash
npx create-directus-agent <agent-name> --template <template> --type <type>

# Examples:
npx create-directus-agent company-scraper --template web-scraper --type task
npx create-directus-agent daily-weather --template api-caller --type cron
npx create-directus-agent lead-enricher --template search-enricher --type enrichment
```

**What it generates**:
```
/agent-company-scraper/
  config/
    schema.yaml               # Pre-filled from template
  src/
    agent.js                  # With TODO comments
    lib/                      # Copied from base/
  test/
    local-test.js
  scripts/
    deploy.js
  .env.example
  package.json
  README.md                   # Template-specific instructions
```

### Web Scraper Template (`web-scraper`)

**config/schema.yaml**:
```yaml
version: "1.0.0"
name: "company-scraper"
type: "task"

input:
  directus_fields:
    - name: source_url
      maps_to: website
      type: url
      required: true
      validation:
        - not_empty
        - valid_url
    - name: company_name
      maps_to: companyName
      type: string
      required: false
      default: "Unknown Company"

output:
  directus_collection: scraped_companies
  fields:
    - name: funding_round
      from: funding
      type: string
    - name: employee_count
      from: teamSize
      type: integer
      validation:
        - min: 0
    - name: tech_stack
      from: technologies
      type: json

dependencies:
  firecrawl:
    version: "^1.0.0"
    api_key_env: FIRECRAWL_API_KEY
  anthropic:
    version: "^0.20.0"
    api_key_env: ANTHROPIC_API_KEY

config:
  max_scrape_depth: 2
  llm_model: "claude-3-5-sonnet-20241022"
  timeout_seconds: 120
  cost_limit_usd: 0.50
```

**src/agent.js** (template with TODOs):
```javascript
import Firecrawl from 'firecrawl';
import Anthropic from '@anthropic-ai/sdk';
import { loadSchema, validateInput, mapToInternal, mapToDirectus } from './lib/schema.js';
import { logger } from './lib/logger.js';

const SCHEMA = loadSchema('../config/schema.yaml');
const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Main agent execution function
 *
 * @param {Object} payload - From orchestrator
 * @param {Object} payload.directus_item - Raw Directus item data
 * @param {Object} payload.context - Item ID, collection, tenant
 * @returns {Object} - { success, items_created, enriched_fields }
 */
export async function execute(payload) {
  const { directus_item, context } = payload;

  // 1. Validate input against schema
  const validation = validateInput(directus_item, SCHEMA.input);
  if (!validation.valid) {
    throw new ValidationError(validation.errors);
  }

  // 2. Map Directus fields → internal format
  const internal = mapToInternal(directus_item, SCHEMA.input);
  // internal = { website: "https://...", companyName: "Acme" }

  logger.info('Scraping website', {
    website: internal.website,
    trace_id: context.trace_id
  });

  // 3. TODO: Customize this logic for your use case
  const scraped = await scrapeWebsite(internal.website);
  const extracted = await extractWithLLM(scraped, internal.companyName);

  // 4. Map internal format → Directus fields
  const output = mapToDirectus(extracted, SCHEMA.output);
  // output = { funding_round: "Series A", employee_count: 50, tech_stack: [...] }

  return {
    success: true,
    items_created: 1,
    enriched_fields: output,
    tokens_used: extracted.usage.total_tokens,
    confidence_score: extracted.confidence
  };
}

/**
 * TODO: Customize scraping logic
 */
async function scrapeWebsite(url) {
  const result = await firecrawl.scrapeUrl(url, {
    formats: ['markdown', 'html'],
    onlyMainContent: true
  });

  return result.markdown;
}

/**
 * TODO: Customize extraction prompt
 */
async function extractWithLLM(markdown, companyName) {
  const message = await anthropic.messages.create({
    model: SCHEMA.config.llm_model,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Extract company information from this website:

Company: ${companyName}

Website content:
${markdown}

Return JSON with these fields:
{
  "funding": "Latest funding round (e.g., 'Series A, $5M') or null",
  "teamSize": "Approximate employee count (integer) or null",
  "technologies": ["Technology 1", "Technology 2", ...] or [],
  "confidence": 0.0-1.0 (how confident are you in this data)
}
`
    }]
  });

  const json = extractJSON(message.content[0].text);

  return {
    ...json,
    usage: message.usage
  };
}

/**
 * Schema endpoint (required by orchestrator)
 */
export function getSchema() {
  return SCHEMA;
}
```

**test/local-test.js**:
```javascript
import { execute, getSchema } from '../src/agent.js';

// Mock Directus item (from your actual collection)
const mockItem = {
  id: "123",
  source_url: "https://anthropic.com",
  company_name: "Anthropic",
  tenant_id: "xyz"
};

const mockContext = {
  item_id: "123",
  collection: "companies",
  tenant_id: "xyz",
  trace_id: "local-test-" + Date.now()
};

async function test() {
  console.log('Testing agent with mock data...\n');

  console.log('Schema:', JSON.stringify(getSchema(), null, 2));
  console.log('\nInput:', JSON.stringify(mockItem, null, 2));

  try {
    const result = await execute({
      directus_item: mockItem,
      context: mockContext
    });

    console.log('\n✅ Success!');
    console.log('Output:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
```

**scripts/deploy.js**:
```javascript
#!/usr/bin/env node
import { DirectusClient } from './lib/directus-client.js';
import { loadSchema } from './lib/schema.js';

const SCHEMA = loadSchema('./config/schema.yaml');
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const AGENT_PORT = process.env.PORT || 3001;

async function deploy() {
  const client = new DirectusClient(DIRECTUS_URL);

  console.log('📦 Deploying agent to Directus...\n');

  // 1. Check if agent already registered
  const existing = await client.findAgent(SCHEMA.name);

  const agentData = {
    name: SCHEMA.name,
    agent_type: SCHEMA.type,
    endpoint_url: `http://localhost:${AGENT_PORT}/execute`,
    version: SCHEMA.version,
    enabled: true,
    template_type: 'web-scraper',
    max_retries: 3,
    timeout_seconds: SCHEMA.config.timeout_seconds
  };

  if (existing) {
    console.log(`✓ Updating existing agent: ${SCHEMA.name}`);
    await client.updateAgent(existing.id, agentData);
  } else {
    console.log(`✓ Registering new agent: ${SCHEMA.name}`);
    await client.createAgent(agentData);
  }

  console.log(`\n✅ Agent deployed successfully!`);
  console.log(`\nNext steps:`);
  console.log(`  1. Start agent: npm start`);
  console.log(`  2. Test in Directus: http://localhost:8055/admin`);
}

deploy().catch(console.error);
```

### Schema Validation Library (`src/lib/schema.js`)

**Generated in every template**:
```javascript
import yaml from 'js-yaml';
import fs from 'fs';

export function loadSchema(path) {
  return yaml.load(fs.readFileSync(path, 'utf8'));
}

export function validateInput(data, schemaInput) {
  const errors = [];

  for (const field of schemaInput.directus_fields) {
    const value = data[field.name];

    // Check required
    if (field.required && (value === null || value === undefined || value === '')) {
      errors.push(`Required field missing: ${field.name}`);
    }

    // Type validation
    if (value !== null && value !== undefined) {
      if (field.type === 'url' && !isValidURL(value)) {
        errors.push(`Invalid URL: ${field.name}`);
      }
      if (field.type === 'integer' && !Number.isInteger(value)) {
        errors.push(`Invalid integer: ${field.name}`);
      }
    }

    // Custom validations
    if (field.validation) {
      for (const rule of field.validation) {
        if (rule === 'not_empty' && (!value || value.trim() === '')) {
          errors.push(`Field cannot be empty: ${field.name}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function mapToInternal(directusData, schemaInput) {
  const internal = {};

  for (const field of schemaInput.directus_fields) {
    const value = directusData[field.name];
    const internalName = field.maps_to;

    internal[internalName] = value !== undefined ? value : field.default;
  }

  return internal;
}

export function mapToDirectus(internalData, schemaOutput) {
  const directus = {};

  for (const field of schemaOutput.fields) {
    const value = internalData[field.from];

    if (value !== undefined) {
      directus[field.name] = value;
    }
  }

  return directus;
}

function isValidURL(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}
```

### Testing Phase 2

**1. Create agent from template**:
```bash
cd /Users/parijat/Documents/colex
npx create-directus-agent company-scraper --template web-scraper --type task
cd agent-company-scraper
npm install
```

**2. Test locally**:
```bash
npm run test:local

# Should output:
# Testing agent with mock data...
# Schema: { ... }
# Input: { source_url: "https://anthropic.com", ... }
# ✅ Success!
# Output: { success: true, enriched_fields: { ... } }
```

**3. Deploy to Directus**:
```bash
npm run deploy

# Should output:
# ✓ Registering new agent: company-scraper
# ✅ Agent deployed successfully!
```

**4. Start agent**:
```bash
npm start

# Agent running on http://localhost:3001
# GET /schema - Returns schema contract
# POST /execute - Executes agent
# GET /health - Health check
```

**5. Test from Directus**:
- Create task with `action_type: "scrape_company"`
- Click "Run Task"
- Orchestrator calls agent
- Verify results in `scraped_companies` collection

### Success Criteria

- [ ] CLI generates working agent from template
- [ ] Local testing works without Directus
- [ ] Schema validation catches errors
- [ ] Agent registers in Directus automatically
- [ ] Orchestrator calls agent successfully
- [ ] Results appear in output collection
- [ ] Can customize agent logic easily

---

## Phase 3: Additional Templates & n8n Integration (2-3 days)

### Deliverables

1. **Search Enricher Template**
2. **API Caller Template**
3. **n8n Workflow Registration**
4. **Template Gallery in Directus**

### Search Enricher Template

**Use case**: Enrich companies using web search + LLM

**config/schema.yaml**:
```yaml
input:
  directus_fields:
    - name: company_name
      maps_to: companyName
      type: string
      required: true

output:
  directus_collection: companies
  fields:
    - name: industry
      from: industry
      type: string
    - name: founded_year
      from: foundedYear
      type: integer

dependencies:
  exa:
    version: "^1.0.0"
    api_key_env: EXA_API_KEY
  anthropic:
    version: "^0.20.0"
```

**src/agent.js** (simplified):
```javascript
async function execute(payload) {
  const internal = mapToInternal(payload.directus_item, SCHEMA.input);

  // Search for company info
  const searchResults = await exa.search(`${internal.companyName} company info`, {
    numResults: 5,
    contents: { text: true }
  });

  // Extract with LLM
  const extracted = await extractWithLLM(searchResults, internal.companyName);

  return {
    success: true,
    items_updated: 1,
    enriched_fields: mapToDirectus(extracted, SCHEMA.output)
  };
}
```

### n8n Workflow Registration

**Pattern**: Register n8n workflows as agents in Directus

**agent_registry record**:
```javascript
{
  name: "email-nurture-campaign",
  agent_type: "cron",  // Scheduled via n8n
  endpoint_url: "http://n8n:5678/webhook/nurture-campaign",
  template_type: "n8n-workflow",
  enabled: true,

  // n8n-specific metadata
  n8n_workflow_id: "abc123",
  n8n_webhook_path: "/webhook/nurture-campaign"
}
```

**Orchestrator calls n8n**:
```javascript
// POST /orchestrator/execute
{
  "agent_type": "cron",
  "agent_id": "<n8n-workflow-agent-id>",
  "scheduled_trigger": true
}

// Orchestrator → POST http://n8n:5678/webhook/nurture-campaign
// n8n executes complex workflow (email, CRM, Slack, etc.)
// n8n returns: { success: true, emails_sent: 50 }
```

**Benefits**:
- n8n workflows appear in Directus agent registry
- Unified monitoring (all agent runs in `agent_runs`)
- Consistent triggering (Directus Flow or manual)
- Simple agents in code, complex workflows in n8n

### Template Gallery (Directus UI Enhancement)

**Future enhancement** (not Phase 3):
- Directus admin UI shows available templates
- "Create Agent" wizard
- Preview template code before generating
- One-click deploy from gallery

---

## Phase 4: Production Readiness (2-3 days)

### Deliverables

1. **Monitoring Dashboard**
2. **Cost Controls**
3. **Multi-Tenant Testing**
4. **Documentation**
5. **GitHub Repo Setup**

### Monitoring Dashboard (Directus Insights)

**Widgets**:
1. Agent success rate (pie chart)
   - SQL: `SELECT status, COUNT(*) FROM agent_runs GROUP BY status`
2. Runs by agent (bar chart)
3. Failed runs (table with trace IDs)
4. Total cost last 24h (metric)
5. Most expensive agents (table)

### Cost Controls

**Template includes cost limiting**:
```javascript
// src/agent.js
const COST_LIMIT = SCHEMA.config.cost_limit_usd || 1.0;

async function execute(payload) {
  // ... scraping ...

  const estimatedCost = estimateTokenCost(markdown.length);

  if (estimatedCost > COST_LIMIT) {
    throw new CostLimitError(
      `Estimated cost $${estimatedCost} exceeds limit $${COST_LIMIT}`
    );
  }

  // ... continue with LLM call ...
}
```

**Registry-level limits**:
```javascript
// agent_registry
{
  max_cost_per_run_usd: 0.50,  // Kill run if exceeded
  daily_cost_limit_usd: 10.00  // Disable agent if exceeded
}
```

### Multi-Tenant Testing

**Test cases**:
1. Tenant A creates agent → Tenant B cannot see it
2. Agent runs only process tenant A's data
3. `agent_runs` filtered by tenant_id
4. Cost tracking per tenant

### Documentation

**Create**:
1. `README.md` - Quick start guide
2. `TEMPLATES.md` - Available templates
3. `DEPLOYMENT.md` - Production deployment
4. `TROUBLESHOOTING.md` - Common issues
5. `CONTRIBUTING.md` - How to add templates

### GitHub Repo Setup

**Repository structure**:
```
/colex-agent-system/
  templates/              # Agent templates
  packages/
    create-agent/         # CLI
    schema-validator/     # Shared lib
  examples/
    company-scraper/      # Full example
    weather-collector/
  docs/
  tests/
```

**Publishing**:
```bash
# Publish CLI to npm
cd packages/create-agent
npm publish

# Users can then:
npx @colex/create-agent my-agent --template web-scraper
```

---

## Testing Strategy (Cross-Phase)

### Unit Tests (Per Template)

**test/agent.test.js**:
```javascript
import { describe, it, expect } from 'vitest';
import { execute, getSchema } from '../src/agent.js';

describe('Web Scraper Agent', () => {
  it('validates required fields', async () => {
    const payload = {
      directus_item: { company_name: "Test" },  // Missing source_url
      context: { item_id: "1" }
    };

    await expect(execute(payload)).rejects.toThrow('Required field missing: source_url');
  });

  it('maps Directus fields correctly', async () => {
    const payload = {
      directus_item: {
        source_url: "https://test.com",
        company_name: "Test Co"
      },
      context: { item_id: "1" }
    };

    const result = await execute(payload);

    expect(result.success).toBe(true);
    expect(result.enriched_fields).toHaveProperty('funding_round');
  });
});
```

### Integration Tests (Orchestrator)

**tests/orchestrator-integration.test.js**:
```javascript
describe('Orchestrator → Agent Integration', () => {
  it('calls agent and validates output', async () => {
    // 1. Start test agent server
    const agent = await startTestAgent();

    // 2. Register in agent_registry
    await registerAgent({
      name: "test-agent",
      endpoint_url: agent.url
    });

    // 3. Call orchestrator
    const response = await POST('/orchestrator/execute', {
      agent_type: "task",
      action_type: "test-action"
    });

    expect(response.success).toBe(true);

    // 4. Verify agent_run created
    const run = await db.agent_runs.findOne({ id: response.run_id });
    expect(run.status).toBe('success');

    // 5. Cleanup
    await agent.stop();
  });
});
```

### Local Development Testing

**Developer workflow**:
```bash
# 1. Create agent
npx create-directus-agent my-agent --template web-scraper

# 2. Edit src/agent.js
# 3. Test locally (no Directus needed)
npm run test:local

# 4. Run unit tests
npm test

# 5. Deploy to local Directus
npm run deploy

# 6. Start agent
npm start

# 7. Test via Directus UI or curl
curl -X POST http://localhost:8055/orchestrator/execute \
  -H "Content-Type: application/json" \
  -d '{"agent_type": "task", "action_type": "my-action"}'
```

---

## Deployment Guide

### Local Development (Docker Compose)

**docker-compose.yml** (add to Directus setup):
```yaml
services:
  # ... existing directus, postgres ...

  agent-company-scraper:
    build: ./agents/company-scraper
    environment:
      - FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - DIRECTUS_URL=http://directus:8055
    networks:
      - directus_dev
```

### Production Deployment

**Options**:

**Option A: Same server as Directus**
- Agents run as systemd services
- nginx proxy routes to agents
- Simplest for small scale

**Option B: Separate containers**
- Each agent in Docker container
- Orchestrated with Docker Compose or Kubernetes
- Better isolation, easier scaling

**Option C: Serverless (advanced)**
- Agents as AWS Lambda/Google Cloud Functions
- agent_registry stores function ARNs
- Cost-effective for sporadic usage

---

## Success Criteria (Overall)

### Phase 2 (Templates)
- [ ] CLI generates working agents
- [ ] Local testing without Directus works
- [ ] Schema validation prevents errors
- [ ] Auto-deployment to Directus works
- [ ] Web scraper template complete

### Phase 3 (Additional Templates)
- [ ] Search enricher template works
- [ ] API caller template works
- [ ] n8n workflows register as agents
- [ ] All templates tested end-to-end

### Phase 4 (Production)
- [ ] Monitoring dashboard shows metrics
- [ ] Cost limits prevent runaway costs
- [ ] Multi-tenant isolation verified
- [ ] Documentation complete
- [ ] GitHub repo published

---

## Key Architectural Benefits

**For Developers**:
- ✅ Create agent in minutes (not days)
- ✅ Test locally before deploying
- ✅ Version control schema with code
- ✅ Clear contract (schema.yaml)
- ✅ Reusable patterns (templates)

**For Production**:
- ✅ Schema validation prevents errors
- ✅ Agents are loosely coupled (no god service)
- ✅ Observable (trace IDs, metrics)
- ✅ Cost-controlled (per-run limits)
- ✅ Resilient (circuit breakers, retries)

**For Business**:
- ✅ Fast iteration (new agents in hours)
- ✅ Cost transparency (USD per agent)
- ✅ Scalable (add templates as needed)
- ✅ Maintainable (clear ownership)

---

## Research Sources

This architecture is informed by 2025 production patterns:

1. **Orchestration Patterns**: [Microsoft Orchestration Saga](https://medium.com/gett-engineering/architectural-patterns-orchestration-saga-0d03894ce9e8)
2. **Anti-Patterns**: [Seven Microservices Anti-patterns](https://www.infoq.com/articles/seven-uservices-antipatterns/)
3. **Agent Frameworks**: [Google's Context-Aware Framework](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)
4. **Web Scraping**: [Firecrawl](https://github.com/firecrawl/firecrawl), [AI Scraping Agents](https://github.com/hmshb/scraping-agent-ai)
5. **n8n Integration**: [n8n AI Workflows](https://n8n.io/workflows/categories/ai/)
6. **Template Systems**: [Cookiecutter](https://github.com/cookiecutter/cookiecutter-django)
7. **Schema Transformation**: [AI ETL Processes 2025](https://dataengineeracademy.com/blog/ai-optimized-etl-processes-how-to-automate-data-transformation-in-2025/)

---

## Next Steps

**Immediate** (if continuing from Phase 1):
1. Create `/agent-templates/` directory structure
2. Build `create-directus-agent` CLI
3. Implement web-scraper template
4. Test end-to-end with real Directus data

**Or** (if validating architecture first):
1. Review this plan with team
2. Prototype one template manually
3. Test schema validation approach
4. Confirm Firecrawl API works for use case
5. Then build automation (CLI, templates)

---

**Status**: Architecture validated through brainstorming, Phase 1 complete, ready for Phase 2 implementation.
