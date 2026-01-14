/**
 * BlackboardService Tests
 *
 * TDD tests for the blackboard architecture.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlackboardService } from './blackboard-service';
import { PRIORITY_MAP } from './blackboard-types';

// Mock ItemsService
function createMockItemsService() {
  const store: Record<number, any> = {};
  let nextId = 1;

  return {
    store,
    readByQuery: vi.fn(async (query: any) => {
      const projectId = query.filter?.project_id?._eq;
      if (projectId && store[projectId]) {
        return [store[projectId]];
      }
      return [];
    }),
    createOne: vi.fn(async (data: any) => {
      const id = nextId++;
      store[data.project_id] = { id, ...data };
      return id;
    }),
    updateOne: vi.fn(async (id: number, data: any) => {
      // Find by id
      for (const projectId of Object.keys(store)) {
        if (store[Number(projectId)]?.id === id) {
          store[Number(projectId)] = { ...store[Number(projectId)], ...data };
          return;
        }
      }
    }),
    readOne: vi.fn(async (id: number) => {
      for (const projectId of Object.keys(store)) {
        if (store[Number(projectId)]?.id === id) {
          return store[Number(projectId)];
        }
      }
      return null;
    }),
  };
}

describe('BlackboardService', () => {
  let mockItemsService: ReturnType<typeof createMockItemsService>;
  let blackboard: BlackboardService;
  const projectId = 1;

  beforeEach(() => {
    mockItemsService = createMockItemsService();
    blackboard = new BlackboardService(mockItemsService);
  });

  describe('getOrCreate', () => {
    it('creates blackboard for new project', async () => {
      const bb = await blackboard.getOrCreate(projectId);

      expect(bb.project_id).toBe(projectId);
      expect(bb.entries).toEqual({});
      expect(bb.conflicts).toEqual([]);
      expect(mockItemsService.createOne).toHaveBeenCalled();
    });

    it('returns existing blackboard', async () => {
      // Create first
      const bb1 = await blackboard.getOrCreate(projectId);
      // Get again
      const bb2 = await blackboard.getOrCreate(projectId);

      expect(bb2.id).toBe(bb1.id);
      expect(mockItemsService.createOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('write', () => {
    it('writes new entry', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'task_1',
      });

      const bb = await blackboard.get(projectId);
      expect(bb?.entries.brand_name.value).toBe('Kenzai Puzzles');
      expect(bb?.entries.brand_name.priority).toBe(PRIORITY_MAP.user_input);
      expect(bb?.entries.brand_name.source_type).toBe('user_input');
    });

    it('higher priority overwrites lower', async () => {
      // Write with low priority first
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai',
        source_type: 'ai_inference',
        source_id: 'task_1',
      });

      // Write with high priority
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'task_2',
      });

      const bb = await blackboard.get(projectId);
      expect(bb?.entries.brand_name.value).toBe('Kenzai Puzzles');
    });

    it('lower priority does not overwrite higher', async () => {
      // Write with high priority first
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'task_1',
      });

      // Try to write with low priority
      const result = await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai',
        source_type: 'ai_inference',
        source_id: 'task_2',
      });

      expect(result).toBe(false);
      const bb = await blackboard.get(projectId);
      expect(bb?.entries.brand_name.value).toBe('Kenzai Puzzles');
    });

    it('equal priority uses later timestamp (overwrites)', async () => {
      await blackboard.write(projectId, 'summary', {
        value: 'First summary',
        source_type: 'ai_synthesis',
        source_id: 'task_1',
      });

      await blackboard.write(projectId, 'summary', {
        value: 'Better summary',
        source_type: 'ai_synthesis',
        source_id: 'task_2',
      });

      const bb = await blackboard.get(projectId);
      expect(bb?.entries.summary.value).toBe('Better summary');
    });

    it('user_correction has highest priority', async () => {
      // Write as user_input
      await blackboard.write(projectId, 'brand_name', {
        value: 'Wrong Name',
        source_type: 'user_input',
        source_id: 'form_1',
      });

      // Correct via sidebar
      await blackboard.write(projectId, 'brand_name', {
        value: 'Correct Name',
        source_type: 'user_correction',
        source_id: 'sidebar_correction',
      });

      const bb = await blackboard.get(projectId);
      expect(bb?.entries.brand_name.value).toBe('Correct Name');
      expect(bb?.entries.brand_name.priority).toBe(1000);
    });
  });

  describe('read', () => {
    it('reads single key', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai Puzzles',
        source_type: 'user_input',
        source_id: 'task_1',
      });

      const entry = await blackboard.read(projectId, 'brand_name');
      expect(entry?.value).toBe('Kenzai Puzzles');
    });

    it('returns null for missing key', async () => {
      await blackboard.getOrCreate(projectId);
      const entry = await blackboard.read(projectId, 'nonexistent');
      expect(entry).toBeNull();
    });

    it('returns null for nonexistent project', async () => {
      const entry = await blackboard.read(999, 'brand_name');
      expect(entry).toBeNull();
    });
  });

  describe('readMany', () => {
    it('reads multiple keys', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai',
        source_type: 'user_input',
        source_id: 't1',
      });
      await blackboard.write(projectId, 'industry', {
        value: 'Toys',
        source_type: 'user_input',
        source_id: 't1',
      });

      const entries = await blackboard.readMany(projectId, [
        'brand_name',
        'industry',
        'missing',
      ]);

      expect(entries.brand_name?.value).toBe('Kenzai');
      expect(entries.industry?.value).toBe('Toys');
      expect(entries.missing).toBeUndefined();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'X',
        source_type: 'user_input',
        source_id: 'form_1',
      });
      await blackboard.write(projectId, 'brand_story', {
        value: 'Y',
        source_type: 'ai_synthesis',
        source_id: 'task_2',
      });
      await blackboard.write(projectId, 'competitors', {
        value: 'Z',
        source_type: 'ai_synthesis',
        source_id: 'task_2',
      });
    });

    it('returns all entries matching prefix', async () => {
      const brandEntries = await blackboard.query(projectId, { prefix: 'brand_' });
      expect(Object.keys(brandEntries).sort()).toEqual(['brand_name', 'brand_story']);
    });

    it('returns all entries from source', async () => {
      const formEntries = await blackboard.query(projectId, { source_id: 'form_1' });
      expect(Object.keys(formEntries)).toEqual(['brand_name']);
    });

    it('returns all entries by source_type', async () => {
      const aiEntries = await blackboard.query(projectId, { source_type: 'ai_synthesis' });
      expect(Object.keys(aiEntries).sort()).toEqual(['brand_story', 'competitors']);
    });
  });

  describe('getValues', () => {
    it('returns simple key-value object', async () => {
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai',
        source_type: 'user_input',
        source_id: 't1',
      });
      await blackboard.write(projectId, 'industry', {
        value: 'Toys',
        source_type: 'user_input',
        source_id: 't1',
      });

      const values = await blackboard.getValues(projectId);

      expect(values).toEqual({
        brand_name: 'Kenzai',
        industry: 'Toys',
      });
    });
  });

  describe('conflicts', () => {
    it('adds conflict to blackboard', async () => {
      const conflictId = await blackboard.addConflict(projectId, {
        type: 'ambiguity',
        keys_involved: ['brand_name'],
        description: 'Found Kenzai Cosmetics but you entered Kenzai Puzzles',
        options: [
          {
            id: 'puzzles',
            label: 'Kenzai Puzzles (3D puzzles)',
            description: 'Use what I entered',
            writes: { brand_entity: 'Kenzai Puzzles' },
          },
          {
            id: 'cosmetics',
            label: 'Kenzai Cosmetics (skincare)',
            description: 'Use research finding',
            writes: { brand_entity: 'Kenzai Cosmetics' },
          },
        ],
        created_by_task: 'task_1',
      });

      expect(conflictId).toBeDefined();

      const bb = await blackboard.get(projectId);
      expect(bb?.conflicts).toHaveLength(1);
      expect(bb?.conflicts[0].status).toBe('pending');
    });

    it('gets pending conflicts', async () => {
      await blackboard.addConflict(projectId, {
        type: 'ambiguity',
        keys_involved: ['brand_name'],
        description: 'Test conflict',
        options: [],
        created_by_task: 'task_1',
      });

      const pending = await blackboard.getPendingConflicts(projectId);
      expect(pending).toHaveLength(1);
    });

    it('resolves conflict and writes chosen values', async () => {
      const conflictId = await blackboard.addConflict(projectId, {
        type: 'ambiguity',
        keys_involved: ['brand_name'],
        description: 'Test conflict',
        options: [
          {
            id: 'option_a',
            label: 'Option A',
            description: 'Choose A',
            writes: { brand_entity: 'Value A', verified: true },
          },
          {
            id: 'option_b',
            label: 'Option B',
            description: 'Choose B',
            writes: { brand_entity: 'Value B' },
          },
        ],
        created_by_task: 'task_1',
      });

      const result = await blackboard.resolveConflict(projectId, conflictId, 'option_a');

      expect(result).toBe(true);

      const bb = await blackboard.get(projectId);
      expect(bb?.conflicts[0].status).toBe('resolved');
      expect(bb?.conflicts[0].resolution?.chosen_option_id).toBe('option_a');
      expect(bb?.entries.brand_entity?.value).toBe('Value A');
      expect(bb?.entries.verified?.value).toBe(true);
    });

    it('resolves conflict with custom value', async () => {
      const conflictId = await blackboard.addConflict(projectId, {
        type: 'ambiguity',
        keys_involved: ['brand_name'],
        description: 'Test conflict',
        options: [
          { id: 'a', label: 'A', description: '', writes: {} },
        ],
        created_by_task: 'task_1',
      });

      const result = await blackboard.resolveConflictCustom(projectId, conflictId, {
        brand_name: 'Custom Value',
      });

      expect(result).toBe(true);

      const bb = await blackboard.get(projectId);
      expect(bb?.conflicts[0].status).toBe('resolved');
      expect(bb?.conflicts[0].resolution?.chosen_option_id).toBe('custom');
      expect(bb?.entries.brand_name?.value).toBe('Custom Value');
      expect(bb?.entries.brand_name?.source_type).toBe('user_correction');
      expect(bb?.entries.brand_name?.priority).toBe(1000);
    });

    it('returns false for nonexistent conflict', async () => {
      await blackboard.getOrCreate(projectId);
      const result = await blackboard.resolveConflict(projectId, 'fake-id', 'option_a');
      expect(result).toBe(false);
    });

    it('returns false for already resolved conflict', async () => {
      const conflictId = await blackboard.addConflict(projectId, {
        type: 'ambiguity',
        keys_involved: ['test'],
        description: 'Test',
        options: [{ id: 'a', label: 'A', description: '', writes: { x: 1 } }],
        created_by_task: 'task_1',
      });

      // Resolve once
      await blackboard.resolveConflict(projectId, conflictId, 'a');

      // Try to resolve again
      const result = await blackboard.resolveConflict(projectId, conflictId, 'a');
      expect(result).toBe(false);
    });
  });

  describe('writeMany', () => {
    it('writes multiple entries at once', async () => {
      const results = await blackboard.writeMany(projectId, {
        brand_name: { value: 'Kenzai', source_type: 'user_input', source_id: 'form' },
        industry: { value: 'Toys', source_type: 'user_input', source_id: 'form' },
        website: { value: 'https://example.com', source_type: 'user_input', source_id: 'form' },
      });

      expect(results.brand_name).toBe(true);
      expect(results.industry).toBe(true);
      expect(results.website).toBe(true);

      const values = await blackboard.getValues(projectId);
      expect(values.brand_name).toBe('Kenzai');
      expect(values.industry).toBe('Toys');
      expect(values.website).toBe('https://example.com');
    });
  });

  // Phase 4: Task Writes to Blackboard
  describe('writeTaskOutput', () => {
    it('writes task findings to blackboard with verified_scrape for website content', async () => {
      const taskOutput = {
        website_content: 'Kenzai Puzzles creates 3D mechanical puzzles...',
        competitors: ['Ugears', 'ROKR', 'Robotime'],
        market_position: 'Premium handcrafted segment',
      };

      await blackboard.writeTaskOutput(projectId, 'task_123', taskOutput, {
        hasScrapedWebsite: true,
      });

      const bb = await blackboard.get(projectId);
      expect(bb?.entries.website_content.value).toContain('3D mechanical puzzles');
      expect(bb?.entries.website_content.source_type).toBe('verified_scrape');
      expect(bb?.entries.website_content.source_id).toBe('task_123');
      expect(bb?.entries.competitors.value).toContain('Ugears');
      expect(bb?.entries.market_position.source_type).toBe('verified_scrape');
    });

    it('uses ai_synthesis for non-scrape research results', async () => {
      const taskOutput = {
        brand_summary: 'Kenzai is known for...',
        key_themes: ['quality', 'craftsmanship', 'innovation'],
      };

      await blackboard.writeTaskOutput(projectId, 'task_456', taskOutput, {
        hasScrapedWebsite: false,
        hasSearchResults: true,
      });

      const bb = await blackboard.get(projectId);
      expect(bb?.entries.brand_summary.source_type).toBe('ai_synthesis');
      expect(bb?.entries.key_themes.source_type).toBe('ai_synthesis');
    });

    it('uses ai_inference for pure AI generation', async () => {
      const taskOutput = {
        brand_story: 'Once upon a time...',
        tagline_suggestions: ['Craft Your World', 'Puzzle Your Way'],
      };

      await blackboard.writeTaskOutput(projectId, 'task_789', taskOutput, {
        hasScrapedWebsite: false,
        hasSearchResults: false,
      });

      const bb = await blackboard.get(projectId);
      expect(bb?.entries.brand_story.source_type).toBe('ai_inference');
      expect(bb?.entries.tagline_suggestions.source_type).toBe('ai_inference');
    });

    it('AI output does NOT overwrite user input', async () => {
      // User said industry is "Toys"
      await blackboard.write(projectId, 'industry', {
        value: 'Toys for teens and adults',
        source_type: 'user_input',
        source_id: 'form_1',
      });

      // AI tries to write different industry
      await blackboard.writeTaskOutput(projectId, 'task_123', {
        industry: 'Cosmetics', // Wrong!
      }, { hasScrapedWebsite: false });

      // User input should win
      const entry = await blackboard.read(projectId, 'industry');
      expect(entry?.value).toBe('Toys for teens and adults');
      expect(entry?.source_type).toBe('user_input');
    });

    it('AI output CAN overwrite other AI output of lower priority', async () => {
      // First AI infers something
      await blackboard.write(projectId, 'market_position', {
        value: 'Budget segment',
        source_type: 'ai_inference',
        source_id: 'task_1',
      });

      // AI synthesis (higher priority) writes different value
      await blackboard.writeTaskOutput(projectId, 'task_2', {
        market_position: 'Premium segment',
      }, { hasScrapedWebsite: false, hasSearchResults: true });

      const entry = await blackboard.read(projectId, 'market_position');
      expect(entry?.value).toBe('Premium segment');
      expect(entry?.source_type).toBe('ai_synthesis');
    });

    it('writes source_url when provided', async () => {
      await blackboard.writeTaskOutput(projectId, 'task_123', {
        website_content: 'Content from website...',
      }, {
        hasScrapedWebsite: true,
        sourceUrl: 'https://kenzaipuzzles.com',
      });

      const entry = await blackboard.read(projectId, 'website_content');
      expect(entry?.source_url).toBe('https://kenzaipuzzles.com');
    });

    it('writes based_on when derived from other keys', async () => {
      // First write some base data
      await blackboard.write(projectId, 'brand_name', {
        value: 'Kenzai',
        source_type: 'user_input',
        source_id: 'form_1',
      });

      await blackboard.writeTaskOutput(projectId, 'task_123', {
        brand_summary: 'Summary of Kenzai brand...',
      }, {
        hasSearchResults: true,
        basedOnKeys: ['brand_name', 'website_content'],
      });

      const entry = await blackboard.read(projectId, 'brand_summary');
      expect(entry?.based_on).toEqual(['brand_name', 'website_content']);
    });

    it('returns which entries were written vs skipped', async () => {
      // Pre-populate with user input (high priority)
      await blackboard.write(projectId, 'industry', {
        value: 'Toys',
        source_type: 'user_input',
        source_id: 'form_1',
      });

      const result = await blackboard.writeTaskOutput(projectId, 'task_123', {
        industry: 'Different Industry', // Should be skipped
        competitors: ['A', 'B', 'C'], // Should be written
        brand_summary: 'New summary', // Should be written
      }, { hasSearchResults: true });

      expect(result.written).toContain('competitors');
      expect(result.written).toContain('brand_summary');
      expect(result.skipped).toContain('industry');
    });
  });
});
