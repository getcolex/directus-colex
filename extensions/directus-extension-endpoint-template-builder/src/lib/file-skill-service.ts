import { SKILL_PREFIX, FileSkillValue } from './blackboard-types';
import { BlackboardService } from './blackboard-service';

export interface RegisterFileParams {
  projectId: number;
  fileId: string;
  skillKey: string;
  summary: string;
  pageCount?: number;
}

export interface RegisterFileResult {
  success: boolean;
  key?: string;
  error?: string;
}

export interface ReadFileOptions {
  projectId: number;
  query?: string;
  pages?: number[];
  full?: boolean;
}

export class FileSkillService {
  constructor(
    private filesService: any,
    private projectFilesService: any,
    private blackboardService: BlackboardService
  ) {}

  async registerFileAsSkill(params: RegisterFileParams): Promise<RegisterFileResult> {
    const { projectId, fileId, skillKey, summary, pageCount } = params;

    const key = skillKey.startsWith(SKILL_PREFIX)
      ? skillKey
      : `${SKILL_PREFIX}${skillKey}`;

    try {
      const file = await this.filesService.readOne(fileId);

      const skillValue: FileSkillValue = {
        type: 'file_skill',
        file_id: fileId,
        filename: file.filename_download,
        content_type: file.type,
        summary,
        page_count: pageCount,
      };

      await this.blackboardService.write(projectId, key, {
        value: skillValue,
        source_type: 'user_input',
        source_id: `file_upload_${fileId}`,
      });

      return { success: true, key };
    } catch (error) {
      return {
        success: false,
        error: `File not found or inaccessible: ${error}`,
      };
    }
  }

  async readFileContent(
    skillKey: string,
    options: ReadFileOptions
  ): Promise<{ content: string; truncated: boolean }> {
    // TODO: Implement file content reading
    return {
      content: 'File content will be loaded here',
      truncated: false,
    };
  }
}
