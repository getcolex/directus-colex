# Blackboard Architecture for Template Builder

**Date:** 2026-01-11
**Status:** Planning

## Problem

Tasks don't share data effectively:
1. Form data not flowing to subsequent tasks (Kenzai Puzzles → researched wrong company)
2. Hardcoded field mapping (`company_name` vs `brand_name`)
3. No conflict detection when AI finds contradictory information
4. No way to ask user for clarification mid-workflow

## Solution

Implement Blackboard Architecture (per Han & Zhang 2025 paper):
- Shared knowledge space per project
- Tasks read/write to blackboard, not each other
- Priority-based resolution (user input > verified scrape > AI inference)
- HITL conflict resolution via AI sidebar

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROJECT BLACKBOARD                            │
│  (Stored in tb_blackboard collection, one row per project)      │
│                                                                  │
│  entries: {                                                      │
│    "brand_name": {                                              │
│      value: "Kenzai Puzzles",                                   │
│      source_type: "user_input",                                 │
│      source_id: "task_123",                                     │
│      priority: 100,                                             │
│      timestamp: "2026-01-11T..."                                │
│    },                                                           │
│    "website_content": {                                         │
│      value: "...",                                              │
│      source_type: "verified_scrape",                            │
│      source_id: "task_456",                                     │
│      source_url: "https://kenzaipuzzles.com",                   │
│      priority: 80,                                              │
│      timestamp: "2026-01-11T..."                                │
│    }                                                            │
│  }                                                               │
│                                                                  │
│  conflicts: [                                                    │
│    { id: "c1", status: "pending", keys: [...], options: [...] } │
│  ]                                                               │
└─────────────────────────────────────────────────────────────────┘
          ▲                    ▲                    ▲
          │ write              │ read               │ write
     ┌────┴────┐         ┌─────┴─────┐        ┌─────┴─────┐
     │  Form   │         │ Research  │        │ Generate  │
     │  Task   │         │   Task    │        │   Task    │
     └─────────┘         └───────────┘        └───────────┘
                               │
                               │ conflict?
                               ▼
                    ┌─────────────────┐
                    │   AI SIDEBAR    │
                    │  "Which Kenzai  │
                    │   did you mean?"│
                    └─────────────────┘
```

## Data Model

### Blackboard Entry

```typescript
interface BlackboardEntry {
  key: string;                    // "brand_name", "competitors", etc.
  value: any;                     // The actual data
  source_type: SourceType;
  source_id: string;              // Task/form ID that wrote this
  source_url?: string;            // If scraped, the URL
  based_on?: string[];            // Keys this was derived from
  priority: number;               // For resolution (higher wins)
  timestamp: string;
}

type SourceType =
  | 'user_correction'   // priority: 1000 - User explicitly fixed
  | 'user_input'        // priority: 100  - Original form data
  | 'user_verified'     // priority: 90   - User confirmed AI finding
  | 'verified_scrape'   // priority: 80   - Scraped from their own website
  | 'external_scrape'   // priority: 60   - Scraped from third party
  | 'ai_synthesis'      // priority: 40   - AI combined sources
  | 'ai_inference';     // priority: 20   - AI guessed
```

### Conflict

```typescript
interface Conflict {
  id: string;
  type: 'contradiction' | 'ambiguity' | 'missing_required';
  keys_involved: string[];
  description: string;            // Human-readable
  options: ConflictOption[];
  status: 'pending' | 'resolved' | 'dismissed';
  created_by_task: string;
  resolution?: {
    chosen_option_id: string;
    resolved_by: 'user' | 'auto';
    timestamp: string;
  };
}

