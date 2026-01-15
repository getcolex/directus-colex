/**
 * Tool Executor Tests
 *
 * Tests for chat-v2 tool execution handlers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createToolExecutor,
  ToolExecutorContext,
  ToolExecutor,
} from './tool-executor';

describe('Tool Executor', () => {
  let executor: ToolExecutor;
  let mockTasksService: any;
  let mockOutputsService: any;
  let mockBlackboardService: any;
  let actionHistory: Map<string, any[]>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTasksService = {
      readOne: vi.fn().mockResolvedValue({ id: 1, name: 'Task 1', status: 'pending', sort_order: 0 }),
      readByQuery: vi.fn().mockResolvedValue([
        { id: 1, name: 'Task 1', status: 'pending', sort_order: 0 },
        { id: 2, name: 'Task 2', status: 'done', sort_order: 1000 },
      ]),
      createOne: vi.fn().mockResolvedValue(3),
      updateOne: vi.fn().mockResolvedValue({}),
      deleteOne: vi.fn().mockResolvedValue({}),
    };

    mockOutputsService = {
      readOne: vi.fn().mockResolvedValue({ id: 1, data: { content: [{ name: 'Item 1' }] } }),
      createOne: vi.fn().mockResolvedValue(1),
      updateOne: vi.fn().mockResolvedValue({}),
    };

    mockBlackboardService = {
      get: vi.fn().mockResolvedValue({ entries: {}, conflicts: [] }),
      write: vi.fn().mockResolvedValue(true),
    };

    actionHistory = new Map();

    const context: ToolExecutorContext = {
      projectId: 1,
      conversationId: 'conv-123',
      tasksService: mockTasksService,
      outputsService: mockOutputsService,
      blackboardService: mockBlackboardService,
      actionHistory,
    };

    executor = createToolExecutor(context);
  });

  describe('update_task', () => {
    it('updates task and records action for undo', async () => {
      const result = await executor.execute('update_task', {
        taskId: 1,
        data: { name: 'Updated Task Name' },
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(1);
      expect(result.updated).toContain('name');

      // Verify service calls
      expect(mockTasksService.readOne).toHaveBeenCalledWith(1);
      expect(mockTasksService.updateOne).toHaveBeenCalledWith(1, { name: 'Updated Task Name' });

      // Verify action history
      const history = actionHistory.get('conv-123');
      expect(history).toHaveLength(1);
      expect(history![0].type).toBe('update');
      expect(history![0].collection).toBe('tb_tasks');
      expect(history![0].id).toBe(1);
      expect(history![0].previousData).toEqual({ id: 1, name: 'Task 1', status: 'pending', sort_order: 0 });
    });

    it('returns error when taskId is missing', async () => {
      const result = await executor.execute('update_task', { data: { name: 'Test' } });

      expect(result.success).toBe(false);
      expect(result.error).toContain('taskId required');
    });
  });

  describe('create_task', () => {
    it('creates task with draft status', async () => {
      const result = await executor.execute('create_task', {
        name: 'New Task',
        description: 'A new task',
        action_type: 'agent',
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(3);
      expect(result.created).toMatchObject({
        name: 'New Task',
        status: 'draft',
      });

      // Verify task is created at the beginning (lowest sort_order)
      expect(mockTasksService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 1,
          status: 'draft',
          sort_order: expect.any(Number),
        })
      );

      const createdTask = mockTasksService.createOne.mock.calls[0][0];
      expect(createdTask.sort_order).toBeLessThan(0); // Before existing tasks

      // Verify action history
      const history = actionHistory.get('conv-123');
      expect(history).toHaveLength(1);
      expect(history![0].type).toBe('create');
    });

    it('returns error when projectId is missing', async () => {
      const contextWithoutProject = {
        projectId: undefined as any,
        conversationId: 'conv-123',
        tasksService: mockTasksService,
        outputsService: mockOutputsService,
        blackboardService: mockBlackboardService,
        actionHistory,
      };
      const executorNoProject = createToolExecutor(contextWithoutProject);

      const result = await executorNoProject.execute('create_task', {
        name: 'New Task',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('projectId required');
    });
  });

  describe('delete_task', () => {
    it('deletes task and records for undo', async () => {
      const result = await executor.execute('delete_task', { taskId: 1 });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(1);
      expect(result.deleted).toBe(true);

      // Verify service calls
      expect(mockTasksService.readOne).toHaveBeenCalledWith(1);
      expect(mockTasksService.deleteOne).toHaveBeenCalledWith(1);

      // Verify action history stores previous data for undo
      const history = actionHistory.get('conv-123');
      expect(history).toHaveLength(1);
      expect(history![0].type).toBe('delete');
      expect(history![0].previousData).toBeDefined();
    });

    it('returns error when taskId is missing', async () => {
      const result = await executor.execute('delete_task', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('taskId required');
    });
  });

  describe('activate_task', () => {
    it('changes draft status to pending', async () => {
      mockTasksService.readOne.mockResolvedValue({ id: 1, name: 'Draft Task', status: 'draft' });

      const result = await executor.execute('activate_task', { taskId: 1 });

      expect(result.success).toBe(true);
      expect(result.activated).toBe(true);

      // Verify task is updated to pending
      expect(mockTasksService.updateOne).toHaveBeenCalledWith(1, { status: 'pending' });
    });

    it('returns error when task is not in draft status', async () => {
      mockTasksService.readOne.mockResolvedValue({ id: 1, name: 'Task', status: 'pending' });

      const result = await executor.execute('activate_task', { taskId: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in draft status');
    });
  });

  describe('reorder_task', () => {
    it('moves task to first position', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, name: 'Task 1', sort_order: 0 },
        { id: 2, name: 'Task 2', sort_order: 1000 },
        { id: 3, name: 'Task 3', sort_order: 2000 },
      ]);

      const result = await executor.execute('reorder_task', {
        taskId: 3,
        position: 'first',
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(3);
      expect(result.newSortOrder).toBeLessThan(0); // Before first task
    });

    it('moves task to last position', async () => {
      const result = await executor.execute('reorder_task', {
        taskId: 1,
        position: 'last',
      });

      expect(result.success).toBe(true);
      expect(result.newSortOrder).toBeGreaterThan(1000); // After last task
    });

    it('moves task before target', async () => {
      mockTasksService.readByQuery.mockResolvedValue([
        { id: 1, name: 'Task 1', sort_order: 0 },
        { id: 2, name: 'Task 2', sort_order: 1000 },
        { id: 3, name: 'Task 3', sort_order: 2000 },
      ]);

      const result = await executor.execute('reorder_task', {
        taskId: 3,
        position: 'before',
        targetTaskId: 2,
      });

      expect(result.success).toBe(true);
      // New sort_order should be between task 1 and task 2
      expect(result.newSortOrder).toBeGreaterThan(0);
      expect(result.newSortOrder).toBeLessThan(1000);
    });
  });

  describe('submit_form', () => {
    it('submits form data and writes to blackboard', async () => {
      const formData = { company_name: 'Acme Corp', industry: 'Tech' };

      const result = await executor.execute('submit_form', {
        taskId: 1,
        data: formData,
      });

      expect(result.success).toBe(true);
      expect(result.outputId).toBe(1);

      // Verify output is created
      expect(mockOutputsService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 1,
          task_id: 1,
          output_type: 'form',
          data: formData,
        })
      );

      // Verify task status is updated to done
      expect(mockTasksService.updateOne).toHaveBeenCalledWith(1, { status: 'done' });

      // Verify blackboard write
      expect(mockBlackboardService.write).toHaveBeenCalled();
    });
  });

  describe('read_file tool', () => {
    it('reads file content via skill handler', async () => {
      // Create executor with file skill service
      const mockFileSkillService = {
        readFileContent: vi.fn().mockResolvedValue({
          success: true,
          content: 'File content here',
          filename: 'test.pdf',
          contentSource: 'extracted_text' as const,
        }),
      };

      const contextWithSkills: ToolExecutorContext = {
        projectId: 1,
        conversationId: 'conv-123',
        tasksService: mockTasksService,
        outputsService: mockOutputsService,
        blackboardService: mockBlackboardService,
        actionHistory,
        fileSkillService: mockFileSkillService,
      };

      const executorWithSkills = createToolExecutor(contextWithSkills);

      const result = await executorWithSkills.execute('read_file', {
        skill_key: '@brand_guidelines',
        query: 'What are the brand colors?',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('File content here');
      expect(mockFileSkillService.readFileContent).toHaveBeenCalledWith({
        projectId: 1,
        skillKey: '@brand_guidelines',
        query: 'What are the brand colors?',
        pages: undefined,
      });
    });

    it('returns error when file skill service is not available', async () => {
      const result = await executor.execute('read_file', {
        skill_key: '@test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('File skill service not available');
    });
  });

  describe('query_collection tool', () => {
    it('queries collection via skill handler', async () => {
      const mockCollectionSkillService = {
        queryCollection: vi.fn().mockResolvedValue({
          success: true,
          data: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
        }),
      };

      const contextWithSkills: ToolExecutorContext = {
        projectId: 1,
        conversationId: 'conv-123',
        tasksService: mockTasksService,
        outputsService: mockOutputsService,
        blackboardService: mockBlackboardService,
        actionHistory,
        collectionSkillService: mockCollectionSkillService,
      };

      const executorWithSkills = createToolExecutor(contextWithSkills);

      const result = await executorWithSkills.execute('query_collection', {
        skill_key: '@customers',
        filter: { status: { _eq: 'active' } },
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockCollectionSkillService.queryCollection).toHaveBeenCalledWith({
        projectId: 1,
        skillKey: '@customers',
        filter: { status: { _eq: 'active' } },
        fields: undefined,
        limit: 10,
        sort: undefined,
      });
    });

    it('returns error when collection skill service is not available', async () => {
      const result = await executor.execute('query_collection', {
        skill_key: '@test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Collection skill service not available');
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool', async () => {
      const result = await executor.execute('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });
});
