/**
 * Collection Skill Service
 *
 * Registers Directus collections as blackboard skills so AI can query them.
 */

import { SKILL_PREFIX, PRIORITY_MAP, isCollectionSkill } from './types';
import type { CollectionSkillValue, BlackboardEntry, Blackboard } from './types';

export interface RegisterCollectionSkillParams {
  projectId: number;
  collection: string;
  skillKey: string;
  summary: string;
}

export interface RegisterCollectionSkillResult {
  success: boolean;
  skillKey?: string;
  error?: string;
}

export interface QueryCollectionParams {
  projectId: number;
  skillKey: string;
  filter?: Record<string, any>;
  fields?: string[];
  limit?: number;
  sort?: string[];
}

export interface QueryCollectionResult {
  success: boolean;
  data?: any[];
  error?: string;
}

export interface UnregisterCollectionSkillParams {
  projectId: number;
  skillKey: string;
}

export interface UnregisterCollectionSkillResult {
  success: boolean;
  error?: string;
}

export interface CollectionSkillService {
  registerCollectionSkill(params: RegisterCollectionSkillParams): Promise<RegisterCollectionSkillResult>;
  queryCollection(params: QueryCollectionParams): Promise<QueryCollectionResult>;
  unregisterCollectionSkill(params: UnregisterCollectionSkillParams): Promise<UnregisterCollectionSkillResult>;
}

const MAX_QUERY_LIMIT = 100;
const DEFAULT_QUERY_LIMIT = 10;

/**
 * Normalize skill key to start with @
 */
function normalizeSkillKey(key: string): string {
  return key.startsWith(SKILL_PREFIX) ? key : `${SKILL_PREFIX}${key}`;
}

/**
 * Extract schema info from Directus collection schema
 */
function extractSchema(
  collectionSchema: any
): Record<string, { type: string; enum?: string[] }> {
  const schema: Record<string, { type: string; enum?: string[] }> = {};

  if (!collectionSchema?.fields) return schema;

  for (const [fieldName, fieldDef] of Object.entries(collectionSchema.fields)) {
    const field = fieldDef as any;
    const fieldSchema: { type: string; enum?: string[] } = {
      type: field.type || 'unknown',
    };

    // Extract enum values if present
    const choices = field.meta?.options?.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      fieldSchema.enum = choices.map((c: any) => c.value);
    }

    schema[fieldName] = fieldSchema;
  }

  return schema;
}

/**
 * Create a CollectionSkillService instance
 */
export function createCollectionSkillService(
  ItemsServiceFactory: any,
  schema: any,
  accountability: any
): CollectionSkillService {
  // Create blackboard service
  const blackboardService = new ItemsServiceFactory('tb_blackboard', {
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
    async registerCollectionSkill(params: RegisterCollectionSkillParams): Promise<RegisterCollectionSkillResult> {
      const { projectId, collection, summary } = params;
      const skillKey = normalizeSkillKey(params.skillKey);

      try {
        // Verify collection exists in schema
        const collectionSchema = schema.collections?.[collection];
        if (!collectionSchema) {
          return { success: false, error: `Collection "${collection}" not found in schema` };
        }

        // Get row count
        const collectionService = new ItemsServiceFactory(collection, {
          schema,
          accountability,
        });

        const countResult = await collectionService.readByQuery({
          aggregate: { count: '*' },
          limit: 1,
        });
        const rowCount = countResult[0]?.count || 0;

        // Get blackboard
        const blackboard = await getBlackboard(projectId);
        if (!blackboard) {
          return { success: false, error: 'Blackboard not found for project' };
        }

        // Extract schema
        const collectionSchemaInfo = extractSchema(collectionSchema);

        // Create skill entry
        const skillValue: CollectionSkillValue = {
          type: 'collection_skill',
          collection,
          summary,
          row_count: rowCount,
          schema: collectionSchemaInfo,
        };

        const entry: BlackboardEntry = {
          key: skillKey,
          value: skillValue,
          source_type: 'user_input',
          source_id: 'collection_skill_registration',
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

    async queryCollection(params: QueryCollectionParams): Promise<QueryCollectionResult> {
      const { projectId, filter, fields, sort } = params;
      const skillKey = normalizeSkillKey(params.skillKey);
      const limit = Math.min(params.limit || DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);

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

        // Verify it's a collection skill
        if (!isCollectionSkill(entry)) {
          return { success: false, error: `"${skillKey}" is not a collection skill` };
        }

        const collectionSkill = entry.value;

        // Query the collection
        const collectionService = new ItemsServiceFactory(collectionSkill.collection, {
          schema,
          accountability,
        });

        const queryOptions: any = {
          limit,
        };

        if (filter) queryOptions.filter = filter;
        if (fields) queryOptions.fields = fields;
        if (sort) queryOptions.sort = sort;

        const data = await collectionService.readByQuery(queryOptions);

        return { success: true, data };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    },

    async unregisterCollectionSkill(params: UnregisterCollectionSkillParams): Promise<UnregisterCollectionSkillResult> {
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
