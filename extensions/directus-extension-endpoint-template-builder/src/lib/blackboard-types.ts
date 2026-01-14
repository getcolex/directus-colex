/**
 * Blackboard Architecture Types
 *
 * Shared knowledge space for data flow between tasks.
 * Based on Han & Zhang 2025 paper on LLM Multi-Agent Systems.
 */

export type SourceType =
  | 'user_correction'   // priority: 1000 - User explicitly fixed via sidebar
  | 'user_input'        // priority: 100  - Original form data
  | 'user_verified'     // priority: 90   - User confirmed AI finding
  | 'verified_scrape'   // priority: 80   - Scraped from their own website
  | 'external_scrape'   // priority: 60   - Scraped from third party
  | 'ai_synthesis'      // priority: 40   - AI combined sources
  | 'ai_inference';     // priority: 20   - AI guessed

export const PRIORITY_MAP: Record<SourceType, number> = {
  'user_correction': 1000,
  'user_input': 100,
  'user_verified': 90,
  'verified_scrape': 80,
  'external_scrape': 60,
  'ai_synthesis': 40,
  'ai_inference': 20,
};

export interface BlackboardEntry {
  key: string;                    // "brand_name", "competitors", etc.
  value: any;                     // The actual data
  source_type: SourceType;
  source_id: string;              // Task/form ID that wrote this
  source_url?: string;            // If scraped, the URL
  based_on?: string[];            // Keys this was derived from
  priority: number;               // For resolution (higher wins)
  timestamp: string;              // ISO timestamp
}

export type ConflictType = 'contradiction' | 'ambiguity' | 'missing_required';

export interface ConflictOption {
  id: string;
  label: string;
  description: string;
  writes: Record<string, any>;    // What to write if chosen
}

export interface Conflict {
  id: string;
  type: ConflictType;
  keys_involved: string[];
  description: string;            // Human-readable
  options: ConflictOption[];
  status: 'pending' | 'resolved' | 'dismissed';
  created_by_task: string;
  resolution?: {
    chosen_option_id: string;
    resolved_by: 'user' | 'auto';
    timestamp: string;
  };
}

export interface Blackboard {
  id: number;
  project_id: number;
  entries: Record<string, BlackboardEntry>;
  conflicts: Conflict[];
  date_created?: string;
  date_updated?: string;
}

export interface WriteEntryParams {
  value: any;
  source_type: SourceType;
  source_id: string;
  source_url?: string;
  based_on?: string[];
}

export interface QueryParams {
  prefix?: string;
  source_id?: string;
  source_type?: SourceType;
}

export const SKILL_PREFIX = '@';

export interface FileSkillValue {
  type: 'file_skill';
  file_id: string;
  filename: string;
  content_type: string;
  summary: string;
  page_count?: number;
  extracted_text?: string;
}

export interface CollectionSkillValue {
  type: 'collection_skill';
  collection: string;
  summary: string;
  row_count: number;
  schema: Record<string, { type: string; enum?: string[] }>;
}

export interface FileSkillEntry extends BlackboardEntry {
  key: `@${string}`;
  value: FileSkillValue;
}

export interface CollectionSkillEntry extends BlackboardEntry {
  key: `@${string}`;
  value: CollectionSkillValue;
}

export type SkillEntry = FileSkillEntry | CollectionSkillEntry;

export function isFileSkill(entry: BlackboardEntry): entry is FileSkillEntry {
  return (
    entry.key.startsWith(SKILL_PREFIX) &&
    typeof entry.value === 'object' &&
    entry.value !== null &&
    entry.value.type === 'file_skill'
  );
}

export function isCollectionSkill(entry: BlackboardEntry): entry is CollectionSkillEntry {
  return (
    entry.key.startsWith(SKILL_PREFIX) &&
    typeof entry.value === 'object' &&
    entry.value !== null &&
    entry.value.type === 'collection_skill'
  );
}

export function isSkill(entry: BlackboardEntry): entry is SkillEntry {
  return isFileSkill(entry) || isCollectionSkill(entry);
}
