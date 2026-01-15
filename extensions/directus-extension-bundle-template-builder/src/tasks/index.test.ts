/**
 * Tasks Endpoint Tests
 *
 * Tests for execute-task, generate-tasks, and edit-text routes.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import endpoint from './index';

// Mock fetch globally for tool calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

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

// Mock response
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

// Mock ItemsService with configurable behavior
function createMockItemsService(config: {
  task?: any;
  outputs?: any[];
  blackboard?: any;
  createdOutputId?: number;
} = {}) {
  const mockTasksService = {
    readOne: vi.fn().mockResolvedValue(config.task || null),
    readByQuery: vi.fn().mockResolvedValue([]),
    updateOne: vi.fn().mockResolvedValue({}),
  };

  const mockOutputsService = {
    readOne: vi.fn().mockResolvedValue(null),
    readByQuery: vi.fn().mockResolvedValue(config.outputs || []),
    createOne: vi.fn().mockResolvedValue(config.createdOutputId || 1),
    updateOne: vi.fn().mockResolvedValue({}),
  };

  const mockBlackboardService = {
    readOne: vi.fn().mockResolvedValue(config.blackboard || null),
    readByQuery: vi.fn().mockResolvedValue(config.blackboard ? [config.blackboard] : []),
    createOne: vi.fn().mockResolvedValue(1),
    updateOne: vi.fn().mockResolvedValue({}),
  };

  return {
    ItemsService: vi.fn().mockImplementation((collection: string) => {
      if (collection === 'tb_tasks') return mockTasksService;
      if (collection === 'tb_outputs') return mockOutputsService;
      if (collection === 'tb_blackboard') return mockBlackboardService;
      return {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
    }),
    mockTasksService,
    mockOutputsService,
    mockBlackboardService,
  };
}

describe('TB-Tasks Endpoint', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('endpoint metadata', () => {
    it('has correct id', () => {
      expect(endpoint.id).toBe('tb-tasks');
    });
  });

  describe('POST /execute-task', () => {
    it('registers the route', () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      expect(router.routes.post['/execute-task']).toBeDefined();
    });

    it('returns 400 when taskId is missing', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/execute-task'];
      const req = {
        body: { projectId: '123' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('taskId and projectId are required');
    });

    it('returns 400 when projectId is missing', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/execute-task'];
      const req = {
        body: { taskId: '456' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('taskId and projectId are required');
    });

    it('returns 404 when task not found', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService({ task: null });
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/execute-task'];
      const req = {
        body: { taskId: 999, projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.data.error).toBe('Task not found');
    });

    it('sets task status to running at start', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      // Mock Claude proxy response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            output_type: 'text',
            title: 'Test Output',
            content: 'Generated content',
          }),
        }),
      });

      router = createMockRouter();
      const task = {
        id: 1,
        name: 'Test Task',
        description: 'Test description',
        tool_mode: 'none',
        output_type: 'text',
      };
      const { ItemsService, mockTasksService } = createMockItemsService({
        task,
        createdOutputId: 100,
      });
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/execute-task'];
      const req = {
        body: { taskId: 1, projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      // First updateOne call should set status to running
      expect(mockTasksService.updateOne).toHaveBeenCalledWith(1, { status: 'running' });
    });

    it('creates output and sets task status to done on success', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            output_type: 'text',
            title: 'Generated Title',
            content: 'Generated content here',
          }),
        }),
      });

      router = createMockRouter();
      const task = {
        id: 1,
        name: 'Test Task',
        description: 'Generate something',
        tool_mode: 'none',
        output_type: 'text',
      };
      const { ItemsService, mockTasksService, mockOutputsService } = createMockItemsService({
        task,
        createdOutputId: 100,
      });
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/execute-task'];
      const req = {
        body: { taskId: 1, projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      // Should create output
      expect(mockOutputsService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 1,
          task_id: 1,
          output_type: 'text',
        })
      );

      // Should set task status to done with output_id
      expect(mockTasksService.updateOne).toHaveBeenCalledWith(1, {
        status: 'done',
        output_id: 100,
      });

      // Response should include output
      expect(res.data.success).toBe(true);
      expect(res.data.output.id).toBe(100);
      expect(res.data.taskStatus).toBe('done');
    });

    it('reverts task status to pending on error', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      mockFetch.mockRejectedValue(new Error('API Error'));

      router = createMockRouter();
      const task = {
        id: 1,
        name: 'Test Task',
        description: 'Generate something',
        tool_mode: 'none',
        output_type: 'text',
      };
      const { ItemsService, mockTasksService } = createMockItemsService({ task });
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/execute-task'];
      const req = {
        body: { taskId: 1, projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      // Should revert status to pending
      expect(mockTasksService.updateOne).toHaveBeenCalledWith(1, { status: 'pending' });
      expect(res.statusCode).toBe(500);
    });

    it('executes tools when tool_mode is research', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      // Mock search tool response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, results: 'Search results for Acme' }),
        })
        // Mock Claude proxy response
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            response: JSON.stringify({
              output_type: 'text',
              title: 'Research Results',
              content: 'Found information about Acme',
              tools_used: ['search'],
            }),
          }),
        });

      router = createMockRouter();
      const task = {
        id: 1,
        name: 'Brand Research',
        description: 'Research the brand',
        tool_mode: 'research',
        output_type: 'text',
      };
      const blackboard = {
        id: 1,
        project_id: 1,
        entries: { brand_name: { value: 'Acme Corp', source: 'user' } },
      };
      const { ItemsService } = createMockItemsService({
        task,
        blackboard,
        createdOutputId: 100,
      });
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/execute-task'];
      const req = {
        body: { taskId: 1, projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      // Should have called the tools server for search
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tools/search'),
        expect.any(Object)
      );
      expect(res.data.success).toBe(true);
    });

    it('reads blackboard context for task execution', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            output_type: 'text',
            title: 'Output',
            content: 'Content',
          }),
        }),
      });

      router = createMockRouter();
      const task = {
        id: 1,
        name: 'Test',
        description: 'Test',
        tool_mode: 'none',
        output_type: 'text',
      };
      const blackboard = {
        id: 1,
        project_id: 1,
        entries: {
          company_name: { value: 'Test Corp', source: 'user' },
          industry: { value: 'Technology', source: 'user' },
        },
      };
      const { ItemsService, mockBlackboardService } = createMockItemsService({
        task,
        blackboard,
        createdOutputId: 100,
      });
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/execute-task'];
      const req = {
        body: { taskId: 1, projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      // Should have queried blackboard
      expect(mockBlackboardService.readByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: { project_id: { _eq: 1 } },
        })
      );
    });

    it('supersedes previous outputs for same task', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            output_type: 'text',
            title: 'New Output',
            content: 'New content',
          }),
        }),
      });

      router = createMockRouter();
      const task = {
        id: 1,
        name: 'Test',
        description: 'Test',
        tool_mode: 'none',
        output_type: 'text',
      };
      const previousOutputs = [
        { id: 50, task_id: 1, output_type: 'text', superseded_by: null },
        { id: 51, task_id: 1, output_type: 'text', superseded_by: null },
      ];
      const { ItemsService, mockOutputsService } = createMockItemsService({
        task,
        outputs: previousOutputs,
        createdOutputId: 100,
      });
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/execute-task'];
      const req = {
        body: { taskId: 1, projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      // Should mark previous outputs as superseded
      expect(mockOutputsService.updateOne).toHaveBeenCalledWith(50, { superseded_by: 100 });
      expect(mockOutputsService.updateOne).toHaveBeenCalledWith(51, { superseded_by: 100 });
    });
  });

  describe('POST /generate-tasks', () => {
    it('returns 400 when description is missing', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks'];
      expect(handler).toBeDefined();

      const req = {
        body: {},
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('description is required');
    });
  });

  describe('POST /edit-text', () => {
    it('returns 400 when text is missing', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/edit-text'];
      expect(handler).toBeDefined();

      const req = {
        body: { action: 'rewrite' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('text and action are required');
    });

    it('returns 400 when action is missing', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/edit-text'];
      const req = {
        body: { text: 'Some text' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('text and action are required');
    });

    it('returns 400 for invalid action', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/edit-text'];
      const req = {
        body: { text: 'Some text', action: 'invalid' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('action must be one of');
    });
  });

  describe('POST /enrich-output', () => {
    it('returns 400 when output_id is missing', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/enrich-output'];
      expect(handler).toBeDefined();

      const req = {
        body: {
          task_id: 123,
          new_fields: [{ name: 'website_url', type: 'url' }],
        },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('output_id is required');
    });

    it('returns 400 when task_id is missing', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/enrich-output'];
      const req = {
        body: {
          output_id: 456,
          new_fields: [{ name: 'website_url', type: 'url' }],
        },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('task_id is required');
    });

    it('returns 400 when new_fields is missing or empty', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/enrich-output'];
      const req = {
        body: {
          output_id: 456,
          task_id: 123,
        },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('new_fields is required and must be a non-empty array');
    });
  });
});
