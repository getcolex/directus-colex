/**
 * Claude API and Tools Integration
 *
 * Utilities for calling Claude (via OpenRouter, Anthropic, or Proxy)
 * and the tools server for search, scrape, and image generation.
 */

import Anthropic from '@anthropic-ai/sdk';

// Environment configuration
export const CLAUDE_PROXY_URL = process.env.CLAUDE_PROXY_URL || 'http://host.docker.internal:3456';
export const TOOLS_SERVER_URL = process.env.TOOLS_SERVER_URL || 'http://host.docker.internal:8201';

/**
 * Call a tool on the tools server
 */
export async function callTool(toolName: string, params: Record<string, any>): Promise<any> {
  try {
    const response = await fetch(`${TOOLS_SERVER_URL}/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.detail || `Tool returned ${response.status}` };
    }

    return data;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      return { success: false, error: 'Tools server not running. Start it with: python scripts/tools_server.py' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Get available tools for a tool_mode
 */
export async function getToolsForMode(toolMode: string): Promise<string[]> {
  try {
    const response = await fetch(`${TOOLS_SERVER_URL}/tools?mode=${toolMode}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.tools?.map((t: any) => t.name) || [];
  } catch {
    return [];
  }
}

/**
 * Execute tools based on task configuration and return results
 * Reads from blackboard for proper data flow between tasks.
 */
export async function executeToolsForTask(
  task: any,
  previousOutputs: any[],
  logger: (msg: string) => void,
  blackboardContext?: Record<string, any>
): Promise<{ toolResults: string; toolsUsed: string[] }> {
  const toolMode = task.tool_mode;
  const toolsUsed: string[] = [];
  const results: string[] = [];

  if (!toolMode || toolMode === 'none') {
    return { toolResults: '', toolsUsed: [] };
  }

  // Get context from blackboard first, fall back to previous outputs
  let context: Record<string, any> = {};

  if (blackboardContext && Object.keys(blackboardContext).length > 0) {
    // Use blackboard context (preferred)
    context = blackboardContext;
    logger(`Using blackboard context: ${JSON.stringify(context).substring(0, 200)}`);
  } else {
    // Fall back to parsing previous outputs (legacy behavior)
    context = previousOutputs
      .filter((o) => o.output_type === 'form' || o.data?.type === 'form_submission')
      .map((o) => o.data?.fields || o.data)
      .reduce((acc, data) => ({ ...acc, ...data }), {});
    logger(`Using legacy form context: ${JSON.stringify(context).substring(0, 200)}`);
  }

  logger(`Tool mode: ${toolMode}`);

  // Research mode: search and optionally scrape
  if (toolMode === 'research' || toolMode === 'all') {
    // Build search query - prioritize brand_name over company_name
    let searchQuery = task.description || task.name;

    // Use the most specific name available
    const entityName = context.brand_name || context.company_name || context.product_name;
    if (entityName) {
      searchQuery = `${entityName} ${searchQuery}`;
    }
    if (context.topic) {
      searchQuery = context.topic;
    }
    // Include industry for disambiguation
    if (context.industry) {
      searchQuery = `${searchQuery} ${context.industry}`;
    }

    logger(`Searching: "${searchQuery}"`);
    const searchResult = await callTool('search', { query: searchQuery, num_results: 5 });
    toolsUsed.push('search');

    if (searchResult.success) {
      results.push(`## Search Results\n${searchResult.results}`);
    } else {
      results.push(`## Search Failed\n${searchResult.error}`);
    }

    // ALWAYS scrape the provided website_url if available
    const websiteUrl = context.website_url || context.website || context.url;
    if (websiteUrl) {
      logger(`Scraping provided website: ${websiteUrl}`);
      const scrapeResult = await callTool('scrape', { url: websiteUrl, max_chars: 8000 });
      toolsUsed.push('scrape');
      if (scrapeResult.success) {
        results.push(
          `## Scraped (Brand Website): ${websiteUrl}\n${scrapeResult.content?.substring(0, 5000) || '[No content]'}`
        );
      } else {
        results.push(`## Scrape Failed: ${websiteUrl}\n${scrapeResult.error}`);
      }
    }

    // If task mentions competitors, websites, or scraping, scrape top search results
    const shouldScrapeSearchResults =
      task.description?.toLowerCase().includes('competitor') ||
      (task.description?.toLowerCase().includes('scrape') && !websiteUrl);

    if (shouldScrapeSearchResults && searchResult.success && searchResult.results) {
      const urlMatches = searchResult.results.match(/URL: (https?:\/\/[^\s\n]+)/g);
      if (urlMatches && urlMatches.length > 0) {
        const urls = urlMatches.slice(0, 2).map((m: string) => m.replace('URL: ', ''));
        for (const url of urls) {
          logger(`Scraping search result: ${url}`);
          const scrapeResult = await callTool('scrape', { url, max_chars: 5000 });
          toolsUsed.push('scrape');
          if (scrapeResult.success) {
            results.push(`## Scraped: ${url}\n${scrapeResult.content?.substring(0, 3000) || '[No content]'}`);
          }
        }
      }
    }
  }

  // Scrape mode: scrape specific URLs
  if (toolMode === 'scrape') {
    const urls = context.website_url || context.website || context.url || context.urls;
    if (urls) {
      const urlList = Array.isArray(urls) ? urls : [urls];
      for (const url of urlList.slice(0, 3)) {
        logger(`Scraping: ${url}`);
        const scrapeResult = await callTool('scrape', { url, max_chars: 8000 });
        toolsUsed.push('scrape');
        if (scrapeResult.success) {
          results.push(`## Scraped: ${url}\n${scrapeResult.content}`);
        } else {
          results.push(`## Scrape Failed: ${url}\n${scrapeResult.error}`);
        }
      }
    }
  }

  // Generate mode: get stock images
  if (toolMode === 'generate' || toolMode === 'all') {
    const imageQuery = context.image_query || context.brand_name || context.company_name || task.name;
    if (task.description?.toLowerCase().includes('image') || task.output_type === 'images') {
      logger(`Searching images: "${imageQuery}"`);
      const imageResult = await callTool('stock_images', { query: imageQuery, count: 6 });
      toolsUsed.push('stock_images');
      if (imageResult.success && imageResult.images) {
        results.push(`## Stock Images for "${imageQuery}"\n${JSON.stringify(imageResult.images, null, 2)}`);
      }
    }
  }

  return { toolResults: results.join('\n\n'), toolsUsed };
}

/**
 * Call Claude via OpenRouter API (preferred) or Anthropic API
 * Falls back to Claude proxy if no API keys available
 */
export async function callClaude(prompt: string, options: { timeout?: number } = {}): Promise<string> {
  const { timeout = 120000 } = options;

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // Prefer OpenRouter, then Anthropic SDK, then proxy
  if (openrouterKey || anthropicKey) {
    try {
      const useOpenRouter = !!openrouterKey;
      const anthropic = new Anthropic({
        apiKey: openrouterKey || anthropicKey,
        ...(useOpenRouter && {
          baseURL: 'https://openrouter.ai/api',
          defaultHeaders: {
            'HTTP-Referer': 'https://template-builder.local',
            'X-Title': 'Template Builder AI',
          },
        }),
      });

      const response = await anthropic.messages.create({
        model: useOpenRouter ? 'anthropic/claude-sonnet-4' : 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      return textContent?.text || '';
    } catch (error: any) {
      console.error('[Claude] API error:', error.message);
      throw error;
    }
  }

  // Fall back to proxy
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${CLAUDE_PROXY_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Proxy returned ${response.status}`);
    }

    const data = await response.json();
    return data.response || '';
  } catch (error: any) {
    console.error('[Claude] Proxy error:', error.message);
    throw error;
  }
}
