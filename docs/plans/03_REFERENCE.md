# Colex: Reference Doc

Deep context and research behind the architecture. Read Vision and Build Spec first.

---

## 1. Key Architectural Decisions

### Decision 1: Blackboard, not pipelines

**Before:** Rigid pipelines with fixed data flow between steps
**After:** Shared blackboard where any step can read any previous output

**Why:** Real workflows aren't linear. Step 5 might need data from step 1 and step 3. Blackboard enables flexible data access without explicit wiring.

### Decision 2: HITL as first-class participant

**Before:** Human approval bolted on as afterthought
**After:** Human is a knowledge source, reads/writes to blackboard like agents

**Why:** Strategic human checkpoints produce better outcomes than pure automation. Human contributions are just another write to the pool.

### Decision 3: Step library, not runtime configuration

**Before:** General agent configured at runtime with full context
**After:** Pre-configured steps with minimal prompts, loaded from library

**Why:** 6x cheaper. Each step only loads what it needs. No wasted tokens on irrelevant context.

### Decision 4: Patterns define sequence, steps define behavior

**Before:** Patterns contain full step definitions inline
**After:** Patterns reference reusable steps from library

**Why:** Separation of concerns. Steps improve independently. Patterns just compose them.

### Decision 5: Pool-based data flow

**Before:** Explicit wiring between steps (output of A → input of B)
**After:** Steps declare what they want, read from pool if available

**Why:** No validation errors. Missing data = step works with less context. System is robust to changes.

---

## 2. The Blackboard Model

### Origin

The blackboard pattern comes from 1970s AI research (Hearsay-II speech recognition). Multiple specialists collaborate around a shared workspace.

### Components

```
┌─────────────────────────────────────────────────────┐
│                   BLACKBOARD                         │
│  (shared memory - all artifacts from all steps)      │
│                                                      │
│  { context: {...}, competitor_list: [...], ... }     │
└─────────────────────────────────────────────────────┘
        ↑ read/write       ↑ read/write
        │                  │
   ┌────┴────┐        ┌────┴────┐
   │  Agent  │        │  Human  │
   │ (step)  │        │ (HITL)  │
   └─────────┘        └─────────┘
```

### Why it works for us

| Classic Blackboard | Colex Adaptation |
|-------------------|------------------|
| Opportunistic (any agent can fire) | Sequential (pattern defines order) |
| Fully autonomous | HITL checkpoints |
| Control unit selects next agent | Pattern defines next step |

We keep the key insight (shared state) while adding predictability (fixed sequence) and human judgment (HITL gates).

### Research validation

LbMAS (2024) showed blackboard-based LLM multi-agent systems:
- 13-57% improvement over rigid orchestration
- Better token efficiency (no message-passing overhead)
- Handles ill-structured problems better

---

## 3. The Step Library

### Philosophy

The "agent" is just: **prompt template + tool list + I/O spec**

No complex agent code. Just configuration.

### Step Types

| Type | Behavior |
|------|----------|
| **agent** | LLM executes with prompt, tools, reads from blackboard |
| **hitl** | Pauses for human input, writes result to blackboard |

### HITL Subtypes

| Subtype | Human Action | UI |
|---------|--------------|-----|
| **provide** | Fill in information | Form |
| **select** | Choose from options | Checkboxes/cards |
| **edit** | Modify content | Text editor |
| **confirm** | Approve/reject | Yes/No buttons |

### Step Definition (YAML)

```yaml
id: find_competitors
name: Find competitors
type: agent
role: research

prompt: |
  Search for companies competing with the client.

  Context: {context}

  Return a list with name, URL, description, why they compete.

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

### Why YAML?

- Easy to edit without code changes
- Non-engineers can tweak prompts
- Version control on individual steps
- A/B testing of step variants

---

## 4. How Steps Read from Blackboard

### Declaration

Each step declares:
- `inputs_optional` - keys it would like to read
- `output_key` - key it writes to

### At Runtime

```python
def execute_step(step, blackboard):
    # Gather available inputs
    inputs = {}
    for key in step.inputs_optional:
        if key in blackboard:
            inputs[key] = blackboard[key]

    # Format prompt with available inputs
    prompt = step.prompt.format(**inputs)

    # Execute
    result = llm.complete(prompt, tools=step.tools)

    # Write output
    blackboard[step.output_key] = result
