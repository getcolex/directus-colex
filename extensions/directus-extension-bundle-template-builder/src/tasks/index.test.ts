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

// Mock SSE response for streaming endpoints
function createMockSSEResponse() {
  const res: any = {
    statusCode: 200,
    data: null,
    events: [] as { event: string; data: any }[],
    headers: {} as Record<string, string>,
    json: vi.fn((data: any) => {
      res.data = data;
      return res;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name] = value;
    }),
    flushHeaders: vi.fn(),
    write: vi.fn((data: string) => {
      // Parse SSE format: "event: <type>\ndata: <json>\n\n"
      const eventMatch = data.match(/event: (\w+)\n/);
      const dataMatch = data.match(/data: (.+)\n/);
      if (eventMatch && dataMatch) {
        res.events.push({
          event: eventMatch[1],
          data: JSON.parse(dataMatch[1]),
        });
      }
    }),
    end: vi.fn(),
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

    it('calls Claude to generate tasks and returns them', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const generatedTasks = [
        {
          name: 'Research Competitors',
          description: 'Find and analyze top competitors',
          action_type: 'agent',
          tool_mode: 'research',
          needs_review: true,
          output_type: 'table',
        },
        {
          name: 'Collect Brand Info',
          description: 'Gather brand information from user',
          action_type: 'form',
          tool_mode: null,
          needs_review: false,
          output_type: 'text',
          form_schema: [{ name: 'brand_name', label: 'Brand Name', type: 'text', required: true }],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: JSON.stringify(generatedTasks) }),
      });

      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks'];
      const req = {
        body: { description: 'Create a brand strategy workflow' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.tasks).toHaveLength(2);
      expect(res.data.tasks[0].name).toBe('Research Competitors');
      expect(res.data.tasks[1].action_type).toBe('form');
      expect(res.data.saved).toBe(false);
    });

    it('saves tasks to project when projectId is provided', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const generatedTasks = [
        {
          name: 'Research Task',
          description: 'Research something',
          action_type: 'agent',
          tool_mode: 'research',
          needs_review: true,
          output_type: 'text',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: JSON.stringify(generatedTasks) }),
      });

      router = createMockRouter();
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(999),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        return {
          readOne: vi.fn().mockResolvedValue(null),
          readByQuery: vi.fn().mockResolvedValue([]),
          createOne: vi.fn().mockResolvedValue(1),
          updateOne: vi.fn().mockResolvedValue({}),
        };
      });

      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks'];
      const req = {
        body: { description: 'Create a workflow', projectId: 123 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(mockTasksService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 123,
          name: 'Research Task',
          status: 'pending',
        })
      );
      expect(res.data.tasks[0].id).toBe(999);
      expect(res.data.saved).toBe(true);
    });

    it('returns 500 when Claude response cannot be parsed', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'This is not valid JSON' }),
      });

      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks'];
      const req = {
        body: { description: 'Create a workflow' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.data.error).toBe('Failed to parse generated tasks');
    });

    it('assigns incrementing sort_order based on existing tasks', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const generatedTasks = [
        { name: 'Task 1', description: 'First', action_type: 'agent', tool_mode: 'research', needs_review: false, output_type: 'text' },
        { name: 'Task 2', description: 'Second', action_type: 'agent', tool_mode: 'generate', needs_review: false, output_type: 'text' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: JSON.stringify(generatedTasks) }),
      });

      router = createMockRouter();
      const createOneCalls: any[] = [];
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([{ sort_order: 5 }]), // Existing task with sort_order 5
        createOne: vi.fn().mockImplementation((data: any) => {
          createOneCalls.push(data);
          return Promise.resolve(createOneCalls.length);
        }),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        return {
          readOne: vi.fn().mockResolvedValue(null),
          readByQuery: vi.fn().mockResolvedValue([]),
          createOne: vi.fn().mockResolvedValue(1),
          updateOne: vi.fn().mockResolvedValue({}),
        };
      });

      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks'];
      const req = {
        body: { description: 'Create tasks', projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      // First task should have sort_order 6 (existing 5 + 1)
      expect(createOneCalls[0].sort_order).toBe(6);
      // Second task should have sort_order 7
      expect(createOneCalls[1].sort_order).toBe(7);
    });
  });

  describe('POST /generate-tasks-stream', () => {
    it('returns 400 when description is missing', async () => {
      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks-stream'];
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

    it('sets up SSE headers correctly', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const generatedTasks = [{ name: 'Task', description: 'Desc', action_type: 'agent', tool_mode: 'research', needs_review: false, output_type: 'text' }];

      // Mock search tool failure (so it skips research)
      mockFetch.mockRejectedValueOnce(new Error('Tools server down'));
      // Mock Claude response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: JSON.stringify(generatedTasks) }),
      });

      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks-stream'];
      const req = {
        body: { description: 'Create a workflow' },
        schema: {},
        accountability: {},
      };
      const res = createMockSSEResponse();

      await handler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('streams progress events during task generation', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const generatedTasks = [{ name: 'Task', description: 'Desc', action_type: 'agent', tool_mode: 'research', needs_review: false, output_type: 'text' }];

      // Mock search tool (success)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          results: [{ title: 'Best Practice', snippet: 'Do this...' }],
        }),
      });
      // Mock Claude response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: JSON.stringify(generatedTasks) }),
      });

      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks-stream'];
      const req = {
        body: { description: 'Create a brand workflow' },
        schema: {},
        accountability: {},
      };
      const res = createMockSSEResponse();

      await handler(req, res);

      // Should have progress events
      const progressEvents = res.events.filter((e: any) => e.event === 'progress');
      expect(progressEvents.length).toBeGreaterThanOrEqual(2);
      expect(progressEvents[0].data.stage).toBe('researching');
      expect(progressEvents[1].data.stage).toBe('generating');

      // Should have complete event
      const completeEvents = res.events.filter((e: any) => e.event === 'complete');
      expect(completeEvents).toHaveLength(1);
      expect(completeEvents[0].data.tasks).toHaveLength(1);

      expect(res.end).toHaveBeenCalled();
    });

    it('saves tasks to project and includes in complete event', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const generatedTasks = [{ name: 'Task', description: 'Desc', action_type: 'agent', tool_mode: 'research', needs_review: false, output_type: 'text' }];

      // Skip research
      mockFetch.mockRejectedValueOnce(new Error('Skip'));
      // Claude response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: JSON.stringify(generatedTasks) }),
      });

      router = createMockRouter();
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(777),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        return {
          readOne: vi.fn().mockResolvedValue(null),
          readByQuery: vi.fn().mockResolvedValue([]),
          createOne: vi.fn().mockResolvedValue(1),
          updateOne: vi.fn().mockResolvedValue({}),
        };
      });

      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks-stream'];
      const req = {
        body: { description: 'Create workflow', projectId: 42 },
        schema: {},
        accountability: {},
      };
      const res = createMockSSEResponse();

      await handler(req, res);

      const completeEvent = res.events.find((e: any) => e.event === 'complete');
      expect(completeEvent.data.saved).toBe(true);
      expect(completeEvent.data.tasks[0].id).toBe(777);
    });

    it('sends error event on parse failure', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      // Skip research
      mockFetch.mockRejectedValueOnce(new Error('Skip'));
      // Claude returns invalid JSON
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Not valid JSON at all' }),
      });

      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/generate-tasks-stream'];
      const req = {
        body: { description: 'Create workflow' },
        schema: {},
        accountability: {},
      };
      const res = createMockSSEResponse();

      await handler(req, res);

      const errorEvents = res.events.filter((e: any) => e.event === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].data.error).toBe('Failed to parse generated tasks');
      expect(res.end).toHaveBeenCalled();
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

    it('calls Claude and returns edited text', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'This is the improved text.' }),
      });

      router = createMockRouter();
      const { ItemsService } = createMockItemsService();
      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/edit-text'];
      const req = {
        body: { text: 'Some text to improve', action: 'improve' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.editedText).toBe('This is the improved text.');
      expect(res.data.action).toBe('improve');
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

    it('returns 404 when output not found', async () => {
      router = createMockRouter();
      const mockOutputsService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue({ id: 123, form_schema: null }),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_outputs') return mockOutputsService;
        if (collection === 'tb_tasks') return mockTasksService;
        return {
          readOne: vi.fn().mockResolvedValue(null),
          readByQuery: vi.fn().mockResolvedValue([]),
          createOne: vi.fn().mockResolvedValue(1),
          updateOne: vi.fn().mockResolvedValue({}),
        };
      });

      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/enrich-output'];
      const req = {
        body: {
          output_id: 456,
          task_id: 123,
          new_fields: [{ name: 'website_url', type: 'url' }],
        },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.data.error).toBe('Output not found or has no data');
    });

    it('returns 400 when output content is not an array', async () => {
      router = createMockRouter();
      const mockOutputsService = {
        readOne: vi.fn().mockResolvedValue({
          id: 456,
          data: { content: 'string not array' },
        }),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue({ id: 123, form_schema: null }),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_outputs') return mockOutputsService;
        if (collection === 'tb_tasks') return mockTasksService;
        return {
          readOne: vi.fn().mockResolvedValue(null),
          readByQuery: vi.fn().mockResolvedValue([]),
          createOne: vi.fn().mockResolvedValue(1),
          updateOne: vi.fn().mockResolvedValue({}),
        };
      });

      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/enrich-output'];
      const req = {
        body: {
          output_id: 456,
          task_id: 123,
          new_fields: [{ name: 'website_url', type: 'url' }],
        },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('Output content must be an array (table data)');
    });

    it('enriches each row with AI and updates output', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      // Mock Claude response for enrichment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '{"website_url": "https://acme.com"}' }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '{"website_url": "https://beta.com"}' }),
      });

      router = createMockRouter();
      const mockOutputsService = {
        readOne: vi.fn().mockResolvedValue({
          id: 456,
          data: {
            content: [
              { name: 'Acme Corp', industry: 'Tech' },
              { name: 'Beta Inc', industry: 'Finance' },
            ],
          },
        }),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue({ id: 123, form_schema: null }),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_outputs') return mockOutputsService;
        if (collection === 'tb_tasks') return mockTasksService;
        return {
          readOne: vi.fn().mockResolvedValue(null),
          readByQuery: vi.fn().mockResolvedValue([]),
          createOne: vi.fn().mockResolvedValue(1),
          updateOne: vi.fn().mockResolvedValue({}),
        };
      });

      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/enrich-output'];
      const req = {
        body: {
          output_id: 456,
          task_id: 123,
          new_fields: [{ name: 'website_url', type: 'url', description: 'Company website' }],
        },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.success).toBe(true);
      expect(res.data.enriched_count).toBe(2);
      expect(res.data.task_updated).toBe(true);

      // Should update output with enriched content
      expect(mockOutputsService.updateOne).toHaveBeenCalledWith(456, {
        data: expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({ name: 'Acme Corp', website_url: 'https://acme.com' }),
            expect.objectContaining({ name: 'Beta Inc', website_url: 'https://beta.com' }),
          ]),
        }),
      });

      // Should update task form_schema with new columns
      expect(mockTasksService.updateOne).toHaveBeenCalledWith(123, {
        form_schema: expect.objectContaining({
          columns: ['website_url'],
          field_types: { website_url: 'url' },
        }),
      });
    });

    it('preserves original row on enrichment error', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      // First row succeeds, second row fails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '{"website_url": "https://acme.com"}' }),
      });
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      router = createMockRouter();
      const mockOutputsService = {
        readOne: vi.fn().mockResolvedValue({
          id: 456,
          data: {
            content: [
              { name: 'Acme Corp' },
              { name: 'Beta Inc' },
            ],
          },
        }),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue({ id: 123, form_schema: null }),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_outputs') return mockOutputsService;
        if (collection === 'tb_tasks') return mockTasksService;
        return {
          readOne: vi.fn().mockResolvedValue(null),
          readByQuery: vi.fn().mockResolvedValue([]),
          createOne: vi.fn().mockResolvedValue(1),
          updateOne: vi.fn().mockResolvedValue({}),
        };
      });

      endpoint.handler(router, {
        services: { ItemsService },
        logger: { info: vi.fn(), error: vi.fn() },
      });

      const handler = router.routes.post['/enrich-output'];
      const req = {
        body: {
          output_id: 456,
          task_id: 123,
          new_fields: [{ name: 'website_url', type: 'url' }],
        },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.success).toBe(true);
      expect(res.data.enriched_count).toBe(2);

      // Second row should be preserved without enrichment
      const updateCall = mockOutputsService.updateOne.mock.calls[0];
      expect(updateCall[1].data.content[0].website_url).toBe('https://acme.com');
      expect(updateCall[1].data.content[1].website_url).toBeUndefined();
    });
  });
});