interface ConflictOption {
  id: string;
  label: string;
  description: string;
  writes: Record<string, any>;    // What to write if chosen
}
```

### Task Contract (optional enhancement)

```typescript
interface TaskContract {
  reads: string[];                // Keys task will read
  writes: string[];               // Keys task will produce
  requires?: string[];            // Must exist before task runs
}
```

## Priority Rules

| Priority | Source Type | Example |
|----------|-------------|---------|
| 1000 | user_correction | User typed correction in sidebar |
| 100 | user_input | Form field submitted |
| 90 | user_verified | User confirmed AI finding |
| 80 | verified_scrape | Scraped from brand's own website |
| 60 | external_scrape | Scraped from third-party site |
| 40 | ai_synthesis | AI combined multiple sources |
| 20 | ai_inference | AI guessed/inferred |

**Resolution**: Higher priority wins. Equal priority → later timestamp wins.

## Implementation Phases

### Phase 1: Blackboard Storage
Create collection and basic read/write operations.

### Phase 2: Form → Blackboard
Form submissions write entries to blackboard.

### Phase 3: Task Reads Blackboard
Tasks query blackboard instead of parsing previousOutputs.

### Phase 4: Task Writes Blackboard
Task outputs write structured entries to blackboard.

### Phase 5: Conflict Detection
Detect contradictions and ambiguities.

### Phase 6: HITL Resolution
Surface conflicts in AI sidebar, get user decision.

---

## Phase 1: Blackboard Storage

### 1.1 Create Collection

**Test**: `setup-blackboard-schema.test.ts`
```typescript
describe('Blackboard Schema Setup', () => {
  test('creates tb_blackboard collection if missing', async () => {
    await setupBlackboardSchema(directus);
    const collections = await directus.collections.readAll();
    expect(collections.find(c => c.collection === 'tb_blackboard')).toBeDefined();
  });

  test('tb_blackboard has required fields', async () => {
    const fields = await directus.fields.readAll('tb_blackboard');
    expect(fields.map(f => f.field)).toContain('project_id');
    expect(fields.map(f => f.field)).toContain('entries');
    expect(fields.map(f => f.field)).toContain('conflicts');
  });

  test('project_id has unique constraint', async () => {
    // One blackboard per project
  });
});
```

**Schema**:
```
tb_blackboard
├── id (integer, PK)
├── project_id (integer, FK → tb_projects, unique)
├── entries (json) - Record<string, BlackboardEntry>
├── conflicts (json) - Conflict[]
├── date_created (timestamp)
├── date_updated (timestamp)
```

### 1.2 Blackboard Service

**Test**: `blackboard-service.test.ts`
```typescript
describe('BlackboardService', () => {
  describe('getOrCreate', () => {
    test('creates blackboard for new project', async () => {
      const bb = await blackboard.getOrCreate(projectId);
      expect(bb.project_id).toBe(projectId);
      expect(bb.entries).toEqual({});
    });

    test('returns existing blackboard', async () => {
      await blackboard.getOrCreate(projectId);
      const bb2 = await blackboard.getOrCreate(projectId);
      expect(bb2.id).toBe(bb.id);
    });
  });

  describe('write', () => {
    test('writes new entry', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'task_1'
      });

      const bb = await blackboard.get(projectId);
      expect(bb.entries.brand_name.value).toBe('Kenzai Puzzles');
      expect(bb.entries.brand_name.priority).toBe(100);
    });

    test('higher priority overwrites lower', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai',
        source_type: 'ai_inference',
        source_id: 'task_1'
      });
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'task_2'
      });

      const bb = await blackboard.get(projectId);
      expect(bb.entries.brand_name.value).toBe('Kenzai Puzzles');
    });

    test('lower priority does not overwrite higher', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'task_1'
      });
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai',
        source_type: 'ai_inference',
        source_id: 'task_2'
      });

      const bb = await blackboard.get(projectId);
      expect(bb.entries.brand_name.value).toBe('Kenzai Puzzles');
    });

    test('equal priority uses later timestamp', async () => {
      await blackboard.write(projectId, 'summary', {
        value: 'First summary',
        source_type: 'ai_synthesis',
        source_id: 'task_1'
      });
      await blackboard.write(projectId, 'summary', {
        value: 'Better summary',
        source_type: 'ai_synthesis',
        source_id: 'task_2'
      });

      const bb = await blackboard.get(projectId);
      expect(bb.entries.summary.value).toBe('Better summary');
    });
  });

  describe('read', () => {
    test('reads single key', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'task_1'
      });

      const entry = await blackboard.read(projectId, 'brand_name');
      expect(entry.value).toBe('Kenzai Puzzles');
    });

    test('returns null for missing key', async () => {
      const entry = await blackboard.read(projectId, 'nonexistent');
      expect(entry).toBeNull();
    });

    test('reads multiple keys', async () => {
      await blackboard.write(projectId, 'brand_name', { value: 'Kenzai', source_type: 'user_input', source_id: 't1' });
      await blackboard.write(projectId, 'industry', { value: 'Toys', source_type: 'user_input', source_id: 't1' });

      const entries = await blackboard.readMany(projectId, ['brand_name', 'industry', 'missing']);
      expect(entries.brand_name.value).toBe('Kenzai');
      expect(entries.industry.value).toBe('Toys');
      expect(entries.missing).toBeUndefined();
    });
  });

  describe('query', () => {
    test('returns all entries matching prefix', async () => {
      await blackboard.write(projectId, 'brand_name', { value: 'X', source_type: 'user_input', source_id: 't1' });
      await blackboard.write(projectId, 'brand_story', { value: 'Y', source_type: 'ai_synthesis', source_id: 't2' });
      await blackboard.write(projectId, 'competitors', { value: 'Z', source_type: 'ai_synthesis', source_id: 't2' });

      const brandEntries = await blackboard.query(projectId, { prefix: 'brand_' });
      expect(Object.keys(brandEntries)).toEqual(['brand_name', 'brand_story']);
    });

    test('returns all entries from source', async () => {
      await blackboard.write(projectId, 'a', { value: 'X', source_type: 'user_input', source_id: 'form_1' });
      await blackboard.write(projectId, 'b', { value: 'Y', source_type: 'user_input', source_id: 'form_1' });
      await blackboard.write(projectId, 'c', { value: 'Z', source_type: 'ai_synthesis', source_id: 'task_2' });

      const formEntries = await blackboard.query(projectId, { source_id: 'form_1' });
      expect(Object.keys(formEntries)).toEqual(['a', 'b']);
    });
  });
});
```

**Implementation**: `blackboard-service.ts`
```typescript
const PRIORITY_MAP: Record<SourceType, number> = {
  'user_correction': 1000,
  'user_input': 100,
  'user_verified': 90,
  'verified_scrape': 80,
  'external_scrape': 60,
  'ai_synthesis': 40,
  'ai_inference': 20,
};

