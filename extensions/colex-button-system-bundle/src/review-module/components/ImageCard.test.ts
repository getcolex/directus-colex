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
