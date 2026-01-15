/**
 * Template Builder Tasks Endpoint
 *
 * Task execution, generation, and text editing routes.
 */

import { randomUUID } from 'crypto';
import { callClaude, callTool, executeToolsForTask, createBlackboardService } from '../shared';

const VALID_EDIT_ACTIONS = ['rewrite', 'shorten', 'expand', 'improve', 'simplify'];

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
     * Generate tasks from a natural language description
     */
    router.post('/generate-tasks', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { description, projectId } = req.body;

      console.log(`[TB-Tasks][${traceId}] Generate tasks from description`);

      // Input validation
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
            const tasksService = new ItemsService('tb_tasks', {
              schema: req.schema,
              accountability: req.accountability,
            });
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
          } catch (e: any) {
            console.log(`[TB-Tasks][${traceId}] Could not save tasks: ${e.message}`);
            savedTasks = tasks; // Fall back to original tasks if save fails
          }
        }

        res.json({
          tasks: savedTasks,
          saved: !!projectId && savedTasks !== tasks,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TB-Tasks][${traceId}] Generate tasks error:`, error);
        res.status(500).json({
          error: 'Failed to generate tasks',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * POST /generate-tasks-stream
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

      console.log(`[TB-Tasks][${traceId}] Generate tasks with research (streaming)`);

      // Input validation
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
            console.log(`[TB-Tasks][${traceId}] Research found ${searchResult.results.length} results`);
          } else {
            console.log(`[TB-Tasks][${traceId}] Research failed or no results, proceeding without context`);
          }
        } catch (searchError: any) {
          console.log(`[TB-Tasks][${traceId}] Research error: ${searchError.message}`);
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
            const tasksService = new ItemsService('tb_tasks', {
              schema: req.schema,
              accountability: req.accountability,
            });
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
          } catch (e: any) {
            console.log(`[TB-Tasks][${traceId}] Could not save tasks: ${e.message}`);
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
        console.error(`[TB-Tasks][${traceId}] Generate tasks stream error:`, error);
        sendEvent('error', {
          error: 'Failed to generate tasks',
          details: error.message,
          traceId,
        });
        res.end();
      }
    });

    /**
     * POST /edit-text
     * AI-powered text editing (rewrite/shorten/expand/improve/simplify)
     */
    router.post('/edit-text', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { text, action, context = '' } = req.body;

      console.log(`[TB-Tasks][${traceId}] Edit text: ${action}`);

      // Input validation
      if (!text || !action) {
        return res.status(400).json({ error: 'text and action are required', traceId });
      }

      if (!VALID_EDIT_ACTIONS.includes(action)) {
        return res.status(400).json({
          error: `action must be one of: ${VALID_EDIT_ACTIONS.join(', ')}`,
          traceId,
        });
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
        console.error(`[TB-Tasks][${traceId}] Edit text error:`, error);
        res.status(500).json({
          error: 'Failed to edit text',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * POST /enrich-output
     * Add new columns to existing output data and populate with AI
     */
    router.post('/enrich-output', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { output_id, task_id, new_fields } = req.body;

      console.log(`[TB-Tasks][${traceId}] Enrich output ${output_id} for task ${task_id}`);

      // Input validation
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
        const tasksService = new ItemsService('tb_tasks', {
          schema: req.schema,
          accountability: req.accountability,
        });
        const outputsService = new ItemsService('tb_outputs', {
          schema: req.schema,
          accountability: req.accountability,
        });

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
        const currentSchema = task?.form_schema || { columns: [], field_types: {} };
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
          .map((f: any) => `- ${f.name} (${f.type})${f.description ? `: ${f.description}` : ''}`)
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
              console.log(`[TB-Tasks][${traceId}] Failed to parse enrichment response for row`);
            }

            // Merge enriched fields with existing row
            enrichedContent.push({ ...row, ...enrichedFields });
          } catch (enrichError: any) {
            console.log(`[TB-Tasks][${traceId}] Error enriching row: ${enrichError.message}`);
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
        console.error(`[TB-Tasks][${traceId}] Enrich output error:`, error);
        res.status(500).json({
          error: 'Failed to enrich output',
          details: error.message,
          traceId,
        });
      }
    });

    console.log('✓ [TB-Tasks] Routes registered: /execute-task, /generate-tasks, /generate-tasks-stream, /edit-text, /enrich-output');
  },
};
