<template>
	<div class="gallery-layout">
		<div v-if="items.length === 0 && !loading" class="empty-state">
			<v-icon name="image" x-large />
			<p>No outputs to review</p>
		</div>

		<div v-else class="gallery-grid">
			<image-card
				v-for="item in items"
				:key="item.id"
				:item="item"
				:fields="fields"
				:permissions="permissions"
				:showEmptyThumbnail="showEmptyThumbnail"
				@approve="$emit('approve', [item.id])"
				@reject="$emit('reject', [item.id])"
				@delete="$emit('delete', [item.id])"
				@edit="$emit('edit', item.id, $event)"
			/>
		</div>

		<v-progress-circular v-if="loading" indeterminate class="loading-spinner" />
	</div>
</template>

<script setup>
import { defineProps, defineEmits, computed } from 'vue';
import ImageCard from '../components/ImageCard.vue';

const props = defineProps({
	items: {
		type: Array,
		default: () => []
	},
	fields: {
		type: Array,
		default: () => []
	},
	permissions: {
		type: Object,
		default: () => ({ edit: true, delete: false, create: false })
	},
	loading: {
		type: Boolean,
		default: false
	}
});

// Determine if we should show empty thumbnails
// Only show them if at least one item has an image (mixed state)
const showEmptyThumbnail = computed(() => {
	if (!props.items || props.items.length === 0) return false;

	const imageFields = ['url', 'image', 'thumbnail_url', 'file', 'image_url', 'thumbnail'];
	const hasAnyImage = props.items.some(item =>
		imageFields.some(field => item[field])
	);
	const hasAnyWithoutImage = props.items.some(item =>
		!imageFields.some(field => item[field])
	);

	// Show placeholder only in mixed state (some have images, some don't)
	return hasAnyImage && hasAnyWithoutImage;
});

const emit = defineEmits(['approve', 'reject', 'delete', 'edit']);
</script>

<style scoped>
.gallery-layout {
	position: relative;
	min-height: 400px;
}

.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	min-height: 400px;
	color: var(--foreground-subdued);
	gap: 16px;
}

.empty-state p {
	font-size: 16px;
	margin: 0;
}

.gallery-grid {
	column-count: 3;
	column-gap: 24px;
	padding: 8px;
}

/* Add spacing between cards */
.gallery-grid > * {
	margin-bottom: 24px;
}

/* Responsive columns */
@media (max-width: 1024px) {
	.gallery-grid {
		column-count: 2;
	}
}

@media (max-width: 640px) {
	.gallery-grid {
		column-count: 1;
	}
}

.loading-spinner {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
}
</style>
