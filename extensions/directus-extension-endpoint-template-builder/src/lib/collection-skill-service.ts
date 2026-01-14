import { SKILL_PREFIX, CollectionSkillValue } from './blackboard-types';
import { BlackboardService } from './blackboard-service';

const MAX_QUERY_LIMIT = 100;

export interface RegisterCollectionParams {
  projectId: number;
  collection: string;
  skillKey: string;
  summary: string;
  allowedFields?: string[];
}

export interface RegisterCollectionResult {
  success: boolean;
  key?: string;
  error?: string;
}

export interface QueryCollectionOptions {
  projectId: number;
  filter?: Record<string, any>;
  fields?: string[];
  limit?: number;
  sort?: string[];
}

export interface QueryCollectionResult {
  data: any[];
  count: number;
  truncated: boolean;
}

export interface SchemaInspector {
  getCollectionInfo(collection: string): Promise<{ fields: Array<{ field: string; type: string }> }>;
  getRowCount(collection: string): Promise<number>;
}

export class CollectionSkillService {
  constructor(
    private itemsServiceFactory: (collection: string) => any,
    private blackboardService: BlackboardService,
    private schemaInspector: SchemaInspector
  ) {}

  async registerCollectionAsSkill(
    params: RegisterCollectionParams
  ): Promise<RegisterCollectionResult> {
    const { projectId, collection, skillKey, summary, allowedFields } = params;

    const key = skillKey.startsWith(SKILL_PREFIX)
      ? skillKey
      : `${SKILL_PREFIX}${skillKey}`;

    try {
      const collectionInfo = await this.schemaInspector.getCollectionInfo(collection);
      const rowCount = await this.schemaInspector.getRowCount(collection);

      const schema: Record<string, { type: string }> = {};
      for (const field of collectionInfo.fields) {
        if (!allowedFields || allowedFields.includes(field.field)) {
          schema[field.field] = { type: field.type };
        }
      }

      const skillValue: CollectionSkillValue = {
        type: 'collection_skill',
        collection,
        summary,
        row_count: rowCount,
        schema,
      };

      await this.blackboardService.write(projectId, key, {
        value: skillValue,
        source_type: 'user_input',
        source_id: `collection_config_${collection}`,
      });

      return { success: true, key };
    } catch (error) {
      return {
        success: false,
        error: `Failed to register collection: ${error}`,
      };
    }
  }

  async queryCollection(
    skillKey: string,
    options: QueryCollectionOptions
  ): Promise<QueryCollectionResult> {
    const collectionName = skillKey.replace(SKILL_PREFIX, '');
    const limit = Math.min(options.limit || 10, MAX_QUERY_LIMIT);

    const service = this.itemsServiceFactory(collectionName);
    const data = await service.readByQuery({
      filter: options.filter,
      fields: options.fields,
      limit,
      sort: options.sort,
    });

    return {
      data,
      count: data.length,
      truncated: data.length >= limit,
    };
  }
}
