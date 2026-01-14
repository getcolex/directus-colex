/**
 * Reorder Task Tool
 *
 * Handles moving tasks to different positions with gap-based integer sort ordering.
 */

import {
  calculateSortOrder,
  needsRenumber,
  renumberSortOrders,
  TaskWithSortOrder,
  Position,
} from './sort-order';

export interface ReorderTaskInput {
  taskId: number;
  position: Position;
  targetTaskId?: number;
}

export interface ReorderTaskContext {
  tasksService: {
    readByQuery: (query: any) => Promise<any[]>;
    updateOne: (id: number, data: any) => Promise<void>;
    updateMany: (ids: number[], data: any) => Promise<void>;
  };
  projectId?: string;
}

export interface ReorderTaskResult {
  success: boolean;
  error?: string;
  taskId?: number;
  movedTo?: string;
  previousSortOrder?: number;
  newSortOrder?: number;
  renumbered?: boolean;
}

/**
 * Handle the reorder_task tool call.
 * Uses gap-based integer sort ordering to avoid fractional values.
 */
export async function handleReorderTask(
  input: ReorderTaskInput,
  context: ReorderTaskContext
): Promise<ReorderTaskResult> {
  const { taskId, position, targetTaskId } = input;
  const { tasksService, projectId } = context;

  // Validation
  if (!taskId) {
    throw new Error('taskId required');
  }
  if (!projectId) {
    throw new Error('projectId required for reorder_task');
  }
  if (!position) {
    throw new Error('position required');
  }

  // Validate before/after requires targetTaskId
  if ((position === 'before' || position === 'after') && !targetTaskId) {
    return {
      success: false,
      error: `Position "${position}" requires targetTaskId`,
    };
  }

  // Get all tasks for the project, sorted by sort_order
  const allTasks = await tasksService.readByQuery({
    filter: { project_id: { _eq: projectId } },
    sort: ['sort_order'],
  });

  // Find the task to move
  const taskToMove = allTasks.find((t: any) => t.id === taskId);
  if (!taskToMove) {
    return {
      success: false,
      error: `Task ${taskId} not found in project`,
    };
  }

  // For before/after, verify target exists
  if ((position === 'before' || position === 'after') && targetTaskId) {
    const targetTask = allTasks.find((t: any) => t.id === targetTaskId);
    if (!targetTask) {
      return {
        success: false,
        error: `Target task ${targetTaskId} not found`,
      };
    }
  }

  // Convert to TaskWithSortOrder format (excluding the task being moved)
  const otherTasks: TaskWithSortOrder[] = allTasks
    .filter((t: any) => t.id !== taskId)
    .map((t: any) => ({
      id: t.id,
      sort_order: t.sort_order || 0,
    }));

  const previousSortOrder = taskToMove.sort_order;
  let renumbered = false;

  // Check if we need to renumber due to exhausted gaps
  if (needsRenumber(otherTasks, position, targetTaskId)) {
    // Renumber all tasks first
    const renumberedTasks = renumberSortOrders(otherTasks);

    // Batch update all tasks with new sort_orders
    const updates = renumberedTasks.map((t) => ({
      id: t.id,
      sort_order: t.sort_order,
    }));

    // Update each task's sort_order
    for (const update of updates) {
      await tasksService.updateMany([update.id], { sort_order: update.sort_order });
    }

    renumbered = true;

    // Recalculate position after renumbering
    const newSortOrder = calculateSortOrder(renumberedTasks, position, targetTaskId);

    await tasksService.updateOne(taskId, { sort_order: newSortOrder });

    return {
      success: true,
      taskId,
      movedTo: position,
      previousSortOrder,
      newSortOrder,
      renumbered,
    };
  }

  // Calculate new sort_order using gap-based algorithm
  const newSortOrder = calculateSortOrder(otherTasks, position, targetTaskId);

  // Update the task's sort_order
  await tasksService.updateOne(taskId, { sort_order: newSortOrder });

  return {
    success: true,
    taskId,
    movedTo: position,
    previousSortOrder,
    newSortOrder,
    renumbered,
  };
}
