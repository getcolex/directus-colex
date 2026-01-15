/**
 * Shared Module Barrel Export
 *
 * Re-exports all shared utilities for use by endpoint modules.
 */

// Types
export * from './types';

// Services
export { BlackboardService, createBlackboardService } from './blackboard-service';

// Utilities
export { detectConflicts, stringSimilarity, industriesMatch, type ResearchFindings } from './conflict-detector';
export { calculateSortOrder, needsRenumber, renumberSortOrders, DEFAULT_GAP, type TaskWithSortOrder, type Position } from './sort-order';
export { formatBlackboardContext } from './format-blackboard-context';

// Tools
export { ANTHROPIC_TOOLS, type ToolName } from './tools';
