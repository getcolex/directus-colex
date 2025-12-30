<template>
	<div class="quick-filters">
		<v-button
			v-for="filter in filters"
			:key="filter.value"
			:class="['quick-filter-btn', { active: props.filter === filter.value }]"
			:secondary="props.filter !== filter.value"
			small
			@click="$emit('update:filter', filter.value)"
		>
			<v-icon :name="filter.icon" small />
			{{ filter.label }} ({{ counts[filter.value] || 0 }})
		</v-button>
	</div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
	filter: {
		type: String,
		default: 'all'
	},
	counts: {
		type: Object,
		default: () => ({
			all: 0,
			pending: 0,
			approved: 0,
			rejected: 0,
			edited: 0
		})
	}
});

const emit = defineEmits(['update:filter']);

const filters = computed(() => [
	{
		label: 'All',
		value: 'all',
		icon: 'list'
	},
	{
		label: 'Pending',
		value: 'pending',
		icon: 'schedule'
	},
	{
		label: 'Approved',
		value: 'approved',
		icon: 'check_circle'
	},
	{
		label: 'Rejected',
		value: 'rejected',
		icon: 'cancel'
	},
	{
		label: 'Edited',
		value: 'edited',
		icon: 'edit'
	}
]);
</script>

<style scoped>
.quick-filters {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.quick-filter-btn {
	height: 36px !important;
	min-height: 36px !important;
	transition: all 0.2s ease;
	flex-shrink: 0;
}

.quick-filter-btn :deep(.v-icon) {
	margin-right: 6px;
}

/* Inactive/unselected - secondary gives light background automatically */
.quick-filter-btn:not(.active) {
	/* secondary attribute handles the light background */
}

/* Active/selected - primary button (default v-button style) */
.quick-filter-btn.active {
	font-weight: 600;
}

/* Hover effects - only on unselected */
.quick-filter-btn:not(.active):hover {
	transform: translateY(-1px);
}
</style>
