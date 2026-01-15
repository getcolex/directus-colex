/**
 * Tool Definitions Tests
 */

import { describe, it, expect } from 'vitest';
import { ANTHROPIC_TOOLS, ToolName } from './tools';

describe('ANTHROPIC_TOOLS', () => {
  it('should have 9 tools defined', () => {
    expect(ANTHROPIC_TOOLS).toHaveLength(9);
  });

  it('should have all required tool names', () => {
    const names = ANTHROPIC_TOOLS.map((t) => t.name);
    expect(names).toContain('update_task');
    expect(names).toContain('create_task');
    expect(names).toContain('delete_task');
    expect(names).toContain('activate_task');
    expect(names).toContain('reorder_task');
    expect(names).toContain('submit_form');
    expect(names).toContain('enrich_output');
    expect(names).toContain('read_file');
    expect(names).toContain('query_collection');
  });

  it('should have valid input_schema for each tool', () => {
    for (const tool of ANTHROPIC_TOOLS) {
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.properties).toBeDefined();
    }
  });

  it('should have descriptions for each tool', () => {
    for (const tool of ANTHROPIC_TOOLS) {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  describe('update_task', () => {
    it('requires taskId and data', () => {
      const tool = ANTHROPIC_TOOLS.find((t) => t.name === 'update_task');
      expect(tool?.input_schema.required).toContain('taskId');
      expect(tool?.input_schema.required).toContain('data');
    });
  });

  describe('create_task', () => {
    it('requires name', () => {
      const tool = ANTHROPIC_TOOLS.find((t) => t.name === 'create_task');
      expect(tool?.input_schema.required).toContain('name');
    });
  });

  describe('read_file', () => {
    it('requires skill_key', () => {
      const tool = ANTHROPIC_TOOLS.find((t) => t.name === 'read_file');
      expect(tool?.input_schema.required).toContain('skill_key');
    });
  });

  describe('query_collection', () => {
    it('requires skill_key', () => {
      const tool = ANTHROPIC_TOOLS.find((t) => t.name === 'query_collection');
      expect(tool?.input_schema.required).toContain('skill_key');
    });
  });
});
