/**
 * Template Builder Projects Endpoint
 *
 * Project execution, status, and review approval routes.
 */

import { randomUUID } from 'crypto';
import { createBlackboardService } from '../shared';

function generateTraceId(): string {
  return randomUUID().substring(0, 8);
}

/**
 * Check if a task is ready to run based on its 'requires' field
 */
function isTaskReady(
  task: any,
  blackboardKeys: Set<string>
): { ready: boolean; missing: string[] } {
  const requires = task.requires || [];
  if (!Array.isArray(requires) || requires.length === 0) {
    return { ready: true, missing: [] };
  }

  const missing = requires.filter((key: string) => !blackboardKeys.has(key));
  return { ready: missing.length === 0, missing };
}

export default {
  id: 'tb-projects',
  handler: (router: any, context: any) => {
    const { services } = context;
    const { ItemsService } = services;

    console.log('🚀 [TB-Projects] Extension loaded - registering routes...');

    /**
     * POST /run-project
     * Start running all tasks in a project (orchestrator)
     *
     * Returns status:
     * - no_tasks: Project has no tasks
     * - complete: All tasks finished
     * - running: Tasks currently executing
     * - waiting_review: Paused for human review
     * - needs_input: Form tasks need user input
     * - blocked: Tasks waiting for missing blackboard data
     */
    router.post('/run-project', async (req: any, res: any) => {
      const traceId = generateTraceId();
      const { projectId, continueFromReview } = req.body;

      console.log(`[TB-Projects][${traceId}] Run project ${projectId}`);

      // Input validation
      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required', traceId });
      }

      try {
        const tasksService = new ItemsService('tb_tasks', {
          schema: req.schema,
          accountability: req.accountability,
        });
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
            traceId,
          });
        }

        // Get current blackboard state
        let blackboardKeys = new Set<string>();
        try {
          const blackboardEntries = await blackboard.getValues(projectId);
          blackboardKeys = new Set(Object.keys(blackboardEntries));
          console.log(`[TB-Projects][${traceId}] Blackboard keys: ${Array.from(blackboardKeys).join(', ') || 'none'}`);
        } catch (bbError: any) {
          console.log(`[TB-Projects][${traceId}] Could not read blackboard: ${bbError.message}`);
        }

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
            const { ready, missing } = isTaskReady(task, blackboardKeys);
            if (ready) {
              pendingTasks.push(task);
            } else {
              blockedTasks.push({ ...task, missing_keys: missing });
            }
          }
        }

        console.log(`[TB-Projects][${traceId}] Tasks: ${completedTasks.length} done, ${runningTasks.length} running, ${reviewTasks.length} review, ${pendingTasks.length} ready, ${blockedTasks.length} blocked`);

        // If there are tasks waiting for human review and we're not continuing, pause
        if (reviewTasks.length > 0 && !continueFromReview) {
          return res.json({
            status: 'waiting_review',
            message: `${reviewTasks.length} task(s) waiting for human review`,
            review_tasks: reviewTasks.map((t) => ({ id: t.id, name: t.name, stage: t.stage })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId,
          });
        }

        // If there are running tasks, wait for them
        if (runningTasks.length > 0) {
          return res.json({
            status: 'running',
            message: `${runningTasks.length} task(s) currently running`,
            running_tasks: runningTasks.map((t) => ({ id: t.id, name: t.name, stage: t.stage })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId,
          });
        }

        // If no pending tasks and all done, project is complete
        if (pendingTasks.length === 0 && blockedTasks.length === 0) {
          return res.json({
            status: 'complete',
            message: 'All tasks completed',
            completed: completedTasks.length,
            total: allTasks.length,
            traceId,
          });
        }

        // If no pending but some blocked, we're stuck
        if (pendingTasks.length === 0 && blockedTasks.length > 0) {
          return res.json({
            status: 'blocked',
            message: 'Tasks are blocked waiting for required data',
            blocked_tasks: blockedTasks.map((t) => ({
              id: t.id,
              name: t.name,
              stage: t.stage,
              missing_keys: t.missing_keys,
            })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId,
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

        console.log(`[TB-Projects][${traceId}] Running ${tasksToRun.length} task(s) from stage ${currentStage}`);

        // Filter out form tasks (need human input) and review tasks
        const agentTasks = tasksToRun.filter((t) => t.action_type === 'agent');
        const formTasks = tasksToRun.filter((t) => t.action_type === 'form');
        const reviewTasksToRun = tasksToRun.filter((t) => t.action_type === 'review' || t.needs_review);

        // If there are form tasks at this stage, we need human input first
        if (formTasks.length > 0) {
          return res.json({
            status: 'needs_input',
            message: `Stage ${currentStage} has ${formTasks.length} form task(s) requiring human input`,
            form_tasks: formTasks.map((t) => ({ id: t.id, name: t.name, form_schema: t.form_schema })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId,
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
            review_tasks: reviewTasksToRun.map((t) => ({ id: t.id, name: t.name })),
            completed: completedTasks.length,
            total: allTasks.length,
            traceId,
          });
        }

        // Return status indicating tasks are ready to run
        // Note: Actual task execution should be done via /execute-task endpoint
        // This orchestrator just determines what's ready
        res.json({
          status: 'ready',
          message: `${agentTasks.length} agent task(s) ready to run at stage ${currentStage}`,
          ready_tasks: agentTasks.map((t) => ({ id: t.id, name: t.name, stage: t.stage })),
          completed: completedTasks.length,
          total: allTasks.length,
          traceId,
        });
      } catch (error: any) {
        console.error(`[TB-Projects][${traceId}] Run project error:`, error);
        res.status(500).json({
          error: 'Failed to run project',
          details: error.message,
          traceId,
        });
      }
    });

    /**
     * GET /project-status/:projectId
     * Get current project execution status
     */
    router.get('/project-status/:projectId', async (req: any, res: any) => {
      const { projectId } = req.params;
      const parsedId = parseInt(projectId);

      // Input validation
      if (isNaN(parsedId)) {
        return res.status(400).json({ error: 'Valid projectId is required' });
      }

      try {
        const projectsService = new ItemsService('tb_projects', {
          schema: req.schema,
          accountability: req.accountability,
        });

        const project = await projectsService.readOne(parsedId);

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        const tasksService = new ItemsService('tb_tasks', {
          schema: req.schema,
          accountability: req.accountability,
        });

        const tasks = await tasksService.readByQuery({
          filter: { project_id: { _eq: parsedId } },
          sort: ['sort_order'],
        });

        const taskSummary = {
          total: tasks.length,
          pending: tasks.filter((t: any) => t.status === 'pending').length,
          running: tasks.filter((t: any) => t.status === 'running').length,
          done: tasks.filter((t: any) => t.status === 'done').length,
          error: tasks.filter((t: any) => t.status === 'error').length,
          review: tasks.filter((t: any) => t.status === 'review').length,
        };

        res.json({
          projectId: parsedId,
          projectName: project.name,
          projectStatus: project.status,
          tasks: taskSummary,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /approve-review
     * Approve a task that's waiting for review
     */
    router.post('/approve-review', async (req: any, res: any) => {
      const { projectId, taskId, approved, feedback } = req.body;

      // Input validation
      if (!projectId || !taskId) {
        return res.status(400).json({ error: 'projectId and taskId are required' });
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

        if (task.status !== 'review') {
          return res.status(400).json({ error: 'Task is not in review status' });
        }

        // Update task status based on approval
        const newStatus = approved === false ? 'pending' : 'done';
        await tasksService.updateOne(taskId, {
          status: newStatus,
          review_feedback: feedback || null,
        });

        res.json({
          success: true,
          taskId,
          newStatus,
          approved: approved !== false,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    console.log('✓ [TB-Projects] Routes registered: /run-project, /project-status/:projectId, /approve-review');
  },
};
