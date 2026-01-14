/**
 * Template Builder AI Endpoints
 *
 * - /template-builder/chat-v2 - AI conversation with SSE streaming and proper tool use (Anthropic SDK)
 * - /template-builder/chat - Legacy: AI conversation with project context (can execute actions)
 * - /template-builder/execute-task - Run a task using Claude
 * - /template-builder/edit-text - Rewrite/shorten/expand text
 * - /template-builder/generate-tasks - Generate tasks from description
 */

import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { BlackboardService, createBlackboardService } from './lib/blackboard-service';
import { SourceType, WriteEntryParams } from './lib/blackboard-types';
import { detectConflicts, ResearchFindings } from './lib/conflict-detector';
import { ANTHROPIC_TOOLS, handleReorderTask } from './tools';

// Action types the AI can perform
type ActionType = 'update_task' | 'create_task' | 'delete_task' | 'submit_form' | 'update_project';

interface AIAction {
  type: ActionType;
  taskId?: number;
  projectId?: number;
  data?: Record<string, any>;
}

// ============================================================================
// CHAT-V2: SSE STREAMING WITH PROPER TOOL USE (Anthropic SDK)
// ============================================================================

// Tool definitions imported from ./tools/definitions.ts

// Conversation memory storage (in-memory, keyed by conversationId)
const conversationSessions = new Map<string, Array<{ role: 'user' | 'assistant', content: string }>>();
const MAX_CONVERSATION_TOKENS = 100000;

// Action history for undo/redo functionality
interface UndoableAction {
  type: 'create' | 'update' | 'delete';
  collection: string;
  id: number | string;
  previousData?: Record<string, any>;
  newData?: Record<string, any>;
  timestamp: string;
}

const actionHistory = new Map<string, UndoableAction[]>();
const MAX_HISTORY_SIZE = 20;

// Claude proxy URL - host.docker.internal points to the host machine from Docker
const CLAUDE_PROXY_URL = process.env.CLAUDE_PROXY_URL || 'http://host.docker.internal:3456';

// Tools server URL - provides search, scrape, and other tools
const TOOLS_SERVER_URL = process.env.TOOLS_SERVER_URL || 'http://host.docker.internal:8201';

/**
 * Call a tool from the tools server
 */
async function callTool(toolName: string, params: Record<string, any>): Promise<any> {
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
async function getToolsForMode(toolMode: string): Promise<string[]> {
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
 * Now reads from blackboard for proper data flow between tasks.
 *
 * Key improvements over previous version:
 * 1. Uses brand_name (not just company_name) for search queries
 * 2. Always scrapes website_url if available
 * 3. Falls back to previousOutputs if blackboard is empty (backwards compat)
 */
async function executeToolsForTask(
  task: any,
  previousOutputs: any[],
  logger: (msg: string) => void,
  blackboardContext?: Record<string, any>  // Optional blackboard values
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
      .filter(o => o.output_type === 'form' || o.data?.type === 'form_submission')
      .map(o => o.data?.fields || o.data)
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
        results.push(`## Scraped (Brand Website): ${websiteUrl}\n${scrapeResult.content?.substring(0, 5000) || '[No content]'}`);
      } else {
        results.push(`## Scrape Failed: ${websiteUrl}\n${scrapeResult.error}`);
      }
    }

    // If task mentions competitors, websites, or scraping, scrape top search results
    const shouldScrapeSearchResults = task.description?.toLowerCase().includes('competitor') ||
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
async function callClaude(prompt: string, options: { timeout?: number } = {}): Promise<string> {
  const { timeout = 120000 } = options;

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // Prefer OpenRouter, then Anthropic SDK, then proxy
  if (openrouterKey || anthropicKey) {
    try {
      const useOpenRouter = !!openrouterKey;
      // Note: Anthropic SDK appends '/v1/messages' to baseURL, so we use '/api' not '/api/v1'
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

      const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
      return textBlock?.text || '';
    } catch (error: any) {
      console.error('[callClaude] API error, falling back to proxy:', error.message);
      // Fall through to proxy
    }
  }

  // Fallback to Claude proxy (uses CLI)
  try {
    const response = await fetch(`${CLAUDE_PROXY_URL}/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, timeout }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Proxy returned ${response.status}`);
    }

    return data.response;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      throw new Error('No LLM available. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY, or start the Claude proxy.');
    }
    throw error;
  }
}

/**
 * Generate a trace ID for request tracking
 */
function generateTraceId(): string {
  return randomUUID();
}

/**
 * Write form data to the blackboard
 * Each form field becomes a blackboard entry with user_input priority
 */
async function writeFormToBlackboard(
  blackboard: BlackboardService,
  projectId: number,
  formData: Record<string, any>,
  sourceId: string
): Promise<void> {
  const entries: Record<string, WriteEntryParams> = {};

  for (const [key, value] of Object.entries(formData)) {
    // Skip null/undefined values
    if (value === null || value === undefined) continue;

    entries[key] = {
      value,
      source_type: 'user_input',
      source_id: sourceId,
    };
  }

  if (Object.keys(entries).length > 0) {
    await blackboard.writeMany(projectId, entries);
  }
}

