# Colex: Build Spec

**Status:** Approved for implementation
**Last updated:** December 2024

---

## 0. What Already Exists

Before building, here's what's already in place on localhost:8055:

### Collections (Existing)

| Collection | Status | Notes |
|------------|--------|-------|
| `project` | ✅ Exists | Has: name, status, files, template_id, tenant_id |
| `tasks` | ✅ Exists | Has: project_id, status, action_type, depends_on, needs_approval, button_context, output_collection |
| `project_files` | ✅ Exists | Junction table: project_id ↔ directus_files_id |
| `templates` | ✅ Exists | Simple: template_name, status, tenant_id |
| `configurable_buttons` | ✅ Exists | Full button system with visibility/action conditions |
| `agent_registry` | ✅ Exists | Agent definitions with health, circuit breaker |
| `agent_runs` | ✅ Exists | Execution history with cost tracking |

### Extensions (Enabled)

| Extension | Status | Components |
|-----------|--------|------------|
| **colex-button-system-bundle** | ✅ Enabled | configurable-button, populate-button-context, task-dependency-v2, webhook-proxy, review-module |
| **directus-extension-endpoint-orchestrator** | ✅ Enabled | Agent execution with circuit breakers |
| **wcag-theme-colex-light/dark** | ✅ Enabled | Accessibility themes |

### What's Missing for New Architecture

| Need | Gap |
|------|-----|
| `steps` collection | Step library doesn't exist |
| `patterns` collection | Pattern library doesn't exist |
| `runs` collection | Run execution state doesn't exist |
| `blackboard` collection | Shared artifact pool doesn't exist |
| Runner endpoint | Executes patterns, manages blackboard |
| Blackboard UI | Cards showing outputs, editable |

---

## 1. Core Concepts

| Concept | What it is | Example |
|---------|-----------|---------|
| **Step** | Reusable step definition with config | "find_competitors" with prompt, tools, I/O |
| **Pattern** | Sequence of steps for a use case | "Brand Direction" = 5 steps in order |
| **Run** | Execution of a pattern | "Brand Direction for Acme Corp" |
| **Blackboard** | Shared artifact pool for a run | All outputs from all steps |
| **Artifact** | Single output on the blackboard | "competitor_list" with 5 items |

---

## 2. User Flow

### Start a Run

```
User: "I need a brand direction document"
           ↓
System matches to "Brand Direction" pattern
           ↓
Shows steps in plain English:
  1. Gather client context (you provide)
  2. Find competitors (agent)
  3. Review competitors (you select)
  4. Analyze selected (agent)
  5. Write brief (agent)
           ↓
User clicks Run
```

### During Execution

```
Runner executes steps, manages blackboard:

Step 1 (HITL - provide):
  → Shows form to user
  → User fills in context
  → Writes to blackboard: { context: {...} }

Step 2 (Agent - find):
  → Reads from blackboard: context
  → Agent searches for competitors
  → Writes to blackboard: { competitor_list: [...] }

Step 3 (HITL - select):
  → Shows competitor_list to user
  → User selects relevant ones
  → Writes to blackboard: { selected_competitors: [...] }

Step 4 (Agent - analyze):
  → Reads from blackboard: context, selected_competitors
  → Agent analyzes each
  → Writes to blackboard: { analysis: {...} }

Step 5 (Agent - write):
  → Reads from blackboard: ALL artifacts
  → Agent generates brief
  → Writes to blackboard: { brief: "..." }
```

### View Results

```
Blackboard displayed as cards:
  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
  │ Context         │ │ Competitors     │ │ Analysis        │
  │ ────────────────│ │ ────────────────│ │ ────────────────│
  │ Acme Corp is... │ │ 1. Competitor A │ │ Market position │
  │                 │ │ 2. Competitor B │ │ is strong...    │
  │ [Edit]          │ │ [Edit]          │ │ [Edit]          │
  └─────────────────┘ └─────────────────┘ └─────────────────┘

User can edit any card → updates blackboard
Final document assembled from blackboard
```

---

## 3. Data Model

### steps (Step Library)

