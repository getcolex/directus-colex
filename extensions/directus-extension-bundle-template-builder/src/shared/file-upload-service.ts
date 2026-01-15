/**
 * File Upload Service
 *
 * Business logic for uploading files to projects.
 * Handles multipart parsing, Directus file upload, and project file record creation.
 */

import { parseMultipartRequest } from './multipart-parser';

export interface FileUploadParams {
  projectId: number;
}

export interface UploadedProjectFile {
  id: number;
  project_id: number;
  task_id: number | null;
  file_type: string;
  date_created?: string;
  file: {
    id: string;
    filename_download: string;
    title?: string;
    type: string;
    filesize: number;
  } | null;
}

export interface FileUploadResult {
  success: boolean;
  projectFile?: UploadedProjectFile;
  error?: string;
}

const VALID_FILE_TYPES = ['input', 'template'] as const;
type FileType = (typeof VALID_FILE_TYPES)[number];

/**
 * Service for handling file uploads to projects.
 * Uses constructor-injected Directus services.
 */
export class FileUploadService {
  constructor(
    private filesService: any,
    private projectFilesService: any,
    private projectsService: any
  ) {}

  /**
   * Upload a file from a multipart request.
   *
   * @param req - Request stream with headers
   * @param params - Upload parameters including projectId
   * @returns Result with success status and project file or error
   */
  async uploadFromRequest(
    req: NodeJS.ReadableStream & { headers: Record<string, string> },
    params: FileUploadParams
  ): Promise<FileUploadResult> {
    // Verify project exists
    try {
      await this.projectsService.readOne(params.projectId);
    } catch {
      return { success: false, error: 'Project not found' };
    }

    // Parse multipart request
    const parsed = await parseMultipartRequest(req);

    // Validate file_type if provided
    const fileType = (parsed.fields.file_type || 'input') as FileType;
    if (!VALID_FILE_TYPES.includes(fileType)) {
      return { success: false, error: 'file_type must be "input" or "template"' };
    }

    // Check for file
    if (!parsed.file) {
      return { success: false, error: 'No file uploaded' };
    }

    // Parse task_id if provided
    const taskId = parsed.fields.task_id ? parseInt(parsed.fields.task_id, 10) : null;

    // Upload file to Directus
    const fileId = await this.filesService.uploadOne(parsed.file.stream, {
      filename_download: parsed.file.filename,
      type: parsed.file.mimeType,
      storage: 'local',
    });

    // Create project file junction record
    const projectFileId = await this.projectFilesService.createOne({
      project_id: params.projectId,
      file_id: fileId,
      file_type: fileType,
      task_id: taskId,
    });

    // Fetch complete record with file details
    const completeRecord = await this.projectFilesService.readOne(projectFileId, {
      fields: ['*', 'file_id.*'],
    });

    // Transform to response format
    const projectFile: UploadedProjectFile = {
      id: completeRecord.id,
      project_id: completeRecord.project_id,
      task_id: completeRecord.task_id || null,
      file_type: completeRecord.file_type,
      date_created: completeRecord.date_created,
      file: completeRecord.file_id
        ? {
            id: completeRecord.file_id.id || completeRecord.file_id,
            filename_download: completeRecord.file_id.filename_download,
            title: completeRecord.file_id.title,
            type: completeRecord.file_id.type,
            filesize: completeRecord.file_id.filesize,
          }
        : null,
    };

    return { success: true, projectFile };
  }
}

/**
 * Factory function to create FileUploadService from Directus context.
 */
export function createFileUploadService(
  services: { FilesService: any; ItemsService: any },
  schema: any,
  accountability: any
): FileUploadService {
  const { FilesService, ItemsService } = services;

  const filesService = new FilesService({ schema, accountability });
  const projectFilesService = new ItemsService('tb_project_files', { schema, accountability });
  const projectsService = new ItemsService('tb_projects', { schema, accountability });

  return new FileUploadService(filesService, projectFilesService, projectsService);
}
