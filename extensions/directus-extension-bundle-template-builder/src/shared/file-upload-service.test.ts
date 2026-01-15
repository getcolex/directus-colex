/**
 * Tests for file-upload-service
 *
 * Tests the business logic for uploading files to projects.
 * Uses mocks for Directus services and multipart parser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileUploadService } from './file-upload-service';

// Mock the multipart parser
vi.mock('./multipart-parser', () => ({
  parseMultipartRequest: vi.fn(),
}));

import { parseMultipartRequest } from './multipart-parser';

describe('FileUploadService', () => {
  let service: FileUploadService;
  let mockFilesService: any;
  let mockProjectFilesService: any;
  let mockProjectsService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFilesService = { uploadOne: vi.fn() };
    mockProjectFilesService = { createOne: vi.fn(), readOne: vi.fn() };
    mockProjectsService = { readOne: vi.fn() };
    service = new FileUploadService(
      mockFilesService,
      mockProjectFilesService,
      mockProjectsService
    );
  });

  it('returns error when project does not exist', async () => {
    mockProjectsService.readOne.mockRejectedValue(new Error('Not found'));

    const result = await service.uploadFromRequest({} as any, { projectId: 999 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Project not found');
  });

  it('returns error when no file is uploaded', async () => {
    mockProjectsService.readOne.mockResolvedValue({ id: 1 });
    (parseMultipartRequest as any).mockResolvedValue({ fields: {}, file: null });

    const result = await service.uploadFromRequest({} as any, { projectId: 1 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No file uploaded');
  });

  it('returns error for invalid file_type', async () => {
    mockProjectsService.readOne.mockResolvedValue({ id: 1 });
    (parseMultipartRequest as any).mockResolvedValue({
      fields: { file_type: 'invalid_type' },
      file: { filename: 'test.pdf', mimeType: 'application/pdf', stream: {} },
    });

    const result = await service.uploadFromRequest({} as any, { projectId: 1 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('file_type must be "input" or "template"');
  });

  it('uploads file and creates project_file record', async () => {
    const mockFileId = 'uploaded-file-uuid';
    const mockProjectFileId = 42;
    const mockStream = { pipe: vi.fn() };

    mockProjectsService.readOne.mockResolvedValue({ id: 1 });
    mockFilesService.uploadOne.mockResolvedValue(mockFileId);
    mockProjectFilesService.createOne.mockResolvedValue(mockProjectFileId);
    mockProjectFilesService.readOne.mockResolvedValue({
      id: mockProjectFileId,
      project_id: 1,
      task_id: null,
      file_type: 'input',
      date_created: '2025-01-15T00:00:00Z',
      file_id: {
        id: mockFileId,
        filename_download: 'test.pdf',
        title: 'Test PDF',
        type: 'application/pdf',
        filesize: 1024,
      },
    });

    (parseMultipartRequest as any).mockResolvedValue({
      fields: { file_type: 'input' },
      file: { filename: 'test.pdf', mimeType: 'application/pdf', stream: mockStream },
    });

    const result = await service.uploadFromRequest({} as any, { projectId: 1 });

    expect(result.success).toBe(true);
    expect(result.projectFile?.file?.filename_download).toBe('test.pdf');
    expect(mockFilesService.uploadOne).toHaveBeenCalledWith(
      mockStream,
      expect.objectContaining({
        filename_download: 'test.pdf',
        type: 'application/pdf',
        storage: 'local',
      })
    );
  });

  it('defaults to input file_type when not provided', async () => {
    mockProjectsService.readOne.mockResolvedValue({ id: 1 });
    mockFilesService.uploadOne.mockResolvedValue('file-id');
    mockProjectFilesService.createOne.mockResolvedValue(1);
    mockProjectFilesService.readOne.mockResolvedValue({
      id: 1,
      project_id: 1,
      file_type: 'input',
      file_id: { id: 'file-id', filename_download: 'x.pdf', type: 'application/pdf', filesize: 100 },
    });

    (parseMultipartRequest as any).mockResolvedValue({
      fields: {}, // No file_type
      file: { filename: 'x.pdf', mimeType: 'application/pdf', stream: {} },
    });

    await service.uploadFromRequest({} as any, { projectId: 1 });

    expect(mockProjectFilesService.createOne).toHaveBeenCalledWith(
      expect.objectContaining({ file_type: 'input' })
    );
  });

  it('passes template file_type when specified', async () => {
    mockProjectsService.readOne.mockResolvedValue({ id: 1 });
    mockFilesService.uploadOne.mockResolvedValue('file-id');
    mockProjectFilesService.createOne.mockResolvedValue(1);
    mockProjectFilesService.readOne.mockResolvedValue({
      id: 1,
      project_id: 1,
      file_type: 'template',
      file_id: {},
    });

    (parseMultipartRequest as any).mockResolvedValue({
      fields: { file_type: 'template' },
      file: { filename: 'x.pdf', mimeType: 'application/pdf', stream: {} },
    });

    await service.uploadFromRequest({} as any, { projectId: 1 });

    expect(mockProjectFilesService.createOne).toHaveBeenCalledWith(
      expect.objectContaining({ file_type: 'template' })
    );
  });

  it('passes task_id when provided', async () => {
    mockProjectsService.readOne.mockResolvedValue({ id: 1 });
    mockFilesService.uploadOne.mockResolvedValue('file-id');
    mockProjectFilesService.createOne.mockResolvedValue(1);
    mockProjectFilesService.readOne.mockResolvedValue({
      id: 1,
      project_id: 1,
      task_id: 5,
      file_id: {},
    });

    (parseMultipartRequest as any).mockResolvedValue({
      fields: { task_id: '5' },
      file: { filename: 'x.pdf', mimeType: 'application/pdf', stream: {} },
    });

    await service.uploadFromRequest({} as any, { projectId: 1 });

    expect(mockProjectFilesService.createOne).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: 5 })
    );
  });

  it('passes null task_id when not provided', async () => {
    mockProjectsService.readOne.mockResolvedValue({ id: 1 });
    mockFilesService.uploadOne.mockResolvedValue('file-id');
    mockProjectFilesService.createOne.mockResolvedValue(1);
    mockProjectFilesService.readOne.mockResolvedValue({
      id: 1,
      project_id: 1,
      task_id: null,
      file_id: {},
    });

    (parseMultipartRequest as any).mockResolvedValue({
      fields: {},
      file: { filename: 'x.pdf', mimeType: 'application/pdf', stream: {} },
    });

    await service.uploadFromRequest({} as any, { projectId: 1 });

    expect(mockProjectFilesService.createOne).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: null })
    );
  });

  it('returns complete project file with file details', async () => {
    mockProjectsService.readOne.mockResolvedValue({ id: 1 });
    mockFilesService.uploadOne.mockResolvedValue('file-uuid');
    mockProjectFilesService.createOne.mockResolvedValue(42);
    mockProjectFilesService.readOne.mockResolvedValue({
      id: 42,
      project_id: 1,
      task_id: 3,
      file_type: 'template',
      date_created: '2025-01-15T12:00:00Z',
      file_id: {
        id: 'file-uuid',
        filename_download: 'report.docx',
        title: 'Report',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filesize: 2048,
      },
    });

    (parseMultipartRequest as any).mockResolvedValue({
      fields: { file_type: 'template', task_id: '3' },
      file: {
        filename: 'report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        stream: {},
      },
    });

    const result = await service.uploadFromRequest({} as any, { projectId: 1 });

    expect(result.success).toBe(true);
    expect(result.projectFile).toEqual({
      id: 42,
      project_id: 1,
      task_id: 3,
      file_type: 'template',
      date_created: '2025-01-15T12:00:00Z',
      file: {
        id: 'file-uuid',
        filename_download: 'report.docx',
        title: 'Report',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filesize: 2048,
      },
    });
  });
});
