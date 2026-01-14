import { describe, it, expect, vi } from 'vitest';
import { persistAgentResults } from './persistAgentResults';

describe('persistAgentResults', () => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  const mockGetSchema = vi.fn().mockResolvedValue({});

  const createMockServices = (options: {
    createOneResult?: string;
    readByQueryResult?: any[];
    updateOneResult?: any;
  } = {}) => {
    const mockItemsService = {
      createOne: vi.fn().mockResolvedValue(options.createOneResult || 'new-record-id'),
      readByQuery: vi.fn().mockResolvedValue(options.readByQueryResult || []),
      updateOne: vi.fn().mockResolvedValue(options.updateOneResult || {}),
    };
    // Create a mock class that can be instantiated with `new`
    const MockItemsService = function() {
      return mockItemsService;
    } as any;
    return {
      ItemsService: MockItemsService,
      _mockItemsService: mockItemsService,
    };
  };

  describe('workflow agent - update mode', () => {
    it('returns items_created=1 when creating a new record without project_id', async () => {
      const services = createMockServices({ createOneResult: 'created-id-123' });

      const agent = { agent_type: 'workflow' };
      const requestBody = {
        task: { output_collection: 'market_study_typed', output_mode: 'update' },
      };
      const agentResponse = {
        update: { market_size: '$500B', growth_rate: '20%' },
        output_mode: 'update',
      };
      const context = {
        services,
        schema: {},
        accountability: { admin: true },
        run: 'run-123',
        logger: mockLogger,
        traceId: 'trace-123',
        getSchema: mockGetSchema,
      };

      const result = await persistAgentResults(agent, requestBody, agentResponse, context);

      expect(result.items_created).toBe(1);
      expect(result.items_updated).toBe(0);
    });

    it('returns items_updated=1 when updating existing record with project_id', async () => {
      const services = createMockServices({
        readByQueryResult: [{ id: 'existing-id-456' }],
      });

      const agent = { agent_type: 'workflow' };
      const requestBody = {
        task: { output_collection: 'market_study_typed', output_mode: 'update' },
        context: { project_id: 'project-123' },
      };
      const agentResponse = {
        update: { market_size: '$600B', growth_rate: '25%' },
        output_mode: 'update',
      };
      const context = {
        services,
        schema: {},
        accountability: { admin: true },
        run: 'run-123',
        logger: mockLogger,
        traceId: 'trace-123',
        getSchema: mockGetSchema,
      };

      const result = await persistAgentResults(agent, requestBody, agentResponse, context);

      expect(result.items_created).toBe(0);
      expect(result.items_updated).toBe(1);
    });

    it('returns items_created=1 when creating new record with project_id (no existing)', async () => {
      const services = createMockServices({
        readByQueryResult: [], // No existing record
        createOneResult: 'new-id-789',
      });

      const agent = { agent_type: 'workflow' };
      const requestBody = {
        task: { output_collection: 'market_study_typed', output_mode: 'update' },
        context: { project_id: 'project-123' },
      };
      const agentResponse = {
        update: { market_size: '$700B' },
        output_mode: 'update',
      };
      const context = {
        services,
        schema: {},
        accountability: { admin: true },
        run: 'run-123',
        logger: mockLogger,
        traceId: 'trace-123',
        getSchema: mockGetSchema,
      };

      const result = await persistAgentResults(agent, requestBody, agentResponse, context);

      expect(result.items_created).toBe(1);
      expect(result.items_updated).toBe(0);
    });
  });

  describe('workflow agent - records mode', () => {
    it('returns items_created count matching number of records created', async () => {
      const services = createMockServices();

      const agent = { agent_type: 'workflow' };
      const requestBody = {
        task: { output_collection: 'brand_inspirations', output_mode: 'records' },
      };
      const agentResponse = {
        records: [
          { title: 'Inspiration 1' },
          { title: 'Inspiration 2' },
          { title: 'Inspiration 3' },
        ],
        output_mode: 'records',
      };
      const context = {
        services,
        schema: {},
        accountability: { admin: true },
        run: 'run-123',
        logger: mockLogger,
        traceId: 'trace-123',
        getSchema: mockGetSchema,
      };

      const result = await persistAgentResults(agent, requestBody, agentResponse, context);

      expect(result.items_created).toBe(3);
      expect(result.items_updated).toBe(0);
    });
  });

  describe('no data to persist', () => {
    it('returns zeros when no update data provided', async () => {
      const services = createMockServices();

      const agent = { agent_type: 'workflow' };
      const requestBody = {
        task: { output_collection: 'test_collection', output_mode: 'update' },
      };
      const agentResponse = {
        update: {}, // Empty update
        output_mode: 'update',
      };
      const context = {
        services,
        schema: {},
        accountability: { admin: true },
        run: 'run-123',
        logger: mockLogger,
        traceId: 'trace-123',
        getSchema: mockGetSchema,
      };

      const result = await persistAgentResults(agent, requestBody, agentResponse, context);

      expect(result.items_created).toBe(0);
      expect(result.items_updated).toBe(0);
    });
  });
});
