/**
 * Conflict Detector
 *
 * Detects contradictions and ambiguities between user input
 * and AI research findings. Creates conflicts for HITL resolution.
 */

import { randomUUID } from 'crypto';
import { Blackboard, Conflict, ConflictOption } from './types';

/**
 * Research findings that might conflict with user input
 */
export interface ResearchFindings {
  entity_found?: string;
  company_name?: string;
  entity_industry?: string;
  industry?: string;
  [key: string]: any;
}

/**
 * Calculate string similarity using Levenshtein distance
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;

  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 1;
  if (aLower.length === 0 && bLower.length === 0) return 1;
  if (aLower.length === 0 || bLower.length === 0) return 0;

  // Check for substring containment (common for company names)
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return 0.9;
  }

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= bLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      if (aLower[i - 1] === bLower[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  const distance = matrix[aLower.length][bLower.length];
  const maxLength = Math.max(aLower.length, bLower.length);

  return 1 - distance / maxLength;
}

/**
 * Known industry equivalents for matching
 */
const INDUSTRY_EQUIVALENTS: Record<string, string[]> = {
  toys: ['puzzles', 'games', 'hobbies', 'gaming'],
  cosmetics: ['skincare', 'beauty', 'makeup', 'personal care'],
  technology: ['software', 'tech', 'it', 'saas', 'hardware'],
  food: ['beverage', 'restaurant', 'culinary', 'dining'],
  fashion: ['apparel', 'clothing', 'accessories'],
  automotive: ['cars', 'vehicles', 'auto'],
};

/**
 * Check if two industry descriptions are compatible
 */
export function industriesMatch(userIndustry: string, foundIndustry: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const aNorm = normalize(userIndustry);
  const bNorm = normalize(foundIndustry);

  // Direct match or substring
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;

  // Check known equivalents
  for (const [key, values] of Object.entries(INDUSTRY_EQUIVALENTS)) {
    const aMatches = aNorm.includes(key) || values.some((v) => aNorm.includes(v));
    const bMatches = bNorm.includes(key) || values.some((v) => bNorm.includes(v));

    if (aMatches && bMatches) {
      return true;
    }
  }

  return false;
}

/**
 * Detect conflicts between blackboard user input and new research findings
 *
 * Only flags conflicts for user_input or user_verified entries -
 * we don't care about AI-vs-AI conflicts.
 */
export function detectConflicts(
  blackboard: Blackboard,
  findings: ResearchFindings,
  taskId: string
): Conflict[] {
  const conflicts: Conflict[] = [];

  // 1. Check for entity name mismatch
  const brandNameEntry = blackboard.entries.brand_name;
  const foundEntity = findings.entity_found || findings.company_name;

  if (
    brandNameEntry &&
    foundEntity &&
    (brandNameEntry.source_type === 'user_input' || brandNameEntry.source_type === 'user_verified')
  ) {
    const similarity = stringSimilarity(brandNameEntry.value, foundEntity);

    if (similarity < 0.7) {
      const userValue = brandNameEntry.value;
      const researchValue = foundEntity;

      conflicts.push({
        id: randomUUID(),
        type: 'ambiguity',
        keys_involved: ['brand_name'],
        description: `Research found "${researchValue}" but you entered "${userValue}". Are these the same company?`,
        options: [
          {
            id: 'use_user_input',
            label: `${userValue} (what I entered)`,
            description: 'Use what I entered in the form',
            writes: {
              brand_entity: userValue,
              brand_entity_verified: true,
              disambiguation: `Not ${researchValue}`,
            },
          },
          {
            id: 'use_research',
            label: `${researchValue} (from research)`,
            description: 'Use what the research found',
            writes: {
              brand_entity: researchValue,
            },
          },
        ],
        status: 'pending',
        created_by_task: taskId,
      });
    }
  }

  // 2. Check for industry mismatch
  const industryEntry = blackboard.entries.industry;
  const foundIndustry = findings.entity_industry || findings.industry;

  if (
    industryEntry &&
    foundIndustry &&
    (industryEntry.source_type === 'user_input' || industryEntry.source_type === 'user_verified')
  ) {
    if (!industriesMatch(industryEntry.value, foundIndustry)) {
      conflicts.push({
        id: randomUUID(),
        type: 'contradiction',
        keys_involved: ['industry'],
        description: `You said "${industryEntry.value}" but research found "${foundIndustry}"`,
        options: [
          {
            id: 'use_user_input',
            label: industryEntry.value,
            description: 'My form data is correct',
            writes: {
              industry: industryEntry.value,
              industry_verified: true,
            },
          },
          {
            id: 'use_research',
            label: foundIndustry,
            description: 'Research is correct',
            writes: {
              industry: foundIndustry,
            },
          },
        ],
        status: 'pending',
        created_by_task: taskId,
      });
    }
  }

  return conflicts;
}
