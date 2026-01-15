import { describe, it, expect } from 'vitest';
import {
  FileSkillEntry,
  CollectionSkillEntry,
  isFileSkill,
  isCollectionSkill,
  isSkill,
  SKILL_PREFIX,
  PRIORITY_MAP,
} from './types';

describe('Blackboard Skill Types', () => {
  describe('SKILL_PREFIX', () => {
    it('should be @ symbol', () => {
      expect(SKILL_PREFIX).toBe('@');
    });
  });

  describe('PRIORITY_MAP', () => {
    it('should have user_correction as highest priority', () => {
      expect(PRIORITY_MAP['user_correction']).toBe(1000);
    });

    it('should have ai_inference as lowest priority', () => {
      expect(PRIORITY_MAP['ai_inference']).toBe(20);
    });

    it('should have correct ordering', () => {
      expect(PRIORITY_MAP['user_input']).toBeGreaterThan(PRIORITY_MAP['ai_synthesis']);
      expect(PRIORITY_MAP['verified_scrape']).toBeGreaterThan(PRIORITY_MAP['external_scrape']);
    });
  });

  describe('isFileSkill', () => {
    it('returns true for file skill entries', () => {
      const entry: FileSkillEntry = {
        key: '@brand_guidelines',
        value: {
          type: 'file_skill',
          file_id: 'abc123',
          filename: 'brand-guidelines.pdf',
          content_type: 'application/pdf',
          summary: 'Brand voice and color guidelines',
          page_count: 12,
        },
        source_type: 'user_input',
        source_id: 'upload_123',
        priority: 100,
        timestamp: new Date().toISOString(),
      };
      expect(isFileSkill(entry)).toBe(true);
    });

    it('returns false for regular entries', () => {
      const entry = {
        key: 'brand_name',
        value: 'Acme Corp',
        source_type: 'user_input',
        source_id: 'form_1',
        priority: 100,
        timestamp: new Date().toISOString(),
      };
      expect(isFileSkill(entry)).toBe(false);
    });

    it('returns false for entries without @ prefix', () => {
      const entry = {
        key: 'brand_guidelines',
        value: { type: 'file_skill', file_id: 'abc' },
        source_type: 'user_input',
        source_id: 'upload_123',
        priority: 100,
        timestamp: new Date().toISOString(),
      };
      expect(isFileSkill(entry)).toBe(false);
    });
  });

  describe('isCollectionSkill', () => {
    it('returns true for collection skill entries', () => {
      const entry: CollectionSkillEntry = {
        key: '@customers',
        value: {
          type: 'collection_skill',
          collection: 'customers',
          summary: '2,847 customer records',
          row_count: 2847,
          schema: {
            name: { type: 'string' },
            email: { type: 'string' },
            plan: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
          },
        },
        source_type: 'user_input',
        source_id: 'admin_config',
        priority: 100,
        timestamp: new Date().toISOString(),
      };
      expect(isCollectionSkill(entry)).toBe(true);
    });

    it('returns false for file skills', () => {
      const entry = {
        key: '@brand_guidelines',
        value: { type: 'file_skill', file_id: 'abc' },
        source_type: 'user_input',
        source_id: 'upload_123',
        priority: 100,
        timestamp: new Date().toISOString(),
      };
      expect(isCollectionSkill(entry)).toBe(false);
    });
  });

  describe('isSkill', () => {
    it('returns true for file skills', () => {
      const entry: FileSkillEntry = {
        key: '@docs',
        value: {
          type: 'file_skill',
          file_id: 'xyz',
          filename: 'docs.pdf',
          content_type: 'application/pdf',
          summary: 'Documentation',
        },
        source_type: 'user_input',
        source_id: 'upload',
        priority: 100,
        timestamp: new Date().toISOString(),
      };
      expect(isSkill(entry)).toBe(true);
    });

    it('returns true for collection skills', () => {
      const entry: CollectionSkillEntry = {
        key: '@products',
        value: {
          type: 'collection_skill',
          collection: 'products',
          summary: '100 products',
          row_count: 100,
          schema: { name: { type: 'string' } },
        },
        source_type: 'user_input',
        source_id: 'config',
        priority: 100,
        timestamp: new Date().toISOString(),
      };
      expect(isSkill(entry)).toBe(true);
    });

    it('returns false for regular entries', () => {
      const entry = {
        key: 'brand_name',
        value: 'Test',
        source_type: 'user_input',
        source_id: 'form',
        priority: 100,
        timestamp: new Date().toISOString(),
      };
      expect(isSkill(entry)).toBe(false);
    });
  });
});
