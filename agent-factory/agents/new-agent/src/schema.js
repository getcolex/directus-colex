import { z } from 'zod';

/**
 * Input and Output schemas for mafia
 *
 * Generated from AgentSpec JSON schemas.
 */

export const InputSchema = z.object({
  url: z.string().url(),
  not sure: z.string()
});

export const OutputSchema = z.object({

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
 * Validate output data
 */
export function validateOutput(data) {
  try {
    return OutputSchema.parse(data);
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
