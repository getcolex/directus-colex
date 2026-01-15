/**
 * File Skill Service Tests
 *
 * Service to register file uploads as blackboard skills and read their content.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFileSkillService, FileSkillService } from './file-skill-service';

describe('FileSkillService', () => {
  let service: FileSkillService;
  let mockItemsService: any;
  let mockFilesService: any;

  // Mock Directus services factory
  const mockItemsServiceFactory = vi.fn();
  const mockSchema = { collections: {} };
  const mockAccountability = { user: 'user-123', admin: false };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ItemsService instances
    mockItemsService = {
      readByQuery: vi.fn(),
      updateOne: vi.fn(),
      readOne: vi.fn(),
    };

    mockFilesService = {
      readOne: vi.fn(),
    };

    mockItemsServiceFactory.mockImplementation((collection: string) => {
      if (collection === 'directus_files') return mockFilesService;
      return mockItemsService;
    });

    service = createFileSkillService(
      mockItemsServiceFactory,
      mockSchema,
      mockAccountability
    );
  });

  describe('registerFileSkill', () => {
    it('creates a skill entry on the blackboard for a file', async () => {
      const projectId = 1;
      const fileId = 'file-abc-123';
      const skillKey = '@brand_guidelines';
      const summary = 'Brand guidelines document with logo usage and colors';

      // Mock file info
      mockFilesService.readOne.mockResolvedValue({
        id: fileId,
        filename_download: 'brand-guidelines.pdf',
        type: 'application/pdf',
      });

      // Mock existing blackboard
      mockItemsService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: projectId,
          entries: {},
          conflicts: [],
        },
      ]);

      mockItemsService.updateOne.mockResolvedValue({});

      const result = await service.registerFileSkill({
        projectId,
        fileId,
        skillKey,
        summary,
      });

      expect(result.success).toBe(true);
      expect(result.skillKey).toBe('@brand_guidelines');

      // Verify blackboard was updated with skill entry
      expect(mockItemsService.updateOne).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          entries: expect.objectContaining({
            '@brand_guidelines': expect.objectContaining({
              key: '@brand_guidelines',
              value: expect.objectContaining({
                type: 'file_skill',
                file_id: fileId,
                filename: 'brand-guidelines.pdf',
                content_type: 'application/pdf',
                summary,
              }),
              source_type: 'user_input',
            }),
          }),
        })
      );
    });

    it('normalizes skill key to start with @', async () => {
      mockFilesService.readOne.mockResolvedValue({
        id: 'file-1',
        filename_download: 'doc.pdf',
        type: 'application/pdf',
      });

      mockItemsService.readByQuery.mockResolvedValue([
        { id: 1, project_id: 1, entries: {}, conflicts: [] },
      ]);
      mockItemsService.updateOne.mockResolvedValue({});

      // Pass without @ prefix
      const result = await service.registerFileSkill({
        projectId: 1,
        fileId: 'file-1',
        skillKey: 'brand_doc',
        summary: 'A document',
      });

      expect(result.skillKey).toBe('@brand_doc');
    });

    it('returns error if file not found', async () => {
      mockFilesService.readOne.mockRejectedValue(new Error('File not found'));

      const result = await service.registerFileSkill({
        projectId: 1,
        fileId: 'nonexistent',
        skillKey: '@missing',
        summary: 'Missing file',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('returns error if blackboard not found', async () => {
      mockFilesService.readOne.mockResolvedValue({
        id: 'file-1',
        filename_download: 'doc.pdf',
        type: 'application/pdf',
      });
      mockItemsService.readByQuery.mockResolvedValue([]);

      const result = await service.registerFileSkill({
        projectId: 999,
        fileId: 'file-1',
        skillKey: '@doc',
        summary: 'A document',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blackboard not found');
    });
  });

  describe('readFileContent', () => {
    it('reads file content and returns extracted text', async () => {
      const projectId = 1;
      const skillKey = '@brand_guidelines';

      // Mock blackboard with file skill
      mockItemsService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: projectId,
          entries: {
            '@brand_guidelines': {
              key: '@brand_guidelines',
              value: {
                type: 'file_skill',
                file_id: 'file-abc',
                filename: 'brand.pdf',
                content_type: 'application/pdf',
                summary: 'Brand guidelines',
                extracted_text: 'Logo should be used with 20px padding...',
              },
              source_type: 'user_input',
              source_id: 'register',
              priority: 100,
              timestamp: '2025-01-01T00:00:00Z',
            },
          },
          conflicts: [],
        },
      ]);

      const result = await service.readFileContent({
        projectId,
        skillKey,
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Logo should be used with 20px padding...');
      expect(result.filename).toBe('brand.pdf');
    });

    it('returns error if skill key not found', async () => {
      mockItemsService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: 1,
          entries: {},
          conflicts: [],
        },
      ]);

      const result = await service.readFileContent({
        projectId: 1,
        skillKey: '@nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error if skill is not a file skill', async () => {
      mockItemsService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: 1,
          entries: {
            '@customers': {
              key: '@customers',
              value: {
                type: 'collection_skill',
                collection: 'customers',
                summary: 'Customer data',
                row_count: 100,
                schema: {},
              },
              source_type: 'user_input',
              source_id: 'register',
              priority: 100,
              timestamp: '2025-01-01T00:00:00Z',
            },
          },
          conflicts: [],
        },
      ]);

      const result = await service.readFileContent({
        projectId: 1,
        skillKey: '@customers',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a file skill');
    });

    it('returns summary when no extracted text available', async () => {
      mockItemsService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: 1,
          entries: {
            '@doc': {
              key: '@doc',
              value: {
                type: 'file_skill',
                file_id: 'file-1',
                filename: 'doc.pdf',
                content_type: 'application/pdf',
                summary: 'Important document about branding',
                // No extracted_text
              },
              source_type: 'user_input',
              source_id: 'register',
              priority: 100,
              timestamp: '2025-01-01T00:00:00Z',
            },
          },
          conflicts: [],
        },
      ]);

      const result = await service.readFileContent({
        projectId: 1,
        skillKey: '@doc',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Important document about branding');
      expect(result.contentSource).toBe('summary');
    });
  });

  describe('unregisterFileSkill', () => {
    it('removes a file skill from the blackboard', async () => {
      const projectId = 1;

      mockItemsService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: projectId,
          entries: {
            '@brand_guidelines': {
              key: '@brand_guidelines',
              value: { type: 'file_skill', file_id: 'file-1' },
              source_type: 'user_input',
              source_id: 'register',
              priority: 100,
              timestamp: '2025-01-01T00:00:00Z',
            },
            brand_name: {
              key: 'brand_name',
              value: 'Acme Corp',
              source_type: 'user_input',
              source_id: 'form-1',
              priority: 100,
              timestamp: '2025-01-01T00:00:00Z',
            },
          },
          conflicts: [],
        },
      ]);

      mockItemsService.updateOne.mockResolvedValue({});

      const result = await service.unregisterFileSkill({
        projectId,
        skillKey: '@brand_guidelines',
      });

      expect(result.success).toBe(true);

      // Verify the skill was removed but other entries remain
      expect(mockItemsService.updateOne).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          entries: expect.objectContaining({
            brand_name: expect.any(Object),
          }),
        })
      );

      // Verify skill was removed
      const updateCall = mockItemsService.updateOne.mock.calls[0][1];
      expect(updateCall.entries['@brand_guidelines']).toBeUndefined();
    });
  });
});