export default {
  id: 'template-builder',
  handler: (router: any, context: any) => {
    const { services, logger } = context;
    const { ItemsService } = services;

    console.log('🚀 [TemplateBuilder] Extension loaded - registering routes...');
    console.log(`   Claude Proxy URL: ${CLAUDE_PROXY_URL}`);

    /**
     * Health check endpoint
     */
    router.get('/health', async (_req: any, res: any) => {
      let proxyAvailable = false;
      try {
        const proxyRes = await fetch(`${CLAUDE_PROXY_URL}/health`);
        proxyAvailable = proxyRes.ok;
      } catch {}

      // Check if API keys are available
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      const openrouterApiKey = process.env.OPENROUTER_API_KEY;

      res.json({
        status: 'healthy',
        service: 'template-builder',
        timestamp: new Date().toISOString(),
        claudeProxyUrl: CLAUDE_PROXY_URL,
        claudeProxyAvailable: proxyAvailable,
        anthropicSdkAvailable: !!anthropicApiKey,
        openrouterAvailable: !!openrouterApiKey,
        chatV2Available: !!anthropicApiKey || !!openrouterApiKey,
      });
    });

    // ========================================================================
    // CHAT-V2: SSE STREAMING WITH PROPER TOOL USE
    // ========================================================================

    /**
     * POST /template-builder/chat-v2
     * AI conversation with SSE streaming and structured tool use via Anthropic SDK
     *
     * SSE Events:
     * - text: { chunk: string } - Real-time text chunks
     * - tool_executing: { tool: string, toolIndex: number, params: object } - Tool being called
     * - tool_complete: { tool: string, toolIndex: number, success: boolean, result: object } - Tool result
     * - tool_error: { tool: string, toolIndex: number, error: string } - Tool failed
     * - complete: { actions: array } - Response complete
     * - error: { message: string } - Error occurred
     */
    router.post('/chat-v2', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { message, projectId, conversationId, taskId, enrichmentContext } = req.body;

      console.log(`[TemplateBuilder][${traceId}] Chat-v2 request for project ${projectId}, conversation ${conversationId}${enrichmentContext ? ', enrichment mode' : ''}`);

      // Input validation
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required', traceId });
      }
      if (message.length > 10000) {
        return res.status(400).json({ error: 'Message too long (max 10,000 characters)', traceId });
      }
      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId is required for chat-v2', traceId });
      }

      // Check for API key - prefer OpenRouter, fall back to Anthropic
      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

      if (!openrouterApiKey && !anthropicApiKey) {
        return res.status(503).json({ error: 'Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY configured', traceId });
      }

      const useOpenRouter = !!openrouterApiKey;
      const apiKey = openrouterApiKey || anthropicApiKey;
      console.log(`[TemplateBuilder][${traceId}] Using ${useOpenRouter ? 'OpenRouter' : 'Anthropic'} API`);

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders?.();

      // Helper function to send SSE events
      let clientDisconnected = false;
      const sendEvent = (eventType: string, data: any) => {
        if (clientDisconnected) return;
        try {
          res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
          console.error(`[TemplateBuilder][${traceId}] Failed to send SSE event:`, e);
        }
      };

      // Handle client disconnect
      req.on('close', () => {
        clientDisconnected = true;
        console.log(`[TemplateBuilder][${traceId}] Client disconnected`);
      });

      try {
        // Initialize services
        const projectsService = new ItemsService('tb_projects', { schema: req.schema, accountability: req.accountability });
        const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
        const outputsService = new ItemsService('tb_outputs', { schema: req.schema, accountability: req.accountability });

        // Fetch project context
        let projectContext = '';
        let project: any = null;
        let tasks: any[] = [];

        if (projectId) {
          try {
            project = await projectsService.readOne(projectId);
            tasks = await tasksService.readByQuery({
              filter: { project_id: { _eq: projectId } },
              sort: ['sort_order'],
            });

            console.log(`[TemplateBuilder][${traceId}] Loaded project "${project.name}" with ${tasks.length} tasks`);

            projectContext = `
## Current Project
Name: ${project.name}
Status: ${project.status}
Description: ${project.description || 'No description'}

## Tasks (${tasks.length} total, ordered by sort_order - first task is at the top)
${tasks.map((t: any, i: number) => {
  const isSelected = t.id === taskId;
  const formInfo = t.action_type === 'form' && t.form_schema ? ` | Form fields: ${JSON.stringify(t.form_schema)}` : '';
  return `${i + 1}. [ID:${t.id}] "${t.name}" - ${t.description || 'No description'} [status: ${t.status}] (type: ${t.action_type}, sort_order: ${t.sort_order})${formInfo}${isSelected ? ' ← CURRENTLY SELECTED' : ''}`;
}).join('\n')}
`;
          } catch (e: any) {
            console.error(`[TemplateBuilder][${traceId}] Could not fetch project context:`, e?.message || e);
            projectContext = `
## Project Context Error
Could not load project with ID ${projectId}. Error: ${e?.message || 'Unknown error'}
Please ask the user for more details about what they want to do.
`;
          }
        } else {
          projectContext = `
## No Project Selected
The user has not selected a project. Ask them to select a project first, or ask what they'd like help with.
`;
        }

        // Get or create conversation history
        let conversationHistory = conversationSessions.get(conversationId) || [];
        conversationHistory.push({ role: 'user', content: message });

        // Check token limit and truncate if needed
        const estimatedTokens = JSON.stringify(conversationHistory).length / 4;
        if (estimatedTokens > MAX_CONVERSATION_TOKENS) {
          conversationHistory = conversationHistory.slice(-10);
          console.log(`[TemplateBuilder][${traceId}] Truncated conversation to last 10 messages`);
        }

        // Build enrichment context section if provided
        let enrichmentSection = '';
        if (enrichmentContext) {
          enrichmentSection = `
## Output Enrichment Mode (ACTIVE)
You are in enrichment mode - helping the user add new data columns to existing table output.
Output ID: ${enrichmentContext.output_id}
Task ID: ${enrichmentContext.task_id}

When the user asks to add fields/columns (like "add website links" or "add instagram handles"), you MUST use the enrich_output tool to:
1. Add the new column(s) to the output data
2. Use AI to populate the values for each row based on existing data

IMPORTANT: DO NOT use update_task to modify the task definition. Use enrich_output to add data to the OUTPUT.
`;
        }

        // Build system prompt
        const systemPrompt = `You are an AI assistant for a workflow/template builder tool. You help users create, modify, and manage their workflow tasks.

${projectContext}
${enrichmentSection}

## Your Capabilities
You can use tools to:
- update_task: Modify existing tasks (name, description, status, form schema)
- create_task: Create new tasks in the project (created as 'draft' for user review)
- activate_task: Activate a draft task so it can be run (changes status to 'pending')
- delete_task: Remove tasks from the project
- reorder_task: Move a task to a different position (first, last, before/after another task)
- submit_form: Submit form data for form-type tasks
- enrich_output: Add new columns to existing output data and populate with AI${enrichmentContext ? ' ← USE THIS for adding data columns!' : ''}

## How to Handle User Requests
1. When users request changes (improve, update, add, delete, etc.), FIRST propose a numbered list of specific changes
2. Wait for user to confirm which changes to make (e.g., "do all", "do 1,3,5", "do 1")
3. Only execute tools AFTER user confirms which actions to take
4. After executing, briefly confirm what was done

Example flow:
- User: "Improve the task descriptions"
- You: "Here are my suggested improvements:
  1. Task 'Research' → 'Research competitor pricing and features'
  2. Task 'Analysis' → 'Analyze market trends and customer feedback'
  3. Task 'Report' → 'Generate executive summary report'

  Reply with the numbers you'd like me to apply (e.g., 'do all' or 'do 1,3')"
- User: "do all"
- You: [execute update_task for each] "Done! Updated 3 task descriptions."

## Guidelines
1. Always propose changes first, then wait for confirmation before executing
2. Use numbered lists so users can easily select which changes to apply
3. Be concise and helpful in your responses
4. After making changes, briefly confirm what you did
5. If you need more information, ask the user
6. When adding form fields, use snake_case for field names
7. Draft tasks need to be activated by the user (changed to 'pending') before they can be run
${enrichmentContext ? '8. When in enrichment mode, use enrich_output to add new data columns to the output' : ''}

Current project ID: ${projectId || 'none'}
Selected task ID: ${taskId || 'none'}${enrichmentContext ? `
Enrichment output ID: ${enrichmentContext.output_id}
Enrichment task ID: ${enrichmentContext.task_id}` : ''}`;

        // Initialize Anthropic client (use OpenRouter base URL if using OpenRouter key)
        // Note: Anthropic SDK appends '/v1/messages' to baseURL, so we use '/api' not '/api/v1'
        const anthropic = new Anthropic({
          apiKey: apiKey!,
          ...(useOpenRouter && {
            baseURL: 'https://openrouter.ai/api',
            defaultHeaders: {
              'HTTP-Referer': 'https://template-builder.local',
              'X-Title': 'Template Builder AI',
            },
          }),
        });

        // Track executed actions
        const executedActions: any[] = [];
        let toolIndex = 0;

        // Agentic loop: keep processing until no more tool calls
        let continueLoop = true;
        let loopCount = 0;
        const MAX_LOOPS = 10;
        let fullTextResponse = '';

        // Build messages for API
        const apiMessages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        while (continueLoop && loopCount < MAX_LOOPS && !clientDisconnected) {
          loopCount++;

          // Stream the response
          const stream = await anthropic.messages.stream({
            model: useOpenRouter ? 'anthropic/claude-sonnet-4' : 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemPrompt,
            messages: apiMessages,
            tools: ANTHROPIC_TOOLS,
          });

          let currentTextBlock = '';
          let currentToolUse: any = null;
          let stopReason: string | null = null;

          for await (const event of stream) {
            if (clientDisconnected) break;

            if (event.type === 'content_block_start') {
              if (event.content_block.type === 'text') {
                currentTextBlock = '';
              } else if (event.content_block.type === 'tool_use') {
                currentToolUse = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: '',
                };
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                const chunk = event.delta.text;
                currentTextBlock += chunk;
                fullTextResponse += chunk;
                sendEvent('text', { chunk });
              } else if (event.delta.type === 'input_json_delta') {
                if (currentToolUse) {
                  currentToolUse.input += event.delta.partial_json;
                }
              }
            } else if (event.type === 'content_block_stop') {
              // If tool use block completed, execute the tool
              if (currentToolUse) {
                const thisToolIndex = toolIndex++;
                let toolInput: any = {};
                try {
                  toolInput = JSON.parse(currentToolUse.input || '{}');
                } catch {
                  toolInput = {};
                }

                // Send tool_executing event
                sendEvent('tool_executing', {
                  tool: currentToolUse.name,
                  toolIndex: thisToolIndex,
                  params: toolInput,
                });

                // Execute the tool
                let toolResult: any = { success: false, error: 'Unknown tool' };
                try {
                  switch (currentToolUse.name) {
                    case 'update_task': {
                      const { taskId: targetTaskId, data } = toolInput;
                      if (!targetTaskId) throw new Error('taskId required');

                      // Fetch current state for undo
                      const previousTask = await tasksService.readOne(targetTaskId);

                      // Perform update
                      await tasksService.updateOne(targetTaskId, data);

                      // Record for undo
                      const history = actionHistory.get(conversationId) || [];
                      history.push({
                        type: 'update',
                        collection: 'tb_tasks',
                        id: targetTaskId,
                        previousData: previousTask,
                        newData: data,
                        timestamp: new Date().toISOString(),
                      });
                      if (history.length > MAX_HISTORY_SIZE) history.shift();
                      actionHistory.set(conversationId, history);

                      toolResult = { success: true, taskId: targetTaskId, updated: Object.keys(data) };
                      break;
                    }

                    case 'create_task': {
                      if (!projectId) throw new Error('projectId required for create_task');

                      // Get min sort_order to put new task at the BEGINNING
                      const existingTasks = await tasksService.readByQuery({
                        filter: { project_id: { _eq: projectId } },
                        sort: ['sort_order'],
                        limit: 1,
                      });
                      const sortOrder = existingTasks.length > 0 ? (existingTasks[0].sort_order || 1) - 1 : 0;

                      const newTask = {
                        project_id: projectId,
                        name: toolInput.name || 'New Task',
                        description: toolInput.description || '',
                        action_type: toolInput.action_type || 'agent',
                        tool_mode: toolInput.tool_mode || null,
                        form_schema: toolInput.form_schema || null,
                        status: 'draft', // Tasks created by AI start as draft for user review
                        sort_order: sortOrder,
                      };

                      const newTaskId = await tasksService.createOne(newTask);

                      // Record for undo
                      const history = actionHistory.get(conversationId) || [];
                      history.push({
                        type: 'create',
                        collection: 'tb_tasks',
                        id: newTaskId,
                        newData: newTask,
                        timestamp: new Date().toISOString(),
                      });
                      if (history.length > MAX_HISTORY_SIZE) history.shift();
                      actionHistory.set(conversationId, history);

                      toolResult = { success: true, taskId: newTaskId, created: newTask };
                      break;
                    }

                    case 'delete_task': {
                      const { taskId: deleteTaskId } = toolInput;
                      if (!deleteTaskId) throw new Error('taskId required');

                      // Fetch current state for undo
                      const taskToDelete = await tasksService.readOne(deleteTaskId);

                      // Perform delete
                      await tasksService.deleteOne(deleteTaskId);

                      // Record for undo
                      const history = actionHistory.get(conversationId) || [];
                      history.push({
                        type: 'delete',
                        collection: 'tb_tasks',
                        id: deleteTaskId,
                        previousData: taskToDelete,
                        timestamp: new Date().toISOString(),
                      });
                      if (history.length > MAX_HISTORY_SIZE) history.shift();
                      actionHistory.set(conversationId, history);

                      toolResult = { success: true, taskId: deleteTaskId, deleted: true };
                      break;
                    }

                    case 'activate_task': {
                      const { taskId: activateTaskId } = toolInput;
                      if (!activateTaskId) throw new Error('taskId required');

                      // Fetch current state for undo
                      const taskToActivate = await tasksService.readOne(activateTaskId);

                      // Check if task is in draft status
                      if (taskToActivate.status !== 'draft') {
                        toolResult = { success: false, error: `Task is not in draft status (current: ${taskToActivate.status})` };
                        break;
                      }

                      // Activate the task
                      await tasksService.updateOne(activateTaskId, { status: 'pending' });

                      // Record for undo
                      const history = actionHistory.get(conversationId) || [];
                      history.push({
                        type: 'update',
                        collection: 'tb_tasks',
                        id: activateTaskId,
                        previousData: taskToActivate,
                        newData: { status: 'pending' },
                        timestamp: new Date().toISOString(),
                      });
                      if (history.length > MAX_HISTORY_SIZE) history.shift();
                      actionHistory.set(conversationId, history);

                      toolResult = { success: true, taskId: activateTaskId, activated: true };
                      break;
                    }

                    case 'reorder_task': {
                      const { taskId: reorderTaskId, position, targetTaskId } = toolInput;

                      // Use the new gap-based reorder handler
                      const reorderResult = await handleReorderTask(
                        {
                          taskId: reorderTaskId,
                          position,
                          targetTaskId,
                        },
                        {
                          tasksService: {
                            readByQuery: (query: any) => tasksService.readByQuery(query),
                            updateOne: (id: number, data: any) => tasksService.updateOne(id, data),
                            updateMany: (ids: number[], data: any) => tasksService.updateMany(ids, data),
                          },
                          projectId,
                        }
                      );

                      if (reorderResult.success && reorderResult.previousSortOrder !== undefined) {
                        // Record for undo
                        const history = actionHistory.get(conversationId) || [];
                        history.push({
                          type: 'update',
                          collection: 'tb_tasks',
                          id: reorderTaskId,
                          previousData: { sort_order: reorderResult.previousSortOrder },
                          newData: { sort_order: reorderResult.newSortOrder },
                          timestamp: new Date().toISOString(),
                        });
                        if (history.length > MAX_HISTORY_SIZE) history.shift();
                        actionHistory.set(conversationId, history);
                      }

                      toolResult = reorderResult;
                      break;
                    }

                    case 'submit_form': {
                      const { taskId: formTaskId, data: formData } = toolInput;
                      if (!formTaskId) throw new Error('taskId required');
                      if (!projectId) throw new Error('projectId required');

                      // Save form data as output
                      const outputId = await outputsService.createOne({
                        project_id: projectId,
                        task_id: formTaskId,
                        output_type: 'form',
                        data: formData,
                      });

                      // Write form data to blackboard for data flow between tasks
                      try {
                        const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);
                        await writeFormToBlackboard(blackboard, projectId, formData, `form_task_${formTaskId}`);
                        console.log(`[TemplateBuilder][${traceId}] Form data written to blackboard for project ${projectId}`);
                      } catch (bbError: any) {
                        console.error(`[TemplateBuilder][${traceId}] Failed to write to blackboard:`, bbError.message);
                        // Don't fail the form submission if blackboard write fails
                      }

                      // Update task status
                      await tasksService.updateOne(formTaskId, { status: 'done' });

                      toolResult = { success: true, taskId: formTaskId, outputId };
                      break;
                    }

                    case 'enrich_output': {
                      // Extract parameters from tool input
                      const { outputId: enrichOutputId, taskId: enrichTaskId, newFields } = toolInput;

                      if (!enrichOutputId) throw new Error('outputId is required');
                      if (!enrichTaskId) throw new Error('taskId is required');
                      if (!newFields || !Array.isArray(newFields) || newFields.length === 0) {
                        throw new Error('newFields must be a non-empty array');
                      }

                      // Fetch the task and output
                      const enrichTask = await tasksService.readOne(enrichTaskId);
                      const enrichOutput = await outputsService.readOne(enrichOutputId);

                      if (!enrichOutput || !enrichOutput.data) {
                        throw new Error('Output not found or has no data');
                      }

                      // Get the content array (table data)
                      const content = enrichOutput.data.content;
                      if (!Array.isArray(content)) {
                        throw new Error('Output content must be an array (table data)');
                      }

                      // Update task form_schema with new columns
                      const currentSchema = enrichTask.form_schema || { columns: [], field_types: {} };
                      const updatedColumns = [...(currentSchema.columns || [])];
                      const updatedFieldTypes = { ...(currentSchema.field_types || {}) };

                      for (const field of newFields) {
                        if (!updatedColumns.includes(field.name)) {
                          updatedColumns.push(field.name);
                        }
                        updatedFieldTypes[field.name] = field.type;
                      }

                      await tasksService.updateOne(enrichTaskId, {
                        form_schema: {
                          columns: updatedColumns,
                          field_types: updatedFieldTypes,
                        },
                      });

                      // Build field descriptions for the prompt
                      const fieldDescriptions = newFields
                        .map((f: any) => `- ${f.name} (${f.type})${f.description ? `: ${f.description}` : ''}`)
                        .join('\n');

                      // Enrich each row with AI
                      const enrichedContent: any[] = [];
                      for (const row of content) {
                        // Build context from existing row data
                        const rowContext = Object.entries(row)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join('\n');

                        const enrichPrompt = `You are enriching data for a table. Given the existing data for an entity, find/infer the requested additional fields.

Existing data:
${rowContext}

Fields to find:
${fieldDescriptions}

Return ONLY a JSON object with the requested field values. Example:
{"website_url": "https://example.com", "founding_year": 2020}

Be accurate - if you cannot determine a value with high confidence, use null.
Return ONLY the JSON object, no explanation.`;

                        try {
                          const enrichResponse = await callClaude(enrichPrompt, { timeout: 30000 });

                          // Parse the enriched fields from response
                          let enrichedFields: Record<string, any> = {};
                          try {
                            const jsonMatch = enrichResponse.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                              enrichedFields = JSON.parse(jsonMatch[0]);
                            }
                          } catch {
                            console.log(`[TemplateBuilder][${traceId}] Failed to parse enrichment response for row`);
                          }

                          // Merge enriched fields with existing row
                          enrichedContent.push({ ...row, ...enrichedFields });
                        } catch (enrichError: any) {
                          console.log(`[TemplateBuilder][${traceId}] Error enriching row: ${enrichError.message}`);
                          // Keep original row on error
                          enrichedContent.push(row);
                        }
                      }

                      // Update the output with enriched data
                      const updatedData = {
                        ...enrichOutput.data,
                        content: enrichedContent,
                      };

                      await outputsService.updateOne(enrichOutputId, { data: updatedData });

                      // Record for undo
                      const enrichHistory = actionHistory.get(conversationId) || [];
                      enrichHistory.push({
                        type: 'update',
                        collection: 'tb_outputs',
                        id: enrichOutputId,
                        previousData: enrichOutput,
                        newData: { data: updatedData },
                        timestamp: new Date().toISOString(),
                      });
                      if (enrichHistory.length > MAX_HISTORY_SIZE) enrichHistory.shift();
                      actionHistory.set(conversationId, enrichHistory);

                      toolResult = {
                        success: true,
                        enriched_count: enrichedContent.length,
                        task_updated: true,
                        new_columns: newFields.map((f: any) => f.name),
                        outputId: enrichOutputId,
                        taskId: enrichTaskId,
                      };
                      break;
                    }
                  }
                } catch (toolError: any) {
                  toolResult = { success: false, error: toolError.message };
                }

                // Send tool_complete event
                sendEvent('tool_complete', {
                  tool: currentToolUse.name,
                  toolIndex: thisToolIndex,
                  success: toolResult.success,
                  result: toolResult,
                });

                // Store action result
                executedActions.push({
                  tool: currentToolUse.name,
                  toolIndex: thisToolIndex,
                  input: toolInput,
                  success: toolResult.success,  // Include success at top level for frontend
                  result: toolResult,
                });

                // Add tool result to messages for next iteration
                apiMessages.push({
                  role: 'assistant',
                  content: [{
                    type: 'tool_use',
                    id: currentToolUse.id,
                    name: currentToolUse.name,
                    input: toolInput,
                  }],
                });
                apiMessages.push({
                  role: 'user',
                  content: [{
                    type: 'tool_result',
                    tool_use_id: currentToolUse.id,
                    content: JSON.stringify(toolResult),
                  }],
                });

                currentToolUse = null;
              }
            } else if (event.type === 'message_delta') {
              stopReason = event.delta.stop_reason || null;
            }
          }

          // Decide if we need to continue looping
          if (stopReason === 'tool_use') {
            // Continue the loop to process tool results
            continueLoop = true;
          } else {
            // No more tool calls, we're done
            continueLoop = false;
          }
        }

        // Save assistant response to conversation history
        if (fullTextResponse) {
          conversationHistory.push({ role: 'assistant', content: fullTextResponse });
          conversationSessions.set(conversationId, conversationHistory);
        }

        // Send complete event
        sendEvent('complete', {
          actions: executedActions,
          traceId,
        });

        res.end();
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Chat-v2 error:`, error);
        sendEvent('error', {
          message: error.message || 'An error occurred',
          traceId,
        });
        res.end();
      }
    });

    /**
     * POST /template-builder/undo
     * Undo the last action from chat-v2
     */
    router.post('/undo', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { conversationId, count = 1 } = req.body;

      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId is required', traceId });
      }

      const history = actionHistory.get(conversationId);
      if (!history || history.length === 0) {
        return res.json({ success: false, message: 'No actions to undo', traceId });
      }

      const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
      const undone: any[] = [];
      const errors: any[] = [];

      const actionsToUndo = history.slice(-count).reverse();
      for (const action of actionsToUndo) {
        try {
          switch (action.type) {
            case 'create':
              // Undo create by deleting
              await tasksService.deleteOne(action.id);
              undone.push({ type: 'deleted', id: action.id, original: 'create' });
              break;
            case 'update':
              // Undo update by restoring previous data
              if (action.previousData) {
                await tasksService.updateOne(action.id, action.previousData);
                undone.push({ type: 'restored', id: action.id, original: 'update' });
              }
              break;
            case 'delete':
              // Undo delete by recreating
              if (action.previousData) {
                await tasksService.createOne(action.previousData);
                undone.push({ type: 'recreated', id: action.id, original: 'delete' });
              }
              break;
          }

          // Remove from history
          const idx = history.indexOf(action);
          if (idx > -1) history.splice(idx, 1);
        } catch (e: any) {
          errors.push({ action, error: e.message });
        }
      }

      actionHistory.set(conversationId, history);

      res.json({
        success: errors.length === 0,
        undone,
        errors,
        remainingHistory: history.length,
        traceId,
      });
    });

    /**
     * GET /template-builder/action-history
     * Get the action history for a conversation (for undo UI)
     */
    router.get('/action-history', async (req: any, res: any) => {
      const conversationId = req.query.conversationId as string;

      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId query param required' });
      }

      const history = actionHistory.get(conversationId) || [];
      res.json({
        conversationId,
        actions: history,
        count: history.length,
      });
    });

    // ========================================================================
    // LEGACY ENDPOINTS (still using Claude CLI proxy)
    // ========================================================================

    /**
     * POST /template-builder/chat
     * Legacy: AI conversation with project context - can execute actions
     */
    router.post('/chat', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { message, projectId, taskId, conversationHistory = [], enrichmentContext } = req.body;

      console.log(`[TemplateBuilder][${traceId}] Chat request for project ${projectId}, task ${taskId}`);

      if (!message) {
        return res.status(400).json({ error: 'Message is required', traceId });
      }

      try {
        const projectsService = new ItemsService('tb_projects', { schema: req.schema, accountability: req.accountability });
        const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
        const outputsService = new ItemsService('tb_outputs', { schema: req.schema, accountability: req.accountability });

        // Fetch project and tasks context
        let projectContext = '';
        let project: any = null;
        let tasks: any[] = [];
        let selectedTask: any = null;

        if (projectId) {
          try {
            project = await projectsService.readOne(projectId);
            tasks = await tasksService.readByQuery({
              filter: { project_id: { _eq: projectId } },
              sort: ['sort_order'],
            });

            // Find selected task if taskId provided
            if (taskId) {
              selectedTask = tasks.find((t: any) => t.id === taskId);
            }

            projectContext = `
