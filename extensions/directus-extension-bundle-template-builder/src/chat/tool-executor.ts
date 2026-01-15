/**
 * Tool Executor
 *
 * Handles execution of AI tools for the chat-v2 endpoint.
 */

const MAX_HISTORY_SIZE = 20;
const GAP_SIZE = 1000;

/**
 * Action recorded for undo functionality
 */
export interface UndoableAction {
  type: 'create' | 'update' | 'delete';
  collection: string;
  id: number | string;
  previousData?: Record<string, any>;
  newData?: Record<string, any>;
  timestamp: string;
}

/**
 * File skill service interface (optional)
 */
export interface FileSkillServiceLike {
  readFileContent: (params: {
    projectId: number;
    skillKey: string;
    query?: string;
    pages?: number[];
  }) => Promise<{
    success: boolean;
    content?: string;
    filename?: string;
    contentSource?: 'extracted_text' | 'summary';
    error?: string;
  }>;
}

/**
 * Collection skill service interface (optional)
 */
export interface CollectionSkillServiceLike {
  queryCollection: (params: {
    projectId: number;
    skillKey: string;
    filter?: Record<string, any>;
    fields?: string[];
    limit?: number;
    sort?: string[];
  }) => Promise<{
    success: boolean;
    data?: any[];
    error?: string;
  }>;
}

/**
 * Context required for tool execution
 */
export interface ToolExecutorContext {
  projectId: number | undefined;
  conversationId: string;
  tasksService: {
    readOne: (id: number) => Promise<any>;
    readByQuery: (query: any) => Promise<any[]>;
    createOne: (data: any) => Promise<number>;
    updateOne: (id: number, data: any) => Promise<any>;
    deleteOne: (id: number) => Promise<any>;
  };
  outputsService: {
    readOne: (id: number) => Promise<any>;
    createOne: (data: any) => Promise<number>;
    updateOne: (id: number, data: any) => Promise<any>;
  };
  blackboardService: {
    get: (projectId: number) => Promise<any>;
    write: (projectId: number, key: string, value: any, source: string) => Promise<boolean>;
  };
  actionHistory: Map<string, UndoableAction[]>;
  // Optional skill services
  fileSkillService?: FileSkillServiceLike;
  collectionSkillService?: CollectionSkillServiceLike;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  error?: string;
  [key: string]: any;
}

/**
 * Tool executor interface
 */
export interface ToolExecutor {
  execute(toolName: string, input: any): Promise<ToolResult>;
}

/**
 * Record an action to history for undo
 */
function recordAction(
  actionHistory: Map<string, UndoableAction[]>,
  conversationId: string,
  action: Omit<UndoableAction, 'timestamp'>
): void {
  let history = actionHistory.get(conversationId) || [];

  history.push({
    ...action,
    timestamp: new Date().toISOString(),
  });

  if (history.length > MAX_HISTORY_SIZE) {
    history = history.slice(-MAX_HISTORY_SIZE);
  }

  actionHistory.set(conversationId, history);
}

/**
 * Create a tool executor with the given context
 */
