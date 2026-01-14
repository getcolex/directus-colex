# Colex: Vision

## The One-Liner

**Users describe intent in English. System matches to patterns. Patterns run on a shared blackboard. Human and agents collaborate. Artifacts are the product.**

---

## The Problem

Every day, smart people waste hours on structured thinking tasks:

- "Which CRM should we use?" → 3 days of scattered research
- "Create a brand direction" → Weeks of back-and-forth
- "How to create a good retention feature?" → Googling until exhausted

They're not lacking intelligence. They're lacking **structure**.

Current tools don't help:

| Tool | Problem |
|------|---------|
| ChatGPT | No structure, no memory, starts from zero every time |
| Zapier/n8n | Terrifying for non-devs, workflow building is work itself |
| Notion AI | Feature, not product. Still manual |
| Agent builders | Dev-only, expose plumbing, no patterns |

---

## The Insight

### 1. People don't want to build workflows

They want **output documents** (artifacts). The workflow is invisible plumbing.

### 2. People don't build from scratch

They **customize from patterns**. Brand direction, CRM evaluation, competitor research — these are known shapes.

### 3. Human judgment matters

Fully autonomous agents make mistakes. Strategic checkpoints for human review produce better outcomes than pure automation.

---

## The Model: HITL + Blackboard

We combine two powerful concepts:

### Blackboard Architecture

A shared workspace where all participants (agents and humans) can read from and write to. Each step's output becomes available to all subsequent steps.

```
┌─────────────────────────────────────────────────────┐
│                   BLACKBOARD                         │
│  (shared artifact pool - all can read/write)         │
│                                                      │
│  context: {...}                                      │
│  competitor_list: [...]                              │
│  analysis: {...}                                     │
│  brief: "..."                                        │
└─────────────────────────────────────────────────────┘
        ↑ write          ↑ write           ↑ write
        │                │                 │
   ┌────┴────┐     ┌─────┴─────┐     ┌─────┴─────┐
   │  Agent  │     │   Human   │     │   Agent   │
   │ (find)  │     │ (review)  │     │ (analyze) │
   └─────────┘     └───────────┘     └───────────┘
```

### Human-in-the-Loop (HITL)

Human is a first-class participant, not an afterthought:

| HITL Type | Human reads | Human writes |
|-----------|-------------|--------------|
| **Provide** | Context so far | New information (form) |
| **Select** | List of options | Chosen subset |
| **Edit** | Draft content | Revised content |
| **Confirm** | Proposed output | Approval signal |

### The Flow

```
User: "I need a brand direction document"
           ↓
System matches to "Brand Direction" pattern
           ↓
Shows steps in plain English
           ↓
User clicks Run
           ↓
Step 1 (HITL): User provides context → writes to blackboard
           ↓
Step 2 (Agent): Finds competitors → reads context, writes list
           ↓
Step 3 (HITL): User selects relevant ones → reads list, writes filtered
           ↓
Step 4 (Agent): Analyzes selected → reads all, writes analysis
           ↓
Step 5 (Agent): Writes brief → reads all, writes document
           ↓
User reviews, edits if needed
           ↓
Gets final document
```

---

## The Architecture

```
┌─────────────────────────────────────────┐
│         PATTERN LIBRARY                 │
│  (brand direction, CRM eval, research)  │
│         ↑ grows over time               │
└─────────────────┬───────────────────────┘
                  │ match
                  ▼
┌─────────────────────────────────────────┐
│         STEP LIBRARY                    │
│  Pre-configured step definitions        │
│  (find_competitors, analyze_brands...)  │
└─────────────────┬───────────────────────┘
                  │ compile
                  ▼
┌─────────────────────────────────────────┐
│         RUNNER                          │
│  Executes steps, manages blackboard     │
│  Pauses for HITL, resumes after         │
└─────────────────┬───────────────────────┘
                  │ read/write
                  ▼
┌─────────────────────────────────────────┐
│         BLACKBOARD                      │
│  Shared artifact pool                   │
│  All outputs visible to all steps       │
└─────────────────────────────────────────┘
```

---

## Why Blackboard + HITL?

### Research validates this

LLM multi-agent systems using blackboard architecture show:
- 13-57% improvement over rigid orchestration
- Better token efficiency (no message-passing overhead)
- Handles ill-structured problems better

### But pure autonomy fails

Fully autonomous agents:
- Make confident mistakes
- Can't ask for clarification
- Miss context only humans have

### The hybrid

Pattern defines when human acts. Between checkpoints, agents work autonomously on the blackboard. Human contributions are just another write to the pool.

---

## Cost Efficiency

### Pattern-defined steps are cheap

| Approach | Tokens per Step |
|----------|-----------------|
| General agent (Claude Code style) | 10k+ (full context every call) |
| Dynamic agent selection | 5k (control unit overhead) |
| Pattern-defined steps | 1.7k (minimal prompt + relevant context) |

A 5-step pattern: ~10k tokens vs 50k+ for general agent. 5x cheaper.

---

## What Success Looks Like

Non-technical user:
1. Describes what they need in English
2. Sees a pattern, tweaks if needed
3. Runs — agents work, human reviews at checkpoints
4. Edits any artifact if wrong
5. Gets final document

Time: Minutes, not days.
Quality: Human judgment where it matters.
Cost: Minimal tokens per run.

---