## Current Project
Name: ${project.name}
Status: ${project.status}
Description: ${project.description || 'No description'}

## Tasks (${tasks.length} total)
${tasks.map((t: any, i: number) => {
  const isSelected = t.id === taskId;
  const formInfo = t.action_type === 'form' && t.form_schema ? ` | Form fields: ${JSON.stringify(t.form_schema)}` : '';
  return `${i + 1}. [ID:${t.id}] ${t.name} - ${t.description || 'No description'} [${t.status}] (type: ${t.action_type})${formInfo}${isSelected ? ' ← SELECTED' : ''}`;
}).join('\n')}
`;

            // Add selected task detail
            if (selectedTask) {
              projectContext += `
## Selected Task Detail
ID: ${selectedTask.id}
Name: ${selectedTask.name}
Description: ${selectedTask.description}
Type: ${selectedTask.action_type}
Status: ${selectedTask.status}
${selectedTask.form_schema ? `Form Schema: ${JSON.stringify(selectedTask.form_schema, null, 2)}` : ''}
`;
            }
          } catch (e) {
            console.log(`[TemplateBuilder][${traceId}] Could not fetch project context:`, e);
          }
        }

        // Build enrichment context section if provided
        let enrichmentSection = '';
        if (enrichmentContext) {
          enrichmentSection = `
## Output Enrichment Context
You are in enrichment mode - helping the user add new data columns to a table output.
Current output ID: ${enrichmentContext.output_id}
Task ID: ${enrichmentContext.task_id}
Current columns: ${(enrichmentContext.current_columns || []).join(', ')}

When the user asks to add fields or columns to the data, extract the field details and include an ENRICHMENT_FIELDS block in your response:
ENRICHMENT_FIELDS: [{"name": "field_name", "type": "field_type", "description": "description"}]

Field types: text, url, number, date, email, boolean
Use snake_case for field names.
`;
        }

        // Build conversation for Claude
        const historyText = conversationHistory
          .map((msg: any) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');

        const prompt = `You are an AI assistant for a workflow/template builder tool. You can both answer questions AND execute actions.

${projectContext}
${enrichmentSection}
${historyText ? `## Conversation History\n${historyText}\n` : ''}

## Current Message
User: ${message}

## Instructions
1. Understand what the user wants
2. If they want to MODIFY something (add field, update task, submit form data), you MUST include an ACTION block
3. Respond conversationally AND include actions when needed

## Output Enrichment Feature
If the user wants to add new fields/columns to EXISTING OUTPUT DATA (not task definitions), they should:
1. Go to the Outputs view
2. Click the "+" (Add Missing Data) button on the output card they want to enrich
3. Then describe what fields they want to add

When a user asks to "add fields to output data" or "enrich competitors with website links" WITHOUT having an output selected (no enrichmentContext), guide them to use the Add Missing Data button on the specific output card they want to enrich.

## Available Actions (include in your response when needed)
To execute an action, include a JSON block at the END of your response like this:

ACTION: {"type": "update_task", "taskId": 123, "data": {"name": "New name", "description": "New desc"}}
ACTION: {"type": "submit_form", "taskId": 123, "data": {"field1": "value1", "field2": "value2"}}
ACTION: {"type": "create_task", "data": {"name": "Task name", "description": "Desc", "action_type": "agent"}}
ACTION: {"type": "enrich_output", "outputId": 123, "taskId": 456, "newFields": [{"name": "field_name", "type": "url"}]}

Action types:
- update_task: Update task fields (name, description, status, form_schema, etc.)
- submit_form: Submit form data for a form-type task (saves to outputs)
- create_task: Create a new task in the project
- enrich_output: Add new fields to existing output data (ONLY when user has selected an output via the + button)

## Example Interactions

User: "Add an email field to the form"
Response: I'll add an email field to the Company Info form.
ACTION: {"type": "update_task", "taskId": 5, "data": {"form_schema": [{"name": "company_name", "label": "Company Name", "type": "text", "required": true}, {"name": "email", "label": "Email", "type": "email", "required": true}]}}

User: "Fill in the company name as Acme Corp"
Response: I've submitted the form with Acme Corp as the company name.
ACTION: {"type": "submit_form", "taskId": 5, "data": {"company_name": "Acme Corp"}}