```

### No Validation

- Missing input? Step runs with less context.
- No compile-time errors.
- Quality varies based on available data.

---

## 5. HITL Integration

### Human as Knowledge Source

In classic blackboard, knowledge sources are agents. We add human as another source:

```
┌─────────────────────────────────────────────────────┐
│                  PARTICIPANTS                        │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Research │ │ Analysis │ │ Writing  │  (agents)  │
│  │  Agent   │ │  Agent   │ │  Agent   │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                      │
│  ┌──────────────────────────────────────┐          │
│  │              HUMAN                    │  (hitl)  │
│  │  provide | select | edit | confirm   │          │
│  └──────────────────────────────────────┘          │
└─────────────────────────────────────────────────────┘
```

### Flow Control

Pattern defines when human acts. Runner:
1. Executes agent steps automatically
2. Pauses at HITL steps
3. Waits for human input
4. Writes input to blackboard
5. Continues

### HITL Data Capture

Each HITL interaction captures:
- What was shown (read from blackboard)
- What human provided (written to blackboard)
- Time spent
- (Future: enables learning)

---

## 6. Cost Model Deep Dive

### Why Pattern-Defined Steps Win

| Approach | What's Loaded | Tokens |
|----------|---------------|--------|
| General agent | Full system prompt + all tools + full conversation | 10k+ |
| Dynamic selection | Control unit + selected agent + context | 5k |
| **Pattern-defined** | **Step prompt + step tools + relevant inputs** | **~1.7k** |

### Token Breakdown per Step

| Component | Tokens | Notes |
|-----------|--------|-------|
| Step prompt template | ~500 | Pre-written, specific |
| Tool definitions | ~200 | Only tools this step needs |
| Blackboard inputs | ~1000 | Only relevant artifacts |
| **Total** | **~1700** | |

### Comparison: 5-Step Pattern

| Approach | Calculation | Total |
|----------|-------------|-------|
| General agent | 5 × 10k | 50k tokens |
| Dynamic selection | 5 × 5k | 25k tokens |
| **Pattern-defined** | **5 × 1.7k** | **8.5k tokens** |

**Result: 6x cheaper than general agent approach.**

---

## 7. Comparison to Claude Code

Claude Code is also a HITL+blackboard system:

| Component | Claude Code | Colex |
|-----------|-------------|-------|
| Blackboard | Conversation + files | Artifact pool |
| Agents | One (Claude) with many tools | Multiple steps from library |
| HITL | User messages, approvals | Pattern-defined gates |
| Sequence | LLM decides dynamically | Pattern defines order |

### Key Difference

Claude Code: Flexible, LLM decides sequence
Colex: Predictable, pattern defines sequence

For non-technical users running business processes, predictability is the feature.

---

## 8. Relationship to Existing System

### What we keep

| Existing | Usage |
|----------|-------|
| `agent_registry` | Can inform step definitions |
| `agent_runs` | Track step executions |
| Orchestrator endpoint | Could wrap for agent steps |
| Button system | Could power HITL UI |

### What we replace

| Existing | Replaced by |
|----------|-------------|
| `project` | `runs` |
| `tasks` | Steps from library |
| `templates` | `patterns` |

### Migration path

1. New collections alongside old
2. Steps can wrap existing agents
3. Old projects continue working
4. Gradually migrate

---

## 9. Example: Brand Direction

### Steps (from library)

```yaml
# gather_context.yaml
id: gather_context
type: hitl
hitl_type: provide
form_fields:
  - name: company_name
    type: text
    required: true
  - name: industry
    type: text
  - name: description
    type: textarea
output_key: context
```

```yaml
# find_competitors.yaml
id: find_competitors
type: agent
prompt: |
  Find competitors for: {context}
  Return: name, URL, description, why they compete
tools: [web_search, scrape_url]
inputs_optional: [context, industry]
output_key: competitor_list
```

```yaml
# review_competitors.yaml
id: review_competitors
type: hitl
hitl_type: select
reads_from: competitor_list
output_key: selected_competitors
```

```yaml
# analyze_brands.yaml
id: analyze_brands
type: agent
prompt: |
  Analyze these competitors: {selected_competitors}
  Context: {context}
  Provide: positioning, strengths, weaknesses, differentiation opportunities
tools: [web_search]
inputs_optional: [context, selected_competitors, competitor_list]
output_key: analysis
```

```yaml
# write_brand_brief.yaml
id: write_brand_brief
type: agent
prompt: |
  Write a brand direction brief.
  Context: {context}
  Competitors: {selected_competitors}
  Analysis: {analysis}
tools: []
inputs_optional: [context, selected_competitors, analysis]
output_key: brief
```

### Pattern

```json
{
  "name": "Brand Direction",
  "steps": [
    { "order": 1, "step_id": "gather_context" },
    { "order": 2, "step_id": "find_competitors" },
    { "order": 3, "step_id": "review_competitors" },
    { "order": 4, "step_id": "analyze_brands" },
    { "order": 5, "step_id": "write_brand_brief" }
  ],
  "final_output": { "from_key": "brief" }
}
```

### Execution Flow

```
1. Run starts
2. Step 1 (HITL): Show form → User fills → blackboard.context = {...}
3. Step 2 (Agent): Read context → Search → blackboard.competitor_list = [...]
4. Step 3 (HITL): Show list → User selects → blackboard.selected_competitors = [...]
5. Step 4 (Agent): Read all → Analyze → blackboard.analysis = {...}
6. Step 5 (Agent): Read all → Write → blackboard.brief = "..."
7. Run complete
8. Show blackboard as cards
9. User can edit any card
10. Export final document
```

---

## 10. Open Questions

1. **Step versioning:** How do we handle step updates mid-run?
   - Probably: lock to version at run start

2. **Parallel steps:** Can steps run in parallel if no dependencies?
   - Future: yes, if inputs_optional don't overlap

3. **Conditional steps:** Skip step based on blackboard state?
   - Future: add `condition` field to pattern step reference

4. **Step reuse across tenants:** Shared library or per-tenant?
   - Start with global library, add tenant customization later

---

*Last updated: December 2024*
