/**
 * Sort Order Utility Tests
 *
 * TDD tests for gap-based integer sort ordering.
 * Uses gaps of 1000 between items, renumbers when gaps exhausted.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSortOrder,
  needsRenumber,
  renumberSortOrders,
  DEFAULT_GAP,
} from './sort-order';

describe('sort-order', () => {
  describe('calculateSortOrder', () => {
    describe('position: first', () => {
      it('returns DEFAULT_GAP when no tasks exist', () => {
        const result = calculateSortOrder([], 'first');
        expect(result).toBe(DEFAULT_GAP);
      });

      it('returns first task sort_order minus DEFAULT_GAP', () => {
        const tasks = [
          { id: 1, sort_order: 1000 },
          { id: 2, sort_order: 2000 },
        ];
        const result = calculateSortOrder(tasks, 'first');
        expect(result).toBe(1000 - DEFAULT_GAP); // 0
      });

      it('handles negative sort_orders', () => {
        const tasks = [
          { id: 1, sort_order: -500 },
          { id: 2, sort_order: 500 },
        ];
        const result = calculateSortOrder(tasks, 'first');
        expect(result).toBe(-500 - DEFAULT_GAP); // -1500
      });
    });

    describe('position: last', () => {
      it('returns DEFAULT_GAP when no tasks exist', () => {
        const result = calculateSortOrder([], 'last');
        expect(result).toBe(DEFAULT_GAP);
      });

      it('returns last task sort_order plus DEFAULT_GAP', () => {
        const tasks = [
          { id: 1, sort_order: 1000 },
          { id: 2, sort_order: 2000 },
        ];
        const result = calculateSortOrder(tasks, 'last');
        expect(result).toBe(2000 + DEFAULT_GAP); // 3000
      });
    });

    describe('position: before', () => {
      it('returns midpoint between previous task and target', () => {
        const tasks = [
          { id: 1, sort_order: 1000 },
          { id: 2, sort_order: 2000 },
          { id: 3, sort_order: 3000 },
        ];
        // Insert before task 2 (sort_order 2000)
        // Midpoint between 1000 and 2000 = 1500
        const result = calculateSortOrder(tasks, 'before', 2);
        expect(result).toBe(1500);
      });

      it('returns target minus DEFAULT_GAP when target is first', () => {
        const tasks = [
          { id: 1, sort_order: 1000 },
          { id: 2, sort_order: 2000 },
        ];
        // Insert before task 1 (first task)
        const result = calculateSortOrder(tasks, 'before', 1);
        expect(result).toBe(1000 - DEFAULT_GAP); // 0
      });

      it('returns integer (floors the midpoint)', () => {
        const tasks = [
          { id: 1, sort_order: 1000 },
          { id: 2, sort_order: 1001 }, // Gap of 1
        ];
        // Midpoint would be 1000.5, should floor to 1000
        const result = calculateSortOrder(tasks, 'before', 2);
        expect(result).toBe(1000);
        expect(Number.isInteger(result)).toBe(true);
      });

      it('throws when target task not found', () => {
        const tasks = [{ id: 1, sort_order: 1000 }];
        expect(() => calculateSortOrder(tasks, 'before', 999)).toThrow(
          'Target task 999 not found'
        );
      });
    });

    describe('position: after', () => {
      it('returns midpoint between target and next task', () => {
        const tasks = [
          { id: 1, sort_order: 1000 },
          { id: 2, sort_order: 2000 },
          { id: 3, sort_order: 3000 },
        ];
        // Insert after task 2 (sort_order 2000)
        // Midpoint between 2000 and 3000 = 2500
        const result = calculateSortOrder(tasks, 'after', 2);
        expect(result).toBe(2500);
      });

      it('returns target plus DEFAULT_GAP when target is last', () => {
        const tasks = [
          { id: 1, sort_order: 1000 },
          { id: 2, sort_order: 2000 },
        ];
        // Insert after task 2 (last task)
        const result = calculateSortOrder(tasks, 'after', 2);
        expect(result).toBe(2000 + DEFAULT_GAP); // 3000
      });

      it('returns integer (floors the midpoint)', () => {
        const tasks = [
          { id: 1, sort_order: 1000 },
          { id: 2, sort_order: 1001 }, // Gap of 1
        ];
        // Midpoint would be 1000.5, should floor to 1000
        const result = calculateSortOrder(tasks, 'after', 1);
        expect(result).toBe(1000);
        expect(Number.isInteger(result)).toBe(true);
      });

      it('throws when target task not found', () => {
        const tasks = [{ id: 1, sort_order: 1000 }];
        expect(() => calculateSortOrder(tasks, 'after', 999)).toThrow(
          'Target task 999 not found'
        );
      });
    });

    it('throws for invalid position', () => {
      expect(() => calculateSortOrder([], 'invalid' as any)).toThrow(
        'Invalid position'
      );
    });
  });

  describe('needsRenumber', () => {
    it('returns false when gap is sufficient', () => {
      const tasks = [
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 2000 },
      ];
      // Inserting before task 2: midpoint is 1500, gap is 500 on each side
      expect(needsRenumber(tasks, 'before', 2)).toBe(false);
    });

    it('returns true when gap is 1 or less (before)', () => {
      const tasks = [
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 1001 },
      ];
      // Gap of 1 means we can't insert between
      expect(needsRenumber(tasks, 'before', 2)).toBe(true);
    });

    it('returns true when gap is 1 or less (after)', () => {
      const tasks = [
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 1001 },
      ];
      // Gap of 1 means we can't insert between
      expect(needsRenumber(tasks, 'after', 1)).toBe(true);
    });

    it('returns false for first/last positions', () => {
      const tasks = [
        { id: 1, sort_order: 1000 },
        { id: 2, sort_order: 1001 },
      ];
      // first/last always have room (subtract/add DEFAULT_GAP)
      expect(needsRenumber(tasks, 'first')).toBe(false);
      expect(needsRenumber(tasks, 'last')).toBe(false);
    });

    it('returns false for empty task list', () => {
      expect(needsRenumber([], 'before', 1)).toBe(false);
      expect(needsRenumber([], 'after', 1)).toBe(false);
    });
  });

  describe('renumberSortOrders', () => {
    it('assigns sort_orders with DEFAULT_GAP spacing', () => {
      const tasks = [
        { id: 3, sort_order: 5 },
        { id: 1, sort_order: 10 },
        { id: 2, sort_order: 11 },
      ];
      const result = renumberSortOrders(tasks);
      expect(result).toEqual([
        { id: 3, sort_order: DEFAULT_GAP },      // 1000
        { id: 1, sort_order: DEFAULT_GAP * 2 },  // 2000
        { id: 2, sort_order: DEFAULT_GAP * 3 },  // 3000
      ]);
    });

    it('preserves original order (by current sort_order)', () => {
      const tasks = [
        { id: 2, sort_order: 200 },
        { id: 1, sort_order: 100 },
        { id: 3, sort_order: 300 },
      ];
      const result = renumberSortOrders(tasks);
      // Should maintain order: id 1 (100), id 2 (200), id 3 (300)
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
      expect(result[2].id).toBe(3);
    });

    it('returns empty array for empty input', () => {
      expect(renumberSortOrders([])).toEqual([]);
    });

    it('handles single task', () => {
      const tasks = [{ id: 1, sort_order: 999 }];
      const result = renumberSortOrders(tasks);
      expect(result).toEqual([{ id: 1, sort_order: DEFAULT_GAP }]);
    });
  });
});