Now respond to the user. Include an ACTION block if they want to modify something.
After your response (and any ACTION), add suggestions:
SUGGESTIONS: ["suggestion 1", "suggestion 2", "suggestion 3"]`;

        const response = await callClaude(prompt, { timeout: 60000 });

        // Parse response for actions and suggestions
        let mainResponse = response;
        let suggestions: string[] = [];
        let actions: AIAction[] = [];
        let actionResults: any[] = [];

        // Extract ACTION blocks - need to handle nested JSON properly
        const extractJsonFromPosition = (str: string, startPos: number): string | null => {
          if (str[startPos] !== '{') return null;
          let depth = 0;
          let inString = false;
          let escape = false;
          for (let i = startPos; i < str.length; i++) {
            const char = str[i];
            if (escape) {
              escape = false;
              continue;
            }
            if (char === '\\' && inString) {
              escape = true;
              continue;
            }
            if (char === '"') {
              inString = !inString;
              continue;
            }
            if (!inString) {
              if (char === '{') depth++;
              if (char === '}') {
                depth--;
                if (depth === 0) return str.substring(startPos, i + 1);
              }
            }
          }
          return null;
        };

        // Find all ACTION: blocks
        let searchPos = 0;
        while (true) {
          const actionStart = response.indexOf('ACTION:', searchPos);
          if (actionStart === -1) break;

          // Find the start of JSON object
          const jsonStart = response.indexOf('{', actionStart);
          if (jsonStart === -1) break;

          const jsonStr = extractJsonFromPosition(response, jsonStart);
          if (jsonStr) {
            try {
              const action = JSON.parse(jsonStr) as AIAction;
              actions.push(action);
              // Remove the ACTION block from response
              const fullMatch = response.substring(actionStart, jsonStart + jsonStr.length);
              mainResponse = mainResponse.replace(fullMatch, '').trim();
            } catch (e) {
              console.log(`[TemplateBuilder][${traceId}] Failed to parse action JSON:`, jsonStr.substring(0, 100));
            }
            searchPos = jsonStart + jsonStr.length;
          } else {
            searchPos = actionStart + 7;
          }
        }

        // Extract SUGGESTIONS
        const suggestionsMatch = mainResponse.match(/SUGGESTIONS:\s*\[(.*?)\]/s);
        if (suggestionsMatch) {
          mainResponse = mainResponse.replace(/SUGGESTIONS:\s*\[.*?\]/s, '').trim();
          try {
            suggestions = JSON.parse(`[${suggestionsMatch[1]}]`);
          } catch {
            suggestions = [];
          }
        }

        // Execute actions
        for (const action of actions) {
          console.log(`[TemplateBuilder][${traceId}] Executing action:`, action);
          try {
            switch (action.type) {
              case 'update_task': {
                if (!action.taskId) throw new Error('taskId required for update_task');
                await tasksService.updateOne(action.taskId, action.data || {});
                actionResults.push({ type: 'update_task', taskId: action.taskId, success: true });
                break;
              }
              case 'submit_form': {
                const formTaskId = action.taskId || taskId;
                if (!formTaskId) throw new Error('taskId required for submit_form');
                if (!projectId) throw new Error('projectId required for submit_form');

                // Save form data as output
                const outputId = await outputsService.createOne({
                  project_id: projectId,
                  task_id: formTaskId,
                  output_type: 'form',
                  data: action.data || {},
                });

                // Write form data to blackboard for data flow between tasks
                try {
                  const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);
                  await writeFormToBlackboard(blackboard, projectId, action.data || {}, `form_task_${formTaskId}`);
                  console.log(`[TemplateBuilder][${traceId}] Form data written to blackboard for project ${projectId}`);
                } catch (bbError: any) {
                  console.error(`[TemplateBuilder][${traceId}] Failed to write to blackboard:`, bbError.message);
                  // Don't fail the form submission if blackboard write fails
                }

                // Update task status to done
                await tasksService.updateOne(formTaskId, { status: 'done' });

                actionResults.push({ type: 'submit_form', taskId: formTaskId, outputId, success: true });
                break;
              }
              case 'create_task': {
                if (!projectId) throw new Error('projectId required for create_task');

                // Get max sort_order
                const existingTasks = await tasksService.readByQuery({
                  filter: { project_id: { _eq: projectId } },
                  sort: ['-sort_order'],
                  limit: 1,
                });
                const sortOrder = existingTasks.length > 0 ? (existingTasks[0].sort_order || 0) + 1 : 1;

                const newTaskId = await tasksService.createOne({
                  project_id: projectId,
                  name: action.data?.name || 'New Task',
                  description: action.data?.description || '',
                  action_type: action.data?.action_type || 'agent',
                  status: 'pending',
                  sort_order: sortOrder,
                  ...action.data,
                });

                actionResults.push({ type: 'create_task', taskId: newTaskId, success: true });
                break;
              }
              case 'enrich_output': {
                // Enrich existing output with new fields
                const enrichOutputId = action.outputId || (enrichmentContext as any)?.output_id;
                const enrichTaskId = action.taskId || (enrichmentContext as any)?.task_id;
                const newFields = action.newFields || [];

                if (!enrichOutputId) throw new Error('outputId required for enrich_output');
                if (!enrichTaskId) throw new Error('taskId required for enrich_output');
                if (!newFields.length) throw new Error('newFields required for enrich_output');

                // Call the enrich-output logic inline
                const task = await tasksService.readOne(enrichTaskId);
                const output = await outputsService.readOne(enrichOutputId);

                if (!output?.data?.content || !Array.isArray(output.data.content)) {
                  throw new Error('Output must have table data (content array)');
                }

                // Update task form_schema
                const currentSchema = task.form_schema || { columns: [], field_types: {} };
                const updatedColumns = [...(currentSchema.columns || [])];
                const updatedFieldTypes = { ...(currentSchema.field_types || {}) };

                for (const field of newFields) {
                  if (!updatedColumns.includes(field.name)) {
                    updatedColumns.push(field.name);
                  }
                  updatedFieldTypes[field.name] = field.type || 'text';
                }

                await tasksService.updateOne(enrichTaskId, {
                  form_schema: { columns: updatedColumns, field_types: updatedFieldTypes },
                });

                // Enrich each row
                const fieldDescriptions = newFields
                  .map((f: any) => `- ${f.name} (${f.type || 'text'})${f.description ? `: ${f.description}` : ''}`)
                  .join('\n');

                const enrichedContent: any[] = [];
                for (const row of output.data.content) {
                  const rowContext = Object.entries(row)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n');

                  const enrichPrompt = `You are enriching data for a table. Given the existing data for an entity, find/infer the requested additional fields.

Existing data:
${rowContext}

Fields to find:
${fieldDescriptions}

Return ONLY a JSON object with the requested field values. Be accurate - use null if uncertain.`;

                  try {
                    const enrichResponse = await callClaude(enrichPrompt, { timeout: 30000 });
                    const jsonMatch = enrichResponse.match(/\{[\s\S]*\}/);
                    const enrichedFields = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
                    enrichedContent.push({ ...row, ...enrichedFields });
                  } catch {
                    enrichedContent.push(row);
                  }
                }

                // Update output
                await outputsService.updateOne(enrichOutputId, {
                  data: { ...output.data, content: enrichedContent },
                });

                actionResults.push({
                  type: 'enrich_output',
                  outputId: enrichOutputId,
                  taskId: enrichTaskId,
                  enrichedCount: enrichedContent.length,
                  success: true,
                });
                break;
              }
              default:
                console.log(`[TemplateBuilder][${traceId}] Unknown action type:`, action.type);
            }
          } catch (e: any) {
            console.error(`[TemplateBuilder][${traceId}] Action failed:`, e);
            actionResults.push({ type: action.type, error: e.message, success: false });
          }
        }

        // Save to conversation history
        if (projectId) {
          try {
            const conversationsService = new ItemsService('tb_conversations', { schema: req.schema, accountability: req.accountability });
            const existing = await conversationsService.readByQuery({
              filter: { project_id: { _eq: projectId } },
              limit: 1,
            });

            const newMessages = [
              ...conversationHistory,
              { role: 'user', content: message },
              { role: 'assistant', content: mainResponse, actions: actionResults },
            ];

            if (existing.length > 0) {
              await conversationsService.updateOne(existing[0].id, { messages: newMessages });
            } else {
              await conversationsService.createOne({ project_id: projectId, messages: newMessages });
            }
          } catch (e) {
            console.log(`[TemplateBuilder][${traceId}] Could not save conversation:`, e);
          }
        }

        res.json({
          response: mainResponse,
          suggestions,
          actions: actionResults,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Chat error:`, error);
        res.status(500).json({
          error: 'Failed to process chat message',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * POST /template-builder/chat-stream
     * AI conversation with project context - streaming SSE response
     */
    router.post('/chat-stream', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { message, projectId, conversationHistory = [] } = req.body;

      console.log(`[TemplateBuilder][${traceId}] Chat stream request for project ${projectId}`);

      if (!message) {
        return res.status(400).json({ error: 'Message is required', traceId });
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      // Helper to send SSE events
      const sendEvent = (eventType: string, data: any) => {
        res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // Fetch project context if projectId provided
        let projectContext = '';
        if (projectId) {
          const projectsService = new ItemsService('tb_projects', { schema: req.schema, accountability: req.accountability });
          const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });

          try {
            const project = await projectsService.readOne(projectId);
            const tasks = await tasksService.readByQuery({
              filter: { project_id: { _eq: projectId } },
              sort: ['sort_order'],
            });

            projectContext = `
Current Project: ${project.name}
Status: ${project.status}
Tasks (${tasks.length}):
${tasks.map((t: any, i: number) => `${i + 1}. ${t.name} - ${t.description} [${t.status}]`).join('\n')}
`;
          } catch (e) {
            console.log(`[TemplateBuilder][${traceId}] Could not fetch project context:`, e);
          }
        }

        // Build conversation for Claude
        const historyText = conversationHistory
          .map((msg: any) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');

        const prompt = `You are a helpful AI assistant for a workflow/template builder tool. Help users create, modify, and understand their workflow tasks.

${projectContext ? `## Project Context\n${projectContext}\n` : ''}
${historyText ? `## Conversation History\n${historyText}\n` : ''}
## Current Message
User: ${message}

Respond helpfully and concisely. If the user wants to modify tasks, suggest specific changes. If they have questions, answer them directly.

After your response, on a new line, output 3 relevant follow-up suggestions in this exact format:
SUGGESTIONS: ["suggestion 1", "suggestion 2", "suggestion 3"]`;

        // Call streaming endpoint
        const response = await fetch(`${CLAUDE_PROXY_URL}/claude-stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, timeout: 60000 }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Proxy returned ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body from proxy');
        }

        // Process the SSE stream from proxy
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          let currentEventType = '';
          let currentEventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              currentEventData = line.slice(6);
            } else if (line === '' && currentEventType && currentEventData) {
              // End of event, process it
              try {
                const data = JSON.parse(currentEventData);

                if (currentEventType === 'content') {
                  // Forward content events to client
                  sendEvent('content', data);
                  if (data.text) {
                    fullResponse += data.text;
                  }
                } else if (currentEventType === 'done') {
                  // Parse final response for suggestions
                  const finalResponse = data.response || fullResponse;
                  let mainResponse = finalResponse;
                  let suggestions: string[] = [];

                  const suggestionsMatch = finalResponse.match(/SUGGESTIONS:\s*\[(.*?)\]/s);
                  if (suggestionsMatch) {
                    mainResponse = finalResponse.replace(/SUGGESTIONS:\s*\[.*?\]/s, '').trim();
                    try {
                      suggestions = JSON.parse(`[${suggestionsMatch[1]}]`);
                    } catch {
                      suggestions = [];
                    }
                  }

                  // Send done event with suggestions
                  sendEvent('done', {
                    response: mainResponse,
                    suggestions,
                    traceId,
                  });
                } else if (currentEventType === 'error') {
                  sendEvent('error', data);
                }
              } catch (parseError) {
                console.log(`[TemplateBuilder][${traceId}] Failed to parse SSE data:`, currentEventData);
              }

              currentEventType = '';
              currentEventData = '';
            }
          }
        }

        res.end();
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Chat stream error:`, error);

        // Check if proxy is not available
        if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
          sendEvent('error', {
            error: 'Claude proxy not running. Start it with: node scripts/claude-proxy-server.js',
            traceId,
          });
        } else {
          sendEvent('error', {
            error: 'Failed to process chat message',
            details: error.message,
            traceId,
          });
        }

        res.end();
      }
    });

    /**
     * POST /template-builder/execute-task
     * Execute a task using Claude to generate output
     * Now reads from blackboard for proper data flow between tasks.
     */
    router.post('/execute-task', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { taskId, projectId } = req.body;

      console.log(`[TemplateBuilder][${traceId}] Execute task ${taskId} for project ${projectId}`);

      if (!taskId || !projectId) {
        return res.status(400).json({ error: 'taskId and projectId are required', traceId });
      }

      try {
        const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
        const outputsService = new ItemsService('tb_outputs', { schema: req.schema, accountability: req.accountability });

        // Fetch the task
        const task = await tasksService.readOne(taskId);

        // Read from blackboard for context (new blackboard architecture)
        let blackboardContext: Record<string, any> = {};
        try {
          const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);
          blackboardContext = await blackboard.getValues(projectId);
          console.log(`[TemplateBuilder][${traceId}] Blackboard context keys: ${Object.keys(blackboardContext).join(', ') || 'none'}`);
        } catch (bbError: any) {
          console.log(`[TemplateBuilder][${traceId}] Could not read blackboard: ${bbError.message}`);
        }

        // Fetch previous outputs for context (fallback if blackboard empty)
        const previousOutputs = await outputsService.readByQuery({
          filter: { project_id: { _eq: projectId } },
          sort: ['id'],
        });

        // Update task status to running
        await tasksService.updateOne(taskId, { status: 'running' });

        // Create logger for this task
        const taskLogger = (msg: string) => console.log(`[TemplateBuilder][${traceId}] ${msg}`);

        // Execute tools based on tool_mode, passing blackboard context
        const { toolResults, toolsUsed } = await executeToolsForTask(task, previousOutputs, taskLogger, blackboardContext);
        taskLogger(`Tools used: ${toolsUsed.join(', ') || 'none'}`);

        // Build previous outputs context
        let previousOutputsContext = '';
        if (previousOutputs && previousOutputs.length > 0) {
          previousOutputsContext = `
