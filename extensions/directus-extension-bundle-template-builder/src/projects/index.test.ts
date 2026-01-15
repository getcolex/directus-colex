/**
 * Projects Endpoint Tests
 *
 * Tests for run-project, project-status, and approve-review routes.
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

// Mock ItemsService
function createMockItemsService() {
  return vi.fn().mockImplementation(() => ({
    readOne: vi.fn().mockResolvedValue(null),
    readByQuery: vi.fn().mockResolvedValue([]),
    createOne: vi.fn().mockResolvedValue({ id: 'new-id' }),
    updateOne: vi.fn().mockResolvedValue({}),
  }));
}

describe('TB-Projects Endpoint', () => {
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
      expect(endpoint.id).toBe('tb-projects');
    });
  });

  describe('POST /run-project', () => {
    it('returns 400 when projectId is missing', async () => {
      const handler = router.routes.post['/run-project'];
      expect(handler).toBeDefined();

      const req = {
        body: {},
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('projectId is required');
    });

    it('returns no_tasks status when project has no tasks', async () => {
      router = createMockRouter();
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const mockBlackboardService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_blackboard') return mockBlackboardService;
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

      const handler = router.routes.post['/run-project'];
      const req = {
        body: { projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.status).toBe('no_tasks');
    });

    it('returns complete status when all tasks are done', async () => {
      router = createMockRouter();
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([
          { id: 1, name: 'Task 1', status: 'done', stage: 1 },
          { id: 2, name: 'Task 2', status: 'done', stage: 1 },
        ]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const mockBlackboardService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([{ entries: {} }]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_blackboard') return mockBlackboardService;
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

      const handler = router.routes.post['/run-project'];
      const req = {
        body: { projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.status).toBe('complete');
      expect(res.data.completed).toBe(2);
    });

    it('returns waiting_review status when tasks need review', async () => {
      router = createMockRouter();
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([
          { id: 1, name: 'Task 1', status: 'done', stage: 1 },
          { id: 2, name: 'Task 2', status: 'waiting_review', stage: 2 },
        ]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const mockBlackboardService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([{ entries: {} }]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_blackboard') return mockBlackboardService;
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

      const handler = router.routes.post['/run-project'];
      const req = {
        body: { projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.status).toBe('waiting_review');
      expect(res.data.review_tasks).toHaveLength(1);
    });

    it('returns needs_input status when form tasks need human input', async () => {
      router = createMockRouter();
      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([
          { id: 1, name: 'Get Info', status: 'pending', stage: 1, action_type: 'form', form_schema: [{ name: 'brand' }] },
        ]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const mockBlackboardService = {
        readOne: vi.fn().mockResolvedValue(null),
        readByQuery: vi.fn().mockResolvedValue([{ entries: {} }]),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
      };
      const ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_blackboard') return mockBlackboardService;
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

      const handler = router.routes.post['/run-project'];
      const req = {
        body: { projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.status).toBe('needs_input');
      expect(res.data.form_tasks).toHaveLength(1);
    });
  });

  describe('GET /project-status/:projectId', () => {
    it('returns 400 for invalid projectId', async () => {
      const handler = router.routes.get['/project-status/:projectId'];
      expect(handler).toBeDefined();

      const req = {
        params: { projectId: 'invalid' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('Valid projectId is required');
    });

    it('returns 404 when project not found', async () => {
      const handler = router.routes.get['/project-status/:projectId'];

      const req = {
        params: { projectId: '999' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.data.error).toBe('Project not found');
    });
  });

  describe('POST /approve-review', () => {
    it('returns 400 when taskId is missing', async () => {
      const handler = router.routes.post['/approve-review'];
      expect(handler).toBeDefined();

      const req = {
        body: { projectId: 123 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('projectId and taskId are required');
    });

    it('returns 400 when projectId is missing', async () => {
      const handler = router.routes.post['/approve-review'];

      const req = {
        body: { taskId: 456 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('projectId and taskId are required');
    });
  });
});
