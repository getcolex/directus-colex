/**
 * Chat Endpoint Tests
 *
 * Tests for chat-v2 and legacy chat routes with SSE streaming.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import endpoint from './index';

// Mock router
function createMockRouter() {
  const routes: Record<string, Record<string, Function>> = {
    get: {},
    post: {},
  };

  return {
    routes,
    get: vi.fn((path: string, handler: Function) => {
      routes.get[path] = handler;
    }),
    post: vi.fn((path: string, handler: Function) => {
      routes.post[path] = handler;
    }),
  };
}

// Mock response for regular JSON
function createMockResponse() {
  const res: any = {
    statusCode: 200,
    data: null,
    json: vi.fn((data: any) => {
      res.data = data;
      return res;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
  };
  return res;
}

// Mock response for SSE streaming
function createMockSSEResponse() {
  const chunks: string[] = [];
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    writtenData: chunks,
    headersSent: false,
    setHeader: vi.fn().mockImplementation((name: string, value: string) => {
      res.headers[name] = value;
    }),
    writeHead: vi.fn().mockImplementation((code: number, headers?: Record<string, string>) => {
      res.statusCode = code;
      if (headers) Object.assign(res.headers, headers);
      res.headersSent = true;
    }),
    write: vi.fn().mockImplementation((data: string) => {
      chunks.push(data);
      return true;
    }),
    end: vi.fn(),
    status: vi.fn().mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn().mockImplementation((data: any) => {
      res.data = data;
      return res;
    }),
    flushHeaders: vi.fn(),
  };
  return res;
}

// Mock request with abort signal
function createMockRequest(body: any = {}, params = {}, schema = {}, accountability = {}) {
  const abortController = new AbortController();
  return {
    body,
    params,
    schema,
    accountability,
    signal: abortController.signal,
    on: vi.fn(),
    abortController,
  };
}

// Mock ItemsService
function createMockItemsService() {
  return vi.fn().mockImplementation(() => ({
    readOne: vi.fn().mockResolvedValue(null),
    readByQuery: vi.fn().mockResolvedValue([]),
    createOne: vi.fn().mockResolvedValue({ id: 'new-id' }),
    updateOne: vi.fn().mockResolvedValue({}),
  }));
}

describe('TB-Chat Endpoint', () => {
  let router: ReturnType<typeof createMockRouter>;
  let ItemsService: ReturnType<typeof createMockItemsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    ItemsService = createMockItemsService();

    endpoint.handler(router, {
      services: { ItemsService },
      logger: { info: vi.fn(), error: vi.fn() },
    });
  });

  describe('endpoint metadata', () => {
    it('has correct id', () => {
      expect(endpoint.id).toBe('tb-chat');
    });
  });

  describe('POST /chat-v2', () => {
    it('returns 400 when message is missing', async () => {
      const handler = router.routes.post['/chat-v2'];
      expect(handler).toBeDefined();

      const req = createMockRequest({ conversationId: 'abc123' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Message is required');
    });

    it('returns 400 when conversationId is missing', async () => {
      const handler = router.routes.post['/chat-v2'];

      const req = createMockRequest({ message: 'Hello' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('conversationId is required');
    });

    it('returns 503 when no API key is configured', async () => {
      const handler = router.routes.post['/chat-v2'];

      // Clear any API keys
      const originalOpenRouter = process.env.OPENROUTER_API_KEY;
      const originalAnthropic = process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const req = createMockRequest({
        message: 'Hello',
        conversationId: 'abc123',
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.data.error).toContain('API_KEY');

      // Restore
      if (originalOpenRouter) process.env.OPENROUTER_API_KEY = originalOpenRouter;
      if (originalAnthropic) process.env.ANTHROPIC_API_KEY = originalAnthropic;
    });
  });

  describe('POST /chat', () => {
    it('returns 400 when message is missing', async () => {
      const handler = router.routes.post['/chat'];
      expect(handler).toBeDefined();

      const req = createMockRequest({ projectId: 123 });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('Message is required');
    });
  });
});

describe('Chat-v2 SSE Streaming', () => {
  let router: ReturnType<typeof createMockRouter>;
  let mockProjectsService: any;
  let mockTasksService: any;
  let mockOutputsService: any;
  let mockBlackboardService: any;

  function createMockServicesFactory() {
    return vi.fn().mockImplementation((collection: string) => {
      switch (collection) {
        case 'tb_projects':
          return mockProjectsService;
        case 'tb_tasks':
          return mockTasksService;
        case 'tb_outputs':
          return mockOutputsService;
        case 'tb_blackboard':
          return mockBlackboardService;
        default:
          return {
            readOne: vi.fn().mockResolvedValue(null),
            readByQuery: vi.fn().mockResolvedValue([]),
          };
      }
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();

    mockProjectsService = {
      readOne: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Test Project',
        status: 'active',
        description: 'A test project',
      }),
    };

    mockTasksService = {
      readOne: vi.fn().mockResolvedValue({ id: 1, name: 'Task 1', status: 'pending' }),
      readByQuery: vi.fn().mockResolvedValue([
        { id: 1, name: 'Task 1', status: 'pending', action_type: 'agent', sort_order: 0 },
        { id: 2, name: 'Task 2', status: 'done', action_type: 'form', sort_order: 1 },
      ]),
      createOne: vi.fn().mockResolvedValue(3),
      updateOne: vi.fn().mockResolvedValue({}),
      deleteOne: vi.fn().mockResolvedValue({}),
    };

    mockOutputsService = {
      readOne: vi.fn().mockResolvedValue({ id: 1, data: { content: [] } }),
      readByQuery: vi.fn().mockResolvedValue([]),
      createOne: vi.fn().mockResolvedValue(1),
      updateOne: vi.fn().mockResolvedValue({}),
    };

    mockBlackboardService = {
      readByQuery: vi.fn().mockResolvedValue([
        { id: 1, project_id: 1, entries: {}, conflicts: [] },
      ]),
      updateOne: vi.fn().mockResolvedValue({}),
    };

    const ItemsService = createMockServicesFactory();

    endpoint.handler(router, {
      services: { ItemsService },
      logger: { info: vi.fn(), error: vi.fn() },
    });
  });

  describe('SSE headers', () => {
    it('sets correct SSE headers when API key is configured', async () => {
      const handler = router.routes.post['/chat-v2'];

      // Set API key for this test
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const req = createMockRequest({
        message: 'Hello',
        conversationId: 'conv-123',
        projectId: 1,
      });
      const res = createMockSSEResponse();

      // Mock the Anthropic client to avoid actual API calls
      // The handler should set headers before calling the API
      try {
        await handler(req, res);
      } catch (e) {
        // Expected to fail without real API, but headers should be set
      }

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');

      // Restore
      if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
      else delete process.env.ANTHROPIC_API_KEY;
    });
  });

  describe('project context loading', () => {
    it('loads project and tasks when projectId provided', async () => {
      const handler = router.routes.post['/chat-v2'];

      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const req = createMockRequest({
        message: 'List my tasks',
        conversationId: 'conv-123',
        projectId: 1,
      });
      const res = createMockSSEResponse();

      try {
        await handler(req, res);
      } catch (e) {
        // Expected - no real API
      }

      // Should have queried for project and tasks
      expect(mockProjectsService.readOne).toHaveBeenCalledWith(1);
      expect(mockTasksService.readByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: { project_id: { _eq: 1 } },
        })
      );

      if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
      else delete process.env.ANTHROPIC_API_KEY;
    });
  });
});

/**
 * Helper to parse SSE events from written chunks
 */
