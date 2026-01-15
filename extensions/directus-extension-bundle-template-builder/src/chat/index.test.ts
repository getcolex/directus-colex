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
