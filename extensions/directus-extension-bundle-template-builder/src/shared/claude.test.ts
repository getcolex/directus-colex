/**
 * Claude API and Tools Integration Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  callClaude,
  callTool,
  getToolsForMode,
  executeToolsForTask,
  TOOLS_SERVER_URL,
  CLAUDE_PROXY_URL,
} from './claude';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Claude API Integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('callTool', () => {
    it('calls tools server with correct URL and params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, results: 'search results' }),
      });

      const result = await callTool('search', { query: 'test query', num_results: 5 });

      expect(mockFetch).toHaveBeenCalledWith(
        `${TOOLS_SERVER_URL}/tools/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test query', num_results: 5 }),
        }
      );
      expect(result.success).toBe(true);
    });

    it('returns error when tools server is not running', async () => {
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      mockFetch.mockRejectedValueOnce(error);

      const result = await callTool('search', { query: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tools server not running');
    });

    it('handles ECONNREFUSED in error.cause', async () => {
      const error: any = new Error('Fetch failed');
      error.cause = { code: 'ECONNREFUSED' };
      mockFetch.mockRejectedValueOnce(error);

      const result = await callTool('scrape', { url: 'https://test.com' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tools server not running');
    });

    it('returns error when tool returns non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'Invalid parameters' }),
      });

      const result = await callTool('search', { query: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid parameters');
    });

    it('returns status code error when no detail provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const result = await callTool('search', { query: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });
  });

  describe('getToolsForMode', () => {
    it('returns tool names for a given mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            { name: 'search', description: 'Search the web' },
            { name: 'scrape', description: 'Scrape a URL' },
          ],
        }),
      });

      const tools = await getToolsForMode('research');

      expect(mockFetch).toHaveBeenCalledWith(
        `${TOOLS_SERVER_URL}/tools?mode=research`
      );
      expect(tools).toEqual(['search', 'scrape']);
    });

    it('returns empty array when server is unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const tools = await getToolsForMode('research');

      expect(tools).toEqual([]);
    });

    it('returns empty array when server returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const tools = await getToolsForMode('research');

      expect(tools).toEqual([]);
    });

    it('returns empty array when tools array is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const tools = await getToolsForMode('research');

      expect(tools).toEqual([]);
    });
  });

  describe('executeToolsForTask', () => {
    const mockLogger = vi.fn();

    beforeEach(() => {
      mockLogger.mockClear();
    });

    it('returns empty results when tool_mode is none', async () => {
      const task = { tool_mode: 'none', description: 'Test task' };

      const result = await executeToolsForTask(task, [], mockLogger, {});

      expect(result.toolResults).toBe('');
      expect(result.toolsUsed).toEqual([]);
    });

    it('returns empty results when tool_mode is undefined', async () => {
      const task = { description: 'Test task' };

      const result = await executeToolsForTask(task, [], mockLogger, {});

      expect(result.toolResults).toBe('');
      expect(result.toolsUsed).toEqual([]);
    });

    it('executes search for research mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, results: 'Search results here' }),
      });

      const task = {
        tool_mode: 'research',
        name: 'Research Task',
        description: 'Find information',
      };

      const result = await executeToolsForTask(task, [], mockLogger, {});

      expect(result.toolsUsed).toContain('search');
      expect(result.toolResults).toContain('Search Results');
    });

    it('uses brand_name from blackboard context for search', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, results: 'Acme results' }),
      });

      const task = {
        tool_mode: 'research',
        name: 'Brand Research',
        description: 'Research the brand',
      };
      const blackboardContext = { brand_name: 'Acme Corp', industry: 'Technology' };

      await executeToolsForTask(task, [], mockLogger, blackboardContext);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tools/search'),
        expect.objectContaining({
          body: expect.stringContaining('Acme Corp'),
        })
      );
    });

    it('scrapes website_url when available in research mode', async () => {
      // First call for search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, results: 'search results' }),
      });
      // Second call for scrape
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, content: 'Website content here' }),
      });

      const task = {
        tool_mode: 'research',
        description: 'Research',
      };
      const blackboardContext = { website_url: 'https://example.com' };

      const result = await executeToolsForTask(task, [], mockLogger, blackboardContext);

      expect(result.toolsUsed).toContain('scrape');
      expect(result.toolResults).toContain('example.com');
    });

    it('executes scrape mode for specific URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, content: 'Scraped content' }),
      });

      const task = {
        tool_mode: 'scrape',
        description: 'Scrape website',
      };
      const blackboardContext = { website_url: 'https://test.com' };

      const result = await executeToolsForTask(task, [], mockLogger, blackboardContext);

      expect(result.toolsUsed).toContain('scrape');
      expect(result.toolResults).toContain('Scraped');
    });

    it('scrapes multiple URLs in scrape mode', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, content: 'Content 1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, content: 'Content 2' }),
        });

      const task = {
        tool_mode: 'scrape',
        description: 'Scrape websites',
      };
      const blackboardContext = { urls: ['https://a.com', 'https://b.com'] };

      const result = await executeToolsForTask(task, [], mockLogger, blackboardContext);

      expect(result.toolsUsed.filter((t) => t === 'scrape').length).toBe(2);
    });

    it('gets stock images in generate mode when task mentions images', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          images: [{ url: 'https://img.com/1.jpg', title: 'Image 1' }],
        }),
      });

      const task = {
        tool_mode: 'generate',
        description: 'Generate images for the brand',
        output_type: 'images',
      };
      const blackboardContext = { brand_name: 'TestBrand' };

      const result = await executeToolsForTask(task, [], mockLogger, blackboardContext);

      expect(result.toolsUsed).toContain('stock_images');
      expect(result.toolResults).toContain('Stock Images');
    });

    it('falls back to previous outputs when blackboard is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, results: 'results' }),
      });

      const task = {
        tool_mode: 'research',
        description: 'Research',
      };
      const previousOutputs = [
        {
          output_type: 'form',
          data: { fields: { company_name: 'Legacy Corp' } },
        },
      ];

      await executeToolsForTask(task, previousOutputs, mockLogger, {});

      expect(mockLogger).toHaveBeenCalledWith(expect.stringContaining('legacy form context'));
    });

    it('uses topic from context for search query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, results: 'topic results' }),
      });

      const task = {
        tool_mode: 'research',
        description: 'Research topic',
      };
      const blackboardContext = { topic: 'AI trends 2024' };

      await executeToolsForTask(task, [], mockLogger, blackboardContext);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('AI trends 2024'),
        })
      );
    });

    it('handles scrape failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Scrape failed' }),
      });

      const task = {
        tool_mode: 'scrape',
        description: 'Scrape',
      };
      const blackboardContext = { website_url: 'https://fail.com' };

      const result = await executeToolsForTask(task, [], mockLogger, blackboardContext);

      expect(result.toolResults).toContain('Scrape Failed');
    });
  });

  describe('callClaude', () => {
    it('falls back to proxy when no API keys are set', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Proxy response' }),
      });

      const result = await callClaude('test prompt');

      expect(result).toBe('Proxy response');
      expect(mockFetch).toHaveBeenCalledWith(
        `${CLAUDE_PROXY_URL}/chat`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test prompt'),
        })
      );
    });

    it('handles proxy errors gracefully', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(callClaude('test prompt')).rejects.toThrow('Connection refused');
    });

    it('handles non-OK proxy response', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      });

      await expect(callClaude('test prompt')).rejects.toThrow();
    });
  });
});
