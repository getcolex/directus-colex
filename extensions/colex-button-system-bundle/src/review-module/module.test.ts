import { describe, it, expect } from 'vitest';

/**
 * Tests for parseFieldsParam - handles both correct JSON array format
 * and broken comma-separated string format from button interpolation.
 *
 * Bug: Button config uses "{display_fields}" template which converts
 * arrays to comma-separated strings via String() coercion.
 *
 * Working URL:  fields=["id","name","about_the_brand"]
 * Broken URL:   fields="id,name,about_the_brand"
 */

/**
 * parseFieldsParam - Enhanced parser that handles both JSON array and comma-separated string
 *
 * This function handles:
 * 1. Correct format: '["id","name"]' - JSON array
 * 2. Broken format: '"id,name"' - quoted comma-separated (from button interpolation bug)
 * 3. Broken format: 'id,name' - unquoted comma-separated
 */
const parseFieldsParam = (str: string | undefined, fallback: string[]): string[] => {
	if (!str) return fallback;

	// Try JSON parse first (correct format: ["id","name"])
	try {
		const parsed = JSON.parse(str);
		if (Array.isArray(parsed)) return parsed;
	} catch {
		// Not valid JSON, continue to fallback
	}

	// Fallback: handle comma-separated string (broken format: "id,name,about")
	if (typeof str === 'string' && str.length > 0) {
		const cleaned = str.replace(/^"|"$/g, ''); // Remove surrounding quotes
		return cleaned.split(',').map(f => f.trim()).filter(f => f);
	}

	return fallback;
};

describe('Review Module - parseFieldsParam', () => {
	describe('JSON array format (correct)', () => {
		it('should parse valid JSON array format', () => {
			const result = parseFieldsParam('["id","name","about_the_brand"]', []);
			expect(result).toEqual(['id', 'name', 'about_the_brand']);
		});

		it('should parse empty JSON array', () => {
			const result = parseFieldsParam('[]', ['default']);
			expect(result).toEqual([]);
		});
	});

	describe('Comma-separated string format (broken interpolation)', () => {
		it('should handle quoted comma-separated string', () => {
			// This is what the button currently generates
			const result = parseFieldsParam('"id,name,about_the_brand"', []);
			expect(result).toEqual(['id', 'name', 'about_the_brand']);
		});

		it('should handle unquoted comma-separated string', () => {
			const result = parseFieldsParam('id,name,about_the_brand', []);
			expect(result).toEqual(['id', 'name', 'about_the_brand']);
		});

		it('should handle whitespace in comma-separated values', () => {
			const result = parseFieldsParam('id, name , about_the_brand', []);
			expect(result).toEqual(['id', 'name', 'about_the_brand']);
		});
	});

	describe('Edge cases', () => {
		it('should return fallback for empty string', () => {
			const result = parseFieldsParam('', ['default']);
			expect(result).toEqual(['default']);
		});

		it('should return fallback for undefined', () => {
			const result = parseFieldsParam(undefined, ['default']);
			expect(result).toEqual(['default']);
		});

		it('should filter out empty values after splitting', () => {
			const result = parseFieldsParam('id,,name', []);
			expect(result).toEqual(['id', 'name']);
		});
	});
});
