/**
 * Tests for multipart-parser
 *
 * Tests the busboy wrapper that parses multipart/form-data requests.
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { parseMultipartRequest } from './multipart-parser';

describe('parseMultipartRequest', () => {
  it('extracts fields from multipart request', async () => {
    const req = createMockMultipartReq({
      fields: { file_type: 'template', task_id: '5' },
      hasFile: false,
    });

    const result = await parseMultipartRequest(req);

    expect(result.fields.file_type).toBe('template');
    expect(result.fields.task_id).toBe('5');
    expect(result.file).toBeNull();
  });

  it('extracts file metadata and provides stream', async () => {
    const req = createMockMultipartReq({
      hasFile: true,
      filename: 'report.pdf',
      mimeType: 'application/pdf',
    });

    const result = await parseMultipartRequest(req);

    expect(result.file).not.toBeNull();
    expect(result.file!.filename).toBe('report.pdf');
    expect(result.file!.mimeType).toBe('application/pdf');
  });

  it('returns null file when no file in request', async () => {
    const req = createMockMultipartReq({ hasFile: false });

    const result = await parseMultipartRequest(req);

    expect(result.file).toBeNull();
  });

  it('handles file content in the stream', async () => {
    const fileContent = Buffer.from('test file content');
    const req = createMockMultipartReq({
      hasFile: true,
      filename: 'test.txt',
      mimeType: 'text/plain',
      fileContent,
    });

    const result = await parseMultipartRequest(req);

    expect(result.file).not.toBeNull();
    expect(result.file!.stream).toBeDefined();
  });

  it('handles multiple fields', async () => {
    const req = createMockMultipartReq({
      fields: {
        file_type: 'input',
        task_id: '10',
        register_skill: 'true',
      },
      hasFile: true,
    });

    const result = await parseMultipartRequest(req);

    expect(result.fields.file_type).toBe('input');
    expect(result.fields.task_id).toBe('10');
    expect(result.fields.register_skill).toBe('true');
  });
});

/**
 * Helper to create mock multipart requests for testing.
 * Generates valid multipart/form-data formatted body.
 */
function createMockMultipartReq(options: {
  hasFile?: boolean;
  filename?: string;
  mimeType?: string;
  fileContent?: Buffer;
  fields?: Record<string, string>;
}): NodeJS.ReadableStream & { headers: Record<string, string> } {
  const {
    hasFile = true,
    filename = 'test.txt',
    mimeType = 'text/plain',
    fileContent = Buffer.from('test'),
    fields = {},
  } = options;

  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];

  // Add fields
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${value}\r\n`
      )
    );
  }

  // Add file
  if (hasFile) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: ${mimeType}\r\n\r\n`
      )
    );
    parts.push(fileContent);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  // Create readable stream from body
  const stream = new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });

  // Attach headers to the stream
  return Object.assign(stream, {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
  });
}
