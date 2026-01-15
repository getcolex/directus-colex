/**
 * Shared Module Barrel Export
 *
 * Re-exports all shared utilities for use by endpoint modules.
 */

// Types
export * from './types';

// Services
export { BlackboardService, createBlackboardService } from './blackboard-service';
export { createFileSkillService, type FileSkillService } from './file-skill-service';
export { createCollectionSkillService, type CollectionSkillService } from './collection-skill-service';
export { createSkillToolHandlers, type SkillToolHandlers } from './skill-tool-handlers';
export { createFileUploadService, FileUploadService } from './file-upload-service';

// Utilities
export { detectConflicts, stringSimilarity, industriesMatch, type ResearchFindings } from './conflict-detector';
export { calculateSortOrder, needsRenumber, renumberSortOrders, DEFAULT_GAP, type TaskWithSortOrder, type Position } from './sort-order';
export { formatBlackboardContext } from './format-blackboard-context';

// Tools
export { ANTHROPIC_TOOLS, type ToolName } from './tools';

// Claude & External Tools
export {
  callClaude,
  callTool,
  getToolsForMode,
  executeToolsForTask,
  CLAUDE_PROXY_URL,
  TOOLS_SERVER_URL,
} from './claude';
