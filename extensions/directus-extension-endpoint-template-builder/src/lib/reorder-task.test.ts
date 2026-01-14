/**
 * Reorder Task Tool Tests
 *
 * TDD tests for the reorder_task tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleReorderTask, ReorderTaskInput, ReorderTaskContext } from './reorder-task';

describe('handleReorderTask', () => {
  let mockTasksService: any;
  let context: ReorderTaskContext;

  beforeEach(() => {
    mockTasksService = {
      readByQuery: vi.fn(),
      updateOne: vi.fn(),
      updateMany: vi.fn(),
    };
    context = {
      tasksService: mockTasksService,
      projectId: 'project-123',
    };
  });

  describe('validation', () => {
    it('throws when taskId is missing', async () => {
      const input: ReorderTaskInput = {
        taskId: undefined as any,
        position: 'first',
      };

      await expect(handleReorderTask(input, context)).rejects.toThrow('taskId required');
    });

    it('throws when projectId is missing', async () => {
      const input: ReorderTaskInput = {
        taskId: 1,
        position: 'first',
      };

      await expect(handleReorderTask(input, { ...context, projectId: undefined })).rejects.toThrow(
        'projectId required'
      );
    });

    it('throws when position is missing', async () => {
      const input: ReorderTaskInput = {
        taskId: 1,
        position: undefined as any,
      };

      await expect(handleReorderTask(input, context)).rejects.toThrow('position required');
    });

    it('returns error when task not found', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 2, sort_order: 1000 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 1,
        position: 'first',
      };

      const result = await handleReorderTask(input, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for invalid position without targetTaskId', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, sort_order: 1000 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 1,
        position: 'before' as any,
        // targetTaskId missing
      };

      const result = await handleReorderTask(input, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('targetTaskId');
    });
  });

  describe('position: first', () => {
    it('moves task to first position with integer sort_order', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, sort_order: 3000 },
        { id: 2, sort_order: 1000 },
        { id: 3, sort_order: 2000 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 1,
        position: 'first',
      };

      const result = await handleReorderTask(input, context);

      expect(result.success).toBe(true);
      expect(mockTasksService.updateOne).toHaveBeenCalledWith(1, {
        sort_order: expect.any(Number),
      });

      // Verify integer
      const updateCall = mockTasksService.updateOne.mock.calls[0];
      const newSortOrder = updateCall[1].sort_order;
      expect(Number.isInteger(newSortOrder)).toBe(true);
      expect(newSortOrder).toBeLessThan(1000); // Less than current first
    });
  });

  describe('position: last', () => {
    it('moves task to last position with integer sort_order', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 2000 },
        { id: 3, sort_order: 3000 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 1,
        position: 'last',
      };

      const result = await handleReorderTask(input, context);

      expect(result.success).toBe(true);
      const updateCall = mockTasksService.updateOne.mock.calls[0];
      const newSortOrder = updateCall[1].sort_order;
      expect(Number.isInteger(newSortOrder)).toBe(true);
      expect(newSortOrder).toBeGreaterThan(3000); // Greater than current last
    });
  });

  describe('position: before', () => {
    it('moves task before target with integer sort_order', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 2000 },
        { id: 3, sort_order: 3000 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 3,
        position: 'before',
        targetTaskId: 2,
      };

      const result = await handleReorderTask(input, context);

      expect(result.success).toBe(true);
      const updateCall = mockTasksService.updateOne.mock.calls[0];
      const newSortOrder = updateCall[1].sort_order;
      expect(Number.isInteger(newSortOrder)).toBe(true);
      expect(newSortOrder).toBeGreaterThan(1000);
      expect(newSortOrder).toBeLessThan(2000);
    });

    it('returns error when target task not found', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, sort_order: 1000 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 1,
        position: 'before',
        targetTaskId: 999,
      };

      const result = await handleReorderTask(input, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('999');
    });
  });

  describe('position: after', () => {
    it('moves task after target with integer sort_order', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 2000 },
        { id: 3, sort_order: 3000 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 1,
        position: 'after',
        targetTaskId: 2,
      };

      const result = await handleReorderTask(input, context);

      expect(result.success).toBe(true);
      const updateCall = mockTasksService.updateOne.mock.calls[0];
      const newSortOrder = updateCall[1].sort_order;
      expect(Number.isInteger(newSortOrder)).toBe(true);
      expect(newSortOrder).toBeGreaterThan(2000);
      expect(newSortOrder).toBeLessThan(3000);
    });
  });

  describe('auto-renumber when gap exhausted', () => {
    it('renumbers all tasks when gap is 1 or less', async () => {
      // Tasks with no gap between id 1 and id 2
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 1001 }, // Gap of 1
        { id: 3, sort_order: 2000 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 3,
        position: 'before',
        targetTaskId: 2,
      };

      const result = await handleReorderTask(input, context);

      expect(result.success).toBe(true);
      // Should have called updateMany for renumbering
      expect(mockTasksService.updateMany).toHaveBeenCalled();
      // And updateOne for the moved task
      expect(mockTasksService.updateOne).toHaveBeenCalled();
    });

    it('preserves order after renumbering', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 1001 },
        { id: 3, sort_order: 1002 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 3,
        position: 'before',
        targetTaskId: 2,
      };

      await handleReorderTask(input, context);

      // Verify updateMany was called with proper renumbering
      const updateManyCall = mockTasksService.updateMany.mock.calls[0];
      expect(updateManyCall).toBeDefined();
    });
  });

  describe('returns reorder info', () => {
    it('includes previousSortOrder for undo', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 2000 },
      ]);

      const input: ReorderTaskInput = {
        taskId: 1,
        position: 'last',
      };

      const result = await handleReorderTask(input, context);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(1);
      expect(result.previousSortOrder).toBe(1000);
      expect(result.newSortOrder).toBeDefined();
      expect(Number.isInteger(result.newSortOrder)).toBe(true);
    });
  });
});
