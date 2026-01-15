/**
 * Skill Tool Handlers
 *
 * Handlers for read_file and query_collection AI tools.
 */

import type { FileSkillService } from './file-skill-service';
import type { CollectionSkillService } from './collection-skill-service';

export interface ReadFileInput {
  projectId: number;
  skill_key: string;
  query?: string;
  pages?: number[];
}

export interface ReadFileResult {
  success: boolean;
  content?: string;
  filename?: string;
  contentSource?: 'extracted_text' | 'summary';
  toolResult?: string;
  error?: string;
}

export interface QueryCollectionInput {
  projectId: number;
  skill_key: string;
  filter?: Record<string, any>;
  fields?: string[];
  limit?: number;
  sort?: string[];
}

export interface QueryCollectionResult {
  success: boolean;
  data?: any[];
  toolResult?: string;
  error?: string;
}

export interface DispatchToolCallParams {
  toolName: string;
  input: any;
  projectId: number;
}

export interface DispatchToolCallResult {
  success: boolean;
  toolResult?: string;
  error?: string;
  data?: any;
}

export interface SkillToolHandlers {
  handleReadFile(input: ReadFileInput): Promise<ReadFileResult>;
  handleQueryCollection(input: QueryCollectionInput): Promise<QueryCollectionResult>;
  getAvailableTools(): { name: string; description: string }[];
  dispatchToolCall(params: DispatchToolCallParams): Promise<DispatchToolCallResult>;
}

interface CreateSkillToolHandlersParams {
  fileSkillService: FileSkillService;
  collectionSkillService: CollectionSkillService;
}

/**
 * Format file content for AI consumption
 */
function formatFileToolResult(params: {
  filename: string;
  content: string;
  contentSource: 'extracted_text' | 'summary';
}): string {
  const sourceLabel = params.contentSource === 'extracted_text' ? 'Extracted text' : 'Summary';
  return `**File: ${params.filename}**\n\n${sourceLabel}:\n${params.content}`;
}

/**
 * Format collection query result for AI consumption
 */
function formatCollectionToolResult(data: any[]): string {
  const count = data.length;
  if (count === 0) {
    return `Query returned 0 rows.`;
  }

  const preview = JSON.stringify(data.slice(0, 5), null, 2);
  const truncated = count > 5 ? `\n\n(showing first 5 of ${count} rows)` : '';

  return `Query returned ${count} rows:\n\n\`\`\`json\n${preview}\n\`\`\`${truncated}`;
}

/**
 * Create skill tool handlers
 */
export function createSkillToolHandlers(params: CreateSkillToolHandlersParams): SkillToolHandlers {
  const { fileSkillService, collectionSkillService } = params;

  return {
    async handleReadFile(input: ReadFileInput): Promise<ReadFileResult> {
      const result = await fileSkillService.readFileContent({
        projectId: input.projectId,
        skillKey: input.skill_key,
        query: input.query,
        pages: input.pages,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const toolResult = formatFileToolResult({
        filename: result.filename!,
        content: result.content!,
        contentSource: result.contentSource!,
      });

      return {
        success: true,
        content: result.content,
        filename: result.filename,
        contentSource: result.contentSource,
        toolResult,
      };
    },

    async handleQueryCollection(input: QueryCollectionInput): Promise<QueryCollectionResult> {
      const result = await collectionSkillService.queryCollection({
        projectId: input.projectId,
        skillKey: input.skill_key,
        filter: input.filter,
        fields: input.fields,
        limit: input.limit,
        sort: input.sort,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const toolResult = formatCollectionToolResult(result.data!);

      return {
        success: true,
        data: result.data,
        toolResult,
      };
    },

    getAvailableTools(): { name: string; description: string }[] {
      return [
        {
          name: 'read_file',
          description: 'Read content from a file skill on the blackboard',
        },
        {
          name: 'query_collection',
          description: 'Query data from a Directus collection skill on the blackboard',
        },
      ];
    },

    async dispatchToolCall(params: DispatchToolCallParams): Promise<DispatchToolCallResult> {
      const { toolName, input, projectId } = params;

      switch (toolName) {
        case 'read_file': {
          const result = await this.handleReadFile({
            projectId,
            skill_key: input.skill_key,
            query: input.query,
            pages: input.pages,
          });
          return {
            success: result.success,
            toolResult: result.toolResult,
            error: result.error,
          };
        }

        case 'query_collection': {
          const result = await this.handleQueryCollection({
            projectId,
            skill_key: input.skill_key,
            filter: input.filter,
            fields: input.fields,
            limit: input.limit,
            sort: input.sort,
          });
          return {
            success: result.success,
            toolResult: result.toolResult,
            error: result.error,
            data: result.data,
          };
        }

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }
    },
  };
}
