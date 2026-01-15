/**
 * Template Builder Core Endpoint
 *
 * Health, blackboard, conflict resolution, outputs, and action history routes.
 */

import {
  createBlackboardService,
  createFileSkillService,
  createCollectionSkillService,
} from '../shared';

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

/**
 * Record an action to the history for undo functionality
 */
export function recordAction(conversationId: string, action: Omit<UndoableAction, 'timestamp'>): void {
  let history = actionHistory.get(conversationId) || [];

  history.push({
    ...action,
    timestamp: new Date().toISOString(),
  });

  // Limit history size
  if (history.length > MAX_HISTORY_SIZE) {
    history = history.slice(-MAX_HISTORY_SIZE);
  }

  actionHistory.set(conversationId, history);
}

/**
 * Get action history for a conversation
 */
export function getActionHistory(conversationId: string): UndoableAction[] {
  return actionHistory.get(conversationId) || [];
}

export default {
  id: 'tb-core',
  handler: (router: any, context: any) => {
    const { services } = context;
    const { ItemsService } = services;

    console.log('🚀 [TB-Core] Extension loaded - registering routes...');

    /**
     * GET /health
     * Health check endpoint
     */
    router.get('/health', async (_req: any, res: any) => {
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      const openrouterApiKey = process.env.OPENROUTER_API_KEY;

      res.json({
        status: 'healthy',
        service: 'tb-core',
        timestamp: new Date().toISOString(),
        anthropicSdkAvailable: !!anthropicApiKey,
        openrouterAvailable: !!openrouterApiKey,
      });
    });

    /**
     * GET /blackboard/:projectId
     * Get the blackboard for a project
     */
    router.get('/blackboard/:projectId', async (req: any, res: any) => {
      try {
        const { projectId } = req.params;
        const blackboard = createBlackboardService(
          ItemsService,
          req.schema,
          req.accountability
        );

        const bb = await blackboard.get(parseInt(projectId));

        if (!bb) {
          return res.status(404).json({ error: 'Blackboard not found' });
        }

        res.json(bb);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /conflicts/:projectId
     * Get pending conflicts for a project
     */
    router.get('/conflicts/:projectId', async (req: any, res: any) => {
      try {
        const { projectId } = req.params;
        const blackboard = createBlackboardService(
          ItemsService,
          req.schema,
          req.accountability
        );

        const conflicts = await blackboard.getPendingConflicts(parseInt(projectId));

        res.json({ conflicts });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /resolve-conflict
     * Resolve a conflict by choosing an option
     */
    router.post('/resolve-conflict', async (req: any, res: any) => {
      try {
        const { projectId, conflictId, optionId, customWrites } = req.body;

        if (!projectId || !conflictId) {
          return res.status(400).json({ error: 'projectId and conflictId required' });
        }

        const blackboard = createBlackboardService(
          ItemsService,
          req.schema,
          req.accountability
        );

        let result: boolean;

        if (customWrites) {
          result = await blackboard.resolveConflictCustom(projectId, conflictId, customWrites);
        } else if (optionId) {
          result = await blackboard.resolveConflict(projectId, conflictId, optionId);
        } else {
          return res.status(400).json({ error: 'optionId or customWrites required' });
        }

        if (result) {
          res.json({ success: true, conflictId });
        } else {
          res.status(400).json({ error: 'Failed to resolve conflict' });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /outputs/:projectId
     * Get all outputs for a project
     */
    router.get('/outputs/:projectId', async (req: any, res: any) => {
      try {
        const { projectId } = req.params;

        const outputsService = new ItemsService('tb_outputs', {
          schema: req.schema,
          accountability: req.accountability,
        });

        const outputs = await outputsService.readByQuery({
          filter: { project_id: { _eq: parseInt(projectId) } },
          sort: ['-date_created'],
        });

        res.json({ outputs });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /undo
     * Undo the last action(s) from a conversation
     */
    router.post('/undo', async (req: any, res: any) => {
      const { conversationId, count = 1 } = req.body;

      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId is required' });
      }

      const history = actionHistory.get(conversationId);
      if (!history || history.length === 0) {
        return res.json({ success: false, message: 'No actions to undo' });
      }

      const tasksService = new ItemsService('tb_tasks', {
        schema: req.schema,
        accountability: req.accountability,
      });

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
      });
    });

    /**
     * GET /action-history
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

    /**
     * POST /register-file-skill
     * Register a file as a blackboard skill
     */
    router.post('/register-file-skill', async (req: any, res: any) => {
      const { projectId, fileId, skillKey, summary, pageCount, extractedText } = req.body;

      // Input validation
      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }
      if (!fileId) {
        return res.status(400).json({ error: 'fileId is required' });
      }
      if (!skillKey) {
        return res.status(400).json({ error: 'skillKey is required' });
      }
      if (!summary) {
        return res.status(400).json({ error: 'summary is required' });
      }

      try {
        const fileSkillService = createFileSkillService(
          ItemsService,
          req.schema,
          req.accountability
        );

        const result = await fileSkillService.registerFileSkill({
          projectId,
          fileId,
          skillKey,
          summary,
          pageCount,
          extractedText,
        });

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /register-collection-skill
     * Register a Directus collection as a blackboard skill
     */
    router.post('/register-collection-skill', async (req: any, res: any) => {
      const { projectId, collection, skillKey, summary } = req.body;

      // Input validation
      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }
      if (!collection) {
        return res.status(400).json({ error: 'collection is required' });
      }
      if (!skillKey) {
        return res.status(400).json({ error: 'skillKey is required' });
      }
      if (!summary) {
        return res.status(400).json({ error: 'summary is required' });
      }

      try {
        const collectionSkillService = createCollectionSkillService(
          ItemsService,
          req.schema,
          req.accountability
        );

        const result = await collectionSkillService.registerCollectionSkill({
          projectId,
          collection,
          skillKey,
          summary,
        });

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * DELETE /unregister-skill/:projectId/:skillKey
     * Unregister a skill from the blackboard
     */
    router.delete('/unregister-skill/:projectId/:skillKey', async (req: any, res: any) => {
      const { projectId, skillKey } = req.params;

      try {
        // Try file skill service first (it handles both types via blackboard)
        const fileSkillService = createFileSkillService(
          ItemsService,
          req.schema,
          req.accountability
        );

        const result = await fileSkillService.unregisterFileSkill({
          projectId: parseInt(projectId),
          skillKey,
        });

        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
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
      const { projectId } = req.params;
      const { file_type, task_id } = req.query;

      try {
        const projectFilesService = new ItemsService('tb_project_files', {
          schema: req.schema,
          accountability: req.accountability,
        });

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
          file: f.file_id
            ? {
                id: f.file_id.id || f.file_id,
                filename_download: f.file_id.filename_download,
                title: f.file_id.title,
                type: f.file_id.type,
                filesize: f.file_id.filesize,
                uploaded_on: f.file_id.uploaded_on,
              }
            : null,
        }));

        res.json({
          files: transformedFiles,
          count: transformedFiles.length,
        });
      } catch (error: any) {
        console.error('[TB-Core] List files error:', error);
        res.status(500).json({
          error: 'Failed to list files',
          details: error.message,
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
      const { projectId } = req.params;

      try {
        const { FilesService } = services;
        const filesService = new FilesService({
          schema: req.schema,
          accountability: req.accountability,
        });
        const projectFilesService = new ItemsService('tb_project_files', {
          schema: req.schema,
          accountability: req.accountability,
        });
        const projectsService = new ItemsService('tb_projects', {
          schema: req.schema,
          accountability: req.accountability,
        });

        // Verify project exists
        try {
          await projectsService.readOne(parseInt(projectId, 10));
        } catch {
          return res.status(404).json({ error: 'Project not found' });
        }

        // Get file_type from body (form data or JSON)
        const fileType = req.body?.file_type || 'input';
        if (!['input', 'template'].includes(fileType)) {
          return res.status(400).json({ error: 'file_type must be "input" or "template"' });
        }

        // Get optional task_id from body
        const taskId = req.body?.task_id ? parseInt(req.body.task_id, 10) : null;

        // Check for uploaded file
        if (!req.file && !req.files) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const uploadedFile = req.file || (req.files && req.files[0]);

        // Create the file in directus_files
        const fileId = await filesService.uploadOne(uploadedFile.buffer || uploadedFile.stream, {
          filename_download: uploadedFile.originalname || uploadedFile.filename,
          type: uploadedFile.mimetype,
          title: uploadedFile.originalname || uploadedFile.filename,
          storage: 'local',
        });

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
            file: completeRecord.file_id
              ? {
                  id: completeRecord.file_id.id || completeRecord.file_id,
                  filename_download: completeRecord.file_id.filename_download,
                  title: completeRecord.file_id.title,
                  type: completeRecord.file_id.type,
                  filesize: completeRecord.file_id.filesize,
                }
              : null,
          },
        });
      } catch (error: any) {
        console.error('[TB-Core] Upload file error:', error);
        res.status(500).json({
          error: 'Failed to upload file',
          details: error.message,
        });
      }
    });

    /**
     * DELETE /projects/:projectId/files/:fileId
     * Delete a file association from a project
     * Also deletes the underlying file from directus_files
     */
    router.delete('/projects/:projectId/files/:fileId', async (req: any, res: any) => {
      const { projectId, fileId } = req.params;

      try {
        const { FilesService } = services;
        const filesService = new FilesService({
          schema: req.schema,
          accountability: req.accountability,
        });
        const projectFilesService = new ItemsService('tb_project_files', {
          schema: req.schema,
          accountability: req.accountability,
        });

        // Find the project file record
        const projectFiles = await projectFilesService.readByQuery({
          filter: {
            id: { _eq: fileId },
            project_id: { _eq: parseInt(projectId, 10) },
          },
        });

        if (!projectFiles || projectFiles.length === 0) {
          return res.status(404).json({ error: 'File not found in project' });
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
            console.warn(`[TB-Core] Could not delete directus file ${directusFileId}:`, fileDeleteError.message);
          }
        }

        res.json({
          success: true,
          deleted_id: fileId,
        });
      } catch (error: any) {
        console.error('[TB-Core] Delete file error:', error);
        res.status(500).json({
          error: 'Failed to delete file',
          details: error.message,
        });
      }
    });

    console.log('✓ [TB-Core] Routes registered: /health, /blackboard/:projectId, /conflicts/:projectId, /resolve-conflict, /outputs/:projectId, /undo, /action-history, /register-file-skill, /register-collection-skill, /unregister-skill/:projectId/:skillKey, /projects/:projectId/files');
  },
};
