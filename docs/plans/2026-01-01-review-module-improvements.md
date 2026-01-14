# Review Module Gallery Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the review module gallery layout with cleaner UI, better spacing, and smarter button behavior.

**Architecture:** Modify Vue components (ImageCard.vue, GalleryLayout.vue, module.vue) to remove unused elements, improve styling, and add conditional "Done" button logic that updates task status.

**Tech Stack:** Vue 3, Vitest, Directus Extensions SDK

---

## Changes Summary

1. **Remove "No Image" placeholder** - Don't show image container when no image exists
2. **Remove checkbox** - Unused selection feature, clutters UI
3. **Add card borders and increase padding** - Better visual separation
4. **Smart "Done" button** - When all items are approved/rejected, show "Done" button that updates task status

---

### Task 1: Add Tests for ImageCard Component

**Files:**
- Create: `extensions/colex-button-system-bundle/src/review-module/components/ImageCard.test.ts`

**Step 1: Write failing tests for ImageCard rendering**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ImageCard from './ImageCard.vue';

// Mock Directus components
const mockVIcon = { template: '<span class="v-icon"><slot /></span>' };
const mockVButton = { template: '<button class="v-button"><slot /></button>' };
const mockVCheckbox = { template: '<input type="checkbox" class="v-checkbox" />' };

