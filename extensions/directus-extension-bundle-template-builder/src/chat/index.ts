/**
 * Template Builder Chat Endpoint
 *
 * AI conversation routes with SSE streaming and tool use.
 */

import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_TOOLS } from '../shared/tools';
import {
  createBlackboardService,
  createFileSkillService,
  createCollectionSkillService,
  formatBlackboardContext,
} from '../shared';
import { createToolExecutor, UndoableAction } from './tool-executor';

// Conversation session storage (in-memory for now)
const conversationSessions = new Map<string, Array<{ role: string; content: string }>>();
const MAX_CONVERSATION_TOKENS = 50000;

// Action history for undo functionality
const actionHistory = new Map<string, UndoableAction[]>();

export default {
  id: 'tb-chat',
  handler: (router: any, context: any) => {
    const { services } = context;
    const { ItemsService } = services;

    console.log('🚀 [TB-Chat] Extension loaded - registering routes...');

    /**
     * POST /chat-v2
     * AI conversation with SSE streaming and structured tool use
     */
    router.post('/chat-v2', async (req: any, res: any) => {
      const traceId = randomUUID();
      const { message, projectId, conversationId, taskId, enrichmentContext } = req.body;

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

      // Check for API key
      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

      if (!openrouterApiKey && !anthropicApiKey) {
        return res.status(503).json({ error: 'Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY configured', traceId });
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      // Helper function to send SSE events
      let clientDisconnected = false;
      const sendEvent = (eventType: string, data: any) => {
        if (clientDisconnected) return;
        try {
          res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
          console.error(`[TB-Chat][${traceId}] Failed to send SSE event:`, e);
        }
      };

      // Handle client disconnect
      req.on('close', () => {
        clientDisconnected = true;
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

            console.log(`[TB-Chat][${traceId}] Loaded project "${project.name}" with ${tasks.length} tasks`);

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
            console.error(`[TB-Chat][${traceId}] Could not fetch project context:`, e?.message || e);
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

        // Get blackboard context for skills
        let blackboardContext = '';
        if (projectId) {
          try {
            const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);
            const bb = await blackboard.get(projectId);
            if (bb && bb.entries) {
              blackboardContext = formatBlackboardContext(bb);
            }
          } catch (e: any) {
            console.log(`[TB-Chat][${traceId}] Could not load blackboard: ${e?.message}`);
          }
        }

        // Get or create conversation history
        let conversationHistory = conversationSessions.get(conversationId) || [];
        conversationHistory.push({ role: 'user', content: message });

        // Check token limit and truncate if needed
        const estimatedTokens = JSON.stringify(conversationHistory).length / 4;
        if (estimatedTokens > MAX_CONVERSATION_TOKENS) {
          conversationHistory = conversationHistory.slice(-10);
          console.log(`[TB-Chat][${traceId}] Truncated conversation to last 10 messages`);
        }

        // Build system prompt
        const systemPrompt = `You are an AI assistant for a workflow/template builder tool. You help users create, modify, and manage their workflow tasks.

${projectContext}
${enrichmentSection}
${blackboardContext}

## Your Capabilities
You can use tools to:
- update_task: Modify existing tasks (name, description, status, form schema)
- create_task: Create new tasks in the project (created as 'draft' for user review)
- activate_task: Activate a draft task so it can be run (changes status to 'pending')
- delete_task: Remove tasks from the project
- reorder_task: Move a task to a different position (first, last, before/after another task)
- submit_form: Submit form data for form-type tasks
- enrich_output: Add new columns to existing output data and populate with AI${enrichmentContext ? ' ← USE THIS for adding data columns!' : ''}
- read_file: Read content from uploaded files (PDFs, documents) via blackboard skills
- query_collection: Query data from Directus collections via blackboard skills

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

        // Initialize Anthropic client
        const useOpenRouter = !!openrouterApiKey;
        const apiKey = openrouterApiKey || anthropicApiKey;
        console.log(`[TB-Chat][${traceId}] Using ${useOpenRouter ? 'OpenRouter' : 'Anthropic'} API`);

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

        // Create tool executor with skill services
        const blackboardService = createBlackboardService(ItemsService, req.schema, req.accountability);

        // Create file skill service
        const fileSkillService = createFileSkillService(ItemsService, req.schema, req.accountability);

        // Create collection skill service
        const collectionSkillService = createCollectionSkillService(ItemsService, req.schema, req.accountability);

        const toolExecutor = createToolExecutor({
          projectId,
          conversationId,
          tasksService: {
            readOne: (id: number) => tasksService.readOne(id),
            readByQuery: (query: any) => tasksService.readByQuery(query),
            createOne: (data: any) => tasksService.createOne(data),
            updateOne: (id: number, data: any) => tasksService.updateOne(id, data),
            deleteOne: (id: number) => tasksService.deleteOne(id),
          },
          outputsService: {
            readOne: (id: number) => outputsService.readOne(id),
            createOne: (data: any) => outputsService.createOne(data),
            updateOne: (id: number, data: any) => outputsService.updateOne(id, data),
          },
          blackboardService: {
            get: (pid: number) => blackboardService.get(pid),
            write: (pid: number, key: string, value: any, source: string) =>
              blackboardService.write(pid, key, value, source),
          },
          actionHistory,
          // Add skill services
          fileSkillService: {
            readFileContent: (params) => fileSkillService.readFileContent(params),
          },
          collectionSkillService: {
            queryCollection: (params) => collectionSkillService.queryCollection(params),
          },
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
          role: msg.role as 'user' | 'assistant',
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
                const toolResult = await toolExecutor.execute(currentToolUse.name, toolInput);

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
                  success: toolResult.success,
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
            continueLoop = true;
          } else {
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
        console.error(`[TB-Chat][${traceId}] Chat-v2 error:`, error);
        sendEvent('error', { message: error.message, traceId });
        res.end();
      }
    });

    /**
     * POST /chat
     * Legacy AI conversation (non-streaming JSON response)
     */
    router.post('/chat', async (req: any, res: any) => {
      const traceId = randomUUID();
      const { message, projectId, conversationHistory } = req.body;

      // Input validation
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required', traceId });
      }

      try {
        // TODO: Implement full chat logic
        res.json({
          response: 'Chat endpoint is under construction.',
          suggestions: [],
          traceId,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message, traceId });
      }
    });

    /**
     * POST /chat-stream
     * SSE streaming chat (legacy, simpler than chat-v2)
     */
    router.post('/chat-stream', async (req: any, res: any) => {
      const { message, projectId, conversationHistory } = req.body;

      // Input validation
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      try {
        // TODO: Implement full chat-stream logic
        res.write(`event: content\ndata: ${JSON.stringify({ text: 'Chat stream is under construction.' })}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify({ response: 'Chat stream is under construction.', suggestions: [] })}\n\n`);
        res.end();
      } catch (error: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
        res.end();
      }
    });

    console.log('✓ [TB-Chat] Routes registered: /chat-v2, /chat, /chat-stream');
  },
};