Pre-configured step definitions. The "agent" is just: prompt template + tool list + I/O spec.

```yaml
# steps/find_competitors.yaml
id: find_competitors
name: Find competitors
description: Search for companies competing in this space
type: agent
role: research

prompt: |
  Search for companies competing with the client.
  Focus on: direct competitors, indirect competitors, emerging players.

  Client context:
  {context}

  Return a list with:
  - Company name
  - URL
  - Brief description
  - Why they compete

tools:
  - web_search
  - scrape_url

inputs_optional:
  - context
  - industry
  - geography

output_key: competitor_list
output_type: item_list
```

```yaml
# steps/gather_context.yaml
id: gather_context
name: Gather client context
description: Collect information about the client's business
type: hitl
hitl_type: provide

form_fields:
  - name: company_name
    label: Company Name
    type: text
    required: true
  - name: industry
    label: Industry
    type: text
  - name: description
    label: What does the company do?
    type: textarea

output_key: context
output_type: context
```

```yaml
# steps/review_competitors.yaml
id: review_competitors
name: Review competitors
description: Select which competitors to analyze further
type: hitl
hitl_type: select

reads_from: competitor_list
output_key: selected_competitors
output_type: item_list
```

### patterns

Patterns reference steps from the library.

```json
{
  "id": "uuid",
  "name": "Brand Direction",
  "description": "Complete brand strategy document",
  "category": "branding",
  "steps": [
    { "order": 1, "step_id": "gather_context" },
    { "order": 2, "step_id": "find_competitors" },
    { "order": 3, "step_id": "review_competitors" },
    { "order": 4, "step_id": "analyze_brands" },
    { "order": 5, "step_id": "write_brand_brief" }
  ],
  "final_output": {
    "from_key": "brief",
    "template": "brand_direction_doc"
  },
  "status": "active"
}
```

### runs

Execution of a pattern.

```json
{
  "id": "uuid",
  "pattern_id": "uuid",
  "name": "Brand Direction for Acme Corp",
  "status": "running | paused | completed | failed",
  "current_step": 3,
  "paused_for": "hitl | null",
  "date_created": "timestamp"
}
```

### blackboard (artifacts)

Shared artifact pool for a run. Each step writes here.

```json
{
  "id": "uuid",
  "run_id": "uuid",
  "key": "competitor_list",
  "content": {
    "type": "item_list",
    "items": [
      { "name": "Competitor A", "url": "...", "description": "..." },
      { "name": "Competitor B", "url": "...", "description": "..." }
    ]
  },
  "source_step": 2,
  "source_type": "agent | hitl | edit",
  "version": 1,
  "date_created": "timestamp"
}
```

Key insight: **Any step can read any artifact by key.** No rigid shape validation - steps read what they need.

---

## 4. The Runner

Executes patterns step by step, manages the blackboard.

### Runner Logic

```python
def run(run_id):
    run = get_run(run_id)
    pattern = get_pattern(run.pattern_id)
    blackboard = get_blackboard(run_id)

    for step_ref in pattern.steps:
        step = get_step(step_ref.step_id)
        run.current_step = step_ref.order

        if step.type == "hitl":
            # Pause for human
            run.status = "paused"
            run.paused_for = step.hitl_type
            save(run)
            return  # Resume when user completes

        elif step.type == "agent":
            # Gather inputs from blackboard
            inputs = {}
            for key in step.inputs_optional:
                if blackboard.has(key):
                    inputs[key] = blackboard.get(key)

            # Execute agent
            result = execute_agent(
                prompt=step.prompt,
                tools=step.tools,
                inputs=inputs
            )

            # Write to blackboard
            blackboard.write(
                key=step.output_key,
                content=result,
                source_step=step_ref.order,
                source_type="agent"
            )

    run.status = "completed"
    save(run)
```

### Resume After HITL

```python
def resume_after_hitl(run_id, user_input):
    run = get_run(run_id)
    step = get_current_step(run)
    blackboard = get_blackboard(run_id)

    # Write user input to blackboard
    blackboard.write(
        key=step.output_key,
        content=user_input,
        source_step=run.current_step,
        source_type="hitl"
    )

    # Continue execution
    run.status = "running"
    run.current_step += 1
    save(run)

    run(run_id)  # Continue from next step
```