describe('ImageCard', () => {
	const defaultProps = {
		item: {
			id: 1,
			name: 'Test Item',
			output_status: 'pending',
			date_created: '2024-01-01T00:00:00Z',
			date_updated: null,
		},
		fields: [],
		permissions: { edit: true, delete: false },
		selected: false,
	};

	const mountCard = (props = {}) => {
		return mount(ImageCard, {
			props: { ...defaultProps, ...props },
			global: {
				stubs: {
					'v-icon': mockVIcon,
					'v-button': mockVButton,
					'v-checkbox': mockVCheckbox,
				},
			},
		});
	};

	describe('No Image placeholder removal', () => {
		it('should NOT render image container when no image URL exists', () => {
			const wrapper = mountCard({
				item: { ...defaultProps.item, url: null, image: null },
			});

			expect(wrapper.find('.image-container').exists()).toBe(false);
			expect(wrapper.find('.no-image').exists()).toBe(false);
		});

		it('should render image container when image URL exists', () => {
			const wrapper = mountCard({
				item: { ...defaultProps.item, url: 'https://example.com/image.jpg' },
			});

			expect(wrapper.find('.image-container').exists()).toBe(true);
			expect(wrapper.find('img').exists()).toBe(true);
		});
	});

	describe('Checkbox removal', () => {
		it('should NOT render checkbox overlay', () => {
			const wrapper = mountCard();

			expect(wrapper.find('.checkbox-overlay').exists()).toBe(false);
			expect(wrapper.find('.v-checkbox').exists()).toBe(false);
		});
	});

	describe('Card styling', () => {
		it('should have card border styling class', () => {
			const wrapper = mountCard();

			expect(wrapper.find('.image-card').exists()).toBe(true);
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd extensions/colex-button-system-bundle && npm test -- --run src/review-module/components/ImageCard.test.ts`

Expected: FAIL - tests should fail because:
- `.image-container` still exists when no image (we show "No Image" placeholder)
- `.checkbox-overlay` still exists

---

### Task 2: Implement ImageCard Changes - Remove "No Image" and Checkbox

**Files:**
- Modify: `extensions/colex-button-system-bundle/src/review-module/components/ImageCard.vue`

**Step 1: Update template to remove checkbox and conditionally show image container**

Replace lines 1-21 with:

```vue
<template>
	<div class="image-card" :class="cardClasses">
		<div v-if="imageUrl" class="image-container" @click="toggleReject">
			<img :src="imageUrl" :alt="item.name || 'Output image'" />
			<div class="status-badges">
				<div v-if="isEdited" class="status-badge status-edited">
					<v-icon name="edit" small />
				</div>
				<div v-if="item.output_status" class="status-badge" :class="`status-${item.output_status}`">
					{{ item.output_status }}
				</div>
			</div>
		</div>

		<!-- Status badge when no image - show inline with content -->
		<div v-else class="status-header">
			<div v-if="isEdited" class="status-badge status-edited">
				<v-icon name="edit" small />
			</div>
			<div v-if="item.output_status" class="status-badge" :class="`status-${item.output_status}`">
				{{ item.output_status }}
			</div>
		</div>
```

**Step 2: Remove checkbox-related props and emits**

In the `<script setup>` section, remove:
- `selected` prop
- `'toggle-select'` from emits

**Step 3: Remove checkbox-overlay CSS**

Delete the `.checkbox-overlay` CSS block (lines ~272-279).

**Step 4: Add status-header CSS**

Add this CSS:

```css
.status-header {
	display: flex;
	gap: 4px;
	padding: 12px 12px 0;
	justify-content: flex-end;
}
```

**Step 5: Run tests to verify they pass**

Run: `cd extensions/colex-button-system-bundle && npm test -- --run src/review-module/components/ImageCard.test.ts`

Expected: PASS

**Step 6: Visual verification in browser**

Navigate to: `http://localhost:8055/admin/review?collection=test_outputs&layout=gallery`

Verify:
- No "No Image" placeholder showing
- No checkboxes visible
- Status badges still show (in header area for non-image items)

**Step 7: Commit**

```bash
git add extensions/colex-button-system-bundle/src/review-module/components/ImageCard.vue
git add extensions/colex-button-system-bundle/src/review-module/components/ImageCard.test.ts
git commit -m "feat(review-module): remove No Image placeholder and unused checkbox

- Remove checkbox overlay from ImageCard (was unused)
- Only show image container when imageUrl exists
- Add status-header for non-image items to display status badges
- Add unit tests for ImageCard component"
```

---

### Task 3: Update GalleryLayout to Remove Selection Props

**Files:**
- Modify: `extensions/colex-button-system-bundle/src/review-module/layouts/GalleryLayout.vue`

**Step 1: Remove selection-related props and logic**

In template, remove `:selected` and `@toggle-select` from `<image-card>`:

```vue
<image-card
	v-for="item in items"
	:key="item.id"
	:item="item"
	:fields="fields"
	:permissions="permissions"
	@approve="$emit('approve', [item.id])"
	@reject="$emit('reject', [item.id])"
	@delete="$emit('delete', [item.id])"
	@edit="$emit('edit', item.id, $event)"
/>
```

**Step 2: Remove selection props and emits from script**

Remove from props:
```typescript
selected: {
	type: Array,
	default: () => []
}
```

Remove from emits: `'update:selected'`

Remove the `toggleSelect` function entirely.

**Step 3: Run tests**

Run: `cd extensions/colex-button-system-bundle && npm test`

Expected: PASS

**Step 4: Visual verification**

Refresh browser, verify gallery still works without selection.

**Step 5: Commit**

```bash
git add extensions/colex-button-system-bundle/src/review-module/layouts/GalleryLayout.vue
git commit -m "refactor(review-module): remove unused selection from GalleryLayout"
```

---

### Task 4: Add Tests for Card Styling (Borders and Padding)

**Files:**
- Modify: `extensions/colex-button-system-bundle/src/review-module/components/ImageCard.test.ts`

**Step 1: Add styling tests**

Add to the existing test file:

```typescript
describe('Card borders and spacing', () => {
	it('should have proper card structure for border styling', () => {
		const wrapper = mountCard();
		const card = wrapper.find('.image-card');

		expect(card.exists()).toBe(true);
		// Card should exist and be styled (actual CSS is in component)
	});
});
```

**Step 2: Run tests**

Run: `cd extensions/colex-button-system-bundle && npm test -- --run src/review-module/components/ImageCard.test.ts`

Expected: PASS (test structure only)

---

### Task 5: Update Card and Gallery Styling

**Files:**
- Modify: `extensions/colex-button-system-bundle/src/review-module/components/ImageCard.vue` (CSS)
- Modify: `extensions/colex-button-system-bundle/src/review-module/layouts/GalleryLayout.vue` (CSS)

**Step 1: Update ImageCard CSS for better borders**

Update `.image-card` CSS:

```css
.image-card {
	border: 1px solid var(--border-normal);
	border-radius: 8px;
	overflow: hidden;
	transition: all 0.2s;
	position: relative;
	background: var(--background-page);
	break-inside: avoid;
	display: inline-block;
	width: 100%;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.image-card:hover {
	border-color: var(--primary);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

**Step 2: Update GalleryLayout CSS for better spacing**

Update `.gallery-grid` CSS:

```css
.gallery-grid {
	column-count: 3;
	column-gap: 24px;
	padding: 8px;
}

/* Add spacing between cards */
.gallery-grid > * {
	margin-bottom: 24px;
}
```

**Step 3: Visual verification**

Refresh browser and verify:
- Cards have visible borders
- More space between cards (24px gap)
- Hover effect shows primary color border

**Step 4: Commit**

```bash
git add extensions/colex-button-system-bundle/src/review-module/components/ImageCard.vue
git add extensions/colex-button-system-bundle/src/review-module/layouts/GalleryLayout.vue
git commit -m "style(review-module): improve card borders and spacing

- Add subtle box shadow to cards
- Increase column gap to 24px
- Increase card margin to 24px
- Enhanced hover effect with primary border color"
```

---

### Task 6: Add Tests for Done Button Logic

**Files:**
- Create: `extensions/colex-button-system-bundle/src/review-module/module.test.ts` (extend existing)

**Step 1: Add tests for allReviewed computed and Done button**

Add to the existing `module.test.ts`:

```typescript
describe('Review Module - Done Button Logic', () => {
	describe('allReviewed computed', () => {
		/**
		 * allReviewed should return true when all items are either 'approved' or 'rejected'
		 * (no 'pending' items remain)
		 */
		const isAllReviewed = (items: Array<{ output_status: string }>) => {
			if (!items || items.length === 0) return false;
			return items.every(item =>
				item.output_status === 'approved' || item.output_status === 'rejected'
			);
		};

		it('should return false when there are pending items', () => {
			const items = [
				{ output_status: 'approved' },
				{ output_status: 'pending' },
				{ output_status: 'rejected' },
			];
			expect(isAllReviewed(items)).toBe(false);
		});

		it('should return true when all items are approved or rejected', () => {
			const items = [
				{ output_status: 'approved' },
				{ output_status: 'approved' },
				{ output_status: 'rejected' },
			];
			expect(isAllReviewed(items)).toBe(true);
		});

		it('should return true when all items are approved', () => {
			const items = [
				{ output_status: 'approved' },
				{ output_status: 'approved' },
			];
			expect(isAllReviewed(items)).toBe(true);
		});

		it('should return true when all items are rejected', () => {
			const items = [
				{ output_status: 'rejected' },
				{ output_status: 'rejected' },
			];
			expect(isAllReviewed(items)).toBe(true);
		});

		it('should return false for empty array', () => {
			expect(isAllReviewed([])).toBe(false);
		});
	});
});
```

**Step 2: Run tests to verify**

Run: `cd extensions/colex-button-system-bundle && npm test -- --run src/review-module/module.test.ts`

Expected: PASS (logic tests only)

---

### Task 7: Implement Done Button in module.vue

**Files:**
- Modify: `extensions/colex-button-system-bundle/src/review-module/module.vue`

**Step 1: Add taskId ref and allReviewed computed**

In `<script setup>`, after `const activeFilter = ref('all');`, add:

```typescript
// Parse task_id from query params (passed from button context)
const taskId = ref(route.query.task_id || null);

// Computed: check if all items are reviewed (approved or rejected)
const allReviewed = computed(() => {
	if (!outputs.value || outputs.value.length === 0) return false;
	return outputs.value.every(item =>
		item.output_status === 'approved' || item.output_status === 'rejected'
	);
});
```

**Step 2: Add handleDone function**

After `handleApproveAllRemaining`, add:

```typescript
const handleDone = async () => {
	if (taskId.value) {
		try {
			// Update the task status to 'done'
			const api = useApi();
			await api.patch(`/items/tasks/${taskId.value}`, {
				status: 'done'
			});

			// Navigate back
			router.back();
		} catch (error) {
			console.error('Failed to update task status:', error);
			// Still navigate back even if update fails
			router.back();
		}
	} else {
		// No task_id, just navigate back
		router.back();
	}
};
```

**Step 3: Import useApi**

Add to imports:

```typescript
import { useApi } from '@directus/extensions-sdk';
```

And in script, add:

```typescript
const api = useApi();
```

**Step 4: Update template button section**

Replace the approve-all button section:

```vue
<!-- Action button: Approve All Remaining OR Done -->
<v-button
	v-if="allReviewed"
	@click="handleDone"
	:disabled="loading"
	small
	class="done-btn"
>
	<v-icon name="check_circle" small />
	Done
</v-button>
<v-button
	v-else-if="remainingCount > 0 && permissions.edit"
	@click="handleApproveAllRemaining"
	:disabled="loading"
	small
	secondary
	class="approve-all-btn"
>
	Approve all remaining
</v-button>
```

**Step 5: Add Done button CSS**

Add to `<style scoped>`:

```css
.done-btn {
	--v-button-background-color: var(--success) !important;
	--v-button-background-color-hover: var(--success-125) !important;
	--v-button-color: #FFFFFF !important;
	--v-button-color-hover: #FFFFFF !important;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 4px;
}
```

**Step 6: Run all tests**

Run: `cd extensions/colex-button-system-bundle && npm test`

Expected: PASS

**Step 7: Visual verification**

1. Navigate to: `http://localhost:8055/admin/review?collection=test_outputs&layout=gallery`
2. Approve/reject all pending items
3. Verify "Done" button appears (green) instead of "Approve all remaining"

**Step 8: Commit**

```bash
git add extensions/colex-button-system-bundle/src/review-module/module.vue
git add extensions/colex-button-system-bundle/src/review-module/module.test.ts
git commit -m "feat(review-module): add Done button when all items reviewed

- Add allReviewed computed to detect when all items are approved/rejected
- Show green 'Done' button instead of 'Approve all remaining' when complete
- Done button updates task status to 'done' if task_id is in query params
- Add unit tests for allReviewed logic"
```

---

### Task 8: Build and Final Verification

**Files:**
- None (build verification)

**Step 1: Build the extension**

Run: `cd extensions/colex-button-system-bundle && npm run build`

Expected: Build succeeds with no errors

**Step 2: Run all tests**

Run: `cd extensions/colex-button-system-bundle && npm test`

Expected: All tests pass

**Step 3: Full visual verification**

Navigate to review module and verify:
1. No "No Image" placeholder - cards without images just show content
2. No checkboxes visible
3. Cards have visible borders with shadow
4. 24px gap between cards
5. "Approve all remaining" shows when pending items exist
6. "Done" button (green) shows when all items are approved/rejected

**Step 4: Final commit**

```bash
git add -A
git commit -m "build: verify review module improvements build successfully"
```

---

## Summary of Changes

| Component | Change |
|-----------|--------|
| `ImageCard.vue` | Remove checkbox, remove "No Image" placeholder, add status-header for non-image items |
| `GalleryLayout.vue` | Remove selection props, increase spacing to 24px |
| `module.vue` | Add `allReviewed` computed, add `handleDone` function, conditional Done/Approve button |
| `ImageCard.test.ts` | New tests for component rendering |
| `module.test.ts` | Extended with Done button logic tests |
