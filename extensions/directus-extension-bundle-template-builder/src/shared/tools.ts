/**
 * Anthropic Tool Definitions
 *
 * Tool schemas for the Template Builder AI chat.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic tool definitions for Template Builder
 */
export const ANTHROPIC_TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_task',
    description: 'Update an existing task in the current project. Use this to modify task name, description, status, form schema, or other properties.',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: { type: 'number', description: 'The ID of the task to update' },
        data: {
          type: 'object',
          description: 'Fields to update on the task',
          properties: {
            name: { type: 'string', description: 'New task name' },
            description: { type: 'string', description: 'New task description' },
            status: { type: 'string', enum: ['pending', 'running', 'done', 'error'], description: 'Task status' },
            action_type: { type: 'string', enum: ['form', 'agent', 'review'], description: 'Type of task' },
            form_schema: {
              type: 'array',
              description: 'Form field definitions for form-type tasks',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  label: { type: 'string' },
                  type: { type: 'string', enum: ['text', 'textarea', 'email', 'url', 'number', 'date', 'checkbox'] },
                  required: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
      required: ['taskId', 'data'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in the current project',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Task name (required)' },
        description: { type: 'string', description: 'Task description' },
        action_type: { type: 'string', enum: ['form', 'agent', 'review'], description: 'Type of task' },
        tool_mode: { type: 'string', enum: ['research', 'generate', 'scrape'], description: 'For agent tasks, the tool mode' },
        form_schema: {
          type: 'array',
          description: 'Form field definitions (required for form-type tasks)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              label: { type: 'string' },
              type: { type: 'string' },
              required: { type: 'boolean' },
            },
          },
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task from the project',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: { type: 'number', description: 'The ID of the task to delete' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'activate_task',
    description: 'Activate a draft task so it can be run. Changes status from "draft" to "pending".',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: { type: 'number', description: 'The ID of the draft task to activate' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'reorder_task',
    description: 'Move a task to a different position in the task list. Use this when users ask to reorder tasks (e.g., "move task X to the top", "put this before that").',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: { type: 'number', description: 'The ID of the task to move' },
        position: { type: 'string', enum: ['first', 'last', 'before', 'after'], description: 'Where to move the task: "first" (top), "last" (bottom), "before" (before targetTaskId), "after" (after targetTaskId)' },
        targetTaskId: { type: 'number', description: 'For "before" or "after" position, the ID of the task to position relative to' },
      },
      required: ['taskId', 'position'],
    },
  },
  {
    name: 'submit_form',
    description: 'Submit form data for a form-type task. This saves the data as an output and marks the task as done.',
    input_schema: {
      type: 'object' as const,
      properties: {
        taskId: { type: 'number', description: 'The ID of the form task' },
        data: { type: 'object', description: 'The form data to submit' },
      },
      required: ['taskId', 'data'],
    },
  },
  {
    name: 'enrich_output',
    description: 'Add new columns to existing output data and use AI to populate values for each row. Use this when in enrichment mode to add fields like website_url, instagram_handle, etc. to existing table data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        outputId: { type: 'number', description: 'The ID of the output to enrich (from enrichment context)' },
        taskId: { type: 'number', description: 'The ID of the task that owns the output (from enrichment context)' },
        newFields: {
          type: 'array',
          description: 'Array of new fields to add and populate',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Field name in snake_case (e.g., website_url, instagram_handle)' },
              type: { type: 'string', enum: ['text', 'url', 'number', 'email', 'date'], description: 'Field data type' },
              description: { type: 'string', description: 'Description to help AI populate the value' },
            },
            required: ['name', 'type'],
          },
        },
      },
      required: ['outputId', 'taskId', 'newFields'],
    },
  },
  {
    name: 'read_file',
    description: 'Read content from a file skill on the blackboard. Use this when you need the full content of an uploaded file (PDF, CSV, document). The skill_key should match a @file_skill entry from the blackboard context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        skill_key: {
          type: 'string',
          description: 'The blackboard skill key (e.g., "@brand_guidelines")',
        },
        query: {
          type: 'string',
          description: 'Optional: specific question to answer from the file',
        },
        pages: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional: specific page numbers to read (for PDFs)',
        },
      },
      required: ['skill_key'],
    },
  },
  {
    name: 'query_collection',
    description: 'Query data from a Directus collection skill on the blackboard.',
    input_schema: {
      type: 'object' as const,
      properties: {
        skill_key: {
          type: 'string',
          description: 'The blackboard skill key (e.g., "@customers")',
        },
        filter: {
          type: 'object',
          description: 'Directus filter object',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to return',
        },
        limit: {
          type: 'number',
          description: 'Max rows to return (default: 10, max: 100)',
        },
        sort: {
          type: 'array',
          items: { type: 'string' },
          description: 'Sort fields',
        },
      },
      required: ['skill_key'],
    },
  },
];

/**
 * Tool names as a type union for type safety
 */
export type ToolName =
  | 'update_task'
  | 'create_task'
  | 'delete_task'
  | 'activate_task'
  | 'reorder_task'
  | 'submit_form'
  | 'enrich_output'
  | 'read_file'
  | 'query_collection';
