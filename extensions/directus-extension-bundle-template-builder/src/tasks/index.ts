/**
 * Template Builder Tasks Endpoint
 *
 * Task execution, generation, and text editing routes.
 */

import { randomUUID } from 'crypto';
import { callClaude, executeToolsForTask, createBlackboardService } from '../shared';

const VALID_EDIT_ACTIONS = ['rewrite', 'shorten', 'expand'];

function generateTraceId(): string {
  return randomUUID().substring(0, 8);
}

export default {
  id: 'tb-tasks',
  handler: (router: any, context: any) => {
    const { services } = context;
    const { ItemsService } = services;

    console.log('🚀 [TB-Tasks] Extension loaded - registering routes...');

    /**
     * POST /execute-task
     * Run a task using Claude to generate output
     * Reads from blackboard for proper data flow between tasks.
     */
    router.post('/execute-task', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { taskId, projectId } = req.body;

      console.log(`[TB-Tasks][${traceId}] Execute task ${taskId} for project ${projectId}`);

      // Input validation
      if (!taskId || !projectId) {
        return res.status(400).json({ error: 'taskId and projectId are required', traceId });
      }

      try {
        const tasksService = new ItemsService('tb_tasks', {
          schema: req.schema,
          accountability: req.accountability,
        });
        const outputsService = new ItemsService('tb_outputs', {
          schema: req.schema,
          accountability: req.accountability,
        });

        // Fetch the task
        const task = await tasksService.readOne(taskId);

        if (!task) {
          return res.status(404).json({ error: 'Task not found', traceId });
        }

        // Read from blackboard for context
        let blackboardContext: Record<string, any> = {};
        try {
          const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);
          blackboardContext = await blackboard.getValues(projectId);
          console.log(`[TB-Tasks][${traceId}] Blackboard context keys: ${Object.keys(blackboardContext).join(', ') || 'none'}`);
        } catch (bbError: any) {
          console.log(`[TB-Tasks][${traceId}] Could not read blackboard: ${bbError.message}`);
        }

        // Fetch previous outputs for context (fallback if blackboard empty)
        const previousOutputs = await outputsService.readByQuery({
          filter: { project_id: { _eq: projectId } },
          sort: ['id'],
        });

        // Update task status to running
        await tasksService.updateOne(taskId, { status: 'running' });

        // Create logger for this task
        const taskLogger = (msg: string) => console.log(`[TB-Tasks][${traceId}] ${msg}`);

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
            json: 'Generate output as a structured JSON object with appropriate properties.',
            colors: 'Return a JSON object with color names as keys and hex codes as values.',
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

        // Build prompt based on task type
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

        // Save output
        const savedOutput = await outputsService.createOne({
          project_id: projectId,
          task_id: taskId,
          output_type: output.output_type,
          data: output,
        });

        // Mark previous outputs for this task as superseded
        const previousOutputsForTask = previousOutputs.filter(
          (out: any) => out.task_id === taskId && out.id !== savedOutput && !out.superseded_by
        );
        for (const oldOutput of previousOutputsForTask) {
          try {
            await outputsService.updateOne(oldOutput.id, {
              superseded_by: savedOutput,
            });
            taskLogger(`Superseded old output ${oldOutput.id} with new output ${savedOutput}`);
          } catch (supersedeError: any) {
            taskLogger(`Warning: Could not supersede old output ${oldOutput.id}: ${supersedeError.message}`);
          }
        }

        // Write task output to blackboard for data flow between tasks
        try {
          const blackboard = createBlackboardService(ItemsService, req.schema, req.accountability);
          const outputFieldsToWrite: Record<string, any> = {};

          if (output.content && typeof output.content === 'object' && !Array.isArray(output.content)) {
            Object.assign(outputFieldsToWrite, output.content);
          }

          const taskKey = task.name.toLowerCase().replace(/\s+/g, '_');
          if (output.content) {
            outputFieldsToWrite[`${taskKey}_result`] = output.content;
          }
          if (output.title) {
            outputFieldsToWrite[`${taskKey}_title`] = output.title;
          }

          const hasScrapedWebsite = toolsUsed.includes('scrape');
          const hasSearchResults = toolsUsed.includes('search');
          const sourceUrl = blackboardContext.website_url || blackboardContext.website;

          if (Object.keys(outputFieldsToWrite).length > 0) {
            const { written, skipped } = await blackboard.writeTaskOutput(
              projectId,
              `task_${taskId}`,
              outputFieldsToWrite,
              { hasScrapedWebsite, hasSearchResults, sourceUrl, basedOnKeys: Object.keys(blackboardContext) }
            );
            taskLogger(`Blackboard: wrote ${written.length} entries, skipped ${skipped.length}`);
          }
        } catch (bbError: any) {
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
        console.error(`[TB-Tasks][${traceId}] Execute task error:`, error);

        // Revert task status on error
        try {
          const tasksService = new ItemsService('tb_tasks', {
            schema: req.schema,
            accountability: req.accountability,
          });
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
     * POST /generate-tasks
     * Generate tasks from a description
     */
    router.post('/generate-tasks', async (req: any, res: any) => {
      const { description, projectId } = req.body;

      // Input validation
      if (!description) {
        return res.status(400).json({ error: 'description is required' });
      }

      try {
        // TODO: Implement full task generation logic
        // For now, return a placeholder response
        res.json({
          tasks: [
            {
              name: 'Example Task',
              description: 'Generated from: ' + description.substring(0, 50),
              action_type: 'agent',
              tool_mode: 'research',
              needs_review: true,
            },
          ],
          saved: !!projectId,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /generate-tasks-stream
     * Stream task generation with research progress
     */
    router.post('/generate-tasks-stream', async (req: any, res: any) => {
      const { description, projectId } = req.body;

      // Input validation
      if (!description) {
        return res.status(400).json({ error: 'description is required' });
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      try {
        // TODO: Implement full streaming task generation
        res.write(`event: progress\ndata: ${JSON.stringify({ step: 'researching', message: 'Researching best practices...' })}\n\n`);
        res.write(`event: progress\ndata: ${JSON.stringify({ step: 'generating', message: 'Generating tasks...' })}\n\n`);
        res.write(`event: complete\ndata: ${JSON.stringify({
          tasks: [{
            name: 'Example Task',
            description: 'Generated from description',
            action_type: 'agent',
            tool_mode: 'research',
            needs_review: true,
          }],
          saved: !!projectId,
        })}\n\n`);
        res.end();
      } catch (error: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
        res.end();
      }
    });

    /**
     * POST /edit-text
     * Rewrite, shorten, or expand text
     */
    router.post('/edit-text', async (req: any, res: any) => {
      const { text, action } = req.body;

      // Input validation
      if (!text || !action) {
        return res.status(400).json({ error: 'text and action are required' });
      }

      if (!VALID_EDIT_ACTIONS.includes(action)) {
        return res.status(400).json({
          error: `action must be one of: ${VALID_EDIT_ACTIONS.join(', ')}`,
        });
      }

      try {
        // TODO: Implement full text editing logic
        res.json({
          editedText: `[${action}] ${text}`,
          action,
          originalLength: text.length,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /enrich-output
     * Add new columns to existing output data and populate with AI
     */
    router.post('/enrich-output', async (req: any, res: any) => {
      const { output_id, task_id, new_fields } = req.body;

      // Input validation
      if (!output_id) {
        return res.status(400).json({ error: 'output_id is required' });
      }
      if (!task_id) {
        return res.status(400).json({ error: 'task_id is required' });
      }
      if (!new_fields || !Array.isArray(new_fields) || new_fields.length === 0) {
        return res.status(400).json({ error: 'new_fields is required and must be a non-empty array' });
      }

      try {
        const outputsService = new ItemsService('tb_outputs', {
          schema: req.schema,
          accountability: req.accountability,
        });

        const output = await outputsService.readOne(output_id);

        if (!output) {
          return res.status(404).json({ error: 'Output not found' });
        }

        // TODO: Implement full enrichment logic
        res.json({
          success: true,
          enriched_count: 0,
          task_updated: true,
          message: 'Enrichment is under construction',
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    console.log('✓ [TB-Tasks] Routes registered: /execute-task, /generate-tasks, /generate-tasks-stream, /edit-text, /enrich-output');
  },
};
