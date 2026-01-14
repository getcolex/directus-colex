import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionSkillService } from './collection-skill-service';

describe('CollectionSkillService', () => {
  let service: CollectionSkillService;
  let mockItemsServiceFactory: any;
  let mockBlackboardService: any;
  let mockSchemaInspector: any;

  beforeEach(() => {
    mockItemsServiceFactory = vi.fn().mockReturnValue({
      readByQuery: vi.fn().mockResolvedValue([]),
    });
    mockBlackboardService = {
      write: vi.fn().mockResolvedValue(true),
    };
    mockSchemaInspector = {
      getCollectionInfo: vi.fn().mockResolvedValue({
        fields: [
          { field: 'name', type: 'string' },
          { field: 'email', type: 'string' },
          { field: 'plan', type: 'string' },
        ],
      }),
      getRowCount: vi.fn().mockResolvedValue(2847),
    };
    service = new CollectionSkillService(
      mockItemsServiceFactory,
      mockBlackboardService,
      mockSchemaInspector
    );
  });

  describe('registerCollectionAsSkill', () => {
    it('creates blackboard entry with collection schema and row count', async () => {
      const result = await service.registerCollectionAsSkill({
        projectId: 1,
        collection: 'customers',
        skillKey: 'customers',
        summary: 'Customer records with contact info',
      });

      expect(result.success).toBe(true);
      expect(result.key).toBe('@customers');
      expect(mockBlackboardService.write).toHaveBeenCalledWith(
        1,
        '@customers',
        expect.objectContaining({
          value: expect.objectContaining({
            type: 'collection_skill',
            collection: 'customers',
            summary: 'Customer records with contact info',
            row_count: 2847,
          }),
        })
      );
    });
  });

  describe('queryCollection', () => {
    it('queries collection with filter and returns results', async () => {
      const mockResults = [
        { id: 1, name: 'Acme Corp', email: 'contact@acme.com' },
        { id: 2, name: 'Beta Inc', email: 'hello@beta.io' },
      ];

      const mockService = {
        readByQuery: vi.fn().mockResolvedValue(mockResults),
      };
      mockItemsServiceFactory.mockReturnValue(mockService);

      const result = await service.queryCollection('@customers', {
        projectId: 1,
        filter: { plan: { _eq: 'enterprise' } },
        fields: ['name', 'email'],
        limit: 10,
      });

      expect(result.data).toEqual(mockResults);
      expect(result.count).toBe(2);
    });

    it('enforces max limit of 100 rows', async () => {
      const mockService = {
        readByQuery: vi.fn().mockResolvedValue([]),
      };
      mockItemsServiceFactory.mockReturnValue(mockService);

      await service.queryCollection('@customers', {
        projectId: 1,
        limit: 500,
      });

      expect(mockService.readByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
        })
      );
    });
  });
});
