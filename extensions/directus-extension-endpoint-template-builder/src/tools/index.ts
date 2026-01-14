/**
 * Tools Module
 *
 * Exports all tool definitions and handlers for the Template Builder AI.
 */

// Tool definitions (Anthropic schema)
export { ANTHROPIC_TOOLS, ToolName } from './definitions';

// Tool handlers
export {
  handleReorderTask,
  ReorderTaskInput,
  ReorderTaskContext,
  ReorderTaskResult,
} from '../lib/reorder-task';

// Utilities
export {
  calculateSortOrder,
  needsRenumber,
  renumberSortOrders,
  DEFAULT_GAP,
  TaskWithSortOrder,
  Position,
} from '../lib/sort-order';
