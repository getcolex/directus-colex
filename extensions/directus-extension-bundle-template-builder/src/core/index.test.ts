/**
 * Core Endpoint Tests
 *
 * Tests for health, blackboard, conflict resolution, and action history routes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import endpoint, { recordAction, getActionHistory } from './index';

// Mock the multipart parser for file upload tests
vi.mock('../shared/multipart-parser', () => ({
  parseMultipartRequest: vi.fn(),
}));

import { parseMultipartRequest } from '../shared/multipart-parser';

// Mock router
function createMockRouter() {
  const routes: Record<string, Record<string, Function>> = {
    get: {},
    post: {},
    put: {},
    delete: {},
  };

  return {
    routes,
    get: vi.fn((path: string, handler: Function) => {
      routes.get[path] = handler;
    }),
    post: vi.fn((path: string, handler: Function) => {
      routes.post[path] = handler;
    }),
    put: vi.fn((path: string, handler: Function) => {
      routes.put[path] = handler;
    }),
    delete: vi.fn((path: string, handler: Function) => {
      routes.delete[path] = handler;
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

// Mock ItemsService for blackboard
function createMockItemsService() {
  const store: Record<number, any> = {};
  let nextId = 1;

  return vi.fn().mockImplementation((collection: string) => {
    return {
      readByQuery: vi.fn(async (query: any) => {
        const projectId = query.filter?.project_id?._eq;
        if (projectId && store[projectId]) {
          return [store[projectId]];
        }
        return [];
      }),
      createOne: vi.fn(async (data: any) => {
        const id = nextId++;
        store[data.project_id] = { id, ...data };
        return id;
      }),
      updateOne: vi.fn(async (id: number, data: any) => {
        for (const projectId of Object.keys(store)) {
          if (store[Number(projectId)]?.id === id) {
            store[Number(projectId)] = { ...store[Number(projectId)], ...data };
            return;
          }
        }
      }),
      deleteOne: vi.fn(async (id: number) => {}),
    };
  });
}

describe('TB-Core Endpoint', () => {
  let router: ReturnType<typeof createMockRouter>;
  let ItemsService: ReturnType<typeof createMockItemsService>;

  beforeEach(() => {
    router = createMockRouter();
    ItemsService = createMockItemsService();

    endpoint.handler(router, {
      services: { ItemsService },
      logger: { info: vi.fn(), error: vi.fn() },
    });
  });

  describe('endpoint metadata', () => {
    it('has correct id', () => {
      expect(endpoint.id).toBe('tb-core');
    });
  });

  describe('GET /health', () => {
    it('returns healthy status', async () => {
      const handler = router.routes.get['/health'];
      expect(handler).toBeDefined();

      const req = {};
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.status).toBe('healthy');
      expect(res.data.service).toBe('tb-core');
      expect(res.data.timestamp).toBeDefined();
    });

    it('reports API availability', async () => {
      const handler = router.routes.get['/health'];
      const res = createMockResponse();

      await handler({}, res);

      expect(res.data).toHaveProperty('anthropicSdkAvailable');
      expect(res.data).toHaveProperty('openrouterAvailable');
    });
  });

  describe('GET /blackboard/:projectId', () => {
    it('returns 404 when blackboard not found', async () => {
      const handler = router.routes.get['/blackboard/:projectId'];
      expect(handler).toBeDefined();

      const req = {
        params: { projectId: '999' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.data.error).toBe('Blackboard not found');
    });
  });

  describe('GET /conflicts/:projectId', () => {
    it('returns empty conflicts array for new project', async () => {
      const handler = router.routes.get['/conflicts/:projectId'];
      expect(handler).toBeDefined();

      const req = {
        params: { projectId: '1' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.conflicts).toEqual([]);
    });
  });

  describe('POST /resolve-conflict', () => {
    it('returns 400 when projectId missing', async () => {
      const handler = router.routes.post['/resolve-conflict'];
      expect(handler).toBeDefined();

      const req = {
        body: { conflictId: 'abc123' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('projectId');
    });

    it('returns 400 when conflictId missing', async () => {
      const handler = router.routes.post['/resolve-conflict'];

      const req = {
        body: { projectId: 1 },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('conflictId');
    });

    it('returns 400 when neither optionId nor customWrites provided', async () => {
      const handler = router.routes.post['/resolve-conflict'];

      const req = {
        body: { projectId: 1, conflictId: 'abc123' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('optionId');
    });
  });

  describe('GET /outputs/:projectId', () => {
    it('registers the outputs route', () => {
      const handler = router.routes.get['/outputs/:projectId'];
      expect(handler).toBeDefined();
    });
  });

  describe('POST /undo', () => {
    it('returns 400 when conversationId missing', async () => {
      const handler = router.routes.post['/undo'];
      expect(handler).toBeDefined();

      const req = {
        body: {},
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('conversationId');
    });

    it('returns success:false when no actions to undo', async () => {
      const handler = router.routes.post['/undo'];

      const req = {
        body: { conversationId: 'test-conv-empty' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.success).toBe(false);
      expect(res.data.message).toBe('No actions to undo');
    });
  });

  describe('GET /action-history', () => {
    it('returns 400 when conversationId missing', async () => {
      const handler = router.routes.get['/action-history'];
      expect(handler).toBeDefined();

      const req = {
        query: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('conversationId');
    });

    it('returns empty array for new conversation', async () => {
      const handler = router.routes.get['/action-history'];

      const req = {
        query: { conversationId: 'test-conv-new' },
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.conversationId).toBe('test-conv-new');
      expect(res.data.actions).toEqual([]);
      expect(res.data.count).toBe(0);
    });
  });
});

describe('Skill Registration Endpoints', () => {
  let router: ReturnType<typeof createMockRouter>;
  let mockFilesService: any;
  let mockBlackboardService: any;
  let mockCollectionService: any;

  function createSkillTestItemsService() {
    return vi.fn().mockImplementation((collection: string) => {
      if (collection === 'directus_files') {
        return mockFilesService;
      }
      if (collection === 'tb_blackboard') {
        return mockBlackboardService;
      }
      return mockCollectionService;
    });
  }

  beforeEach(() => {
    router = createMockRouter();

    mockFilesService = {
      readOne: vi.fn().mockResolvedValue({
        id: 'file-123',
        filename_download: 'brand-guidelines.pdf',
        type: 'application/pdf',
      }),
    };

    mockBlackboardService = {
      readByQuery: vi.fn().mockResolvedValue([
        {
          id: 1,
          project_id: 1,
          entries: {},
          conflicts: [],
        },
      ]),
      updateOne: vi.fn().mockResolvedValue({}),
    };

    mockCollectionService = {
      readByQuery: vi.fn().mockResolvedValue([{ count: 100 }]),
    };

    const ItemsService = createSkillTestItemsService();

    endpoint.handler(router, {
      services: { ItemsService },
      logger: { info: vi.fn(), error: vi.fn() },
    });
  });

  describe('POST /register-file-skill', () => {
    it('registers the route', () => {
      const handler = router.routes.post['/register-file-skill'];
      expect(handler).toBeDefined();
    });

    it('returns 400 when projectId is missing', async () => {
      const handler = router.routes.post['/register-file-skill'];
      const req = {
        body: { fileId: 'file-123', skillKey: '@doc', summary: 'A document' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('projectId');
    });

    it('returns 400 when fileId is missing', async () => {
      const handler = router.routes.post['/register-file-skill'];
      const req = {
        body: { projectId: 1, skillKey: '@doc', summary: 'A document' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('fileId');
    });

    it('returns 400 when skillKey is missing', async () => {
      const handler = router.routes.post['/register-file-skill'];
      const req = {
        body: { projectId: 1, fileId: 'file-123', summary: 'A document' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('skillKey');
    });

    it('returns 400 when summary is missing', async () => {
      const handler = router.routes.post['/register-file-skill'];
      const req = {
        body: { projectId: 1, fileId: 'file-123', skillKey: '@doc' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('summary');
    });

    it('returns success when all params provided', async () => {
      const handler = router.routes.post['/register-file-skill'];
      const req = {
        body: {
          projectId: 1,
          fileId: 'file-123',
          skillKey: '@brand_guidelines',
          summary: 'Brand guidelines document',
        },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.success).toBe(true);
      expect(res.data.skillKey).toBe('@brand_guidelines');
    });
  });

  describe('POST /register-collection-skill', () => {
    it('registers the route', () => {
      const handler = router.routes.post['/register-collection-skill'];
      expect(handler).toBeDefined();
    });

    it('returns 400 when projectId is missing', async () => {
      const handler = router.routes.post['/register-collection-skill'];
      const req = {
        body: { collection: 'customers', skillKey: '@customers', summary: 'Customer data' },
        schema: { collections: { customers: { fields: {} } } },
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('projectId');
    });

    it('returns 400 when collection is missing', async () => {
      const handler = router.routes.post['/register-collection-skill'];
      const req = {
        body: { projectId: 1, skillKey: '@customers', summary: 'Customer data' },
        schema: { collections: {} },
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('collection');
    });

    it('returns 400 when skillKey is missing', async () => {
      const handler = router.routes.post['/register-collection-skill'];
      const req = {
        body: { projectId: 1, collection: 'customers', summary: 'Customer data' },
        schema: { collections: { customers: { fields: {} } } },
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('skillKey');
    });

    it('returns 400 when summary is missing', async () => {
      const handler = router.routes.post['/register-collection-skill'];
      const req = {
        body: { projectId: 1, collection: 'customers', skillKey: '@customers' },
        schema: { collections: { customers: { fields: {} } } },
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('summary');
    });

    it('returns success when all params provided', async () => {
      const handler = router.routes.post['/register-collection-skill'];
      const req = {
        body: {
          projectId: 1,
          collection: 'customers',
          skillKey: '@customers',
          summary: 'Customer database',
        },
        schema: { collections: { customers: { fields: { id: { type: 'integer' } } } } },
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.success).toBe(true);
      expect(res.data.skillKey).toBe('@customers');
    });
  });

  describe('DELETE /unregister-skill/:projectId/:skillKey', () => {
    it('registers the route', () => {
      const handler = router.routes.delete['/unregister-skill/:projectId/:skillKey'];
      expect(handler).toBeDefined();
    });

    it('returns error when skill not found', async () => {
      const handler = router.routes.delete['/unregister-skill/:projectId/:skillKey'];
      const req = {
        params: { projectId: '1', skillKey: '@nonexistent' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.success).toBe(false);
      expect(res.data.error).toContain('not found');
    });
  });
});

describe('Project Files Endpoints', () => {
  let router: ReturnType<typeof createMockRouter>;
  let mockProjectFilesService: any;
  let mockFilesService: any;
  let mockProjectsService: any;

  function createFileTestItemsService() {
    return vi.fn().mockImplementation((collection: string) => {
      if (collection === 'tb_project_files') {
        return mockProjectFilesService;
      }
      if (collection === 'tb_projects') {
        return mockProjectsService;
      }
      // Default mock for other collections
      return {
        readByQuery: vi.fn().mockResolvedValue([]),
        readOne: vi.fn().mockResolvedValue(null),
        createOne: vi.fn().mockResolvedValue(1),
        updateOne: vi.fn().mockResolvedValue({}),
        deleteOne: vi.fn().mockResolvedValue({}),
      };
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();

    mockProjectFilesService = {
      readByQuery: vi.fn().mockResolvedValue([
        {
          id: 1,
          project_id: 1,
          task_id: null,
          file_type: 'input',
          date_created: '2024-01-01T00:00:00Z',
          file_id: {
            id: 'file-abc',
            filename_download: 'document.pdf',
            title: 'Document',
            type: 'application/pdf',
            filesize: 12345,
            uploaded_on: '2024-01-01T00:00:00Z',
          },
        },
      ]),
      readOne: vi.fn().mockResolvedValue({
        id: 1,
        project_id: 1,
        task_id: null,
        file_type: 'input',
        date_created: '2024-01-01T00:00:00Z',
        file_id: {
          id: 'file-abc',
          filename_download: 'document.pdf',
          title: 'Document',
          type: 'application/pdf',
          filesize: 12345,
        },
      }),
      createOne: vi.fn().mockResolvedValue(1),
      deleteOne: vi.fn().mockResolvedValue({}),
    };

    mockFilesService = {
      uploadOne: vi.fn().mockResolvedValue('file-new-123'),
      deleteOne: vi.fn().mockResolvedValue({}),
    };

    mockProjectsService = {
      readOne: vi.fn().mockResolvedValue({ id: 1, name: 'Test Project' }),
    };

    const ItemsService = createFileTestItemsService();
    const FilesService = vi.fn().mockImplementation(() => mockFilesService);

    endpoint.handler(router, {
      services: { ItemsService, FilesService },
      logger: { info: vi.fn(), error: vi.fn() },
    });
  });

  describe('GET /projects/:projectId/files', () => {
    it('registers the route', () => {
      const handler = router.routes.get['/projects/:projectId/files'];
      expect(handler).toBeDefined();
    });

    it('returns files for a project', async () => {
      const handler = router.routes.get['/projects/:projectId/files'];
      const req = {
        params: { projectId: '1' },
        query: {},
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.files).toBeDefined();
      expect(res.data.files).toHaveLength(1);
      expect(res.data.files[0].id).toBe(1);
      expect(res.data.files[0].file.filename_download).toBe('document.pdf');
    });

    it('filters by file_type', async () => {
      const handler = router.routes.get['/projects/:projectId/files'];
      const req = {
        params: { projectId: '1' },
        query: { file_type: 'template' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      // Verify filter was passed to service
      expect(mockProjectFilesService.readByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            file_type: { _eq: 'template' },
          }),
        })
      );
    });

    it('filters by task_id', async () => {
      const handler = router.routes.get['/projects/:projectId/files'];
      const req = {
        params: { projectId: '1' },
        query: { task_id: '5' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(mockProjectFilesService.readByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            task_id: { _eq: 5 },
          }),
        })
      );
    });
  });

  describe('POST /projects/:projectId/files', () => {
    it('registers the route', () => {
      const handler = router.routes.post['/projects/:projectId/files'];
      expect(handler).toBeDefined();
    });

    it('returns 404 when project not found', async () => {
      mockProjectsService.readOne.mockRejectedValue(new Error('Not found'));

      const handler = router.routes.post['/projects/:projectId/files'];
      const req = {
        params: { projectId: '999' },
        headers: { 'content-type': 'multipart/form-data' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.data.error).toBe('Project not found');
    });

    it('returns 400 when no file uploaded', async () => {
      (parseMultipartRequest as any).mockResolvedValue({ fields: {}, file: null });

      const handler = router.routes.post['/projects/:projectId/files'];
      const req = {
        params: { projectId: '1' },
        headers: { 'content-type': 'multipart/form-data' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toBe('No file uploaded');
    });

    it('returns 400 for invalid file_type', async () => {
      (parseMultipartRequest as any).mockResolvedValue({
        fields: { file_type: 'invalid' },
        file: { filename: 'test.pdf', mimeType: 'application/pdf', stream: {} },
      });

      const handler = router.routes.post['/projects/:projectId/files'];
      const req = {
        params: { projectId: '1' },
        headers: { 'content-type': 'multipart/form-data' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.data.error).toContain('file_type');
    });

    it('uploads file and creates project_file record', async () => {
      const mockStream = { pipe: vi.fn() };
      (parseMultipartRequest as any).mockResolvedValue({
        fields: { file_type: 'input', task_id: '5' },
        file: { filename: 'test.pdf', mimeType: 'application/pdf', stream: mockStream },
      });

      const handler = router.routes.post['/projects/:projectId/files'];
      const req = {
        params: { projectId: '1' },
        headers: { 'content-type': 'multipart/form-data' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.success).toBe(true);
      expect(res.data.id).toBe(1);
      expect(mockFilesService.uploadOne).toHaveBeenCalled();
      expect(mockProjectFilesService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 1,
          file_type: 'input',
          task_id: 5,
        })
      );
    });
  });

  describe('DELETE /projects/:projectId/files/:fileId', () => {
    it('registers the route', () => {
      const handler = router.routes.delete['/projects/:projectId/files/:fileId'];
      expect(handler).toBeDefined();
    });

    it('returns 404 when file not found', async () => {
      mockProjectFilesService.readByQuery.mockResolvedValue([]);

      const handler = router.routes.delete['/projects/:projectId/files/:fileId'];
      const req = {
        params: { projectId: '1', fileId: '999' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.data.error).toContain('not found');
    });

    it('deletes file association and underlying file', async () => {
      mockProjectFilesService.readByQuery.mockResolvedValue([
        { id: 1, project_id: 1, file_id: 'file-abc' },
      ]);

      const handler = router.routes.delete['/projects/:projectId/files/:fileId'];
      const req = {
        params: { projectId: '1', fileId: '1' },
        schema: {},
        accountability: {},
      };
      const res = createMockResponse();

      await handler(req, res);

      expect(res.data.success).toBe(true);
      expect(res.data.deleted_id).toBe('1');
      expect(mockProjectFilesService.deleteOne).toHaveBeenCalledWith('1');
      expect(mockFilesService.deleteOne).toHaveBeenCalledWith('file-abc');
    });
  });
});

describe('Action History Functions', () => {
  describe('recordAction', () => {
    it('records an action with timestamp', () => {
      const convId = 'test-record-' + Date.now();
      recordAction(convId, {
        type: 'create',
        collection: 'tb_tasks',
        id: 123,
        newData: { name: 'Test Task' },
      });

      const history = getActionHistory(convId);
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('create');
      expect(history[0].id).toBe(123);
      expect(history[0].timestamp).toBeDefined();
    });

    it('appends multiple actions', () => {
      const convId = 'test-multiple-' + Date.now();
      recordAction(convId, { type: 'create', collection: 'tb_tasks', id: 1 });
      recordAction(convId, { type: 'update', collection: 'tb_tasks', id: 1, previousData: { name: 'Old' } });
      recordAction(convId, { type: 'delete', collection: 'tb_tasks', id: 1, previousData: { name: 'Task' } });

      const history = getActionHistory(convId);
      expect(history).toHaveLength(3);
    });
  });

  describe('getActionHistory', () => {
    it('returns empty array for unknown conversation', () => {
      const history = getActionHistory('unknown-conv-id');
      expect(history).toEqual([]);
    });
  });
});