## Previous outputs from this project
${previousOutputs.map((out: any, i: number) => {
  const title = out.data?.title || 'Untitled';
  let content = '';
  if (typeof out.data?.content === 'string') {
    content = out.data.content.substring(0, 500);
  } else if (out.data?.content !== undefined) {
    content = JSON.stringify(out.data.content).substring(0, 500);
  } else if (out.data && typeof out.data === 'object') {
    // For form submissions, use the whole data object
    content = JSON.stringify(out.data).substring(0, 500);
  } else {
    content = '[No content]';
  }
  return `
Output ${i + 1} (${out.output_type}):
Title: ${title}
Content: ${content}`;
}).join('\n')}
`;
        }

        // Build output type formatting instructions
        let outputFormatInstructions = '';
        if (task.output_type) {
          const formatMap: Record<string, string> = {
            table: 'Generate output as a JSON array of objects (rows with consistent keys/columns). Example: [{"col1": "val1", "col2": "val2"}, ...]',
            text: 'Generate output as markdown-formatted text. Use headers, lists, bold, etc. as appropriate.',
            list: 'Generate output as a JSON array of strings or objects representing list items.',
            structured: 'Generate output as a structured JSON object with appropriate nested properties.',
            json: 'Generate output as a structured JSON object with appropriate properties. Good for configurations, technical data, or nested structures.',
            colors: 'Return a JSON object with color names as keys and hex codes as values. Example: {"primary": "#3B82F6", "secondary": "#10B981", "accent": "#F59E0B"}',
          };
          outputFormatInstructions = formatMap[task.output_type] || '';
        }

        // Build blackboard context section for prompt
        let blackboardSection = '';
        if (Object.keys(blackboardContext).length > 0) {
          blackboardSection = `## Project Data (from blackboard)
${Object.entries(blackboardContext).map(([key, value]) => {
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
  return `- ${key}: ${valueStr.substring(0, 200)}${valueStr.length > 200 ? '...' : ''}`;
}).join('\n')}
`;
        }

        // Build prompt based on task type - now includes blackboard and tool results
        const prompt = `You are executing a workflow task. Analyze the provided data and generate structured output.

Task: ${task.name}
Description: ${task.description}
Type: ${task.action_type}
${task.tool_mode ? `Tool Mode: ${task.tool_mode}` : ''}
${task.output_type ? `Output Type: ${task.output_type}` : ''}

${blackboardSection}
${toolResults ? `## Tool Results (Real Data)\n${toolResults}\n` : ''}
${previousOutputsContext}

Based on the task description, project data, and tool results above, generate appropriate output.
- If tool results include search data, synthesize and summarize the findings
- If tool results include scraped content, extract relevant information
- If tool results include images, include them in structured format

${outputFormatInstructions ? `Output Format Instructions:\n${outputFormatInstructions}` : ''}

