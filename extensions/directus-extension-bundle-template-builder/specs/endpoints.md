# Endpoint Specifications

## Route Details

All routes extracted from reference `index.ts` (lines noted for extraction).

---

## tb-core Endpoint

### GET /health
**Lines:** 48-52
**Response:** `{ status: 'ok', timestamp: ISO8601 }`

### GET /blackboard/:projectId
**Lines:** 2680-2720
**Response:** Array of BlackboardEntry
**Requires:** projectId param

### GET /conflicts/:projectId
**Lines:** 2722-2760
**Response:** Array of Conflict with status='unresolved'
**Requires:** projectId param

### POST /resolve-conflict
**Lines:** 2762-2810
**Body:** `{ conflictId, optionId }`
**Response:** `{ success: true, resolution }`

### GET /outputs/:projectId
**Lines:** 2150-2200
**Response:** Array of task outputs with data
**Requires:** projectId param

### POST /undo
**Lines:** 2812-2900
**Body:** `{ conversationId, actionId }`
**Response:** `{ success: true, undone: Action }`

### GET /action-history
**Lines:** 2902-2950
**Query:** `conversationId`
**Response:** Array of undoable actions

---

## tb-chat Endpoint

### POST /chat-v2
**Lines:** 386-1106 (726 lines - largest handler)
**Body:**
```typescript
{
  message: string;
  projectId: number;
  conversationId?: string;
  selectedTaskId?: number;
}
```
**Response:** SSE stream with events:
- `start` - Session info
- `text_delta` - Streaming text
- `tool_use` - Tool execution
- `action` - Database mutation
- `done` - Completion

**Features:**
- Anthropic SDK streaming
- Tool use (9 tools)
- Action recording for undo
- Blackboard context injection
- Conversation history management

### POST /chat
**Lines:** 1200-1400
**Body:** Same as chat-v2
**Response:** `{ response: string, conversationId }`
**Note:** Legacy non-streaming version

### POST /chat-stream
**Lines:** 1402-1600
**Body:** Same as chat-v2
**Response:** SSE stream (simpler than chat-v2)

---

## tb-tasks Endpoint

### POST /execute-task
**Lines:** 1788-2087
**Body:** `{ taskId: number }`
**Response:** `{ success: true, output: TaskOutput }`
**Features:**
- Validates task exists and is pending
- Builds prompt with blackboard context
- Executes with appropriate model tier
- Stores output in tb_outputs

### POST /generate-tasks
**Lines:** 2360-2500
**Body:**
```typescript
{
  projectId: number;
  description: string;
  count?: number;
}
```
**Response:** `{ tasks: GeneratedTask[] }`

### POST /generate-tasks-stream
**Lines:** 2502-2679
**Body:** Same as generate-tasks
**Response:** SSE stream of task generation

### POST /edit-text
**Lines:** 2089-2148
**Body:**
```typescript
{
  text: string;
  instruction: string;
  style?: 'formal' | 'casual';
}
```
**Response:** `{ editedText: string }`

### POST /enrich-output
**Lines:** 2200-2358
**Body:**
```typescript
{
  outputId: number;
  columns: { name: string; prompt: string }[];
}
```
**Response:** `{ success: true, enrichedData }`

---

## tb-projects Endpoint

### POST /run-project
**Lines:** 2981-3284
**Body:** `{ projectId: number }`
**Response:** SSE stream of execution progress
**Features:**
- Topological sort of tasks by dependencies
- Sequential execution
- Error handling with rollback
- Progress events

### GET /project-status/:projectId
**Lines:** 3324-3389
**Response:**
```typescript
{
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number; // 0-100
  currentTask?: { id, name };
  completedTasks: number;
  totalTasks: number;
}
```

### POST /approve-review
**Lines:** 3286-3322
**Body:** `{ taskId: number, approved: boolean }`
**Response:** `{ success: true, nextTask?: Task }`

---

## Common Patterns

### Request Context
All handlers receive:
```typescript
req.schema       // Directus schema
req.accountability // User permissions
req.body         // POST body
req.params       // URL params
req.query        // Query string
```

### Service Creation
```typescript
const ItemsService = context.services.ItemsService;
const tasks = new ItemsService('tb_tasks', { schema, accountability });
```

### Error Response
```typescript
res.status(400).json({ error: 'Message', traceId });
res.status(404).json({ error: 'Not found', traceId });
res.status(500).json({ error: 'Internal error', traceId });
```

### SSE Setup
```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.flushHeaders();
```
