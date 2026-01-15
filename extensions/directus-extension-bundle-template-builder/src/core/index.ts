/**
 * Template Builder Core Endpoint
 *
 * Health, blackboard, conflict resolution, outputs, and action history routes.
 */

import { createBlackboardService } from '../shared';

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

    console.log('✓ [TB-Core] Routes registered: /health, /blackboard/:projectId, /conflicts/:projectId, /resolve-conflict, /outputs/:projectId, /undo, /action-history');
  },
};
