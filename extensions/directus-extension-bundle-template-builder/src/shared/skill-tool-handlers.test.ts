/**
 * Skill Tool Handlers Tests
 *
 * Handlers for read_file and query_collection AI tools.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSkillToolHandlers, SkillToolHandlers } from './skill-tool-handlers';

describe('SkillToolHandlers', () => {
  let handlers: SkillToolHandlers;
  let mockFileSkillService: any;
  let mockCollectionSkillService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFileSkillService = {
      readFileContent: vi.fn(),
    };

    mockCollectionSkillService = {
      queryCollection: vi.fn(),
    };

    handlers = createSkillToolHandlers({
      fileSkillService: mockFileSkillService,
      collectionSkillService: mockCollectionSkillService,
    });
  });

  describe('handleReadFile', () => {
    it('reads file content via file skill service', async () => {
      mockFileSkillService.readFileContent.mockResolvedValue({
        success: true,
        content: 'Brand guidelines: Use blue (#0066CC) as primary color...',
        filename: 'brand-guidelines.pdf',
        contentSource: 'extracted_text',
      });

      const result = await handlers.handleReadFile({
        projectId: 1,
        skill_key: '@brand_guidelines',
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('Brand guidelines');
      expect(mockFileSkillService.readFileContent).toHaveBeenCalledWith({
        projectId: 1,
        skillKey: '@brand_guidelines',
      });
    });

    it('passes query parameter for focused reading', async () => {
      mockFileSkillService.readFileContent.mockResolvedValue({
        success: true,
        content: 'Primary color is blue (#0066CC)',
        filename: 'brand-guidelines.pdf',
        contentSource: 'extracted_text',
      });

      await handlers.handleReadFile({
        projectId: 1,
        skill_key: '@brand_guidelines',
        query: 'What is the primary color?',
      });

      expect(mockFileSkillService.readFileContent).toHaveBeenCalledWith({
        projectId: 1,
        skillKey: '@brand_guidelines',
        query: 'What is the primary color?',
      });
    });

    it('passes pages parameter for page-specific reading', async () => {
      mockFileSkillService.readFileContent.mockResolvedValue({
        success: true,
        content: 'Page 1-2 content...',
        filename: 'brand-guidelines.pdf',
        contentSource: 'extracted_text',
      });

      await handlers.handleReadFile({
        projectId: 1,
        skill_key: '@brand_guidelines',
        pages: [1, 2],
      });

      expect(mockFileSkillService.readFileContent).toHaveBeenCalledWith({
        projectId: 1,
        skillKey: '@brand_guidelines',
        pages: [1, 2],
      });
    });

    it('returns error from file skill service', async () => {
      mockFileSkillService.readFileContent.mockResolvedValue({
        success: false,
        error: 'Skill "@missing" not found on blackboard',
      });

      const result = await handlers.handleReadFile({
        projectId: 1,
        skill_key: '@missing',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('formats result for AI consumption', async () => {
      mockFileSkillService.readFileContent.mockResolvedValue({
        success: true,
        content: 'Document content here',
        filename: 'doc.pdf',
        contentSource: 'extracted_text',
      });

      const result = await handlers.handleReadFile({
        projectId: 1,
        skill_key: '@doc',
      });

      expect(result.toolResult).toBeDefined();
      expect(result.toolResult).toContain('doc.pdf');
      expect(result.toolResult).toContain('Document content here');
    });
  });

  describe('handleQueryCollection', () => {
    it('queries collection via collection skill service', async () => {
      mockCollectionSkillService.queryCollection.mockResolvedValue({
        success: true,
        data: [
          { id: 1, name: 'Alice', email: 'alice@example.com' },
          { id: 2, name: 'Bob', email: 'bob@example.com' },
        ],
      });

      const result = await handlers.handleQueryCollection({
        projectId: 1,
        skill_key: '@customers',
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockCollectionSkillService.queryCollection).toHaveBeenCalledWith({
        projectId: 1,
        skillKey: '@customers',
        limit: 10,
      });
    });

    it('passes filter parameter', async () => {
      mockCollectionSkillService.queryCollection.mockResolvedValue({
        success: true,
        data: [{ id: 1, name: 'Alice', status: 'active' }],
      });

      await handlers.handleQueryCollection({
        projectId: 1,
        skill_key: '@customers',
        filter: { status: { _eq: 'active' } },
      });

      expect(mockCollectionSkillService.queryCollection).toHaveBeenCalledWith({
        projectId: 1,
        skillKey: '@customers',
        filter: { status: { _eq: 'active' } },
      });
    });

    it('passes fields and sort parameters', async () => {
      mockCollectionSkillService.queryCollection.mockResolvedValue({
        success: true,
        data: [{ name: 'Alice' }],
      });

      await handlers.handleQueryCollection({
        projectId: 1,
        skill_key: '@customers',
        fields: ['name', 'email'],
        sort: ['-date_created'],
      });

      expect(mockCollectionSkillService.queryCollection).toHaveBeenCalledWith({
        projectId: 1,
        skillKey: '@customers',
        fields: ['name', 'email'],
        sort: ['-date_created'],
      });
    });

    it('returns error from collection skill service', async () => {
      mockCollectionSkillService.queryCollection.mockResolvedValue({
        success: false,
        error: '"@missing" is not a collection skill',
      });

      const result = await handlers.handleQueryCollection({
        projectId: 1,
        skill_key: '@missing',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a collection skill');
    });

    it('formats result for AI consumption', async () => {
      mockCollectionSkillService.queryCollection.mockResolvedValue({
        success: true,
        data: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      });

      const result = await handlers.handleQueryCollection({
        projectId: 1,
        skill_key: '@customers',
      });

      expect(result.toolResult).toBeDefined();
      expect(result.toolResult).toContain('2 rows');
      expect(result.toolResult).toContain('Alice');
    });

    it('formats empty result', async () => {
      mockCollectionSkillService.queryCollection.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await handlers.handleQueryCollection({
        projectId: 1,
        skill_key: '@customers',
        filter: { status: { _eq: 'archived' } },
      });

      expect(result.toolResult).toContain('0 rows');
    });
  });

  describe('getAvailableTools', () => {
    it('returns both skill tools', () => {
      const tools = handlers.getAvailableTools();

      expect(tools).toHaveLength(2);
      expect(tools.map((t: any) => t.name)).toContain('read_file');
      expect(tools.map((t: any) => t.name)).toContain('query_collection');
    });
  });

  describe('dispatchToolCall', () => {
    it('dispatches read_file to handleReadFile', async () => {
      mockFileSkillService.readFileContent.mockResolvedValue({
        success: true,
        content: 'content',
        filename: 'file.pdf',
        contentSource: 'extracted_text',
      });

      const result = await handlers.dispatchToolCall({
        toolName: 'read_file',
        input: { skill_key: '@doc' },
        projectId: 1,
      });

      expect(result.success).toBe(true);
      expect(mockFileSkillService.readFileContent).toHaveBeenCalled();
    });

    it('dispatches query_collection to handleQueryCollection', async () => {
      mockCollectionSkillService.queryCollection.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await handlers.dispatchToolCall({
        toolName: 'query_collection',
        input: { skill_key: '@customers' },
        projectId: 1,
      });

      expect(result.success).toBe(true);
      expect(mockCollectionSkillService.queryCollection).toHaveBeenCalled();
    });

    it('returns error for unknown tool', async () => {
      const result = await handlers.dispatchToolCall({
        toolName: 'unknown_tool',
        input: {},
        projectId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });
});
