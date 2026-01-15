/**
 * Tasks Endpoint Tests
 *
 * Tests for execute-task, generate-tasks, and edit-text routes.
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

describe('TB-Tasks Endpoint', () => {
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
      expect(endpoint.id).toBe('tb-tasks');
    });
  });

  describe('POST /execute-task', () => {
    it('returns 400 when taskId is missing', async () => {
      const handler = router.routes.post['/execute-task'];
      expect(handler).toBeDefined();

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
  });

  describe('POST /generate-tasks', () => {
    it('returns 400 when description is missing', async () => {
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
