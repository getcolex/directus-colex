/**
 * Conflict Detection Tests
 *
 * TDD tests for detecting contradictions and ambiguities
 * between user input and AI findings.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectConflicts, stringSimilarity, industriesMatch } from './conflict-detector';
import { Blackboard, PRIORITY_MAP } from './types';

describe('Conflict Detection', () => {
  describe('stringSimilarity', () => {
    it('returns 1 for identical strings', () => {
      expect(stringSimilarity('Kenzai Puzzles', 'Kenzai Puzzles')).toBe(1);
    });

    it('returns 1 for case-insensitive matches', () => {
      expect(stringSimilarity('kenzai puzzles', 'KENZAI PUZZLES')).toBe(1);
    });

    it('returns high similarity for near matches', () => {
      expect(stringSimilarity('Kenzai Puzzles', 'Kenzai Puzzle')).toBeGreaterThan(0.8);
    });

    it('returns low similarity for different strings', () => {
      expect(stringSimilarity('Kenzai Puzzles', 'Kenzai Cosmetics')).toBeLessThan(0.7);
    });

    it('handles empty strings', () => {
      expect(stringSimilarity('', '')).toBe(1);
      expect(stringSimilarity('test', '')).toBe(0);
    });
  });

  describe('industriesMatch', () => {
    it('returns true for identical industries', () => {
      expect(industriesMatch('Toys', 'Toys')).toBe(true);
    });

    it('returns true for case-insensitive matches', () => {
      expect(industriesMatch('toys', 'TOYS')).toBe(true);
    });

    it('returns true for substring matches', () => {
      expect(industriesMatch('Toys', 'Toys for teens and adults')).toBe(true);
      expect(industriesMatch('Toys for teens', 'Toys')).toBe(true);
    });

    it('returns true for known equivalents', () => {
      expect(industriesMatch('Toys', 'Puzzles')).toBe(true);
      expect(industriesMatch('Toys', 'Games')).toBe(true);
      expect(industriesMatch('Cosmetics', 'Skincare')).toBe(true);
      expect(industriesMatch('Cosmetics', 'Beauty')).toBe(true);
    });

    it('returns false for unrelated industries', () => {
      expect(industriesMatch('Toys', 'Cosmetics')).toBe(false);
      expect(industriesMatch('Puzzles', 'Skincare')).toBe(false);
    });
  });

  describe('detectConflicts', () => {
    let blackboard: Blackboard;

    beforeEach(() => {
      blackboard = {
        id: 1,
        project_id: 1,
        entries: {},
        conflicts: [],
      };
    });

    describe('entity mismatch detection', () => {
      it('detects when research finds different entity than user input', () => {
        // User entered "Kenzai Puzzles"
        blackboard.entries.brand_name = {
          key: 'brand_name',
          value: 'Kenzai Puzzles',
          source_type: 'user_input',
          source_id: 'form_1',
          priority: PRIORITY_MAP.user_input,
          timestamp: new Date().toISOString(),
        };

        // Research found "Kenzai Cosmetics"
        const researchFindings = {
          entity_found: 'Kenzai Cosmetics',
          entity_industry: 'Skincare',
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].type).toBe('ambiguity');
        expect(conflicts[0].keys_involved).toContain('brand_name');
        expect(conflicts[0].description).toContain('Kenzai Cosmetics');
        expect(conflicts[0].description).toContain('Kenzai Puzzles');
        expect(conflicts[0].options).toHaveLength(2);
        expect(conflicts[0].created_by_task).toBe('task_123');
      });

      it('does not create conflict when entities match', () => {
        blackboard.entries.brand_name = {
          key: 'brand_name',
          value: 'Kenzai Puzzles',
          source_type: 'user_input',
          source_id: 'form_1',
          priority: PRIORITY_MAP.user_input,
          timestamp: new Date().toISOString(),
        };

        const researchFindings = {
          entity_found: 'Kenzai Puzzles',
          entity_industry: '3D Mechanical Puzzles',
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        expect(conflicts).toHaveLength(0);
      });

      it('does not create conflict when no user input exists', () => {
        const researchFindings = {
          entity_found: 'Kenzai Cosmetics',
          entity_industry: 'Skincare',
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        expect(conflicts).toHaveLength(0);
      });

      it('handles similar but not identical names gracefully', () => {
        blackboard.entries.brand_name = {
          key: 'brand_name',
          value: 'Kenzai Puzzles Inc',
          source_type: 'user_input',
          source_id: 'form_1',
          priority: PRIORITY_MAP.user_input,
          timestamp: new Date().toISOString(),
        };

        const researchFindings = {
          entity_found: 'Kenzai Puzzles', // Same entity, slightly different name
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        // Should not flag as conflict - names are similar enough
        expect(conflicts).toHaveLength(0);
      });
    });

    describe('industry mismatch detection', () => {
      it('detects when research finds different industry than user input', () => {
        blackboard.entries.industry = {
          key: 'industry',
          value: 'Toys for teens and adults',
          source_type: 'user_input',
          source_id: 'form_1',
          priority: PRIORITY_MAP.user_input,
          timestamp: new Date().toISOString(),
        };

        const researchFindings = {
          entity_industry: 'Cosmetics',
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].type).toBe('contradiction');
        expect(conflicts[0].keys_involved).toContain('industry');
        expect(conflicts[0].description).toContain('Toys');
        expect(conflicts[0].description).toContain('Cosmetics');
      });

      it('does not create conflict for related industries', () => {
        blackboard.entries.industry = {
          key: 'industry',
          value: 'Toys',
          source_type: 'user_input',
          source_id: 'form_1',
          priority: PRIORITY_MAP.user_input,
          timestamp: new Date().toISOString(),
        };

        const researchFindings = {
          entity_industry: 'Puzzles', // Related to toys
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        expect(conflicts).toHaveLength(0);
      });
    });

    describe('conflict options', () => {
      it('creates options that write verified values', () => {
        blackboard.entries.brand_name = {
          key: 'brand_name',
          value: 'Kenzai Puzzles',
          source_type: 'user_input',
          source_id: 'form_1',
          priority: PRIORITY_MAP.user_input,
          timestamp: new Date().toISOString(),
        };

        const researchFindings = {
          entity_found: 'Kenzai Cosmetics',
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        // First option: use user input
        expect(conflicts[0].options[0].label).toContain('Kenzai Puzzles');
        expect(conflicts[0].options[0].writes.brand_entity).toBe('Kenzai Puzzles');
        expect(conflicts[0].options[0].writes.brand_entity_verified).toBe(true);

        // Second option: use research finding
        expect(conflicts[0].options[1].label).toContain('Kenzai Cosmetics');
        expect(conflicts[0].options[1].writes.brand_entity).toBe('Kenzai Cosmetics');
      });

      it('includes disambiguation note in options', () => {
        blackboard.entries.brand_name = {
          key: 'brand_name',
          value: 'Kenzai Puzzles',
          source_type: 'user_input',
          source_id: 'form_1',
          priority: PRIORITY_MAP.user_input,
          timestamp: new Date().toISOString(),
        };

        const researchFindings = {
          entity_found: 'Kenzai Cosmetics',
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        // User input option should note the disambiguation
        expect(conflicts[0].options[0].writes.disambiguation).toBe('Not Kenzai Cosmetics');
      });
    });

    describe('multiple conflicts', () => {
      it('detects both entity and industry mismatch', () => {
        blackboard.entries.brand_name = {
          key: 'brand_name',
          value: 'Kenzai Puzzles',
          source_type: 'user_input',
          source_id: 'form_1',
          priority: PRIORITY_MAP.user_input,
          timestamp: new Date().toISOString(),
        };
        blackboard.entries.industry = {
          key: 'industry',
          value: 'Toys',
          source_type: 'user_input',
          source_id: 'form_1',
          priority: PRIORITY_MAP.user_input,
          timestamp: new Date().toISOString(),
        };

        const researchFindings = {
          entity_found: 'Kenzai Cosmetics',
          entity_industry: 'Skincare',
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        expect(conflicts).toHaveLength(2);
        expect(conflicts.map((c) => c.type)).toContain('ambiguity');
        expect(conflicts.map((c) => c.type)).toContain('contradiction');
      });
    });

    describe('ignores AI-sourced entries', () => {
      it('only compares against user_input entries', () => {
        // AI inferred brand name
        blackboard.entries.brand_name = {
          key: 'brand_name',
          value: 'Kenzai Puzzles',
          source_type: 'ai_inference',
          source_id: 'task_1',
          priority: PRIORITY_MAP.ai_inference,
          timestamp: new Date().toISOString(),
        };

        // Research finds different entity
        const researchFindings = {
          entity_found: 'Kenzai Cosmetics',
        };

        const conflicts = detectConflicts(blackboard, researchFindings, 'task_123');

        // No conflict - we only flag contradictions with user input
        expect(conflicts).toHaveLength(0);
      });
    });
  });
});