export function createToolExecutor(context: ToolExecutorContext): ToolExecutor {
  const {
    projectId,
    conversationId,
    tasksService,
    outputsService,
    blackboardService,
    actionHistory,
    fileSkillService,
    collectionSkillService,
  } = context;

  return {
    async execute(toolName: string, input: any): Promise<ToolResult> {
      try {
        switch (toolName) {
          case 'update_task': {
            const { taskId, data } = input;
            if (!taskId) throw new Error('taskId required');

            // Fetch current state for undo
            const previousTask = await tasksService.readOne(taskId);

            // Perform update
            await tasksService.updateOne(taskId, data);

            // Record for undo
            recordAction(actionHistory, conversationId, {
              type: 'update',
              collection: 'tb_tasks',
              id: taskId,
              previousData: previousTask,
              newData: data,
            });

            return { success: true, taskId, updated: Object.keys(data) };
          }

          case 'create_task': {
            if (!projectId) throw new Error('projectId required for create_task');

            // Get min sort_order to put new task at the BEGINNING
            const existingTasks = await tasksService.readByQuery({
              filter: { project_id: { _eq: projectId } },
              sort: ['sort_order'],
              limit: 1,
            });
            const sortOrder = existingTasks.length > 0 ? (existingTasks[0].sort_order || 1) - GAP_SIZE : 0;

            const newTask = {
              project_id: projectId,
              name: input.name || 'New Task',
              description: input.description || '',
              action_type: input.action_type || 'agent',
              tool_mode: input.tool_mode || null,
              form_schema: input.form_schema || null,
              status: 'draft', // Tasks created by AI start as draft for user review
              sort_order: sortOrder,
            };

            const newTaskId = await tasksService.createOne(newTask);

            // Record for undo
            recordAction(actionHistory, conversationId, {
              type: 'create',
              collection: 'tb_tasks',
              id: newTaskId,
              newData: newTask,
            });

            return { success: true, taskId: newTaskId, created: newTask };
          }

          case 'delete_task': {
            const { taskId: deleteTaskId } = input;
            if (!deleteTaskId) throw new Error('taskId required');

            // Fetch current state for undo
            const taskToDelete = await tasksService.readOne(deleteTaskId);

            // Perform delete
            await tasksService.deleteOne(deleteTaskId);

            // Record for undo
            recordAction(actionHistory, conversationId, {
              type: 'delete',
              collection: 'tb_tasks',
              id: deleteTaskId,
              previousData: taskToDelete,
            });

            return { success: true, taskId: deleteTaskId, deleted: true };
          }

          case 'activate_task': {
            const { taskId: activateTaskId } = input;
            if (!activateTaskId) throw new Error('taskId required');

            // Fetch current state
            const taskToActivate = await tasksService.readOne(activateTaskId);

            // Check if task is in draft status
            if (taskToActivate.status !== 'draft') {
              return { success: false, error: `Task is not in draft status (current: ${taskToActivate.status})` };
            }

            // Activate the task
            await tasksService.updateOne(activateTaskId, { status: 'pending' });

            // Record for undo
            recordAction(actionHistory, conversationId, {
              type: 'update',
              collection: 'tb_tasks',
              id: activateTaskId,
              previousData: taskToActivate,
              newData: { status: 'pending' },
            });

            return { success: true, taskId: activateTaskId, activated: true };
          }

          case 'reorder_task': {
            const { taskId: reorderTaskId, position, targetTaskId } = input;
            if (!reorderTaskId) throw new Error('taskId required');
            if (!projectId) throw new Error('projectId required');

            // Get all tasks sorted by sort_order
            const allTasks = await tasksService.readByQuery({
              filter: { project_id: { _eq: projectId } },
              sort: ['sort_order'],
            });

            // Find the task being moved
            const taskToMove = allTasks.find((t: any) => t.id === reorderTaskId);
            if (!taskToMove) throw new Error('Task not found');

            const previousSortOrder = taskToMove.sort_order;
            let newSortOrder: number;

            if (position === 'first') {
              // Put before the first task
              const firstTask = allTasks[0];
              newSortOrder = (firstTask?.sort_order || 0) - GAP_SIZE;
            } else if (position === 'last') {
              // Put after the last task
              const lastTask = allTasks[allTasks.length - 1];
              newSortOrder = (lastTask?.sort_order || 0) + GAP_SIZE;
            } else if (position === 'before' && targetTaskId) {
              // Put before target task
              const targetIndex = allTasks.findIndex((t: any) => t.id === targetTaskId);
              if (targetIndex === -1) throw new Error('Target task not found');

              const targetTask = allTasks[targetIndex];
              const prevTask = allTasks[targetIndex - 1];

              if (prevTask) {
                // Put between prev and target
                newSortOrder = Math.floor((prevTask.sort_order + targetTask.sort_order) / 2);
              } else {
                // Target is first, put before it
                newSortOrder = targetTask.sort_order - GAP_SIZE;
              }
            } else if (position === 'after' && targetTaskId) {
              // Put after target task
              const targetIndex = allTasks.findIndex((t: any) => t.id === targetTaskId);
              if (targetIndex === -1) throw new Error('Target task not found');

              const targetTask = allTasks[targetIndex];
              const nextTask = allTasks[targetIndex + 1];

              if (nextTask) {
                // Put between target and next
                newSortOrder = Math.floor((targetTask.sort_order + nextTask.sort_order) / 2);
              } else {
                // Target is last, put after it
                newSortOrder = targetTask.sort_order + GAP_SIZE;
              }
            } else {
              throw new Error('Invalid position or missing targetTaskId');
            }

            // Update the task
            await tasksService.updateOne(reorderTaskId, { sort_order: newSortOrder });

            // Record for undo
            recordAction(actionHistory, conversationId, {
              type: 'update',
              collection: 'tb_tasks',
              id: reorderTaskId,
              previousData: { sort_order: previousSortOrder },
              newData: { sort_order: newSortOrder },
            });

            return {
              success: true,
              taskId: reorderTaskId,
              previousSortOrder,
              newSortOrder,
            };
          }

          case 'submit_form': {
            const { taskId: formTaskId, data: formData } = input;
            if (!formTaskId) throw new Error('taskId required');
            if (!projectId) throw new Error('projectId required');

            // Save form data as output
            const outputId = await outputsService.createOne({
              project_id: projectId,
              task_id: formTaskId,
              output_type: 'form',
              data: formData,
            });

            // Write form data to blackboard for data flow between tasks
            try {
              await blackboardService.write(
                projectId,
                `form_task_${formTaskId}`,
                formData,
                `form_task_${formTaskId}`
              );
            } catch (bbError: any) {
              console.error(`Failed to write to blackboard: ${bbError.message}`);
              // Don't fail the form submission if blackboard write fails
            }

            // Update task status
            await tasksService.updateOne(formTaskId, { status: 'done' });

            return { success: true, taskId: formTaskId, outputId };
          }

          case 'read_file': {
            if (!fileSkillService) {
              return { success: false, error: 'File skill service not available' };
            }
            if (!projectId) throw new Error('projectId required');

            const { skill_key, query, pages } = input;
            const result = await fileSkillService.readFileContent({
              projectId,
              skillKey: skill_key,
              query,
              pages,
            });

            if (!result.success) {
              return { success: false, error: result.error };
            }

            return {
              success: true,
              content: result.content,
              filename: result.filename,
              contentSource: result.contentSource,
            };
          }

          case 'query_collection': {
            if (!collectionSkillService) {
              return { success: false, error: 'Collection skill service not available' };
            }
            if (!projectId) throw new Error('projectId required');

            const { skill_key, filter, fields, limit, sort } = input;
            const result = await collectionSkillService.queryCollection({
              projectId,
              skillKey: skill_key,
              filter,
              fields,
              limit,
              sort,
            });

            if (!result.success) {
              return { success: false, error: result.error };
            }

            return {
              success: true,
              data: result.data,
            };
          }

          default:
            return { success: false, error: `Unknown tool: ${toolName}` };
        }
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  };
}
