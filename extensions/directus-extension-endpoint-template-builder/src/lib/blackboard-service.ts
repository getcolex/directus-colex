/**
 * BlackboardService
 *
 * Core service for reading/writing to the project blackboard.
 * Implements priority-based resolution: higher priority values win.
 */

import { randomUUID } from 'crypto';
import {
  Blackboard,
  BlackboardEntry,
  Conflict,
  PRIORITY_MAP,
  QueryParams,
  SourceType,
  WriteEntryParams,
} from './blackboard-types';

export class BlackboardService {
  private itemsService: any;

  constructor(itemsService: any) {
    this.itemsService = itemsService;
  }

  /**
   * Get or create a blackboard for a project
   */
  async getOrCreate(projectId: number): Promise<Blackboard> {
    // Try to find existing blackboard
    const existing = await this.itemsService.readByQuery({
      filter: { project_id: { _eq: projectId } },
      limit: 1,
    });

    if (existing.length > 0) {
      return this.normalizeBlackboard(existing[0]);
    }

    // Create new blackboard
    const newId = await this.itemsService.createOne({
      project_id: projectId,
      entries: {},
      conflicts: [],
    });

    return {
      id: newId,
      project_id: projectId,
      entries: {},
      conflicts: [],
    };
  }

  /**
   * Get blackboard for a project (returns null if not found)
   */
  async get(projectId: number): Promise<Blackboard | null> {
    const existing = await this.itemsService.readByQuery({
      filter: { project_id: { _eq: projectId } },
      limit: 1,
    });

    if (existing.length === 0) {
      return null;
    }

    return this.normalizeBlackboard(existing[0]);
  }

  /**
   * Write an entry to the blackboard
   * Only overwrites if new priority >= existing priority
   */
  async write(projectId: number, key: string, params: WriteEntryParams): Promise<boolean> {
    const bb = await this.getOrCreate(projectId);
    const existing = bb.entries[key];
    const newPriority = PRIORITY_MAP[params.source_type];

    // Only write if:
    // 1. No existing entry, OR
    // 2. New priority is >= existing priority
    if (existing && newPriority < existing.priority) {
      return false; // Lower priority, don't overwrite
    }

    const entry: BlackboardEntry = {
      key,
      value: params.value,
      source_type: params.source_type,
      source_id: params.source_id,
      source_url: params.source_url,
      based_on: params.based_on,
      priority: newPriority,
      timestamp: new Date().toISOString(),
    };

    bb.entries[key] = entry;
    await this.save(bb);
    return true;
  }

