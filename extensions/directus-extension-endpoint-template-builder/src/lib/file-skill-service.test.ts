import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileSkillService } from './file-skill-service';

describe('FileSkillService', () => {
  let service: FileSkillService;
  let mockFilesService: any;
  let mockProjectFilesService: any;
  let mockBlackboardService: any;

  beforeEach(() => {
    mockFilesService = {
      readOne: vi.fn(),
    };
    mockProjectFilesService = {
      readByQuery: vi.fn(),
      createOne: vi.fn(),
    };
    mockBlackboardService = {
      write: vi.fn().mockResolvedValue(true),
    };
    service = new FileSkillService(
      mockFilesService,
      mockProjectFilesService,
      mockBlackboardService
    );
  });

  describe('registerFileAsSkill', () => {
    it('creates blackboard entry with file metadata and summary', async () => {
      const fileId = 'file-123';
      const projectId = 1;
      const skillKey = 'brand_guidelines';
      const summary = 'Brand voice and color guidelines';

      mockFilesService.readOne.mockResolvedValue({
        id: fileId,
        filename_download: 'brand-guidelines.pdf',
        type: 'application/pdf',
        filesize: 1024000,
      });

      const result = await service.registerFileAsSkill({
        projectId,
        fileId,
        skillKey,
        summary,
      });

      expect(result.success).toBe(true);
      expect(result.key).toBe('@brand_guidelines');
      expect(mockBlackboardService.write).toHaveBeenCalledWith(
        projectId,
        '@brand_guidelines',
        expect.objectContaining({
          value: expect.objectContaining({
            type: 'file_skill',
            file_id: fileId,
            filename: 'brand-guidelines.pdf',
            content_type: 'application/pdf',
            summary: 'Brand voice and color guidelines',
          }),
          source_type: 'user_input',
        })
      );
    });

    it('prepends @ to key if not present', async () => {
      mockFilesService.readOne.mockResolvedValue({
        id: 'file-123',
        filename_download: 'data.csv',
        type: 'text/csv',
      });

      await service.registerFileAsSkill({
        projectId: 1,
        fileId: 'file-123',
        skillKey: 'competitor_data',
        summary: 'Competitor list',
      });

      expect(mockBlackboardService.write).toHaveBeenCalledWith(
        1,
        '@competitor_data',
        expect.any(Object)
      );
    });

    it('returns error if file not found', async () => {
      mockFilesService.readOne.mockRejectedValue(new Error('Not found'));

      const result = await service.registerFileAsSkill({
        projectId: 1,
        fileId: 'nonexistent',
        skillKey: 'test',
        summary: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('readFileContent', () => {
    it('returns file content placeholder', async () => {
      const result = await service.readFileContent('@brand_guidelines', {
        projectId: 1,
      });
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });
});
