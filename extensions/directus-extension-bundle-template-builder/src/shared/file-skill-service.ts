/**
 * File Skill Service
 *
 * Registers file uploads as blackboard skills so AI can read their content.
 */

import { SKILL_PREFIX, PRIORITY_MAP, isFileSkill } from './types';
import type { FileSkillValue, BlackboardEntry, Blackboard } from './types';

export interface RegisterFileSkillParams {
  projectId: number;
  fileId: string;
  skillKey: string;
  summary: string;
  pageCount?: number;
  extractedText?: string;
}

export interface RegisterFileSkillResult {
  success: boolean;
  skillKey?: string;
  error?: string;
}

export interface ReadFileContentParams {
  projectId: number;
  skillKey: string;
  query?: string;
  pages?: number[];
}

export interface ReadFileContentResult {
  success: boolean;
  content?: string;
  filename?: string;
  contentSource?: 'extracted_text' | 'summary';
  error?: string;
}

export interface UnregisterFileSkillParams {
  projectId: number;
  skillKey: string;
}

export interface UnregisterFileSkillResult {
  success: boolean;
  error?: string;
}

export interface FileSkillService {
  registerFileSkill(params: RegisterFileSkillParams): Promise<RegisterFileSkillResult>;
  readFileContent(params: ReadFileContentParams): Promise<ReadFileContentResult>;
  unregisterFileSkill(params: UnregisterFileSkillParams): Promise<UnregisterFileSkillResult>;
}

/**
 * Normalize skill key to start with @
 */
function normalizeSkillKey(key: string): string {
  return key.startsWith(SKILL_PREFIX) ? key : `${SKILL_PREFIX}${key}`;
}

/**
 * Create a FileSkillService instance
 */
export function createFileSkillService(
  ItemsServiceFactory: any,
  schema: any,
  accountability: any
): FileSkillService {
  // Create service instances
  const blackboardService = new ItemsServiceFactory('tb_blackboard', {
    schema,
    accountability,
  });

  const filesService = new ItemsServiceFactory('directus_files', {
    schema,
    accountability,
  });

  async function getBlackboard(projectId: number): Promise<Blackboard | null> {
    const results = await blackboardService.readByQuery({
      filter: { project_id: { _eq: projectId } },
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  }

  return {
    async registerFileSkill(params: RegisterFileSkillParams): Promise<RegisterFileSkillResult> {
      const { projectId, fileId, summary, pageCount, extractedText } = params;
      const skillKey = normalizeSkillKey(params.skillKey);

      try {
        // Get file info
        let fileInfo: { filename_download: string; type: string };
        try {
          fileInfo = await filesService.readOne(fileId);
        } catch (e: any) {
          return { success: false, error: `File not found: ${e.message}` };
        }

        // Get blackboard
        const blackboard = await getBlackboard(projectId);
        if (!blackboard) {
          return { success: false, error: 'Blackboard not found for project' };
        }

        // Create skill entry
        const skillValue: FileSkillValue = {
          type: 'file_skill',
          file_id: fileId,
          filename: fileInfo.filename_download,
          content_type: fileInfo.type,
          summary,
          ...(pageCount !== undefined && { page_count: pageCount }),
          ...(extractedText !== undefined && { extracted_text: extractedText }),
        };

        const entry: BlackboardEntry = {
          key: skillKey,
          value: skillValue,
          source_type: 'user_input',
          source_id: 'file_skill_registration',
          priority: PRIORITY_MAP['user_input'],
          timestamp: new Date().toISOString(),
        };

        // Update blackboard with new skill entry
        const updatedEntries = {
          ...blackboard.entries,
          [skillKey]: entry,
        };

        await blackboardService.updateOne(blackboard.id, {
          entries: updatedEntries,
        });

        return { success: true, skillKey };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },

    async readFileContent(params: ReadFileContentParams): Promise<ReadFileContentResult> {
      const { projectId } = params;
      const skillKey = normalizeSkillKey(params.skillKey);

      try {
        // Get blackboard
        const blackboard = await getBlackboard(projectId);
        if (!blackboard) {
          return { success: false, error: 'Blackboard not found for project' };
        }

        // Get skill entry
        const entry = blackboard.entries[skillKey];
        if (!entry) {
          return { success: false, error: `Skill "${skillKey}" not found on blackboard` };
        }

        // Verify it's a file skill
        if (!isFileSkill(entry)) {
          return { success: false, error: `"${skillKey}" is not a file skill` };
        }

        const fileSkill = entry.value;

        // Return extracted text if available, otherwise summary
        if (fileSkill.extracted_text) {
          return {
            success: true,
            content: fileSkill.extracted_text,
            filename: fileSkill.filename,
            contentSource: 'extracted_text',
          };
        } else {
          return {
            success: true,
            content: fileSkill.summary,
            filename: fileSkill.filename,
            contentSource: 'summary',
          };
        }
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },

    async unregisterFileSkill(params: UnregisterFileSkillParams): Promise<UnregisterFileSkillResult> {
      const { projectId } = params;
      const skillKey = normalizeSkillKey(params.skillKey);

      try {
        // Get blackboard
        const blackboard = await getBlackboard(projectId);
        if (!blackboard) {
          return { success: false, error: 'Blackboard not found for project' };
        }

        // Remove skill entry
        const { [skillKey]: removed, ...remainingEntries } = blackboard.entries;

        if (!removed) {
          return { success: false, error: `Skill "${skillKey}" not found on blackboard` };
        }

        await blackboardService.updateOne(blackboard.id, {
          entries: remainingEntries,
        });

        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },
  };
}
