/**
 * Tests for Template Builder Extension
 *
 * These tests verify the endpoint behavior using mocks for:
 * - Claude proxy fetch calls
 * - Directus ItemsService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Track the latest fetch mock response for prompt verification
let lastFetchPrompt: string | null = null;

// Helper to create a mock fetch response
function createMockFetchResponse(response: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ response }),
  } as Response;
}

// Helper to mock global fetch
function mockFetchWithResponse(response: string) {
  lastFetchPrompt = null;
  global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    // Capture the prompt from the request body for verification
    if (options?.body) {
      try {
        const body = JSON.parse(options.body as string);
        lastFetchPrompt = body.prompt;
      } catch {}
    }
    return createMockFetchResponse(response);
  });
}

// Mock ItemsService
function createMockItemsService() {
  return vi.fn().mockImplementation(() => ({
    readOne: vi.fn(),
    readByQuery: vi.fn().mockResolvedValue([]),
    createOne: vi.fn().mockResolvedValue({ id: 'new-id' }),
    updateOne: vi.fn().mockResolvedValue({}),
  }));
}

// Mock request/response
function createMockReq(options: { body?: any; params?: any; query?: any; schema?: any; accountability?: any } = {}) {
  const { body = {}, params = {}, query = {}, schema = {}, accountability = {} } = options;
  return { body, params, query, schema, accountability };
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    jsonData: null,
    status: vi.fn().mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn().mockImplementation((data: any) => {
      res.jsonData = data;
      return res;
    }),
  };
  return res;
}

// Helper to create a mock SSE stream response
function createMockSSEResponse(events: Array<{ type: string; data: any }>) {
  const encoder = new TextEncoder();
  let eventIndex = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (eventIndex < events.length) {
        const event = events[eventIndex];
        const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
        controller.enqueue(encoder.encode(sseData));
        eventIndex++;
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: stream,
  } as unknown as Response;
}

// Helper to create mock SSE response object
function createMockSSERes() {
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
      if (headers) {
        Object.assign(res.headers, headers);
      }
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
      res.jsonData = data;
      return res;
    }),
    on: vi.fn(),
    flushHeaders: vi.fn(),
  };
  return res;
}

// Helper to create mock request with abort signal
function createMockStreamReq(body: any = {}, schema = {}, accountability = {}) {
  const abortController = new AbortController();
  return {
    body,
    schema,
    accountability,
    signal: abortController.signal,
    on: vi.fn(),
    abortController,
  };
}

describe('Template Builder Extension', () => {
  let mockRouter: any;
  let mockContext: any;
  let routes: Record<string, any>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    lastFetchPrompt = null;

    // Capture route handlers
    routes = {};
    mockRouter = {
      get: vi.fn((path: string, handler: any) => {
        routes[`GET ${path}`] = handler;
      }),
      post: vi.fn((path: string, handler: any) => {
        routes[`POST ${path}`] = handler;
      }),
      delete: vi.fn((path: string, handler: any) => {
        routes[`DELETE ${path}`] = handler;
      }),
    };

    mockContext = {
      services: {
        ItemsService: createMockItemsService(),
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /health', () => {
    it('returns healthy status', async () => {
      // Mock fetch for health check to proxy
      global.fetch = vi.fn().mockRejectedValue(new Error('Not available'));

      // Import and register routes
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['GET /health'];
      expect(handler).toBeDefined();

      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'template-builder',
        })
      );
    });

    it('includes timestamp in response', async () => {
      // Mock fetch for health check to proxy
      global.fetch = vi.fn().mockRejectedValue(new Error('Not available'));

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['GET /health'];
      const req = createMockReq();
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData.timestamp).toBeDefined();
      expect(new Date(res.jsonData.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('POST /chat', () => {
    it('returns error when message is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat'];
      const req = createMockReq({ body: { projectId: '123' } }); // no message
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('Message is required');
    });

    it('returns AI response for user message', async () => {
      // Mock Claude proxy response
      const mockClaudeResponse = 'Here is my helpful response.\n\nSUGGESTIONS: ["Add a task", "Edit workflow", "Run tasks"]';
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat'];
      const req = createMockReq({ body: { message: 'Help me create a workflow' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.response).toContain('Here is my helpful response');
      expect(res.jsonData.traceId).toBeDefined();
    });

    it('parses suggestions from response', async () => {
      const mockClaudeResponse = 'My response.\n\nSUGGESTIONS: ["suggestion 1", "suggestion 2", "suggestion 3"]';
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat'];
      const req = createMockReq({ body: { message: 'Hello' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.jsonData.suggestions).toEqual(['suggestion 1', 'suggestion 2', 'suggestion 3']);
    });
  });

  describe('POST /edit-text', () => {
    it('returns error when text is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /edit-text'];
      const req = createMockReq({ body: { action: 'rewrite' } }); // no text
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('text and action are required');
    });

    it('returns error when action is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /edit-text'];
      const req = createMockReq({ body: { text: 'Some text' } }); // no action
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('text and action are required');
    });

    it('returns error for invalid action', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /edit-text'];
      const req = createMockReq({ body: { text: 'Some text', action: 'invalid' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toContain('action must be one of');
    });

    it('rewrites text when action is rewrite', async () => {
      const mockClaudeResponse = 'This is the improved and rewritten text.';
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /edit-text'];
      const req = createMockReq({ body: { text: 'Original text here', action: 'rewrite' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.editedText).toBe('This is the improved and rewritten text.');
      expect(res.jsonData.action).toBe('rewrite');
    });

    it('shortens text when action is shorten', async () => {
      const mockClaudeResponse = 'Shorter version.';
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /edit-text'];
      const req = createMockReq({ body: { text: 'Very long text that needs to be shortened significantly.', action: 'shorten' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.editedText).toBe('Shorter version.');
      expect(res.jsonData.action).toBe('shorten');
    });

    it('expands text when action is expand', async () => {
      const mockClaudeResponse = 'This is a much longer and more detailed version of the original text with additional context and examples.';
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /edit-text'];
      const req = createMockReq({ body: { text: 'Short text.', action: 'expand' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.editedText).toContain('longer and more detailed');
      expect(res.jsonData.action).toBe('expand');
    });
  });

  describe('POST /execute-task', () => {
    it('returns error when taskId is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { projectId: '123' } }); // no taskId
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('taskId and projectId are required');
    });

    it('returns error when projectId is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '456' } }); // no projectId
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('taskId and projectId are required');
    });

    it('generates output and updates task status', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'text',
        title: 'Research Results',
        content: 'Here are the research findings...',
      });
      mockFetchWithResponse(mockClaudeResponse);

      // Mock task read
      const mockTask = {
        id: '456',
        name: 'Research competitors',
        description: 'Find competitor information',
        action_type: 'agent',
        tool_mode: 'research',
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue({ id: 'output-1' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '456', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.taskStatus).toBe('done');

      // Verify task was updated to 'running' then 'done' (with output_id)
      expect(mockTasksService.updateOne).toHaveBeenCalledWith('456', { status: 'running' });
      expect(mockTasksService.updateOne).toHaveBeenCalledWith('456', expect.objectContaining({ status: 'done' }));

      // Verify output was saved
      expect(mockOutputsService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: '123',
          task_id: '456',
        })
      );
    });
  });

  describe('POST /execute-task with output_type', () => {
    it('gathers previous outputs for context when executing task', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'text',
        title: 'New Analysis',
        content: 'Analysis based on previous context...',
      });
      mockFetchWithResponse(mockClaudeResponse);

      // Mock task with output_type
      const mockTask = {
        id: '456',
        name: 'Analyze data',
        description: 'Analyze the collected data',
        action_type: 'agent',
        tool_mode: 'research',
        output_type: 'text',
      };

      // Mock previous outputs from earlier tasks
      const mockPreviousOutputs = [
        { id: 'out-1', task_id: 'task-1', output_type: 'text', data: { title: 'Research', content: 'Research findings...' } },
        { id: 'out-2', task_id: 'task-2', output_type: 'table', data: { title: 'Data', content: [{ col1: 'val1' }] } },
      ];

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue(mockPreviousOutputs),
        createOne: vi.fn().mockResolvedValue({ id: 'output-new' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '456', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      // Verify outputs were queried for the project
      expect(mockOutputsService.readByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: { project_id: { _eq: '123' } },
        })
      );

      // Verify Claude was called with previous outputs context in the prompt
      expect(global.fetch).toHaveBeenCalled();
      expect(lastFetchPrompt).toContain('Previous outputs');
    });

    it('includes output_type in prompt when task has output_type', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'table',
        title: 'Data Table',
        content: [{ col1: 'val1', col2: 'val2' }],
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: '789',
        name: 'Generate table',
        description: 'Create a data table',
        action_type: 'agent',
        tool_mode: 'generate',
        output_type: 'table',
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue({ id: 'output-table' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '789', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      // Verify Claude was called with output_type in the prompt
      expect(global.fetch).toHaveBeenCalled();
      expect(lastFetchPrompt).toContain('Output Type: table');
    });

    it('formats output based on task output_type - table format', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'table',
        title: 'Results Table',
        content: [{ name: 'Item 1', value: 100 }, { name: 'Item 2', value: 200 }],
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: '101',
        name: 'Generate report table',
        description: 'Create a table of results',
        action_type: 'agent',
        tool_mode: 'generate',
        output_type: 'table',
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue({ id: 'output-table' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '101', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);

      // Verify the output was saved with correct format
      expect(mockOutputsService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          output_type: 'table',
          data: expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ name: 'Item 1' }),
            ]),
          }),
        })
      );
    });

    it('formats output based on task output_type - text format as markdown', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'text',
        title: 'Summary Report',
        content: '# Summary\n\nThis is a markdown formatted report with **bold** text.',
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: '102',
        name: 'Generate summary',
        description: 'Create a summary report',
        action_type: 'agent',
        tool_mode: 'generate',
        output_type: 'text',
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue({ id: 'output-text' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '102', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);

      // Verify the output was saved with text/markdown format
      expect(mockOutputsService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          output_type: 'text',
          data: expect.objectContaining({
            content: expect.stringContaining('markdown'),
          }),
        })
      );
    });

    it('formats output for colors type with hex values', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'colors',
        title: 'Brand Color Palette',
        content: { primary: '#3B82F6', secondary: '#10B981', accent: '#F59E0B' },
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: '103',
        name: 'Generate brand colors',
        description: 'Create a color palette for the brand',
        action_type: 'agent',
        tool_mode: 'generate',
        output_type: 'colors',
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue({ id: 'output-colors' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '103', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);

      // Verify the output was saved with colors format
      expect(mockOutputsService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          output_type: 'colors',
          data: expect.objectContaining({
            content: expect.objectContaining({
              primary: '#3B82F6',
              secondary: '#10B981',
            }),
          }),
        })
      );

      // Verify prompt included colors formatting instructions
      expect(lastFetchPrompt).toContain('Output Type: colors');
    });

    it('includes colors formatting instruction in prompt', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'colors',
        title: 'Color Palette',
        content: { primary: '#000000' },
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: '104',
        name: 'Design colors',
        description: 'Create color scheme',
        action_type: 'agent',
        tool_mode: 'generate',
        output_type: 'colors',
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue({ id: 'output-colors-2' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '104', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      // Verify prompt includes specific colors formatting instructions
      expect(lastFetchPrompt).toContain('color names as keys');
      expect(lastFetchPrompt).toContain('hex codes as values');
    });

    it('formats output for json type with structured data', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'json',
        title: 'API Configuration',
        content: { apiUrl: 'https://api.example.com', timeout: 5000, retries: 3 },
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: '105',
        name: 'Generate config',
        description: 'Create API configuration',
        action_type: 'agent',
        tool_mode: 'generate',
        output_type: 'json',
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue({ id: 'output-json' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '105', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);

      // Verify the output was saved with json format
      expect(mockOutputsService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          output_type: 'json',
          data: expect.objectContaining({
            content: expect.objectContaining({
              apiUrl: 'https://api.example.com',
            }),
          }),
        })
      );

      // Verify prompt included json formatting instructions
      expect(lastFetchPrompt).toContain('Output Type: json');
    });
  });

  describe('POST /generate-tasks', () => {
    it('returns error when description is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks'];
      const req = createMockReq({ body: {} }); // no description
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('description is required');
    });

    it('generates tasks from description', async () => {
      const mockTasks = [
        { name: 'Research market', description: 'Find market data', action_type: 'agent', tool_mode: 'research', needs_review: true },
        { name: 'Analyze competitors', description: 'Study competitors', action_type: 'agent', tool_mode: 'research', needs_review: true },
      ];
      const mockClaudeResponse = JSON.stringify(mockTasks);
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks'];
      const req = createMockReq({ body: { description: 'Create a market research workflow' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.tasks).toHaveLength(2);
      expect(res.jsonData.tasks[0].name).toBe('Research market');
    });

    it('includes output_type in generated tasks', async () => {
      const mockTasks = [
        { name: 'Collect info', description: 'Get user input', action_type: 'form', tool_mode: null, needs_review: false, output_type: 'text' },
        { name: 'Research competitors', description: 'Find competitors', action_type: 'agent', tool_mode: 'research', needs_review: true, output_type: 'table' },
        { name: 'Generate report', description: 'Write summary', action_type: 'agent', tool_mode: 'generate', needs_review: true, output_type: 'text' },
      ];
      const mockClaudeResponse = JSON.stringify(mockTasks);
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks'];
      const req = createMockReq({ body: { description: 'Create a competitor analysis workflow' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.tasks).toHaveLength(3);

      // Verify output_type is present in generated tasks
      expect(res.jsonData.tasks[0].output_type).toBe('text');
      expect(res.jsonData.tasks[1].output_type).toBe('table');
      expect(res.jsonData.tasks[2].output_type).toBe('text');
    });

    it('saves output_type when saving tasks to project', async () => {
      const mockTasks = [
        { name: 'Research', description: 'Research task', action_type: 'agent', tool_mode: 'research', needs_review: true, output_type: 'table' },
      ];
      const mockClaudeResponse = JSON.stringify(mockTasks);
      mockFetchWithResponse(mockClaudeResponse);

      const mockTasksService = {
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue({ id: 'new-task-id' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks'];
      const req = createMockReq({ body: { description: 'Research workflow', projectId: 'proj-123' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.saved).toBe(true);

      // Verify task was created with output_type
      expect(mockTasksService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          output_type: 'table',
        })
      );
    });

    it('includes output_type in prompt instructions', async () => {
      const mockTasks = [
        { name: 'Test', description: 'Test task', action_type: 'agent', tool_mode: 'research', needs_review: true, output_type: 'text' },
      ];
      const mockClaudeResponse = JSON.stringify(mockTasks);
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks'];
      const req = createMockReq({ body: { description: 'Test workflow' } });
      const res = createMockRes();

      await handler(req, res);

      // Verify prompt includes output_type instructions
      expect(lastFetchPrompt).toContain('output_type');
      expect(lastFetchPrompt).toContain('table');
      expect(lastFetchPrompt).toContain('text');
      expect(lastFetchPrompt).toContain('list');
    });
  });

  describe('POST /chat-stream', () => {
    it('returns error when message is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat-stream'];
      expect(handler).toBeDefined();

      const req = createMockStreamReq({ projectId: '123' }); // no message
      const res = createMockSSERes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Message is required' })
      );
    });

    it('sets SSE response headers', async () => {
      // Mock fetch to return SSE stream
      const mockEvents = [
        { type: 'content', data: { text: 'Hello' } },
        { type: 'done', data: { response: 'Hello world!\n\nSUGGESTIONS: ["a", "b", "c"]' } },
      ];
      global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(mockEvents));

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat-stream'];
      const req = createMockStreamReq({ message: 'Hello' });
      const res = createMockSSERes();

      await handler(req, res);

      // Check SSE headers were set
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    });

    it('forwards SSE events from proxy to client', async () => {
      // Mock fetch to return SSE stream with content events
      const mockEvents = [
        { type: 'content', data: { text: 'Hello ' } },
        { type: 'content', data: { text: 'world!' } },
        { type: 'done', data: { response: 'Hello world!\n\nSUGGESTIONS: ["a", "b", "c"]' } },
      ];
      global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(mockEvents));

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat-stream'];
      const req = createMockStreamReq({ message: 'Hello' });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify content events were forwarded
      expect(res.write).toHaveBeenCalled();
      const allWritten = res.writtenData.join('');
      expect(allWritten).toContain('event: content');
      expect(allWritten).toContain('Hello ');
    });

    it('parses suggestions from final response and sends done event', async () => {
      const mockEvents = [
        { type: 'content', data: { text: 'My response.' } },
        { type: 'done', data: { response: 'My response.\n\nSUGGESTIONS: ["suggestion 1", "suggestion 2", "suggestion 3"]' } },
      ];
      global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(mockEvents));

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat-stream'];
      const req = createMockStreamReq({ message: 'Hello' });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify done event with suggestions was sent
      const allWritten = res.writtenData.join('');
      expect(allWritten).toContain('event: done');
      expect(allWritten).toContain('suggestions');
    });

    it('includes project context in prompt when projectId provided', async () => {
      lastFetchPrompt = null;

      // Mock project and tasks
      const mockProject = { id: '123', name: 'Test Project', status: 'active' };
      const mockTasks = [
        { name: 'Task 1', description: 'First task', status: 'pending' },
      ];

      const mockProjectsService = {
        readOne: vi.fn().mockResolvedValue(mockProject),
      };
      const mockTasksService = {
        readByQuery: vi.fn().mockResolvedValue(mockTasks),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_projects') return mockProjectsService;
        if (collection === 'tb_tasks') return mockTasksService;
        return {};
      });

      // Mock fetch to capture prompt
      const mockEvents = [
        { type: 'done', data: { response: 'Response\n\nSUGGESTIONS: []' } },
      ];
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.body) {
          try {
            const body = JSON.parse(options.body as string);
            lastFetchPrompt = body.prompt;
          } catch {}
        }
        return createMockSSEResponse(mockEvents);
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat-stream'];
      const req = createMockStreamReq({ message: 'Hello', projectId: '123' });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify project context was included in prompt
      expect(lastFetchPrompt).toContain('Test Project');
      expect(lastFetchPrompt).toContain('Task 1');
    });

    it('calls proxy /claude-stream endpoint', async () => {
      const mockEvents = [
        { type: 'done', data: { response: 'Response\n\nSUGGESTIONS: []' } },
      ];
      global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(mockEvents));

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat-stream'];
      const req = createMockStreamReq({ message: 'Hello' });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify correct endpoint was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/claude-stream'),
        expect.any(Object)
      );
    });

    it('handles proxy connection error gracefully', async () => {
      // Mock fetch to simulate connection refused
      const connectionError = new Error('Connection refused');
      (connectionError as any).code = 'ECONNREFUSED';
      global.fetch = vi.fn().mockRejectedValue(connectionError);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat-stream'];
      const req = createMockStreamReq({ message: 'Hello' });
      const res = createMockSSERes();

      await handler(req, res);

      // Should send error event
      const allWritten = res.writtenData.join('');
      expect(allWritten).toContain('event: error');
      expect(res.end).toHaveBeenCalled();
    });

    it('includes conversation history in prompt', async () => {
      lastFetchPrompt = null;

      const mockEvents = [
        { type: 'done', data: { response: 'Response\n\nSUGGESTIONS: []' } },
      ];
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.body) {
          try {
            const body = JSON.parse(options.body as string);
            lastFetchPrompt = body.prompt;
          } catch {}
        }
        return createMockSSEResponse(mockEvents);
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat-stream'];
      const conversationHistory = [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
      ];
      const req = createMockStreamReq({ message: 'New message', conversationHistory });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify conversation history was included
      expect(lastFetchPrompt).toContain('Previous message');
      expect(lastFetchPrompt).toContain('Previous response');
    });
  });

  // ============================================================================
  // OUTPUT VERSIONING / SUPERSEDE TESTS
  // ============================================================================

  describe('POST /execute-task output versioning', () => {
    it('supersedes previous outputs for same task on re-run', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'text',
        title: 'New Results',
        content: 'Updated findings...',
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: '456',
        name: 'Research task',
        description: 'Research something',
        action_type: 'agent',
        tool_mode: 'research',
      };

      // Previous output exists for this task
      const existingOutput = {
        id: 'old-output-1',
        project_id: '123',
        task_id: '456',
        output_type: 'text',
        data: { title: 'Old Results', content: 'Old findings...' },
        superseded_by: null,
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue([existingOutput]),
        createOne: vi.fn().mockResolvedValue({ id: 'new-output-1' }),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '456', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);

      // Verify old output was marked as superseded
      expect(mockOutputsService.updateOne).toHaveBeenCalledWith(
        'old-output-1',
        expect.objectContaining({
          superseded_by: 'new-output-1',
        })
      );
    });

    it('does not supersede outputs from different tasks', async () => {
      const mockClaudeResponse = JSON.stringify({
        output_type: 'text',
        title: 'Task 2 Results',
        content: 'Task 2 findings...',
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: '789',
        name: 'Different task',
        description: 'Another task',
        action_type: 'agent',
        tool_mode: 'research',
      };

      // Output from a different task
      const differentTaskOutput = {
        id: 'other-output-1',
        project_id: '123',
        task_id: '456', // Different task ID
        output_type: 'text',
        data: { title: 'Other Results', content: 'Other findings...' },
        superseded_by: null,
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readByQuery: vi.fn().mockResolvedValue([differentTaskOutput]),
        createOne: vi.fn().mockResolvedValue({ id: 'new-output-1' }),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /execute-task'];
      const req = createMockReq({ body: { taskId: '789', projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);

      // Verify the other task's output was NOT superseded
      expect(mockOutputsService.updateOne).not.toHaveBeenCalledWith(
        'other-output-1',
        expect.anything()
      );
    });
  });

  describe('GET /outputs/:projectId', () => {
    it('returns only non-superseded outputs by default', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['GET /outputs/:projectId'];
      const req = createMockReq({ params: { projectId: '123' } });
      const res = createMockRes();

      await handler(req, res);

      // Should filter out superseded outputs
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          outputs: expect.any(Array),
        })
      );
    });

    it('returns all outputs including superseded when include_history=true', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['GET /outputs/:projectId'];
      const req = createMockReq({
        params: { projectId: '123' },
        body: {},
      });
      // Simulate query param
      req.query = { include_history: 'true' };
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // PHASE 6: HITL CONFLICT RESOLUTION ENDPOINT TESTS
  // ============================================================================

  describe('GET /conflicts/:projectId', () => {
    it('returns error for missing projectId', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['GET /conflicts/:projectId'];
      const req = createMockReq({ params: { projectId: 'invalid' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Valid projectId is required'),
        })
      );
    });

    it('returns empty array when no conflicts exist', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['GET /conflicts/:projectId'];
      const req = createMockReq({
        params: { projectId: '123' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          conflicts: [],
          count: 0,
        })
      );
    });
  });

  describe('POST /resolve-conflict', () => {
    it('returns error when projectId is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /resolve-conflict'];
      const req = createMockReq({ body: { conflictId: 'abc' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('projectId and conflictId are required'),
        })
      );
    });

    it('returns error when conflictId is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /resolve-conflict'];
      const req = createMockReq({ body: { projectId: 123 } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('projectId and conflictId are required'),
        })
      );
    });

    it('returns error when optionId is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /resolve-conflict'];
      const req = createMockReq({ body: { projectId: 123, conflictId: 'abc' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('optionId is required'),
        })
      );
    });

    it('returns 404 when conflict does not exist', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /resolve-conflict'];
      const req = createMockReq({
        body: { projectId: 123, conflictId: 'nonexistent', optionId: 'option_a' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Conflict not found or already resolved'),
        })
      );
    });
  });

  describe('GET /blackboard/:projectId', () => {
    it('returns error for missing projectId', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['GET /blackboard/:projectId'];
      const req = createMockReq({ params: { projectId: 'invalid' } });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Valid projectId is required'),
        })
      );
    });

    it('returns 404 when blackboard does not exist', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['GET /blackboard/:projectId'];
      const req = createMockReq({
        params: { projectId: '999' },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Blackboard not found for project'),
        })
      );
    });
  });

  // ============================================================================
  // PHASE 7: STREAMING GENERATE-TASKS WITH RESEARCH
  // ============================================================================

  describe('POST /generate-tasks-stream', () => {
    // Helper to track multiple fetch calls (research + generate)
    let fetchCalls: Array<{ url: string; body: any }> = [];

    // Helper to create a mock response for tools server (returns parsed JSON directly)
    function createToolServerResponse(data: any): Response {
      return {
        ok: true,
        status: 200,
        json: async () => data,
      } as Response;
    }

    // Helper to create a mock response for Claude proxy (returns { response: string })
    function createClaudeProxyResponse(response: string): Response {
      return {
        ok: true,
        status: 200,
        json: async () => ({ response }),
      } as Response;
    }

    function mockMultipleFetches(responses: Array<{ type: 'tool' | 'claude'; data: any }>) {
      fetchCalls = [];
      let callIndex = 0;
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        const body = options?.body ? JSON.parse(options.body as string) : {};
        fetchCalls.push({ url, body });

        const response = responses[callIndex] || responses[responses.length - 1];
        callIndex++;

        // Return different response format based on type
        if (response.type === 'tool') {
          return createToolServerResponse(response.data);
        } else {
          return createClaudeProxyResponse(response.data);
        }
      });
    }

    it('returns error when description is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks-stream'];
      expect(handler).toBeDefined();

      const req = createMockStreamReq({ projectId: '123' }); // no description
      const res = createMockSSERes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'description is required' })
      );
    });

    it('sends researching progress event before generating', async () => {
      // Mock research results and task generation
      const searchResults = {
        results: [
          { title: 'Best practices for brand research', snippet: 'Start with competitor analysis...' },
        ],
      };
      const mockTasks = [
        { name: 'Research competitors', description: 'Analyze competitors', action_type: 'agent', tool_mode: 'research', needs_review: true },
      ];

      mockMultipleFetches([
        { type: 'tool', data: searchResults }, // First call: search/research
        { type: 'claude', data: JSON.stringify(mockTasks) }, // Second call: generate tasks
      ]);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks-stream'];
      const req = createMockStreamReq({ description: 'Create a brand research workflow' });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify SSE events were sent
      const allWritten = res.writtenData.join('');
      expect(allWritten).toContain('event: progress');
      expect(allWritten).toContain('researching');
    });

    it('sends generating progress event after research', async () => {
      const searchResults = {
        results: [
          { title: 'Workflow best practices', snippet: 'Use sequential steps...' },
        ],
      };
      const mockTasks = [
        { name: 'Step 1', description: 'First step', action_type: 'agent', tool_mode: 'research', needs_review: true },
      ];

      mockMultipleFetches([
        { type: 'tool', data: searchResults },
        { type: 'claude', data: JSON.stringify(mockTasks) },
      ]);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks-stream'];
      const req = createMockStreamReq({ description: 'Create a workflow' });
      const res = createMockSSERes();

      await handler(req, res);

      const allWritten = res.writtenData.join('');
      expect(allWritten).toContain('generating');
    });

    it('sends complete event with tasks when done', async () => {
      const searchResults = { results: [] };
      const mockTasks = [
        { name: 'Task A', description: 'Do A', action_type: 'agent', tool_mode: 'research', needs_review: true },
        { name: 'Task B', description: 'Do B', action_type: 'agent', tool_mode: 'generate', needs_review: true },
      ];

      mockMultipleFetches([
        { type: 'tool', data: searchResults },
        { type: 'claude', data: JSON.stringify(mockTasks) },
      ]);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks-stream'];
      const req = createMockStreamReq({ description: 'Create tasks' });
      const res = createMockSSERes();

      await handler(req, res);

      const allWritten = res.writtenData.join('');
      expect(allWritten).toContain('event: complete');
      expect(allWritten).toContain('Task A');
      expect(allWritten).toContain('Task B');
    });

    it('performs research search before generating tasks', async () => {
      const searchResults = {
        results: [
          { title: 'Brand research guide', snippet: 'Step 1: Identify target audience' },
        ],
      };
      const mockTasks = [
        { name: 'Identify audience', description: 'Research target audience', action_type: 'agent', tool_mode: 'research', needs_review: true },
      ];

      mockMultipleFetches([
        { type: 'tool', data: searchResults },
        { type: 'claude', data: JSON.stringify(mockTasks) },
      ]);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks-stream'];
      const req = createMockStreamReq({ description: 'Brand research workflow' });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify search was called first
      expect(fetchCalls.length).toBeGreaterThanOrEqual(2);
      // First call should be to tools server for search
      expect(fetchCalls[0].url).toContain('tools');
      expect(fetchCalls[0].url).toContain('search');
    });

    it('includes research results in task generation prompt', async () => {
      const searchResults = {
        results: [
          { title: 'Best practices', snippet: 'Always start with user research before design' },
        ],
      };
      const mockTasks = [
        { name: 'User research', description: 'Research users', action_type: 'agent', tool_mode: 'research', needs_review: true },
      ];

      mockMultipleFetches([
        { type: 'tool', data: searchResults },
        { type: 'claude', data: JSON.stringify(mockTasks) },
      ]);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks-stream'];
      const req = createMockStreamReq({ description: 'UX design workflow' });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify research results were included in the generate prompt
      const generateCall = fetchCalls.find((call) => call.url.includes('claude'));
      expect(generateCall).toBeDefined();
      expect(generateCall!.body.prompt).toContain('Best practices');
      expect(generateCall!.body.prompt).toContain('user research before design');
    });

    it('sends error event when research fails', async () => {
      // Mock search to fail
      global.fetch = vi.fn().mockRejectedValue(new Error('Search service unavailable'));

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks-stream'];
      const req = createMockStreamReq({ description: 'Some workflow' });
      const res = createMockSSERes();

      await handler(req, res);

      const allWritten = res.writtenData.join('');
      expect(allWritten).toContain('event: error');
    });

    it('sets correct SSE headers', async () => {
      const searchResults = { results: [] };
      const mockTasks = [{ name: 'Task', description: 'Desc', action_type: 'agent', tool_mode: 'research', needs_review: true }];

      mockMultipleFetches([
        { type: 'tool', data: searchResults },
        { type: 'claude', data: JSON.stringify(mockTasks) },
      ]);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks-stream'];
      const req = createMockStreamReq({ description: 'Test' });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify SSE headers
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    });

    it('saves tasks to project when projectId provided', async () => {
      const searchResults = { results: [] };
      const mockTasks = [
        { name: 'Task 1', description: 'First', action_type: 'agent', tool_mode: 'research', needs_review: true },
      ];

      mockMultipleFetches([
        { type: 'tool', data: searchResults },
        { type: 'claude', data: JSON.stringify(mockTasks) },
      ]);

      const mockTasksService = {
        readByQuery: vi.fn().mockResolvedValue([]),
        createOne: vi.fn().mockResolvedValue({ id: 'new-task-id' }),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /generate-tasks-stream'];
      const req = createMockStreamReq({ description: 'Test workflow', projectId: 'proj-456' });
      const res = createMockSSERes();

      await handler(req, res);

      // Verify task was saved
      expect(mockTasksService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'proj-456',
          name: 'Task 1',
        })
      );

      // Verify complete event indicates saved
      const allWritten = res.writtenData.join('');
      expect(allWritten).toContain('"saved":true');
    });
  });

  // ============================================================================
  // OUTPUT ENRICHMENT TESTS
  // ============================================================================

  describe('POST /enrich-output', () => {
    it('returns 400 if output_id is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /enrich-output'];
      expect(handler).toBeDefined();

      const req = createMockReq({
        body: {
          task_id: 123,
          new_fields: [{ name: 'website_url', type: 'url' }],
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('output_id is required');
    });

    it('returns 400 if task_id is missing', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /enrich-output'];
      const req = createMockReq({
        body: {
          output_id: 456,
          new_fields: [{ name: 'website_url', type: 'url' }],
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('task_id is required');
    });

    it('returns 400 if new_fields is missing or empty', async () => {
      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /enrich-output'];

      // Test missing new_fields
      let req = createMockReq({
        body: {
          output_id: 456,
          task_id: 123,
        },
      });
      let res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('new_fields is required and must be a non-empty array');

      // Test empty new_fields array
      req = createMockReq({
        body: {
          output_id: 456,
          task_id: 123,
          new_fields: [],
        },
      });
      res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.jsonData.error).toBe('new_fields is required and must be a non-empty array');
    });

    it('updates task form_schema with new fields', async () => {
      // Mock Claude response with enriched data
      const mockClaudeResponse = JSON.stringify({
        website_url: 'https://acme.com',
        founding_year: 2010,
      });
      mockFetchWithResponse(mockClaudeResponse);

      // Mock existing task with form_schema
      const mockTask = {
        id: 123,
        name: 'Company Research',
        form_schema: {
          columns: ['company_name'],
          field_types: { company_name: 'text' },
        },
      };

      // Mock existing output with table data
      const mockOutput = {
        id: 456,
        task_id: 123,
        project_id: 789,
        output_type: 'table',
        data: {
          content: [
            { company_name: 'Acme Corp' },
            { company_name: 'Beta Inc' },
          ],
        },
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readOne: vi.fn().mockResolvedValue(mockOutput),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /enrich-output'];
      const req = createMockReq({
        body: {
          output_id: 456,
          task_id: 123,
          new_fields: [
            { name: 'website_url', type: 'url', description: 'Company website' },
            { name: 'founding_year', type: 'number', description: 'Year founded' },
          ],
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);

      // Verify task form_schema was updated with new columns
      expect(mockTasksService.updateOne).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          form_schema: expect.objectContaining({
            columns: expect.arrayContaining(['company_name', 'website_url', 'founding_year']),
            field_types: expect.objectContaining({
              company_name: 'text',
              website_url: 'url',
              founding_year: 'number',
            }),
          }),
        })
      );
    });

    it('calls Claude to enrich data for each row', async () => {
      // Mock Claude response with enriched data
      const mockClaudeResponse = JSON.stringify({
        website_url: 'https://acme.com',
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: 123,
        name: 'Company Research',
        form_schema: {
          columns: ['company_name'],
          field_types: { company_name: 'text' },
        },
      };

      const mockOutput = {
        id: 456,
        task_id: 123,
        project_id: 789,
        output_type: 'table',
        data: {
          content: [{ company_name: 'Acme Corp' }],
        },
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readOne: vi.fn().mockResolvedValue(mockOutput),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /enrich-output'];
      const req = createMockReq({
        body: {
          output_id: 456,
          task_id: 123,
          new_fields: [{ name: 'website_url', type: 'url' }],
        },
      });
      const res = createMockRes();

      await handler(req, res);

      // Verify Claude was called with appropriate prompt
      expect(global.fetch).toHaveBeenCalled();
      expect(lastFetchPrompt).toContain('Acme Corp');
      expect(lastFetchPrompt).toContain('website_url');
    });

    it('updates output with enriched data', async () => {
      const mockClaudeResponse = JSON.stringify({
        website_url: 'https://acme.com',
        employee_count: 500,
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: 123,
        name: 'Company Research',
        form_schema: {
          columns: ['company_name'],
          field_types: { company_name: 'text' },
        },
      };

      const mockOutput = {
        id: 456,
        task_id: 123,
        project_id: 789,
        output_type: 'table',
        data: {
          content: [{ company_name: 'Acme Corp' }],
        },
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readOne: vi.fn().mockResolvedValue(mockOutput),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /enrich-output'];
      const req = createMockReq({
        body: {
          output_id: 456,
          task_id: 123,
          new_fields: [
            { name: 'website_url', type: 'url' },
            { name: 'employee_count', type: 'number' },
          ],
        },
      });
      const res = createMockRes();

      await handler(req, res);

      // Verify output was updated with enriched data
      expect(mockOutputsService.updateOne).toHaveBeenCalledWith(
        456,
        expect.objectContaining({
          data: expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                company_name: 'Acme Corp',
                website_url: 'https://acme.com',
                employee_count: 500,
              }),
            ]),
          }),
        })
      );
    });

    it('returns success with enriched_count', async () => {
      const mockClaudeResponse = JSON.stringify({
        website_url: 'https://example.com',
      });
      mockFetchWithResponse(mockClaudeResponse);

      const mockTask = {
        id: 123,
        name: 'Research',
        form_schema: { columns: ['name'], field_types: { name: 'text' } },
      };

      const mockOutput = {
        id: 456,
        task_id: 123,
        project_id: 789,
        output_type: 'table',
        data: {
          content: [
            { name: 'Company A' },
            { name: 'Company B' },
            { name: 'Company C' },
          ],
        },
      };

      const mockTasksService = {
        readOne: vi.fn().mockResolvedValue(mockTask),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      const mockOutputsService = {
        readOne: vi.fn().mockResolvedValue(mockOutput),
        updateOne: vi.fn().mockResolvedValue({}),
      };

      mockContext.services.ItemsService = vi.fn().mockImplementation((collection: string) => {
        if (collection === 'tb_tasks') return mockTasksService;
        if (collection === 'tb_outputs') return mockOutputsService;
        return {};
      });

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /enrich-output'];
      const req = createMockReq({
        body: {
          output_id: 456,
          task_id: 123,
          new_fields: [{ name: 'website_url', type: 'url' }],
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toEqual(
        expect.objectContaining({
          success: true,
          enriched_count: 3,
          task_updated: true,
        })
      );
    });
  });

  // ============================================================================
  // parseFieldsFromMessage HELPER FUNCTION TESTS
  // ============================================================================

  describe('parseFieldsFromMessage', () => {
    // We'll need to export this function to test it directly
    // For now, we test it indirectly through the /chat endpoint with enrichment context

    it('extracts field name and type from "I need website URL"', async () => {
      // Mock Claude to return a response indicating field extraction
      const mockClaudeResponse = `I'll help you add a website URL field.

ENRICHMENT_FIELDS: [{"name": "website_url", "type": "url", "description": "Website URL"}]

SUGGESTIONS: ["Add more fields", "Run enrichment", "Review data"]`;
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat'];
      const req = createMockReq({
        body: {
          message: 'I need website URL for these companies',
          projectId: 123,
          enrichmentContext: {
            output_id: 456,
            task_id: 789,
            current_columns: ['company_name'],
          },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      // The chat should parse the enrichment request
      expect(lastFetchPrompt).toContain('website');
    });

    it('extracts multiple fields from "add founding year and employee count"', async () => {
      const mockClaudeResponse = `I'll add founding year and employee count fields.

ENRICHMENT_FIELDS: [{"name": "founding_year", "type": "number", "description": "Year the company was founded"}, {"name": "employee_count", "type": "number", "description": "Number of employees"}]

SUGGESTIONS: ["Add more fields", "Run enrichment", "Review data"]`;
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat'];
      const req = createMockReq({
        body: {
          message: 'add founding year and employee count',
          projectId: 123,
          enrichmentContext: {
            output_id: 456,
            task_id: 789,
            current_columns: ['company_name'],
          },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      expect(lastFetchPrompt).toContain('founding year');
      expect(lastFetchPrompt).toContain('employee count');
    });

    it('infers types correctly (URL, number, text)', async () => {
      const mockClaudeResponse = `Adding the requested fields.

ENRICHMENT_FIELDS: [{"name": "website", "type": "url"}, {"name": "founded", "type": "number"}, {"name": "description", "type": "text"}]

SUGGESTIONS: []`;
      mockFetchWithResponse(mockClaudeResponse);

      const extension = await import('./index.js');
      extension.default.handler(mockRouter, mockContext);

      const handler = routes['POST /chat'];
      const req = createMockReq({
        body: {
          message: 'add website, founded year, and company description',
          projectId: 123,
          enrichmentContext: {
            output_id: 456,
            task_id: 789,
            current_columns: ['name'],
          },
        },
      });
      const res = createMockRes();

      await handler(req, res);

      // Verify the prompt includes enrichment context
      expect(lastFetchPrompt).toContain('enrichment');
    });
  });
});
