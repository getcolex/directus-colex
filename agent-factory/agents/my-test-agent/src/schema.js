import { z } from 'zod';

/**
 * Input and Output schemas for Test Agent
 *
 * Generated from AgentSpec JSON schemas.
 */

export const InputSchema = z.object({
  url: z.string().url()
});

// User-defined enriched fields schema
export const EnrichedFieldsSchema = z.object({

});

// Orchestrator output format - wraps user fields in enriched_fields
export const OrchestratorOutputSchema = z.object({
  enriched_fields: EnrichedFieldsSchema,
  tokens_used: z.number().default(0),
  confidence_score: z.number().min(0).max(1).default(0.9),
  items_updated: z.number().default(1)
});

/**
 * Validate input data
 */
export function validateInput(data) {
  try {
    return InputSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => {
        const path = e.path.length > 0 ? e.path.join('.') : 'root';
        return `${path}: ${e.message}`;
      }).join(', ');
      throw new Error(`Input validation failed: ${issues}`);
    }
    throw error;
  }
}

/**
 * Validate output data (orchestrator format)
 */
export function validateOutput(data) {
  try {
    return OrchestratorOutputSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => {
        const path = e.path.length > 0 ? e.path.join('.') : 'root';
        return `${path}: ${e.message}`;
      }).join(', ');
      throw new Error(`Output validation failed: ${issues}`);
    }
    throw error;
  }
}