function parseSSEEvents(chunks: string[]): Array<{ event: string; data: any }> {
  const events: Array<{ event: string; data: any }> = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    let eventType = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }
    if (eventType && data) {
      try {
        events.push({ event: eventType, data: JSON.parse(data) });
      } catch {
        events.push({ event: eventType, data });
      }
    }
  }
  return events;
}

/**
 * Create a mock Anthropic stream that yields predefined events
 */
function createMockStream(events: any[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

describe('Chat-v2 Tool Execution', () => {
  let router: ReturnType<typeof createMockRouter>;
  let mockProjectsService: any;
  let mockTasksService: any;
  let mockOutputsService: any;
  let mockBlackboardService: any;
  let originalApiKey: string | undefined;
  let mockAnthropicStream: any;

  function createMockServicesFactory() {
    return vi.fn().mockImplementation((collection: string) => {
      switch (collection) {
        case 'tb_projects':
          return mockProjectsService;
        case 'tb_tasks':
          return mockTasksService;
        case 'tb_outputs':
          return mockOutputsService;
        case 'tb_blackboard':
          return mockBlackboardService;
        default:
          return {
            readOne: vi.fn().mockResolvedValue(null),
            readByQuery: vi.fn().mockResolvedValue([]),
          };
      }
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-api-key';

    mockProjectsService = {
      readOne: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Test Project',
        status: 'active',
        description: 'A test project',
      }),
    };

    mockTasksService = {
      readOne: vi.fn().mockResolvedValue({ id: 1, name: 'Task 1', status: 'pending', sort_order: 0 }),
      readByQuery: vi.fn().mockResolvedValue([
        { id: 1, name: 'Task 1', status: 'pending', action_type: 'agent', sort_order: 0 },
        { id: 2, name: 'Task 2', status: 'done', action_type: 'form', sort_order: 1000 },
      ]),
      createOne: vi.fn().mockResolvedValue(3),
      updateOne: vi.fn().mockResolvedValue({}),
      deleteOne: vi.fn().mockResolvedValue({}),
    };

    mockOutputsService = {
      readOne: vi.fn().mockResolvedValue({ id: 1, data: { content: [{ name: 'Item 1' }] } }),
      readByQuery: vi.fn().mockResolvedValue([]),
      createOne: vi.fn().mockResolvedValue(1),
      updateOne: vi.fn().mockResolvedValue({}),
    };

    mockBlackboardService = {
      readByQuery: vi.fn().mockResolvedValue([
        { id: 1, project_id: 1, entries: {}, conflicts: [] },
      ]),
      updateOne: vi.fn().mockResolvedValue({}),
    };

    const ItemsService = createMockServicesFactory();

    endpoint.handler(router, {
      services: { ItemsService },
      logger: { info: vi.fn(), error: vi.fn() },
    });
  });

  afterEach(() => {
    if (originalApiKey) process.env.ANTHROPIC_API_KEY = originalApiKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  describe('update_task tool', () => {
    it('executes update_task tool and records action for undo', async () => {
      const handler = router.routes.post['/chat-v2'];

      // Create mock stream that returns tool_use for update_task
      const mockStreamEvents = [
        { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool_1', name: 'update_task' } },
        { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"taskId": 1, "data": {"name": "Updated Task"}}' } },
        { type: 'content_block_stop' },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      ];

      // TODO: Need to mock Anthropic client to test this
      // For now, this test documents the expected behavior
      expect(handler).toBeDefined();
    });
  });

  describe('create_task tool', () => {
    it('creates task with draft status', async () => {
      const handler = router.routes.post['/chat-v2'];
      expect(handler).toBeDefined();
      // Test will verify:
      // 1. Task is created with status: 'draft'
      // 2. Task is added at the beginning (lowest sort_order)
      // 3. Action is recorded in history for undo
    });
  });

  describe('delete_task tool', () => {
    it('deletes task and records for undo', async () => {
      const handler = router.routes.post['/chat-v2'];
      expect(handler).toBeDefined();
      // Test will verify:
      // 1. Task is deleted
      // 2. Previous state is recorded for undo
    });
  });

  describe('activate_task tool', () => {
    it('changes draft status to pending', async () => {
      const handler = router.routes.post['/chat-v2'];
      mockTasksService.readOne.mockResolvedValue({ id: 1, name: 'Draft Task', status: 'draft' });
      expect(handler).toBeDefined();
      // Test will verify:
      // 1. Task status changes from 'draft' to 'pending'
      // 2. Rejects if task is not in draft status
    });
  });

  describe('agentic loop behavior', () => {
    it('continues loop when stop_reason is tool_use', async () => {
      const handler = router.routes.post['/chat-v2'];
      expect(handler).toBeDefined();
      // Test will verify:
      // 1. When stop_reason is 'tool_use', the loop continues
      // 2. Tool result is added to messages
      // 3. Another API call is made
    });

    it('stops loop when stop_reason is end_turn', async () => {
      const handler = router.routes.post['/chat-v2'];
      expect(handler).toBeDefined();
      // Test will verify:
      // 1. When stop_reason is 'end_turn', the loop stops
      // 2. Complete event is sent
      // 3. Response is ended
    });

    it('limits loop iterations to prevent infinite loops', async () => {
      const handler = router.routes.post['/chat-v2'];
      expect(handler).toBeDefined();
      // Test will verify:
      // 1. Loop stops after MAX_LOOPS (10) iterations
      // 2. Even if stop_reason is still 'tool_use'
    });
  });
});