Format your response as JSON with this structure:
{
  "output_type": "${task.output_type || 'text'}",
  "title": "Output title",
  "content": "The main output content or data (use the tool results!)",
  "sources": ["list of URLs used if any"],
  "tools_used": ${JSON.stringify(toolsUsed)}
}`;

        const response = await callClaude(prompt, { timeout: 90000 });

        // Parse the output
        let output;
        try {
          // Try to extract JSON from response
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            output = JSON.parse(jsonMatch[0]);
          } else {
            output = {
              output_type: 'text',
              title: task.name,
              content: response,
            };
          }
        } catch {
          output = {
            output_type: 'text',
            title: task.name,
            content: response,
          };
        }

        // Save output (with versioning - supersede old outputs for same task)
        const savedOutput = await outputsService.createOne({
          project_id: projectId,
          task_id: taskId,
          output_type: output.output_type,
          data: output,
        });

        // Mark previous outputs for this task as superseded
        const previousOutputsForTask = previousOutputs.filter(
          (out: any) => out.task_id === taskId && out.id !== savedOutput.id && !out.superseded_by
        );
        for (const oldOutput of previousOutputsForTask) {
          try {
            await outputsService.updateOne(oldOutput.id, {
              superseded_by: savedOutput.id,
            });
            taskLogger(`Superseded old output ${oldOutput.id} with new output ${savedOutput.id}`);
          } catch (supersedeError: any) {
            taskLogger(`Warning: Could not supersede old output ${oldOutput.id}: ${supersedeError.message}`);
          }
        }

        // Phase 4: Write task output to blackboard for data flow between tasks
        try {
          const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);

          // Determine what data to write to blackboard from output
          // Extract structured fields that should be shared with other tasks
          const outputFieldsToWrite: Record<string, any> = {};

          // If output.content is a structured object, write its fields
          if (output.content && typeof output.content === 'object' && !Array.isArray(output.content)) {
            Object.assign(outputFieldsToWrite, output.content);
          }

          // Also write output by task name as a key (e.g., "brand_research" -> content)
          const taskKey = task.name.toLowerCase().replace(/\s+/g, '_');
          if (output.content) {
            outputFieldsToWrite[`${taskKey}_result`] = output.content;
          }
          if (output.title) {
            outputFieldsToWrite[`${taskKey}_title`] = output.title;
          }

          // Determine source type based on tools used
          const hasScrapedWebsite = toolsUsed.includes('scrape');
          const hasSearchResults = toolsUsed.includes('search');

          // Get the website URL if we scraped it
          const sourceUrl = blackboardContext.website_url || blackboardContext.website;

          // Write to blackboard
          if (Object.keys(outputFieldsToWrite).length > 0) {
            const { written, skipped } = await blackboard.writeTaskOutput(
              projectId,
              `task_${taskId}`,
              outputFieldsToWrite,
              {
                hasScrapedWebsite,
                hasSearchResults,
                sourceUrl,
                basedOnKeys: Object.keys(blackboardContext),
              }
            );
            taskLogger(`Blackboard: wrote ${written.length} entries, skipped ${skipped.length} (user input protected)`);
          }

          // Phase 5: Detect conflicts between user input and research findings
          // Look for potential entity mismatches, industry contradictions, etc.
          const bb = await blackboard.get(projectId);
          if (bb) {
            // Extract research findings from output that might conflict with user input
            const researchFindings: ResearchFindings = {};

            // Look for entity_found in output content
            if (output.content && typeof output.content === 'object') {
              if (output.content.entity_found) researchFindings.entity_found = output.content.entity_found;
              if (output.content.company_name) researchFindings.company_name = output.content.company_name;
              if (output.content.entity_industry) researchFindings.entity_industry = output.content.entity_industry;
              if (output.content.industry) researchFindings.industry = output.content.industry;
            }

            // Also check if the task result itself contains a different brand/company name
            // This happens when AI generates content about a different entity
            if (output.title && typeof output.title === 'string') {
              // Extract entity name from title if it looks like "Research: [Company Name]"
              const titleMatch = output.title.match(/Research:\s*(.+)/i);
              if (titleMatch) {
                researchFindings.entity_found = researchFindings.entity_found || titleMatch[1].trim();
              }
            }

            if (Object.keys(researchFindings).length > 0) {
              const conflicts = detectConflicts(bb, researchFindings, `task_${taskId}`);

              if (conflicts.length > 0) {
                taskLogger(`Detected ${conflicts.length} conflict(s) - adding to blackboard for HITL resolution`);

                // Add conflicts to blackboard
                for (const conflict of conflicts) {
                  await blackboard.addConflict(projectId, {
                    type: conflict.type,
                    keys_involved: conflict.keys_involved,
                    description: conflict.description,
                    options: conflict.options,
                    created_by_task: conflict.created_by_task,
                  });
                }
              }
            }
          }
        } catch (bbError: any) {
          // Don't fail the task if blackboard write fails
          taskLogger(`Failed to write task output to blackboard: ${bbError.message}`);
        }

        // Update task status to done and link to output
        await tasksService.updateOne(taskId, { status: 'done', output_id: savedOutput });

        res.json({
          success: true,
          output: {
            id: savedOutput,
            project_id: projectId,
            task_id: taskId,
            output_type: output.output_type,
            data: output,
            date_created: new Date().toISOString(),
          },
          taskStatus: 'done',
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Execute task error:`, error);

        // Revert task status on error
        try {
          const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
          await tasksService.updateOne(taskId, { status: 'pending' });
        } catch {}

        res.status(500).json({
          error: 'Failed to execute task',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * POST /template-builder/edit-text
     * AI-powered text editing (rewrite/shorten/expand)
     */
    router.post('/edit-text', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { text, action, context = '' } = req.body;

      console.log(`[TemplateBuilder][${traceId}] Edit text: ${action}`);

      if (!text || !action) {
        return res.status(400).json({ error: 'text and action are required', traceId });
      }

      const validActions = ['rewrite', 'shorten', 'expand', 'improve', 'simplify'];
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}`, traceId });
      }

      try {
        const actionPrompts: Record<string, string> = {
          rewrite: 'Rewrite this text to improve clarity and flow while maintaining the same meaning:',
          shorten: 'Make this text more concise while keeping the key information:',
          expand: 'Expand this text with more detail and examples:',
          improve: 'Improve the quality and professionalism of this text:',
          simplify: 'Simplify this text to make it easier to understand:',
        };

        const prompt = `${actionPrompts[action]}

${context ? `Context: ${context}\n\n` : ''}Text to edit:
"""
${text}
"""

Provide only the edited text, nothing else.`;

        const editedText = await callClaude(prompt, { timeout: 30000 });

        res.json({
          editedText: editedText.trim(),
          action,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Edit text error:`, error);
        res.status(500).json({
          error: 'Failed to edit text',
          details: error.message,
          traceId,
        });
      }
    });

    // ============================================================================
    // OUTPUT VERSIONING ENDPOINTS
    // ============================================================================

    /**
     * GET /template-builder/outputs/:projectId
     * Get outputs for a project, filtering out superseded ones by default
     * Query params:
     *   - include_history=true: Include superseded outputs
     *   - task_id=xxx: Filter by task ID
     */
    router.get('/outputs/:projectId', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const projectId = parseInt(req.params.projectId, 10);
      const includeHistory = req.query?.include_history === 'true';
      const taskIdFilter = req.query?.task_id;

      console.log(`[TemplateBuilder][${traceId}] Get outputs for project ${projectId} (include_history=${includeHistory})`);

      if (!projectId || isNaN(projectId)) {
        return res.status(400).json({ error: 'Valid projectId is required', traceId });
      }

      try {
        const outputsService = new ItemsService('tb_outputs', { schema: req.schema, accountability: req.accountability });

        // Build filter
        const filter: any = { project_id: { _eq: projectId } };

        // Filter by task if specified
        if (taskIdFilter) {
          filter.task_id = { _eq: taskIdFilter };
        }

        // Filter out superseded outputs unless include_history is true
        if (!includeHistory) {
          filter.superseded_by = { _null: true };
        }

        const outputs = await outputsService.readByQuery({
          filter,
          sort: ['-date_created'],
        });

        // Group outputs by task for easier consumption
        const outputsByTask: Record<string, any[]> = {};
        for (const output of outputs) {
          const taskId = output.task_id || 'unknown';
          if (!outputsByTask[taskId]) {
            outputsByTask[taskId] = [];
          }
          outputsByTask[taskId].push(output);
        }

        res.json({
          outputs,
          outputs_by_task: outputsByTask,
          total: outputs.length,
          include_history: includeHistory,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Get outputs error:`, error);
        res.status(500).json({
          error: 'Failed to get outputs',
          details: error.message,
          traceId,
        });
      }
    });

    // ============================================================================
    // PHASE 6: HITL CONFLICT RESOLUTION ENDPOINTS
    // ============================================================================

    /**
     * GET /template-builder/conflicts/:projectId
     * Get pending conflicts for a project (for AI sidebar to show)
     */
    router.get('/conflicts/:projectId', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const projectId = parseInt(req.params.projectId, 10);

      console.log(`[TemplateBuilder][${traceId}] Get pending conflicts for project ${projectId}`);

      if (!projectId || isNaN(projectId)) {
        return res.status(400).json({ error: 'Valid projectId is required', traceId });
      }

      try {
        const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);
        const pendingConflicts = await blackboard.getPendingConflicts(projectId);

        res.json({
          conflicts: pendingConflicts,
          count: pendingConflicts.length,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Get conflicts error:`, error);
        res.status(500).json({
          error: 'Failed to get conflicts',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * POST /template-builder/resolve-conflict
     * Resolve a conflict by choosing an option or providing custom value
     */
    router.post('/resolve-conflict', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { projectId, conflictId, optionId, customValue } = req.body;

      console.log(`[TemplateBuilder][${traceId}] Resolve conflict ${conflictId} for project ${projectId}`);

      if (!projectId || !conflictId) {
        return res.status(400).json({ error: 'projectId and conflictId are required', traceId });
      }

      try {
        const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);

        let success: boolean;
        let entriesWritten: string[] = [];

        if (optionId === 'custom' && customValue) {
          // Custom resolution - user typed their own value
          success = await blackboard.resolveConflictCustom(projectId, conflictId, customValue);
          entriesWritten = Object.keys(customValue);
        } else if (optionId) {
          // Standard option resolution
          success = await blackboard.resolveConflict(projectId, conflictId, optionId);

          // Get the option to report which entries were written
          const bb = await blackboard.get(projectId);
          const conflict = bb?.conflicts.find((c) => c.id === conflictId);
          const option = conflict?.options.find((o) => o.id === optionId);
          if (option) {
            entriesWritten = Object.keys(option.writes);
          }
        } else {
          return res.status(400).json({ error: 'optionId is required', traceId });
        }

        if (!success) {
          return res.status(404).json({
            error: 'Conflict not found or already resolved',
            traceId,
          });
        }

        res.json({
          success: true,
          entries_written: entriesWritten,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Resolve conflict error:`, error);
        res.status(500).json({
          error: 'Failed to resolve conflict',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * GET /template-builder/blackboard/:projectId
     * Get the full blackboard state for debugging/display
     */
    router.get('/blackboard/:projectId', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const projectId = parseInt(req.params.projectId, 10);

      console.log(`[TemplateBuilder][${traceId}] Get blackboard for project ${projectId}`);

      if (!projectId || isNaN(projectId)) {
        return res.status(400).json({ error: 'Valid projectId is required', traceId });
      }

      try {
        const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);
        const bb = await blackboard.get(projectId);

        if (!bb) {
          return res.status(404).json({ error: 'Blackboard not found for project', traceId });
        }

        // Also get simplified values for convenience
        const values = await blackboard.getValues(projectId);

        res.json({
          blackboard: {
            id: bb.id,
            project_id: bb.project_id,
            entries: bb.entries,
            conflicts: bb.conflicts,
            date_created: bb.date_created,
            date_updated: bb.date_updated,
          },
          values,
          pending_conflicts: bb.conflicts.filter((c) => c.status === 'pending').length,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Get blackboard error:`, error);
        res.status(500).json({
          error: 'Failed to get blackboard',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * POST /template-builder/generate-tasks
     * Generate tasks from a natural language description
     */
    router.post('/generate-tasks', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { description, projectId } = req.body;

      console.log(`[TemplateBuilder][${traceId}] Generate tasks from description`);

      if (!description) {
        return res.status(400).json({ error: 'description is required', traceId });
      }

      try {
        const prompt = `Based on this project/workflow description, generate a list of tasks that would accomplish the goal.

Description: ${description}

Generate 3-6 tasks. For each task, determine:
- name: Short task name
- description: What the task should do
- action_type: "agent" (AI does work), "form" (user input), or "review" (human review step)
- tool_mode: For agent tasks, one of "research", "generate", or "scrape"
- needs_review: true if output needs human review before continuing
- output_type: How to format the task output. One of:
  - "text" (default) - markdown-formatted text, good for reports, summaries, written content
  - "table" - JSON array of objects with consistent keys, good for research findings, comparisons, data
  - "list" - JSON array of strings/items, good for checklists, options, suggestions
  - "json" - structured JSON object, good for technical data, configurations
  - "colors" - color palette with hex codes, good for design/branding tasks
- form_schema: REQUIRED for "form" action_type. Array of form fields with:
  - name: field name (snake_case)
  - label: display label
  - type: "text", "textarea", "email", "url", "number", or "date"
  - required: boolean

Return as JSON array:
[
  {
    "name": "Task name",
    "description": "Task description",
    "action_type": "agent",
    "tool_mode": "research",
    "needs_review": true,
    "output_type": "table"
  },
  {
    "name": "Collect User Input",
    "description": "Gather information from the user",
    "action_type": "form",
    "tool_mode": null,
    "needs_review": false,
    "output_type": "text",
    "form_schema": [
      {"name": "company_name", "label": "Company Name", "type": "text", "required": true},
      {"name": "website", "label": "Website URL", "type": "url", "required": false}
    ]
  }
]`;

        const response = await callClaude(prompt, { timeout: 60000 });

        // Parse tasks from response
        let tasks;
        try {
          const jsonMatch = response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            tasks = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON array found in response');
          }
        } catch {
          return res.status(500).json({
            error: 'Failed to parse generated tasks',
            rawResponse: response,
            traceId,
          });
        }

        // Optionally save tasks to project
        let savedTasks = tasks;
        if (projectId) {
          try {
            const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
            const existingTasks = await tasksService.readByQuery({
              filter: { project_id: { _eq: projectId } },
              sort: ['-sort_order'],
              limit: 1,
            });

            let sortOrder = existingTasks.length > 0 ? (existingTasks[0].sort_order || 0) + 1 : 1;

            // Save tasks and collect their database IDs
            savedTasks = [];
            for (const task of tasks) {
              const savedId = await tasksService.createOne({
                project_id: projectId,
                name: task.name,
                description: task.description,
                action_type: task.action_type,
                tool_mode: task.tool_mode,
                needs_review: task.needs_review,
                status: 'pending',
                sort_order: sortOrder++,
                form_schema: task.action_type === 'form' ? task.form_schema : null,
                output_type: task.output_type || 'text',
              });
              // Add the database ID to the task
              savedTasks.push({ ...task, id: savedId });
            }
          } catch (e) {
            console.log(`[TemplateBuilder][${traceId}] Could not save tasks:`, e);
            savedTasks = tasks; // Fall back to original tasks if save fails
          }
        }

        res.json({
          tasks: savedTasks,
          saved: !!projectId,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Generate tasks error:`, error);
        res.status(500).json({
          error: 'Failed to generate tasks',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * POST /template-builder/generate-tasks-stream
     * Generate tasks with research phase and SSE streaming for loading states
     *
     * Flow:
     * 1. Search for best practices related to the description
     * 2. Generate tasks using search results as context
     * 3. Stream progress events so frontend can show loading state
     *
     * Events:
     * - progress: { stage: "researching" | "generating", message: string }
     * - complete: { tasks: [...], saved: boolean }
     * - error: { error: string }
     */
    router.post('/generate-tasks-stream', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { description, projectId } = req.body;

      console.log(`[TemplateBuilder][${traceId}] Generate tasks with research (streaming)`);

      if (!description) {
        return res.status(400).json({ error: 'description is required', traceId });
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      // Helper to send SSE events
      const sendEvent = (eventType: string, data: any) => {
        res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // Phase 1: Research best practices
        sendEvent('progress', {
          stage: 'researching',
          message: `Researching best practices for: ${description.substring(0, 50)}...`,
        });

        let researchContext = '';
        try {
          // Search for workflow best practices
          const searchQuery = `${description} workflow steps best practices`;
          const searchResult = await callTool('search', { query: searchQuery, max_results: 5 });

          if (searchResult.success !== false && searchResult.results) {
            // Format search results for context
            researchContext = searchResult.results
              .map((r: any) => `- ${r.title}: ${r.snippet || r.content || ''}`)
              .join('\n');
            console.log(`[TemplateBuilder][${traceId}] Research found ${searchResult.results.length} results`);
          } else {
            console.log(`[TemplateBuilder][${traceId}] Research failed or no results, proceeding without context`);
          }
        } catch (searchError: any) {
          console.log(`[TemplateBuilder][${traceId}] Research error:`, searchError.message);
          // Continue without research context
        }

        // Phase 2: Generate tasks using research
        sendEvent('progress', {
          stage: 'generating',
          message: 'Generating tasks based on research...',
        });

        // Build prompt with research context
        let prompt = `Based on this project/workflow description, generate a list of tasks that would accomplish the goal.

Description: ${description}`;

        if (researchContext) {
          prompt += `

Research findings (use these best practices to inform task creation):
${researchContext}`;
        }

        prompt += `

Generate 3-6 tasks. For each task, determine:
- name: Short task name
- description: What the task should do
- action_type: "agent" (AI does work), "form" (user input), or "review" (human review step)
- tool_mode: For agent tasks, one of "research", "generate", or "scrape"
- needs_review: true if output needs human review before continuing
- output_type: How to format the task output. One of:
  - "text" (default) - markdown-formatted text, good for reports, summaries, written content
  - "table" - JSON array of objects with consistent keys, good for research findings, comparisons, data
  - "list" - JSON array of strings/items, good for checklists, options, suggestions
  - "json" - structured JSON object, good for technical data, configurations
  - "colors" - color palette with hex codes, good for design/branding tasks
- form_schema: REQUIRED for "form" action_type. Array of form fields with:
  - name: field name (snake_case)
  - label: display label
  - type: "text", "textarea", "email", "url", "number", or "date"
  - required: boolean

Return as JSON array:
[
  {
    "name": "Task name",
    "description": "Task description",
    "action_type": "agent",
    "tool_mode": "research",
    "needs_review": true,
    "output_type": "table"
  }
]`;

        const response = await callClaude(prompt, { timeout: 60000 });

        // Parse tasks from response
        let tasks;
        try {
          const jsonMatch = response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            tasks = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON array found in response');
          }
        } catch {
          sendEvent('error', {
            error: 'Failed to parse generated tasks',
            rawResponse: response,
            traceId,
          });
          res.end();
          return;
        }

        // Optionally save tasks to project
        let savedTasks = tasks;
        let saved = false;
        if (projectId) {
          try {
            const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
            const existingTasks = await tasksService.readByQuery({
              filter: { project_id: { _eq: projectId } },
              sort: ['-sort_order'],
              limit: 1,
            });

            let sortOrder = existingTasks.length > 0 ? (existingTasks[0].sort_order || 0) + 1 : 1;

            // Save tasks and collect their database IDs
            savedTasks = [];
            for (const task of tasks) {
              const savedId = await tasksService.createOne({
                project_id: projectId,
                name: task.name,
                description: task.description,
                action_type: task.action_type,
                tool_mode: task.tool_mode,
                needs_review: task.needs_review,
                status: 'pending',
                sort_order: sortOrder++,
                form_schema: task.action_type === 'form' ? task.form_schema : null,
                output_type: task.output_type || 'text',
              });
              savedTasks.push({ ...task, id: savedId });
            }
            saved = true;
          } catch (e) {
            console.log(`[TemplateBuilder][${traceId}] Could not save tasks:`, e);
            savedTasks = tasks;
          }
        }

        // Send completion event
        sendEvent('complete', {
          tasks: savedTasks,
          saved,
          traceId,
        });

        res.end();
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Generate tasks stream error:`, error);
        sendEvent('error', {
          error: 'Failed to generate tasks',
          details: error.message,
          traceId,
        });
        res.end();
      }
    });

    // ============================================================================
    // UPLOAD IMAGE FROM URL - Uses Directus /files/import API
    // ============================================================================
    router.post('/upload-image', async (req: any, res) => {
      const { url, folder, title } = req.body;

      if (!url) {
        return res.status(400).json({ success: false, error: 'url is required' });
      }

      try {
        const { FilesService } = services;

        // Use FilesService.importOne which calls the internal import logic
        const filesService = new FilesService({
          schema: req.schema,
          accountability: req.accountability,
        });

        // importOne takes { url, data } and handles the download internally
        const fileId = await filesService.importOne(url, {
          title: title || undefined,
          folder: folder || null,
        });

        // Get the full file record
        const file = await filesService.readOne(fileId);

        res.json({
          success: true,
          file: {
            id: file.id,
            filename: file.filename_download,
            title: file.title,
            type: file.type,
            url: `/assets/${file.id}`,
            full_url: `http://localhost:8056/assets/${file.id}`,
          },
        });
      } catch (error: any) {
        console.error('[TemplateBuilder] Image upload error:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to upload image',
        });
      }
    });

    // ============================================================================
    // BATCH UPLOAD IMAGES - Upload multiple images from URLs
    // ============================================================================
    router.post('/upload-images', async (req: any, res) => {
      const { images, folder } = req.body;

      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ success: false, error: 'images array is required' });
      }

      try {
        const { FilesService } = services;
        const filesService = new FilesService({
          schema: req.schema,
          accountability: req.accountability,
        });

        const results: any[] = [];
        const errors: any[] = [];

        for (const img of images) {
          const url = typeof img === 'string' ? img : img.url;
          const title = typeof img === 'object' ? img.title || img.alt : null;

          try {
            // Use importOne for each image
            const fileId = await filesService.importOne(url, {
              title: title || undefined,
              folder: folder || null,
            });
            const file = await filesService.readOne(fileId);

            results.push({
              original_url: url,
              file: {
                id: file.id,
                filename: file.filename_download,
                title: file.title,
                url: `/assets/${file.id}`,
              },
            });
          } catch (err: any) {
            errors.push({
              original_url: url,
              error: err.message,
            });
          }
        }

        res.json({
          success: true,
          uploaded: results.length,
          failed: errors.length,
          results,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (error: any) {
        console.error('[TemplateBuilder] Batch image upload error:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to upload images',
        });
      }
    });

    // ============================================================================
    // OUTPUT ENRICHMENT ENDPOINT
    // ============================================================================

    /**
     * POST /template-builder/enrich-output
     * Enrich table output data with new fields using AI
     *
     * Request body:
     * {
     *   output_id: number,      // ID of the output to enrich
     *   task_id: number,        // ID of the task that owns the output
     *   new_fields: Array<{     // Fields to add and populate
     *     name: string,         // Field name (snake_case)
     *     type: string,         // Field type (text, url, number, etc.)
     *     description?: string  // Optional description for AI context
     *   }>
     * }
     *
     * Response:
     * {
     *   success: true,
     *   enriched_count: number,  // Number of rows enriched
     *   task_updated: true,      // Whether task form_schema was updated
     *   data: object             // Enriched output data
     * }
     */
    router.post('/enrich-output', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { output_id, task_id, new_fields } = req.body;

      console.log(`[TemplateBuilder][${traceId}] Enrich output ${output_id} for task ${task_id}`);

      // Validate required fields
      if (!output_id) {
        return res.status(400).json({ error: 'output_id is required', traceId });
      }

      if (!task_id) {
        return res.status(400).json({ error: 'task_id is required', traceId });
      }

      if (!new_fields || !Array.isArray(new_fields) || new_fields.length === 0) {
        return res.status(400).json({ error: 'new_fields is required and must be a non-empty array', traceId });
      }

      try {
        const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
        const outputsService = new ItemsService('tb_outputs', { schema: req.schema, accountability: req.accountability });

        // Fetch the task and output
        const task = await tasksService.readOne(task_id);
        const output = await outputsService.readOne(output_id);

        if (!output || !output.data) {
          return res.status(404).json({ error: 'Output not found or has no data', traceId });
        }

        // Get the content array (table data)
        const content = output.data.content;
        if (!Array.isArray(content)) {
          return res.status(400).json({ error: 'Output content must be an array (table data)', traceId });
        }

        // Update task form_schema with new columns
        const currentSchema = task.form_schema || { columns: [], field_types: {} };
        const updatedColumns = [...(currentSchema.columns || [])];
        const updatedFieldTypes = { ...(currentSchema.field_types || {}) };

        for (const field of new_fields) {
          if (!updatedColumns.includes(field.name)) {
            updatedColumns.push(field.name);
          }
          updatedFieldTypes[field.name] = field.type;
        }

        await tasksService.updateOne(task_id, {
          form_schema: {
            columns: updatedColumns,
            field_types: updatedFieldTypes,
          },
        });

        // Build field descriptions for the prompt
        const fieldDescriptions = new_fields
          .map((f) => `- ${f.name} (${f.type})${f.description ? `: ${f.description}` : ''}`)
          .join('\n');

        // Enrich each row with AI
        const enrichedContent: any[] = [];
        for (const row of content) {
          // Build context from existing row data
          const rowContext = Object.entries(row)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');

          const prompt = `You are enriching data for a table. Given the existing data for an entity, find/infer the requested additional fields.

Existing data:
${rowContext}

Fields to find:
${fieldDescriptions}

Return ONLY a JSON object with the requested field values. Example:
{"website_url": "https://example.com", "founding_year": 2020}

Be accurate - if you cannot determine a value with high confidence, use null.
Return ONLY the JSON object, no explanation.`;

          try {
            const response = await callClaude(prompt, { timeout: 30000 });

            // Parse the enriched fields from response
            let enrichedFields: Record<string, any> = {};
            try {
              const jsonMatch = response.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                enrichedFields = JSON.parse(jsonMatch[0]);
              }
            } catch {
              console.log(`[TemplateBuilder][${traceId}] Failed to parse enrichment response for row`);
            }

            // Merge enriched fields with existing row
            enrichedContent.push({ ...row, ...enrichedFields });
          } catch (enrichError: any) {
            console.log(`[TemplateBuilder][${traceId}] Error enriching row: ${enrichError.message}`);
            // Keep original row on error
            enrichedContent.push(row);
          }
        }

        // Update the output with enriched data
        const updatedData = {
          ...output.data,
          content: enrichedContent,
        };

        await outputsService.updateOne(output_id, { data: updatedData });

        res.json({
          success: true,
          enriched_count: enrichedContent.length,
          task_updated: true,
          data: updatedData,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Enrich output error:`, error);
        res.status(500).json({
          error: 'Failed to enrich output',
          details: error.message,
          traceId,
        });
      }
    });

    // ============================================================================
    // PROJECT ORCHESTRATOR: Auto-run tasks based on blackboard requirements
    // ============================================================================

    /**
     * Check if a task is ready to run based on its 'requires' field
     */
    async function isTaskReady(
      task: any,
      blackboardKeys: Set<string>
    ): Promise<{ ready: boolean; missing: string[] }> {
      const requires = task.requires || [];
      if (!Array.isArray(requires) || requires.length === 0) {
        return { ready: true, missing: [] };
      }

      const missing = requires.filter((key: string) => !blackboardKeys.has(key));
      return { ready: missing.length === 0, missing };
    }

    /**
     * POST /run-project
     * Start or continue running a project's tasks automatically
     *
     * Flow:
     * 1. Find all tasks for project
     * 2. Get current blackboard state
     * 3. Find tasks that are ready (requires satisfied) and pending
     * 4. Run them in parallel (same stage) or sequentially
     * 5. Pause at human review tasks
     * 6. Return status
     */
    router.post('/run-project', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { projectId, continueFromReview } = req.body;

      console.log(`[Orchestrator][${traceId}] Run project ${projectId}`);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required', traceId });
      }

      try {
        const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
        const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);

        // Get all tasks for this project
        const allTasks = await tasksService.readByQuery({
          filter: { project_id: { _eq: projectId } },
          sort: ['stage', 'sort_order'],
        });

        if (!allTasks || allTasks.length === 0) {
          return res.json({
            status: 'no_tasks',
            message: 'No tasks found for this project',
            traceId
          });
        }

        // Get current blackboard state
        const blackboardEntries = await blackboard.getValues(projectId);
        const blackboardKeys = new Set(Object.keys(blackboardEntries));
        console.log(`[Orchestrator][${traceId}] Blackboard has keys: ${Array.from(blackboardKeys).join(', ') || 'none'}`);

        // Categorize tasks
        const pendingTasks: any[] = [];
        const runningTasks: any[] = [];
        const completedTasks: any[] = [];
        const reviewTasks: any[] = [];
        const blockedTasks: any[] = [];

        for (const task of allTasks) {
          if (task.status === 'done') {
            completedTasks.push(task);
          } else if (task.status === 'running') {
            runningTasks.push(task);
          } else if (task.status === 'needs_review' || task.status === 'waiting_review') {
            reviewTasks.push(task);
          } else {
            // Check if task is ready based on requires
            const { ready, missing } = await isTaskReady(task, blackboardKeys);
            if (ready) {
              pendingTasks.push(task);
            } else {
              blockedTasks.push({ ...task, missing_keys: missing });
            }
          }
        }

        console.log(`[Orchestrator][${traceId}] Tasks: ${completedTasks.length} done, ${runningTasks.length} running, ${reviewTasks.length} review, ${pendingTasks.length} ready, ${blockedTasks.length} blocked`);

        // If there are tasks waiting for human review and we're not continuing, pause
        if (reviewTasks.length > 0 && !continueFromReview) {
          return res.json({
            status: 'waiting_review',
            message: `${reviewTasks.length} task(s) waiting for human review`,
            review_tasks: reviewTasks.map(t => ({ id: t.id, name: t.name, stage: t.stage })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId
          });
        }

        // If there are running tasks, wait for them
        if (runningTasks.length > 0) {
          return res.json({
            status: 'running',
            message: `${runningTasks.length} task(s) currently running`,
            running_tasks: runningTasks.map(t => ({ id: t.id, name: t.name, stage: t.stage })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId
          });
        }

        // If no pending tasks and all done, project is complete
        if (pendingTasks.length === 0 && blockedTasks.length === 0) {
          return res.json({
            status: 'complete',
            message: 'All tasks completed',
            completed: completedTasks.length,
            total: allTasks.length,
            traceId
          });
        }

        // If no pending but some blocked, we're stuck
        if (pendingTasks.length === 0 && blockedTasks.length > 0) {
          return res.json({
            status: 'blocked',
            message: 'Tasks are blocked waiting for required data',
            blocked_tasks: blockedTasks.map(t => ({
              id: t.id,
              name: t.name,
              stage: t.stage,
              missing_keys: t.missing_keys
            })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId
          });
        }

        // Find tasks to run - group by stage, run same stage in parallel
        const tasksByStage = new Map<number, any[]>();
        for (const task of pendingTasks) {
          const stage = task.stage || 1;
          if (!tasksByStage.has(stage)) {
            tasksByStage.set(stage, []);
          }
          tasksByStage.get(stage)!.push(task);
        }

        // Get the lowest stage with ready tasks
        const stages = Array.from(tasksByStage.keys()).sort((a, b) => a - b);
        const currentStage = stages[0];
        const tasksToRun = tasksByStage.get(currentStage)!;

        console.log(`[Orchestrator][${traceId}] Running ${tasksToRun.length} task(s) from stage ${currentStage}`);

        // Filter out form tasks (need human input) and review tasks
        const agentTasks = tasksToRun.filter(t => t.action_type === 'agent');
        const formTasks = tasksToRun.filter(t => t.action_type === 'form');
        const reviewTasksToRun = tasksToRun.filter(t => t.action_type === 'review' || t.needs_review);

        // If there are form tasks at this stage, we need human input first
        if (formTasks.length > 0) {
          return res.json({
            status: 'needs_input',
            message: `Stage ${currentStage} has ${formTasks.length} form task(s) requiring human input`,
            form_tasks: formTasks.map(t => ({ id: t.id, name: t.name, form_schema: t.form_schema })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId
          });
        }

        // If there are review tasks at this stage, pause for review
        if (reviewTasksToRun.length > 0 && agentTasks.length === 0) {
          // Mark them as waiting_review
          for (const task of reviewTasksToRun) {
            await tasksService.updateOne(task.id, { status: 'waiting_review' });
          }
          return res.json({
            status: 'waiting_review',
            message: `Stage ${currentStage} has ${reviewTasksToRun.length} task(s) waiting for review`,
            review_tasks: reviewTasksToRun.map(t => ({ id: t.id, name: t.name })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId
          });
        }

        // Run agent tasks in parallel
        const results: any[] = [];
        const errors: any[] = [];

        // Execute tasks in parallel
        const executePromises = agentTasks.map(async (task) => {
          try {
            console.log(`[Orchestrator][${traceId}] Starting task ${task.id}: ${task.name}`);

            // Call the execute-task endpoint internally
            const outputsService = new ItemsService('tb_outputs', { schema: req.schema, accountability: req.accountability });

            // Update status to running
            await tasksService.updateOne(task.id, { status: 'running' });

            // Get blackboard context
            const blackboardContext = await blackboard.getValues(projectId);

            // Get previous outputs
            const previousOutputs = await outputsService.readByQuery({
              filter: { project_id: { _eq: projectId } },
              sort: ['id'],
            });

            // Execute tools
            const taskLogger = (msg: string) => console.log(`[Orchestrator][${traceId}][Task ${task.id}] ${msg}`);
            const { toolResults, toolsUsed } = await executeToolsForTask(task, previousOutputs, taskLogger, blackboardContext);

            // Build context and call LLM
            let previousOutputsContext = '';
            if (previousOutputs && previousOutputs.length > 0) {
              previousOutputsContext = previousOutputs.map((out: any) => {
                const title = out.data?.title || 'Output';
                const content = out.data?.content || JSON.stringify(out.data);
                return `### ${title}\n${content}`;
              }).join('\n\n');
            }

            // Build blackboard context string
            let blackboardContextStr = '';
            if (Object.keys(blackboardContext).length > 0) {
              blackboardContextStr = Object.entries(blackboardContext)
                .map(([key, value]) => `- ${key}: ${typeof value === 'string' ? value.substring(0, 200) : JSON.stringify(value).substring(0, 200)}`)
                .join('\n');
            }

            const systemPrompt = `You are an AI assistant helping with a project task.

## Task Information
- Task Name: ${task.name}
- Task Description: ${task.description || 'No description'}
- Tool Mode: ${task.tool_mode || 'general'}

## Project Context (from blackboard)
${blackboardContextStr || 'No blackboard data yet'}

## Previous Outputs
${previousOutputsContext || 'No previous outputs'}

## Tool Results (from automated research/scraping)
${toolResults || 'No tool results'}

Based on all this context, complete the task. Provide a comprehensive, well-structured response.`;

            // Use callClaude helper which uses the proxy (works without ANTHROPIC_API_KEY)
            const fullPrompt = `${systemPrompt}\n\nComplete this task: ${task.name}\n\n${task.description || ''}`;
            const aiContent = await callClaude(fullPrompt, { timeout: 180000 });

            // Save output
            const outputId = await outputsService.createOne({
              project_id: projectId,
              task_id: task.id,
              output_type: task.output_type || 'text',
              data: {
                title: task.name,
                content: aiContent,
                tool_results: toolResults,
                tools_used: toolsUsed,
              },
            });

            // Write to blackboard if task has 'writes' defined
            if (task.writes && Array.isArray(task.writes) && task.writes.length > 0) {
              for (const key of task.writes) {
                await blackboard.write(projectId, key, {
                  value: aiContent,
                  source_type: 'ai_synthesis' as SourceType,
                  source_id: `task_${task.id}`,
                });
              }
              console.log(`[Orchestrator][${traceId}] Wrote to blackboard keys: ${task.writes.join(', ')}`);
            }

            // Update task status and link to output
            const newStatus = task.needs_review ? 'needs_review' : 'done';
            await tasksService.updateOne(task.id, { status: newStatus, output_id: outputId });

            results.push({
              taskId: task.id,
              taskName: task.name,
              status: newStatus,
              outputId,
            });

          } catch (err: any) {
            console.error(`[Orchestrator][${traceId}] Task ${task.id} failed:`, err.message);
            await tasksService.updateOne(task.id, { status: 'error' });
            errors.push({
              taskId: task.id,
              taskName: task.name,
              error: err.message,
            });
          }
        });

        await Promise.all(executePromises);

        // Check if any review tasks need to be handled
        const newReviewCount = results.filter(r => r.status === 'needs_review').length;

        return res.json({
          status: newReviewCount > 0 ? 'waiting_review' : 'progressing',
          message: `Executed ${results.length} task(s), ${errors.length} error(s)`,
          executed: results,
          errors: errors.length > 0 ? errors : undefined,
          completed: completedTasks.length + results.filter(r => r.status === 'done').length,
          total: allTasks.length,
          traceId
        });

      } catch (error: any) {
        console.error(`[Orchestrator][${traceId}] Error:`, error);
        return res.status(500).json({
          error: error.message || 'Orchestrator failed',
          traceId
        });
      }
    });

    /**
     * POST /approve-review
     * Approve a task that's waiting for review, then continue running
     */
    router.post('/approve-review', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { taskId, projectId, approved, feedback } = req.body;

      console.log(`[Orchestrator][${traceId}] Approve review for task ${taskId}`);

      if (!taskId || !projectId) {
        return res.status(400).json({ error: 'taskId and projectId are required', traceId });
      }

      try {
        const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });

        // Update task status
        const newStatus = approved !== false ? 'done' : 'pending'; // If rejected, set back to pending
        await tasksService.updateOne(taskId, {
          status: newStatus,
          // Could store feedback in a field if needed
        });

        return res.json({
          success: true,
          taskId,
          newStatus,
          message: approved !== false ? 'Task approved, continuing...' : 'Task rejected, will retry',
          traceId
        });

      } catch (error: any) {
        console.error(`[Orchestrator][${traceId}] Error:`, error);
        return res.status(500).json({ error: error.message, traceId });
      }
    });

    /**
     * GET /project-status/:projectId
     * Get the current status of a project's task execution
     */
    router.get('/project-status/:projectId', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const projectId = parseInt(req.params.projectId);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required', traceId });
      }

      try {
        const tasksService = new ItemsService('tb_tasks', { schema: req.schema, accountability: req.accountability });
        const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);

        const allTasks = await tasksService.readByQuery({
          filter: { project_id: { _eq: projectId } },
          sort: ['stage', 'sort_order'],
        });

        const blackboardEntries = await blackboard.getValues(projectId);
        const blackboardKeys = Object.keys(blackboardEntries);

        const statusCounts = {
          pending: 0,
          running: 0,
          done: 0,
          needs_review: 0,
          waiting_review: 0,
          error: 0,
        };

        for (const task of allTasks) {
          const status = task.status || 'pending';
          if (status in statusCounts) {
            statusCounts[status as keyof typeof statusCounts]++;
          }
        }

        return res.json({
          projectId,
          total_tasks: allTasks.length,
          status_counts: statusCounts,
          blackboard_keys: blackboardKeys,
          tasks: allTasks.map(t => ({
            id: t.id,
            name: t.name,
            stage: t.stage,
            status: t.status,
            action_type: t.action_type,
            requires: t.requires,
            writes: t.writes,
          })),
          traceId
        });

      } catch (error: any) {
        console.error(`[Orchestrator][${traceId}] Error:`, error);
        return res.status(500).json({ error: error.message, traceId });
      }
    });

    // ============================================================================
    // PROJECT FILES: Upload, list, and delete files associated with projects
    // ============================================================================

    /**
     * GET /projects/:projectId/files
     * List all files for a project, optionally filtered by file_type and/or task_id
     */
    router.get('/projects/:projectId/files', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { projectId } = req.params;
      const { file_type, task_id } = req.query;

      console.log(`[TemplateBuilder][${traceId}] List files for project ${projectId}${file_type ? `, type: ${file_type}` : ''}${task_id ? `, task: ${task_id}` : ''}`);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required', traceId });
      }

      try {
        const projectFilesService = new ItemsService('tb_project_files', { schema: req.schema, accountability: req.accountability });

        // Build filter
        const filter: any = { project_id: { _eq: parseInt(projectId, 10) } };
        if (file_type && ['input', 'template'].includes(file_type)) {
          filter.file_type = { _eq: file_type };
        }
        if (task_id) {
          filter.task_id = { _eq: parseInt(task_id, 10) };
        }

        // Fetch files with file details expanded
        const files = await projectFilesService.readByQuery({
          filter,
          sort: ['-date_created'],
          fields: ['*', 'file_id.*'],
        });

        // Transform response to include file details
        const transformedFiles = files.map((f: any) => ({
          id: f.id,
          project_id: f.project_id,
          task_id: f.task_id || null,
          file_type: f.file_type,
          date_created: f.date_created,
          file: f.file_id ? {
            id: f.file_id.id || f.file_id,
            filename_download: f.file_id.filename_download,
            title: f.file_id.title,
            type: f.file_id.type,
            filesize: f.file_id.filesize,
            uploaded_on: f.file_id.uploaded_on,
          } : null,
        }));

        res.json({
          files: transformedFiles,
          count: transformedFiles.length,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] List files error:`, error);
        res.status(500).json({
          error: 'Failed to list files',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * POST /projects/:projectId/files
     * Upload a file and associate it with a project
     *
     * Expects multipart form data with:
     * - file: The file to upload
     * - file_type: 'input' | 'template' (defaults to 'input')
     * - task_id: Optional task ID for input files attached to specific tasks
     */
    router.post('/projects/:projectId/files', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { projectId } = req.params;

      console.log(`[TemplateBuilder][${traceId}] Upload file for project ${projectId}`);

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required', traceId });
      }

      try {
        const { FilesService } = services;
        const filesService = new FilesService({ schema: req.schema, accountability: req.accountability });
        const projectFilesService = new ItemsService('tb_project_files', { schema: req.schema, accountability: req.accountability });
        const projectsService = new ItemsService('tb_projects', { schema: req.schema, accountability: req.accountability });

        // Verify project exists
        try {
          await projectsService.readOne(parseInt(projectId, 10));
        } catch {
          return res.status(404).json({ error: 'Project not found', traceId });
        }

        // Get file_type from body (form data or JSON)
        const fileType = req.body?.file_type || 'input';
        if (!['input', 'template'].includes(fileType)) {
          return res.status(400).json({ error: 'file_type must be "input" or "template"', traceId });
        }

        // Get optional task_id from body
        const taskId = req.body?.task_id ? parseInt(req.body.task_id, 10) : null;

        // Upload file using Directus FilesService
        // The file should be available in req (handled by Directus middleware)
        if (!req.file && !req.files) {
          return res.status(400).json({ error: 'No file uploaded', traceId });
        }

        const uploadedFile = req.file || (req.files && req.files[0]);

        // Create the file in directus_files
        const fileId = await filesService.uploadOne(
          uploadedFile.buffer || uploadedFile.stream,
          {
            filename_download: uploadedFile.originalname || uploadedFile.filename,
            type: uploadedFile.mimetype,
            title: uploadedFile.originalname || uploadedFile.filename,
            storage: 'local',
          }
        );

        // Create the junction record
        const projectFile = await projectFilesService.createOne({
          project_id: parseInt(projectId, 10),
          file_id: fileId,
          file_type: fileType,
          task_id: taskId,
        });

        // Fetch the complete record with file details
        const completeRecord = await projectFilesService.readOne(projectFile, {
          fields: ['*', 'file_id.*'],
        });

        res.json({
          success: true,
          id: projectFile,
          project_file: {
            id: completeRecord.id,
            project_id: completeRecord.project_id,
            task_id: completeRecord.task_id || null,
            file_type: completeRecord.file_type,
            date_created: completeRecord.date_created,
            file: completeRecord.file_id ? {
              id: completeRecord.file_id.id || completeRecord.file_id,
              filename_download: completeRecord.file_id.filename_download,
              title: completeRecord.file_id.title,
              type: completeRecord.file_id.type,
              filesize: completeRecord.file_id.filesize,
            } : null,
          },
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Upload file error:`, error);
        res.status(500).json({
          error: 'Failed to upload file',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * DELETE /projects/:projectId/files/:fileId
     * Delete a file association from a project
     * Also deletes the underlying file from directus_files
     */
    router.delete('/projects/:projectId/files/:fileId', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { projectId, fileId } = req.params;

      console.log(`[TemplateBuilder][${traceId}] Delete file ${fileId} from project ${projectId}`);

      if (!projectId || !fileId) {
        return res.status(400).json({ error: 'projectId and fileId are required', traceId });
      }

      try {
        const { FilesService } = services;
        const filesService = new FilesService({ schema: req.schema, accountability: req.accountability });
        const projectFilesService = new ItemsService('tb_project_files', { schema: req.schema, accountability: req.accountability });

        // Find the project file record
        const projectFiles = await projectFilesService.readByQuery({
          filter: {
            id: { _eq: fileId },
            project_id: { _eq: parseInt(projectId, 10) },
          },
        });

        if (!projectFiles || projectFiles.length === 0) {
          return res.status(404).json({ error: 'File not found in project', traceId });
        }

        const projectFile = projectFiles[0];
        const directusFileId = projectFile.file_id;

        // Delete the junction record first
        await projectFilesService.deleteOne(fileId);

        // Delete the actual file from directus_files
        if (directusFileId) {
          try {
            await filesService.deleteOne(directusFileId);
          } catch (fileDeleteError: any) {
            // Log but don't fail - the junction record is already deleted
            console.warn(`[TemplateBuilder][${traceId}] Could not delete directus file ${directusFileId}:`, fileDeleteError.message);
          }
        }

        res.json({
          success: true,
          deleted_id: fileId,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TemplateBuilder][${traceId}] Delete file error:`, error);
        res.status(500).json({
          error: 'Failed to delete file',
          details: error.message,
          traceId,
        });
      }
    });

    console.log('✓ [TemplateBuilder] Routes registered: /health, /chat-v2, /undo, /action-history, /chat, /chat-stream, /execute-task, /edit-text, /generate-tasks, /upload-image, /upload-images, /run-project, /approve-review, /project-status, /projects/:projectId/files');
  },
};
