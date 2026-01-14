import { describe, it, expect } from 'vitest';
import { ANTHROPIC_TOOLS, ToolName } from './definitions';

describe('Skill Tools', () => {
  it('includes read_file tool', () => {
    const tool = ANTHROPIC_TOOLS.find((t) => t.name === 'read_file');
    expect(tool).toBeDefined();
    expect(tool?.input_schema.properties).toHaveProperty('skill_key');
    expect(tool?.input_schema.properties).toHaveProperty('query');
    expect(tool?.input_schema.required).toContain('skill_key');
  });

  it('includes query_collection tool', () => {
    const tool = ANTHROPIC_TOOLS.find((t) => t.name === 'query_collection');
    expect(tool).toBeDefined();
    expect(tool?.input_schema.properties).toHaveProperty('skill_key');
    expect(tool?.input_schema.properties).toHaveProperty('filter');
    expect(tool?.input_schema.properties).toHaveProperty('fields');
    expect(tool?.input_schema.properties).toHaveProperty('limit');
    expect(tool?.input_schema.required).toContain('skill_key');
  });

  it('ToolName type includes skill tools', () => {
    const validNames: ToolName[] = ['read_file', 'query_collection'];
    expect(validNames).toHaveLength(2);
  });
});
