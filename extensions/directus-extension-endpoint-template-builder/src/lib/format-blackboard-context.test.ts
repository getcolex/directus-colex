import { describe, it, expect } from 'vitest';
import { formatBlackboardContext } from './format-blackboard-context';

describe('formatBlackboardContext', () => {
  it('formats static values as key-value pairs', () => {
    const entries = {
      brand_name: {
        key: 'brand_name',
        value: 'Acme Corp',
        source_type: 'user_input' as const,
        source_id: 'form_1',
        priority: 100,
        timestamp: '2025-01-15T00:00:00Z',
      },
    };

    const result = formatBlackboardContext(entries);

    expect(result).toContain('## Project Context');
    expect(result).toContain('brand_name');
    expect(result).toContain('Acme Corp');
  });

  it('formats file skills with summary and invoke instruction', () => {
    const entries = {
      '@brand_guidelines': {
        key: '@brand_guidelines' as const,
        value: {
          type: 'file_skill' as const,
          file_id: 'abc123',
          filename: 'brand-guidelines.pdf',
          content_type: 'application/pdf',
          summary: 'Brand voice and color guidelines',
          page_count: 12,
        },
        source_type: 'user_input' as const,
        source_id: 'upload_1',
        priority: 100,
        timestamp: '2025-01-15T00:00:00Z',
      },
    };

    const result = formatBlackboardContext(entries);

    expect(result).toContain('## Available File Skills');
    expect(result).toContain('@brand_guidelines');
    expect(result).toContain('Brand voice and color guidelines');
    expect(result).toContain('read_file');
  });

  it('formats collection skills with schema info', () => {
    const entries = {
      '@customers': {
        key: '@customers' as const,
        value: {
          type: 'collection_skill' as const,
          collection: 'customers',
          summary: 'Customer records',
          row_count: 2847,
          schema: { name: { type: 'string' }, email: { type: 'string' } },
        },
        source_type: 'user_input' as const,
        source_id: 'config_1',
        priority: 100,
        timestamp: '2025-01-15T00:00:00Z',
      },
    };

    const result = formatBlackboardContext(entries);

    expect(result).toContain('## Available Collection Skills');
    expect(result).toContain('@customers');
    expect(result).toContain('2,847');
    expect(result).toContain('query_collection');
  });
});