### No Shape Validation

Unlike rigid pipelines, the blackboard model doesn't validate shapes:
- Steps declare what they *want* to read (`inputs_optional`)
- They read whatever is available
- Missing data = step works with less context
- No compile-time errors, just varying quality

---

## 5. Implementation Phases

### Phase 1: Core Engine (Directus as UI)

Build step library, patterns, runner, blackboard. Users interact via Directus admin.

| # | Task | Status | Description |
|---|------|--------|-------------|
| 1.1 | Create `steps` collection | 🆕 New | Step library with YAML-like config |
| 1.2 | Create `patterns` collection | 🆕 New | Pattern definitions referencing steps |
| 1.3 | Create `runs` collection | 🆕 New | Execution state |
| 1.4 | Create `blackboard` collection | 🆕 New | Artifact pool per run |
| 1.5 | Build runner endpoint | 🆕 New | Execute steps, manage blackboard |
| 1.6 | Build HITL resume endpoint | 🆕 New | Accept user input, continue run |
| 1.7 | Connect to LLM | 🆕 New | Agent steps call Claude/etc |
| 1.8 | Seed Brand Direction pattern | 🆕 New | 5 steps, working end-to-end |
| 1.9 | End-to-end test | 🆕 New | Run pattern, see artifacts |

**Outcome:** Working pattern → run → blackboard flow in Directus.

---

### Phase 2: Blackboard UI

Cards showing the blackboard, editable.

| # | Task | Description |
|---|------|-------------|
| 2.1 | Blackboard panel | Display all artifacts as cards |
| 2.2 | HITL form rendering | Show forms for `provide` type |
| 2.3 | HITL select rendering | Show lists for `select` type |
| 2.4 | Inline editing | Edit any artifact in place |
| 2.5 | Run status display | Show current step, paused state |

**Outcome:** Users see and interact with blackboard visually.

---

### Phase 3: Step Library Expansion

Build out reusable steps.

| # | Task | Description |
|---|------|-------------|
| 3.1 | Research steps | find_competitors, find_investors, etc. |
| 3.2 | Analysis steps | analyze_brands, compare_options, etc. |
| 3.3 | Writing steps | write_brief, write_report, etc. |
| 3.4 | HITL steps | Various form and select types |
| 3.5 | Step versioning | Track changes to step configs |

**Outcome:** Rich library of reusable steps.

---

### Phase 4: Custom Frontend

Standalone UI for end users.

| # | Task | Description |
|---|------|-------------|
| 4.1 | Tech stack | Next.js or similar |
| 4.2 | Pattern browser | See available patterns |
| 4.3 | Run view | Execute and see blackboard |
| 4.4 | HITL interactions | Forms, selects, edits |
| 4.5 | Final document export | PDF, markdown, etc. |

**Outcome:** End users have clean UI, never see Directus.

---

### Phase 5: Learning (Future)

Self-improvement from user edits.

| # | Task | Description |
|---|------|-------------|
| 5.1 | Decision traces | Log before/after of edits |
| 5.2 | Trace analytics | Dashboard of common edits |
| 5.3 | Step improvement | "Users always change X" → fix prompt |
| 5.4 | DSPy optimization | Train on traces |

**Outcome:** System gets better with use.

---

## 6. Phase 1 Detail

### 1.1 Create `steps` collection

The step library. Each step is a reusable definition.

Fields:
- `id` (string) - unique identifier like "find_competitors"
- `name` (string) - display name
- `description` (text)
- `type` (string: agent | hitl)
- `config` (json) - full step configuration

For agent steps, config contains:
```json
{
  "role": "research",
  "prompt": "Search for companies competing...",
  "tools": ["web_search", "scrape_url"],
  "inputs_optional": ["context", "industry"],
  "output_key": "competitor_list",
  "output_type": "item_list"
}
```

For HITL steps, config contains:
```json
{
  "hitl_type": "provide | select | edit | confirm",
  "form_fields": [...],
  "reads_from": "competitor_list",
  "output_key": "selected_competitors",
  "output_type": "item_list"
}
```

