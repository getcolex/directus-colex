/**
 * Collection Skill Service Tests
 *
 * Service to register Directus collections as blackboard skills and query them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCollectionSkillService, CollectionSkillService } from './collection-skill-service';

describe('CollectionSkillService', () => {
  let service: CollectionSkillService;
  let mockBlackboardService: any;
  let mockTargetCollectionService: any;

  // Mock Directus services factory
  const mockItemsServiceFactory = vi.fn();
  const mockSchema = {
    collections: {
      customers: {
        fields: {
          id: { field: 'id', type: 'integer' },
          name: { field: 'name', type: 'string' },
          email: { field: 'email', type: 'string' },
          status: { field: 'status', type: 'string', meta: { options: { choices: [{ value: 'active' }, { value: 'inactive' }] } } },
        },
      },
      products: {
        fields: {
          id: { field: 'id', type: 'integer' },
          title: { field: 'title', type: 'string' },
          price: { field: 'price', type: 'decimal' },
        },
      },
    },
  };
  const mockAccountability = { user: 'user-123', admin: false };

  beforeEach(() => {
    vi.clearAllMocks();

    mockBlackboardService = {
      readByQuery: vi.fn(),
      updateOne: vi.fn(),
    };

    mockTargetCollectionService = {
      readByQuery: vi.fn(),
    };

    mockItemsServiceFactory.mockImplementation((collection: string) => {
      if (collection === 'tb_blackboard') return mockBlackboardService;
      return mockTargetCollectionService;
    });

    service = createCollectionSkillService(
      mockItemsServiceFactory,
      mockSchema,
      mockAccountability
    );
  });

  describe('registerCollectionSkill', () => {
    it('creates a skill entry on the blackboard for a collection', async () => {
      const projectId = 1;
      const collection = 'customers';
      const skillKey = '@customers';
      const summary = 'Customer database with contact info';

      // Mock row count query
      mockTargetCollectionService.readByQuery.mockResolvedValue([
        { count: 150 },
      ]);

      // Mock existing blackboard
      mockBlackboardService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: projectId,
          entries: {},
          conflicts: [],
        },
      ]);

      mockBlackboardService.updateOne.mockResolvedValue({});

      const result = await service.registerCollectionSkill({
        projectId,
        collection,
        skillKey,
        summary,
      });

      expect(result.success).toBe(true);
      expect(result.skillKey).toBe('@customers');

      // Verify blackboard was updated with skill entry
      expect(mockBlackboardService.updateOne).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          entries: expect.objectContaining({
            '@customers': expect.objectContaining({
              key: '@customers',
              value: expect.objectContaining({
                type: 'collection_skill',
                collection: 'customers',
                summary,
                row_count: 150,
                schema: expect.objectContaining({
                  id: { type: 'integer' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'inactive'] },
                }),
              }),
              source_type: 'user_input',
            }),
          }),
        })
      );
    });

    it('normalizes skill key to start with @', async () => {
      mockTargetCollectionService.readByQuery.mockResolvedValue([{ count: 10 }]);
      mockBlackboardService.readByQuery.mockResolvedValue([
        { id: 1, project_id: 1, entries: {}, conflicts: [] },
      ]);
      mockBlackboardService.updateOne.mockResolvedValue({});

      // Pass without @ prefix
      const result = await service.registerCollectionSkill({
        projectId: 1,
        collection: 'customers',
        skillKey: 'customer_data',
        summary: 'Customer data',
      });

      expect(result.skillKey).toBe('@customer_data');
    });

    it('returns error if collection not in schema', async () => {
      const result = await service.registerCollectionSkill({
        projectId: 1,
        collection: 'nonexistent_collection',
        skillKey: '@missing',
        summary: 'Missing collection',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Collection "nonexistent_collection" not found');
    });

    it('returns error if blackboard not found', async () => {
      mockTargetCollectionService.readByQuery.mockResolvedValue([{ count: 10 }]);
      mockBlackboardService.readByQuery.mockResolvedValue([]);

      const result = await service.registerCollectionSkill({
        projectId: 999,
        collection: 'customers',
        skillKey: '@customers',
        summary: 'Customer data',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blackboard not found');
    });
  });

  describe('queryCollection', () => {
    it('queries collection data through the skill', async () => {
      const projectId = 1;
      const skillKey = '@customers';

      // Mock blackboard with collection skill
      mockBlackboardService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: projectId,
          entries: {
            '@customers': {
              key: '@customers',
              value: {
                type: 'collection_skill',
                collection: 'customers',
                summary: 'Customer data',
                row_count: 150,
                schema: {
                  id: { type: 'integer' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                },
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

      // Mock query result
      mockTargetCollectionService.readByQuery.mockResolvedValue([
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
      ]);

      const result = await service.queryCollection({
        projectId,
        skillKey,
        fields: ['id', 'name', 'email'],
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0]).toEqual({ id: 1, name: 'Alice', email: 'alice@example.com' });
    });

    it('applies filter to query', async () => {
      mockBlackboardService.readByQuery.mockResolvedValue([
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
                row_count: 150,
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

      mockTargetCollectionService.readByQuery.mockResolvedValue([
        { id: 1, name: 'Alice', status: 'active' },
      ]);

      await service.queryCollection({
        projectId: 1,
        skillKey: '@customers',
        filter: { status: { _eq: 'active' } },
        limit: 10,
      });

      expect(mockTargetCollectionService.readByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: { status: { _eq: 'active' } },
        })
      );
    });

    it('enforces max limit of 100', async () => {
      mockBlackboardService.readByQuery.mockResolvedValue([
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
                row_count: 150,
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

      mockTargetCollectionService.readByQuery.mockResolvedValue([]);

      await service.queryCollection({
        projectId: 1,
        skillKey: '@customers',
        limit: 500, // Over max
      });

      expect(mockTargetCollectionService.readByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100, // Capped at max
        })
      );
    });

    it('returns error if skill key not found', async () => {
      mockBlackboardService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: 1,
          entries: {},
          conflicts: [],
        },
      ]);

      const result = await service.queryCollection({
        projectId: 1,
        skillKey: '@nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error if skill is not a collection skill', async () => {
      mockBlackboardService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: 1,
          entries: {
            '@brand_doc': {
              key: '@brand_doc',
              value: {
                type: 'file_skill',
                file_id: 'file-1',
                filename: 'brand.pdf',
                content_type: 'application/pdf',
                summary: 'Brand doc',
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

      const result = await service.queryCollection({
        projectId: 1,
        skillKey: '@brand_doc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a collection skill');
    });
  });

  describe('unregisterCollectionSkill', () => {
    it('removes a collection skill from the blackboard', async () => {
      const projectId = 1;

      mockBlackboardService.readByQuery.mockResolvedValue([
        {
          id: 1,
          project_id: projectId,
          entries: {
            '@customers': {
              key: '@customers',
              value: { type: 'collection_skill', collection: 'customers' },
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

      mockBlackboardService.updateOne.mockResolvedValue({});

      const result = await service.unregisterCollectionSkill({
        projectId,
        skillKey: '@customers',
      });

      expect(result.success).toBe(true);

      // Verify the skill was removed but other entries remain
      const updateCall = mockBlackboardService.updateOne.mock.calls[0][1];
      expect(updateCall.entries['@customers']).toBeUndefined();
      expect(updateCall.entries['brand_name']).toBeDefined();
    });
  });
});
