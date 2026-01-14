import { describe, it, expect, vi } from 'vitest';
import { handleReadFile, handleQueryCollection } from './skill-tool-handlers';

describe('Skill Tool Handlers', () => {
  describe('handleReadFile', () => {
    it('returns file content for valid skill key', async () => {
      const mockFileSkillService = {
        readFileContent: vi.fn().mockResolvedValue({
          content: 'File content here',
          truncated: false,
        }),
      };
      const mockBlackboardService = {
        read: vi.fn().mockResolvedValue({
          key: '@brand_guidelines',
          value: {
            type: 'file_skill',
            file_id: 'abc123',
            filename: 'brand.pdf',
          },
        }),
      };

      const result = await handleReadFile(
        { skill_key: '@brand_guidelines' },
        {
          projectId: 1,
          fileSkillService: mockFileSkillService as any,
          blackboardService: mockBlackboardService as any,
        }
      );

      expect(result.success).toBe(true);
      expect(result.content).toBe('File content here');
    });

    it('returns error for non-existent skill', async () => {
      const mockBlackboardService = {
        read: vi.fn().mockResolvedValue(null),
      };

      const result = await handleReadFile(
        { skill_key: '@nonexistent' },
        {
          projectId: 1,
          fileSkillService: {} as any,
          blackboardService: mockBlackboardService as any,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for non-file skill', async () => {
      const mockBlackboardService = {
        read: vi.fn().mockResolvedValue({
          key: '@customers',
          value: { type: 'collection_skill' },
        }),
      };

      const result = await handleReadFile(
        { skill_key: '@customers' },
        {
          projectId: 1,
          fileSkillService: {} as any,
          blackboardService: mockBlackboardService as any,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a file skill');
    });
  });

  describe('handleQueryCollection', () => {
    it('returns query results for valid skill key', async () => {
      const mockData = [{ id: 1, name: 'Acme' }];
      const mockCollectionSkillService = {
        queryCollection: vi.fn().mockResolvedValue({
          data: mockData,
          count: 1,
          truncated: false,
        }),
      };
      const mockBlackboardService = {
        read: vi.fn().mockResolvedValue({
          key: '@customers',
          value: { type: 'collection_skill', collection: 'customers' },
        }),
      };

      const result = await handleQueryCollection(
        { skill_key: '@customers', limit: 10 },
        {
          projectId: 1,
          collectionSkillService: mockCollectionSkillService as any,
          blackboardService: mockBlackboardService as any,
        }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
    });
  });
});
