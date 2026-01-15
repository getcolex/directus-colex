# Bundle Architecture Specification

## Overview

Convert monolithic 3700-line endpoint into a Directus bundle extension with 4 separate endpoints sharing common utilities.

## Bundle Configuration

**package.json directus:extension:**
```json
{
  "type": "bundle",
  "partial": true,
  "entries": [
    { "type": "endpoint", "name": "tb-core", "source": "src/core/index.ts" },
    { "type": "endpoint", "name": "tb-chat", "source": "src/chat/index.ts" },
    { "type": "endpoint", "name": "tb-tasks", "source": "src/tasks/index.ts" },
    { "type": "endpoint", "name": "tb-projects", "source": "src/projects/index.ts" }
  ]
}
```

## Endpoint Responsibilities

### tb-core (Utilities & CRUD)
| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Health check |
| `/blackboard/:projectId` | GET | Get blackboard entries |
| `/conflicts/:projectId` | GET | Get unresolved conflicts |
| `/resolve-conflict` | POST | Resolve conflict manually |
| `/outputs/:projectId` | GET | Get task outputs |
| `/undo` | POST | Undo last action |
| `/action-history` | GET | Get action history |

### tb-chat (AI Conversation)
| Route | Method | Purpose |
|-------|--------|---------|
| `/chat-v2` | POST | SSE streaming chat with tools |
| `/chat` | POST | Legacy non-streaming chat |
| `/chat-stream` | POST | Streaming variant |

### tb-tasks (Task Execution)
| Route | Method | Purpose |
|-------|--------|---------|
| `/execute-task` | POST | Run single task |
| `/generate-tasks` | POST | Generate tasks from description |
| `/generate-tasks-stream` | POST | Streaming task generation |
| `/edit-text` | POST | Rewrite/edit text |
| `/enrich-output` | POST | Add columns to output |

### tb-projects (Project Orchestration)
| Route | Method | Purpose |
|-------|--------|---------|
| `/run-project` | POST | Execute entire project |
| `/project-status/:projectId` | GET | Get execution status |
| `/approve-review` | POST | Approve HITL review |

## Shared Code (src/shared/)

### types.ts
- `SourceType` - Priority levels for blackboard entries
- `BlackboardEntry` - Key-value with source tracking
- `Conflict` - Contradiction/ambiguity record
- `FileSkillValue` - File skill metadata
- `CollectionSkillValue` - Collection skill metadata

### blackboard-service.ts
- `getOrCreate(projectId)` - Get/create blackboard
- `write(projectId, key, params)` - Write with priority
- `read(projectId, key)` - Read entry
- `query(projectId, params)` - Query with filters
- `registerConflict()` - Track conflicts
- `resolveConflict()` - Human resolution

### llm.ts (New - Extract from index.ts)
- `LLMService` class wrapping Anthropic SDK
- `chat(messages, options)` - Non-streaming call
- `streamChat(messages, options)` - SSE streaming
- `getModelForTier(tier)` - Model selection

### tools.ts
- Anthropic tool definitions (9 tools)
- `update_task`, `create_task`, `delete_task`
- `activate_task`, `reorder_task`, `submit_form`
- `enrich_output`, `read_file`, `query_collection`

### Other Shared
- `conflict-detector.ts` - Find contradictions
- `sort-order.ts` - Gap-based ordering
- `format-blackboard-context.ts` - Prompt formatting

## Import Pattern

Endpoints import from shared:
```typescript
// src/chat/index.ts
import { LLMService } from '../shared/llm';
import { BlackboardService } from '../shared/blackboard-service';
import { TOOL_DEFINITIONS } from '../shared/tools';
```

## Testing Strategy

- Each shared module has its own test file
- Copy existing tests from reference implementation
- Each endpoint has route-level integration tests
- Mock Anthropic SDK, Directus ItemsService

## Migration Path

1. Create bundle, copy shared code
2. Implement endpoints one at a time
3. Test bundle loads in Directus
4. Keep old extension as fallback
5. Switch traffic when confident