  /**
   * Write multiple entries at once
   */
  async writeMany(
    projectId: number,
    entries: Record<string, WriteEntryParams>
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [key, params] of Object.entries(entries)) {
      results[key] = await this.write(projectId, key, params);
    }
    return results;
  }

  /**
   * Read a single entry from the blackboard
   */
  async read(projectId: number, key: string): Promise<BlackboardEntry | null> {
    const bb = await this.get(projectId);
    if (!bb) return null;
    return bb.entries[key] || null;
  }

  /**
   * Read multiple entries from the blackboard
   */
  async readMany(
    projectId: number,
    keys: string[]
  ): Promise<Record<string, BlackboardEntry>> {
    const bb = await this.get(projectId);
    if (!bb) return {};

    const result: Record<string, BlackboardEntry> = {};
    for (const key of keys) {
      if (bb.entries[key]) {
        result[key] = bb.entries[key];
      }
    }
    return result;
  }

  /**
   * Query entries by prefix or source
   */
  async query(projectId: number, params: QueryParams): Promise<Record<string, BlackboardEntry>> {
    const bb = await this.get(projectId);
    if (!bb) return {};

    const result: Record<string, BlackboardEntry> = {};

    for (const [key, entry] of Object.entries(bb.entries)) {
      let matches = true;

      if (params.prefix && !key.startsWith(params.prefix)) {
        matches = false;
      }
      if (params.source_id && entry.source_id !== params.source_id) {
        matches = false;
      }
      if (params.source_type && entry.source_type !== params.source_type) {
        matches = false;
      }

      if (matches) {
        result[key] = entry;
      }
    }

    return result;
  }

  /**
   * Get all values as a simple key-value object (for task context)
   */
  async getValues(projectId: number): Promise<Record<string, any>> {
    const bb = await this.get(projectId);
    if (!bb) return {};

    const result: Record<string, any> = {};
    for (const [key, entry] of Object.entries(bb.entries)) {
      result[key] = entry.value;
    }
    return result;
  }

  /**
   * Options for writeTaskOutput
   */
  /**
   * Write task output to blackboard with appropriate source type
   *
   * Determines source_type based on how the data was obtained:
   * - verified_scrape (priority 80): Data scraped from brand's own website
   * - ai_synthesis (priority 40): Data combined from multiple search sources
   * - ai_inference (priority 20): Data generated purely by AI
   *
   * Will NOT overwrite user_input (priority 100) or user_correction (priority 1000)
   */
  async writeTaskOutput(
    projectId: number,
    taskId: string,
    output: Record<string, any>,
    options: {
      hasScrapedWebsite?: boolean;
      hasSearchResults?: boolean;
      sourceUrl?: string;
      basedOnKeys?: string[];
    } = {}
  ): Promise<{ written: string[]; skipped: string[] }> {
    const { hasScrapedWebsite, hasSearchResults, sourceUrl, basedOnKeys } = options;

    // Determine source type based on how data was obtained
    let sourceType: SourceType;
    if (hasScrapedWebsite) {
      sourceType = 'verified_scrape';
    } else if (hasSearchResults) {
      sourceType = 'ai_synthesis';
    } else {
      sourceType = 'ai_inference';
    }

    const written: string[] = [];
    const skipped: string[] = [];

    for (const [key, value] of Object.entries(output)) {
      // Skip null/undefined values
      if (value === null || value === undefined) continue;

      const success = await this.write(projectId, key, {
        value,
        source_type: sourceType,
        source_id: taskId,
        source_url: sourceUrl,
        based_on: basedOnKeys,
      });

      if (success) {
        written.push(key);
      } else {
        skipped.push(key);
      }
    }

    return { written, skipped };
  }

  /**
   * Add a conflict to the blackboard
   */
  async addConflict(projectId: number, conflict: Omit<Conflict, 'id' | 'status'>): Promise<string> {
    const bb = await this.getOrCreate(projectId);
    const id = randomUUID();

    const fullConflict: Conflict = {
      ...conflict,
      id,
      status: 'pending',
    };

    bb.conflicts.push(fullConflict);
    await this.save(bb);
    return id;
  }

  /**
   * Get pending conflicts for a project
   */
  async getPendingConflicts(projectId: number): Promise<Conflict[]> {
    const bb = await this.get(projectId);
    if (!bb) return [];
    return bb.conflicts.filter((c) => c.status === 'pending');
  }

  /**
   * Resolve a conflict by choosing an option
   */
  async resolveConflict(
    projectId: number,
    conflictId: string,
    optionId: string,
    resolvedBy: 'user' | 'auto' = 'user'
  ): Promise<boolean> {
    const bb = await this.get(projectId);
    if (!bb) return false;

    const conflict = bb.conflicts.find((c) => c.id === conflictId);
    if (!conflict || conflict.status !== 'pending') return false;

    const option = conflict.options.find((o) => o.id === optionId);
    if (!option) return false;

    // Mark conflict as resolved
    conflict.status = 'resolved';
    conflict.resolution = {
      chosen_option_id: optionId,
      resolved_by: resolvedBy,
      timestamp: new Date().toISOString(),
    };

    // Write the chosen values to the blackboard
    const sourceType: SourceType = resolvedBy === 'user' ? 'user_verified' : 'ai_synthesis';
    for (const [key, value] of Object.entries(option.writes)) {
      bb.entries[key] = {
        key,
        value,
        source_type: sourceType,
        source_id: `conflict_${conflictId}`,
        priority: PRIORITY_MAP[sourceType],
        timestamp: new Date().toISOString(),
      };
    }

    await this.save(bb);
    return true;
  }

  /**
   * Resolve a conflict with a custom value (not from predefined options)
   */
  async resolveConflictCustom(
    projectId: number,
    conflictId: string,
    customWrites: Record<string, any>
  ): Promise<boolean> {
    const bb = await this.get(projectId);
    if (!bb) return false;

    const conflict = bb.conflicts.find((c) => c.id === conflictId);
    if (!conflict || conflict.status !== 'pending') return false;

    // Mark conflict as resolved with custom
    conflict.status = 'resolved';
    conflict.resolution = {
      chosen_option_id: 'custom',
      resolved_by: 'user',
      timestamp: new Date().toISOString(),
    };

    // Write custom values with user_correction priority (highest)
    for (const [key, value] of Object.entries(customWrites)) {
      bb.entries[key] = {
        key,
        value,
        source_type: 'user_correction',
        source_id: `conflict_${conflictId}_custom`,
        priority: PRIORITY_MAP['user_correction'],
        timestamp: new Date().toISOString(),
      };
    }

    await this.save(bb);
    return true;
  }

  /**
   * Save blackboard to database
   */
  private async save(bb: Blackboard): Promise<void> {
    await this.itemsService.updateOne(bb.id, {
      entries: bb.entries,
      conflicts: bb.conflicts,
    });
  }

  /**
   * Normalize raw database record to Blackboard type
   */
  private normalizeBlackboard(raw: any): Blackboard {
    return {
      id: raw.id,
      project_id: raw.project_id,
      entries: raw.entries || {},
      conflicts: raw.conflicts || [],
      date_created: raw.date_created,
      date_updated: raw.date_updated,
    };
  }
}

/**
 * Create a BlackboardService instance from Directus context
 */
export function createBlackboardService(
  ItemsService: any,
  schema: any,
  accountability: any
): BlackboardService {
  const itemsService = new ItemsService('tb_blackboard', { schema, accountability });
  return new BlackboardService(itemsService);
}