class BlackboardService {
  constructor(private itemsService: ItemsService) {}

  async getOrCreate(projectId: number): Promise<Blackboard> {
    // Find or create
  }

  async write(projectId: number, key: string, entry: Partial<BlackboardEntry>): Promise<void> {
    const bb = await this.getOrCreate(projectId);
    const existing = bb.entries[key];
    const newPriority = PRIORITY_MAP[entry.source_type];

    if (!existing || newPriority >= existing.priority) {
      bb.entries[key] = {
        key,
        value: entry.value,
        source_type: entry.source_type,
        source_id: entry.source_id,
        source_url: entry.source_url,
        based_on: entry.based_on,
        priority: newPriority,
        timestamp: new Date().toISOString(),
      };
      await this.save(bb);
    }
  }

  async read(projectId: number, key: string): Promise<BlackboardEntry | null> {
    const bb = await this.getOrCreate(projectId);
    return bb.entries[key] || null;
  }

  async readMany(projectId: number, keys: string[]): Promise<Record<string, BlackboardEntry>> {
    const bb = await this.getOrCreate(projectId);
    const result: Record<string, BlackboardEntry> = {};
    for (const key of keys) {
      if (bb.entries[key]) {
        result[key] = bb.entries[key];
      }
    }
    return result;
  }
}
```

---

## Phase 2: Form → Blackboard

### 2.1 Form Submission Writes to Blackboard

**Test**: `form-to-blackboard.test.ts`
```typescript
describe('Form Submission to Blackboard', () => {
  test('form fields become blackboard entries', async () => {
    const formData = {
      brand_name: 'Kenzai Puzzles',
      company_name: 'Kenzai',
      website_url: 'https://kenzaipuzzles.com',
      industry: 'Toys for teens and adults',
      brand_description: '3D mechanical puzzles...'
    };

    await submitForm(projectId, taskId, formData);

    const bb = await blackboard.get(projectId);
    expect(bb.entries.brand_name.value).toBe('Kenzai Puzzles');
    expect(bb.entries.brand_name.source_type).toBe('user_input');
    expect(bb.entries.website_url.value).toBe('https://kenzaipuzzles.com');
  });

  test('form fields have highest non-correction priority', async () => {
    await submitForm(projectId, taskId, { brand_name: 'Kenzai Puzzles' });

    const entry = await blackboard.read(projectId, 'brand_name');
    expect(entry.priority).toBe(100); // user_input priority
  });

  test('form output still created for display', async () => {
    await submitForm(projectId, taskId, { brand_name: 'Kenzai Puzzles' });

    const output = await getOutput(taskId);
    expect(output.output_type).toBe('form_submission');
    expect(output.data.fields.brand_name).toBe('Kenzai Puzzles');
  });
});
```

**Implementation**: Modify form submission handler in execute-task or create dedicated endpoint.

---

## Phase 3: Task Reads Blackboard

### 3.1 Replace previousOutputs with Blackboard Query

**Test**: `task-reads-blackboard.test.ts`
```typescript
describe('Task Reads from Blackboard', () => {
  test('research task gets brand info from blackboard', async () => {
    // Setup: form already submitted
    await blackboard.write(projectId, 'brand_name', {
      value: 'Kenzai Puzzles',
      source_type: 'user_input',
      source_id: 'form_1'
    });
    await blackboard.write(projectId, 'website_url', {
      value: 'https://kenzaipuzzles.com',
      source_type: 'user_input',
      source_id: 'form_1'
    });

    const context = await buildTaskContext(projectId, researchTask);

    expect(context.brand_name).toBe('Kenzai Puzzles');
    expect(context.website_url).toBe('https://kenzaipuzzles.com');
  });

  test('search query includes brand_name not just company_name', async () => {
    await blackboard.write(projectId, 'brand_name', {
      value: 'Kenzai Puzzles',
      source_type: 'user_input',
      source_id: 'form_1'
    });
    await blackboard.write(projectId, 'company_name', {
      value: 'Kenzai',
      source_type: 'user_input',
      source_id: 'form_1'
    });

    const searchQuery = buildSearchQuery(projectId, researchTask);

    expect(searchQuery).toContain('Kenzai Puzzles');
    // More specific name used
  });

  test('website_url triggers direct scrape', async () => {
    await blackboard.write(projectId, 'website_url', {
      value: 'https://kenzaipuzzles.com',
      source_type: 'user_input',
      source_id: 'form_1'
    });

    const { toolResults } = await executeToolsForTask(researchTask, projectId);

    expect(toolResults).toContain('kenzaipuzzles.com');
    // Should scrape their actual website
  });
});
```

**Implementation**: Modify `executeToolsForTask` to:
1. Query blackboard instead of parsing previousOutputs
2. Prioritize `brand_name` over `company_name`
3. Always scrape `website_url` if available

---

## Phase 4: Task Writes Blackboard

### 4.1 Task Outputs Write Structured Entries

**Test**: `task-writes-blackboard.test.ts`
```typescript
describe('Task Writes to Blackboard', () => {
  test('research task writes findings to blackboard', async () => {
    const taskOutput = {
      website_content: 'Kenzai Puzzles creates 3D mechanical puzzles...',
      competitors: ['Ugears', 'ROKR', 'Robotime'],
      market_position: 'Premium handcrafted segment'
    };

    await writeTaskOutput(projectId, taskId, taskOutput, 'verified_scrape');

    const bb = await blackboard.get(projectId);
    expect(bb.entries.website_content.value).toContain('3D mechanical puzzles');
    expect(bb.entries.website_content.source_type).toBe('verified_scrape');
    expect(bb.entries.competitors.value).toContain('Ugears');
  });

  test('AI synthesis has lower priority than user input', async () => {
    // User said industry is "Toys"
    await blackboard.write(projectId, 'industry', {
      value: 'Toys for teens and adults',
      source_type: 'user_input',
      source_id: 'form_1'
    });

    // AI tries to write different industry
    await writeTaskOutput(projectId, taskId, {
      industry: 'Cosmetics'  // Wrong!
    }, 'ai_inference');

    // User input should win
    const entry = await blackboard.read(projectId, 'industry');
    expect(entry.value).toBe('Toys for teens and adults');
  });

  test('output still saved to tb_outputs for display', async () => {
    await writeTaskOutput(projectId, taskId, {
      brand_story: 'Long form content...'
    }, 'ai_synthesis');

    const output = await getOutput(taskId);
    expect(output.data.content).toContain('Long form content');
  });
});
```

---

## Phase 5: Conflict Detection

### 5.1 Detect Contradictions

**Test**: `conflict-detection.test.ts`
```typescript
describe('Conflict Detection', () => {
  describe('detectContradiction', () => {
    test('detects entity mismatch', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'form_1'
      });
      await blackboard.write(projectId, 'industry', {
        value: 'Toys',
        source_type: 'user_input',
        source_id: 'form_1'
      });

      const researchFindings = {
        entity_found: 'Kenzai Cosmetics',
        entity_industry: 'Skincare',
        entity_country: 'Switzerland'
      };

      const conflicts = detectConflicts(projectId, researchFindings);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('ambiguity');
      expect(conflicts[0].description).toContain('Kenzai Cosmetics');
      expect(conflicts[0].description).toContain('Kenzai Puzzles');
    });

    test('no conflict when entities match', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'form_1'
      });

      const researchFindings = {
        entity_found: 'Kenzai Puzzles',
        entity_industry: '3D Mechanical Puzzles'
      };

      const conflicts = detectConflicts(projectId, researchFindings);

      expect(conflicts).toHaveLength(0);
    });

    test('detects industry mismatch', async () => {
      await blackboard.write(projectId, 'industry', {
        value: 'Toys',
        source_type: 'user_input',
        source_id: 'form_1'
      });

      const researchFindings = {
        entity_industry: 'Cosmetics'
      };

      const conflicts = detectConflicts(projectId, researchFindings);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('contradiction');
      expect(conflicts[0].keys_involved).toContain('industry');
    });
  });

  describe('conflict storage', () => {
    test('adds conflict to blackboard', async () => {
      const conflict = {
        type: 'ambiguity',
        keys_involved: ['brand_name'],
        description: 'Found Kenzai Cosmetics but you entered Kenzai Puzzles',
        options: [
          { id: 'puzzles', label: 'Kenzai Puzzles (3D puzzles)', writes: { brand_entity: 'Kenzai Puzzles' } },
          { id: 'cosmetics', label: 'Kenzai Cosmetics (skincare)', writes: { brand_entity: 'Kenzai Cosmetics' } }
        ]
      };

      await blackboard.addConflict(projectId, conflict);

      const bb = await blackboard.get(projectId);
      expect(bb.conflicts).toHaveLength(1);
      expect(bb.conflicts[0].status).toBe('pending');
    });
  });
});
```

### 5.2 Conflict Detection Heuristics

**Implementation**: `conflict-detector.ts`
```typescript
function detectConflicts(
  blackboard: Blackboard,
  newFindings: Record<string, any>
): Conflict[] {
  const conflicts: Conflict[] = [];

  // 1. Entity name mismatch
  const brandName = blackboard.entries.brand_name?.value;
  const foundEntity = newFindings.entity_found || newFindings.company_name;

  if (brandName && foundEntity) {
    const similarity = stringSimilarity(brandName, foundEntity);
    if (similarity < 0.7) {
      conflicts.push({
        id: generateId(),
        type: 'ambiguity',
        keys_involved: ['brand_name'],
        description: `Research found "${foundEntity}" but you entered "${brandName}". Are these the same company?`,
        options: [
          {
            id: 'use_user_input',
            label: brandName,
            description: 'Use what I entered in the form',
            writes: { brand_entity: brandName, brand_entity_verified: true }
          },
          {
            id: 'use_found',
            label: foundEntity,
            description: 'Use what the research found',
            writes: { brand_entity: foundEntity }
          }
        ],
        status: 'pending',
        created_by_task: currentTaskId
      });
    }
  }

  // 2. Industry mismatch
  const userIndustry = blackboard.entries.industry?.value;
  const foundIndustry = newFindings.entity_industry || newFindings.industry;

  if (userIndustry && foundIndustry && !industriesMatch(userIndustry, foundIndustry)) {
    conflicts.push({
      id: generateId(),
      type: 'contradiction',
      keys_involved: ['industry'],
      description: `You said "${userIndustry}" but research found "${foundIndustry}"`,
      options: [
        {
          id: 'use_user',
          label: userIndustry,
          description: 'My form data is correct',
          writes: { industry: userIndustry, industry_verified: true }
        },
        {
          id: 'use_research',
          label: foundIndustry,
          description: 'Research is correct',
          writes: { industry: foundIndustry }
        }
      ],
      status: 'pending',
      created_by_task: currentTaskId
    });
  }

  return conflicts;
}

function industriesMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const aNorm = normalize(a);
  const bNorm = normalize(b);

  // Direct match
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;

  // Known equivalents
  const equivalents: Record<string, string[]> = {
    'toys': ['puzzles', 'games', 'hobbies'],
    'cosmetics': ['skincare', 'beauty', 'makeup'],
  };

  for (const [key, values] of Object.entries(equivalents)) {
    if ((aNorm.includes(key) || values.some(v => aNorm.includes(v))) &&
        (bNorm.includes(key) || values.some(v => bNorm.includes(v)))) {
      return true;
    }
  }

  return false;
}
```

---

## Phase 6: HITL Conflict Resolution

### 6.1 Surface Conflicts in AI Sidebar

**Test**: `conflict-resolution-sidebar.test.ts`
```typescript
describe('Conflict Resolution in Sidebar', () => {
  test('pending conflict triggers sidebar notification', async () => {
    await blackboard.addConflict(projectId, {
      type: 'ambiguity',
      keys_involved: ['brand_name'],
      description: 'Found different company',
      options: [/* ... */],
      status: 'pending'
    });

    const sidebarState = await getSidebarState(projectId);

    expect(sidebarState.has_pending_conflicts).toBe(true);
    expect(sidebarState.conflicts[0].description).toContain('different company');
  });

  test('AI asks about conflict when user opens chat', async () => {
    await blackboard.addConflict(projectId, conflictData);

    const response = await chatWithAI(projectId, 'Continue with the research');

    expect(response.content).toContain('clarification');
    expect(response.conflict_prompt).toBeDefined();
  });

  test('user selection resolves conflict', async () => {
    const conflictId = await blackboard.addConflict(projectId, conflictData);

    await resolveConflict(projectId, conflictId, 'use_user_input');

    const bb = await blackboard.get(projectId);
    expect(bb.conflicts[0].status).toBe('resolved');
    expect(bb.entries.brand_entity.value).toBe('Kenzai Puzzles');
    expect(bb.entries.brand_entity.source_type).toBe('user_verified');
  });

  test('resolution writes chosen values to blackboard', async () => {
    const conflictId = await blackboard.addConflict(projectId, {
      // ...
      options: [
        {
          id: 'puzzles',
          writes: {
            brand_entity: 'Kenzai Puzzles',
            disambiguation: 'Not Kenzai Cosmetics'
          }
        }
      ]
    });

    await resolveConflict(projectId, conflictId, 'puzzles');

    const bb = await blackboard.get(projectId);
    expect(bb.entries.brand_entity.value).toBe('Kenzai Puzzles');
    expect(bb.entries.disambiguation.value).toBe('Not Kenzai Cosmetics');
  });

  test('paused task resumes after conflict resolution', async () => {
    // Task paused due to conflict
    const taskStatus = await getTaskStatus(taskId);
    expect(taskStatus).toBe('waiting_for_input');

    await resolveConflict(projectId, conflictId, 'use_user_input');

    // Task should resume or be marked ready
    const newStatus = await getTaskStatus(taskId);
    expect(newStatus).toBe('running');
  });
});
```

### 6.2 Sidebar Conflict UI

**Test**: `conflict-ui.test.ts`
```typescript
describe('Conflict UI in Sidebar', () => {
  test('displays conflict with options', async () => {
    // Integration test with frontend
    await blackboard.addConflict(projectId, {
      description: 'Found Kenzai Cosmetics but you entered Kenzai Puzzles',
      options: [
        { id: 'puzzles', label: 'Kenzai Puzzles (3D puzzles)' },
        { id: 'cosmetics', label: 'Kenzai Cosmetics (skincare)' }
      ]
    });

    // Render sidebar
    const sidebar = render(<AISidebar projectId={projectId} />);

    expect(sidebar.getByText('clarification needed')).toBeVisible();
    expect(sidebar.getByText('Kenzai Puzzles (3D puzzles)')).toBeVisible();
    expect(sidebar.getByText('Kenzai Cosmetics (skincare)')).toBeVisible();
  });

  test('clicking option resolves conflict', async () => {
    // ...
    await user.click(sidebar.getByText('Kenzai Puzzles'));

    expect(mockResolveConflict).toHaveBeenCalledWith(conflictId, 'puzzles');
  });

  test('user can type custom clarification', async () => {
    // ...
    await user.type(sidebar.getByPlaceholder('Or type...'), 'It\'s actually Kenzai Games');
    await user.click(sidebar.getByText('Submit'));

    expect(mockResolveConflict).toHaveBeenCalledWith(conflictId, 'custom', {
      value: 'Kenzai Games'
    });
  });
});
```

### 6.3 Endpoint for Conflict Resolution

**Test**: `resolve-conflict-endpoint.test.ts`
```typescript
describe('POST /template-builder/resolve-conflict', () => {
  test('resolves conflict and writes to blackboard', async () => {
    const response = await request(app)
      .post('/template-builder/resolve-conflict')
      .send({
        projectId,
        conflictId,
        optionId: 'use_user_input'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.entries_written).toContain('brand_entity');
  });

  test('custom resolution writes user value', async () => {
    const response = await request(app)
      .post('/template-builder/resolve-conflict')
      .send({
        projectId,
        conflictId,
        optionId: 'custom',
        customValue: { brand_name: 'Kenzai Games' }
      });

    const bb = await blackboard.get(projectId);
    expect(bb.entries.brand_name.value).toBe('Kenzai Games');
    expect(bb.entries.brand_name.source_type).toBe('user_correction');
  });

  test('returns 404 for unknown conflict', async () => {
    const response = await request(app)
      .post('/template-builder/resolve-conflict')
      .send({
        projectId,
        conflictId: 'nonexistent',
        optionId: 'x'
      });

    expect(response.status).toBe(404);
  });
});
```

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `scripts/setup-blackboard-schema.js` | Create tb_blackboard collection |
| `src/lib/blackboard-service.ts` | Core blackboard read/write operations |
| `src/lib/conflict-detector.ts` | Detect contradictions/ambiguities |
| `src/lib/conflict-resolver.ts` | Handle user resolution choices |
| `tests/blackboard-service.test.ts` | Unit tests for blackboard |
| `tests/conflict-detection.test.ts` | Unit tests for conflict detection |
| `tests/conflict-resolution.test.ts` | Integration tests for HITL |

### Modified Files

| File | Changes |
|------|---------|
| `src/index.ts` | Add `/resolve-conflict` endpoint, modify execute-task |
| `executeToolsForTask` | Read from blackboard instead of previousOutputs |
| `buildTaskContext` | Query blackboard for task inputs |
| Frontend `template-builder.html` | Conflict UI in sidebar |

---

## Success Criteria

- [ ] Form data flows to blackboard with `user_input` priority
- [ ] Research task queries blackboard, uses `brand_name` for search
- [ ] Research task scrapes `website_url` directly
- [ ] Entity mismatch triggers conflict (Kenzai Puzzles vs Kenzai Cosmetics)
- [ ] Conflict appears in AI sidebar with options
- [ ] User selection resolves conflict, writes to blackboard
- [ ] Subsequent tasks use resolved/verified data
- [ ] Priority rules enforced (user input beats AI inference)

## Out of Scope (Future)

- Task contracts (explicit reads/writes declarations)
- Cleaner agent (remove stale entries)
- Conflict auto-resolution heuristics
- Blackboard versioning/history
- Multi-user conflict resolution
