/**
 * Sort Order Utility
 *
 * Gap-based integer sort ordering for tasks.
 * Uses gaps of 1000 between items, renumbers when gaps exhausted.
 */

export const DEFAULT_GAP = 1000;

export type TaskWithSortOrder = {
  id: number;
  sort_order: number;
};

export type Position = 'first' | 'last' | 'before' | 'after';

/**
 * Calculate a new sort_order value for inserting a task at a given position.
 *
 * @param tasks - Array of tasks sorted by sort_order ascending
 * @param position - Where to insert: 'first', 'last', 'before', 'after'
 * @param targetTaskId - Required for 'before' and 'after' positions
 * @returns Integer sort_order value
 */
export function calculateSortOrder(
  tasks: TaskWithSortOrder[],
  position: Position,
  targetTaskId?: number
): number {
  // Sort tasks by sort_order
  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order);

  if (position === 'first') {
    if (sorted.length === 0) {
      return DEFAULT_GAP;
    }
    return sorted[0].sort_order - DEFAULT_GAP;
  }

  if (position === 'last') {
    if (sorted.length === 0) {
      return DEFAULT_GAP;
    }
    return sorted[sorted.length - 1].sort_order + DEFAULT_GAP;
  }

  if (position === 'before') {
    if (targetTaskId === undefined) {
      throw new Error('targetTaskId required for position: before');
    }
    const targetIndex = sorted.findIndex((t) => t.id === targetTaskId);
    if (targetIndex === -1) {
      throw new Error(`Target task ${targetTaskId} not found`);
    }

    const targetTask = sorted[targetIndex];

    // If target is first task, put before it
    if (targetIndex === 0) {
      return targetTask.sort_order - DEFAULT_GAP;
    }

    // Otherwise, midpoint between previous and target
    const prevTask = sorted[targetIndex - 1];
    return Math.floor((prevTask.sort_order + targetTask.sort_order) / 2);
  }

  if (position === 'after') {
    if (targetTaskId === undefined) {
      throw new Error('targetTaskId required for position: after');
    }
    const targetIndex = sorted.findIndex((t) => t.id === targetTaskId);
    if (targetIndex === -1) {
      throw new Error(`Target task ${targetTaskId} not found`);
    }

    const targetTask = sorted[targetIndex];

    // If target is last task, put after it
    if (targetIndex === sorted.length - 1) {
      return targetTask.sort_order + DEFAULT_GAP;
    }

    // Otherwise, midpoint between target and next
    const nextTask = sorted[targetIndex + 1];
    return Math.floor((targetTask.sort_order + nextTask.sort_order) / 2);
  }

  throw new Error(`Invalid position: ${position}`);
}

/**
 * Check if inserting at the given position would require renumbering.
 * Returns true if the gap between adjacent tasks is 1 or less.
 *
 * @param tasks - Array of tasks sorted by sort_order ascending
 * @param position - Where to insert
 * @param targetTaskId - Required for 'before' and 'after' positions
 * @returns true if renumbering is needed
 */
export function needsRenumber(
  tasks: TaskWithSortOrder[],
  position: Position,
  targetTaskId?: number
): boolean {
  // Empty list never needs renumber
  if (tasks.length === 0) {
    return false;
  }

  // first/last always have room (we subtract/add DEFAULT_GAP)
  if (position === 'first' || position === 'last') {
    return false;
  }

  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order);

  if (position === 'before') {
    if (targetTaskId === undefined) {
      return false;
    }
    const targetIndex = sorted.findIndex((t) => t.id === targetTaskId);
    if (targetIndex === -1 || targetIndex === 0) {
      return false;
    }

    const prevTask = sorted[targetIndex - 1];
    const targetTask = sorted[targetIndex];
    const gap = targetTask.sort_order - prevTask.sort_order;
    return gap <= 1;
  }

  if (position === 'after') {
    if (targetTaskId === undefined) {
      return false;
    }
    const targetIndex = sorted.findIndex((t) => t.id === targetTaskId);
    if (targetIndex === -1 || targetIndex === sorted.length - 1) {
      return false;
    }

    const targetTask = sorted[targetIndex];
    const nextTask = sorted[targetIndex + 1];
    const gap = nextTask.sort_order - targetTask.sort_order;
    return gap <= 1;
  }

  return false;
}

/**
 * Renumber all tasks with DEFAULT_GAP spacing.
 * Preserves the existing order (by current sort_order).
 *
 * @param tasks - Array of tasks to renumber
 * @returns New array with updated sort_order values
 */
export function renumberSortOrders(
  tasks: TaskWithSortOrder[]
): TaskWithSortOrder[] {
  if (tasks.length === 0) {
    return [];
  }

  // Sort by current sort_order to preserve order
  const sorted = [...tasks].sort((a, b) => a.sort_order - b.sort_order);

  // Assign new sort_orders with DEFAULT_GAP spacing
  return sorted.map((task, index) => ({
    ...task,
    sort_order: (index + 1) * DEFAULT_GAP,
  }));
}