### 1.2 Create `patterns` collection

Patterns reference steps by ID.

Fields:
- `id` (uuid)
- `name` (string)
- `description` (text)
- `category` (string)
- `steps` (json) - array of { order, step_id }
- `final_output` (json) - { from_key, template }
- `status` (draft | active | archived)
- `date_created`, `date_updated`

### 1.3 Create `runs` collection

Fields:
- `id` (uuid)
- `pattern_id` (m2o → patterns)
- `name` (string)
- `status` (pending | running | paused | completed | failed)
- `current_step` (integer)
- `paused_for` (string: hitl type or null)
- `date_created`, `date_updated`

### 1.4 Create `blackboard` collection

The artifact pool. Each run has multiple entries.

Fields:
- `id` (uuid)
- `run_id` (m2o → runs)
- `key` (string) - artifact key like "competitor_list"
- `content` (json) - the actual data
- `source_step` (integer) - which step created this
- `source_type` (string: agent | hitl | edit)
- `version` (integer)
- `date_created`

### 1.5 Build runner endpoint

```
POST /colex/run
{
  "pattern_id": "uuid"
}
```

Creates run, starts execution, returns run_id.

### 1.6 Build HITL resume endpoint

```
POST /colex/run/{run_id}/resume
{
  "user_input": { ... }
}
```

Writes to blackboard, continues execution.

### 1.7 Connect to LLM

Agent execution function:
```python
def execute_agent(prompt, tools, inputs):
    # Format prompt with inputs
    formatted = prompt.format(**inputs)

    # Call LLM (Claude, etc.)
    result = llm.complete(
        prompt=formatted,
        tools=tools
    )

    return result
```

### 1.8 Seed Brand Direction pattern

Create 5 steps in library:
1. `gather_context` (HITL - provide)
2. `find_competitors` (Agent)
3. `review_competitors` (HITL - select)
4. `analyze_brands` (Agent)
5. `write_brand_brief` (Agent)

Create pattern referencing them.

### 1.9 End-to-end test

1. Create run from Brand Direction pattern
2. Step 1: API returns paused, HITL form needed
3. Call resume with context → blackboard has `context`
4. Step 2: Agent runs → blackboard has `competitor_list`
5. Step 3: API returns paused, HITL select needed
6. Call resume with selections → blackboard has `selected_competitors`
7. Step 4: Agent runs → blackboard has `analysis`
8. Step 5: Agent runs → blackboard has `brief`
9. Run status = completed
10. Verify all artifacts on blackboard

---

## 7. Success Criteria

### Phase 1 Complete When:
- [ ] `steps` collection exists with 5+ step definitions
- [ ] `patterns` collection exists with Brand Direction
- [ ] `runs` collection tracks execution state
- [ ] `blackboard` collection stores artifacts
- [ ] Runner executes agent steps
- [ ] Runner pauses for HITL steps
- [ ] Resume endpoint accepts user input
- [ ] Brand Direction pattern runs end-to-end
- [ ] All artifacts visible on blackboard

### Overall Success:
- Non-technical user runs a pattern → gets artifacts (Phase 4)
- System learns from user edits (Phase 5)

---

## 8. Cost Model

### Why Pattern-Defined Steps Are Cheap

| Approach | Tokens per Step | Why |
|----------|-----------------|-----|
| General agent | 10k+ | Full context, all tools, broad prompt |
| Dynamic selection | 5k | Control unit overhead |
| **Pattern-defined** | **~1.7k** | Minimal prompt + relevant inputs |

### Per-Step Breakdown

| Component | Tokens |
|-----------|--------|
| Step prompt template | ~500 |
| Tool definitions (subset) | ~200 |
| Blackboard inputs (relevant only) | ~1000 |
| **Total** | **~1700** |

### Example: 5-Step Pattern

- Pattern-defined: 5 × 1.7k = **~8.5k tokens**
- General agent: 5 × 10k = **~50k tokens**
- **Savings: 6x cheaper**

---

*Document created: December 2024*
