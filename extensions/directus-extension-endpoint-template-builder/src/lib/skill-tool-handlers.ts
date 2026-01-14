import { isFileSkill, isCollectionSkill } from './blackboard-types';
import { FileSkillService } from './file-skill-service';
import { CollectionSkillService } from './collection-skill-service';
import { BlackboardService } from './blackboard-service';

export interface ReadFileInput {
  skill_key: string;
  query?: string;
  pages?: number[];
}

export interface ReadFileContext {
  projectId: number;
  fileSkillService: FileSkillService;
  blackboardService: BlackboardService;
}

export interface ReadFileResult {
  success: boolean;
  content?: string;
  filename?: string;
  truncated?: boolean;
  error?: string;
}

export async function handleReadFile(
  input: ReadFileInput,
  context: ReadFileContext
): Promise<ReadFileResult> {
  const { skill_key, query, pages } = input;
  const { projectId, fileSkillService, blackboardService } = context;

  const entry = await blackboardService.read(projectId, skill_key);

  if (!entry) {
    return {
      success: false,
      error: `Skill "${skill_key}" not found on blackboard`,
    };
  }

  if (!isFileSkill(entry)) {
    return {
      success: false,
      error: `"${skill_key}" is not a file skill (type: ${entry.value?.type})`,
    };
  }

  const result = await fileSkillService.readFileContent(skill_key, {
    projectId,
    query,
    pages,
  });

  return {
    success: true,
    content: result.content,
    filename: entry.value.filename,
    truncated: result.truncated,
  };
}

export interface QueryCollectionInput {
  skill_key: string;
  filter?: Record<string, any>;
  fields?: string[];
  limit?: number;
  sort?: string[];
}

export interface QueryCollectionContext {
  projectId: number;
  collectionSkillService: CollectionSkillService;
  blackboardService: BlackboardService;
}

export interface QueryCollectionResult {
  success: boolean;
  data?: any[];
  count?: number;
  truncated?: boolean;
  error?: string;
}

export async function handleQueryCollection(
  input: QueryCollectionInput,
  context: QueryCollectionContext
): Promise<QueryCollectionResult> {
  const { skill_key, filter, fields, limit, sort } = input;
  const { projectId, collectionSkillService, blackboardService } = context;

  const entry = await blackboardService.read(projectId, skill_key);

  if (!entry) {
    return {
      success: false,
      error: `Skill "${skill_key}" not found on blackboard`,
    };
  }

  if (!isCollectionSkill(entry)) {
    return {
      success: false,
      error: `"${skill_key}" is not a collection skill (type: ${entry.value?.type})`,
    };
  }

  const result = await collectionSkillService.queryCollection(skill_key, {
    projectId,
    filter,
    fields,
    limit,
    sort,
  });

  return {
    success: true,
    data: result.data,
    count: result.count,
    truncated: result.truncated,
  };
}
