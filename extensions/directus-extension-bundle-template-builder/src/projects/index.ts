/**
 * Template Builder Projects Endpoint
 *
 * Project execution, status, and review approval routes.
 */

export default {
  id: 'tb-projects',
  handler: (router: any, context: any) => {
    const { services } = context;
    const { ItemsService } = services;

    console.log('🚀 [TB-Projects] Extension loaded - registering routes...');

    /**
     * POST /run-project
     * Start running all tasks in a project
     */
    router.post('/run-project', async (req: any, res: any) => {
      const { projectId } = req.body;

      // Input validation
      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      try {
        const projectsService = new ItemsService('tb_projects', {
          schema: req.schema,
          accountability: req.accountability,
        });

        const project = await projectsService.readOne(projectId);

        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        // TODO: Implement full project run logic
        res.json({
          success: true,
          projectId,
          status: 'running',
          message: 'Project execution is under construction',
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
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
