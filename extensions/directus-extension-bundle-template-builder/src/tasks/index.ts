/**
 * Template Builder Tasks Endpoint
 *
 * Task execution, generation, and text editing routes.
 */

import { randomUUID } from 'crypto';

const VALID_EDIT_ACTIONS = ['rewrite', 'shorten', 'expand'];

export default {
  id: 'tb-tasks',
  handler: (router: any, context: any) => {
    const { services } = context;
    const { ItemsService } = services;

    console.log('🚀 [TB-Tasks] Extension loaded - registering routes...');

    /**
     * POST /execute-task
     * Run a task using Claude
     */
    router.post('/execute-task', async (req: any, res: any) => {
      const { taskId, projectId } = req.body;

      // Input validation
      if (!taskId || !projectId) {
        return res.status(400).json({ error: 'taskId and projectId are required' });
      }

      try {
        const tasksService = new ItemsService('tb_tasks', {
          schema: req.schema,
          accountability: req.accountability,
        });

        const task = await tasksService.readOne(taskId);

        if (!task) {
          return res.status(404).json({ error: 'Task not found' });
        }

        // TODO: Implement full task execution logic
        // For now, return a placeholder response
        res.json({
          success: true,
          taskId,
          projectId,
          taskStatus: 'done',
          message: 'Task execution is under construction',
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
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
