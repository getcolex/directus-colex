<template>
	<private-view :title="pageTitle">
		<template #headline>
			<v-breadcrumb :items="breadcrumb" />
		</template>

		<template #title-outer:prepend>
			<v-button secondary icon rounded @click="navigateBack">
				<v-icon name="arrow_back" />
			</v-button>
		</template>

		<div v-if="loading && !outputs.length" class="loading-container">
			<v-progress-circular indeterminate />
		</div>

		<div v-else-if="!collection" class="error-container">
			<v-notice type="warning">
				No collection specified. This page must be accessed via a configurable button.
			</v-notice>
		</div>

		<div v-else class="review-container">
			<!-- Quick Filters with counts and Approve All button -->
			<div class="filters-row">
				<QuickFilters v-model:filter="activeFilter" :counts="filterCounts" />
				<v-button
					v-if="remainingCount > 0 && permissions.edit"
					@click="handleApproveAllRemaining"
					:disabled="loading"
					small
					secondary
					class="approve-all-btn"
				>
					Approve all remaining
				</v-button>
			</div>

			<!-- Dynamic layout component -->
			<component
				:is="layoutComponent"
				:items="filteredOutputs"
				:fields="fields"
				:permissions="permissions"
				:loading="loading"
				v-model:selected="selected"
				@approve="handleApprove"
				@reject="handleReject"
				@delete="handleDelete"
				@edit="handleEdit"
			/>
		</div>
	</private-view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import GalleryLayout from './layouts/GalleryLayout.vue';
import TableLayout from './layouts/TableLayout.vue';
import QuickFilters from './components/QuickFilters.vue';
import { useOutputs } from './composables/useOutputs';
import { useApproval } from './composables/useApproval';

const route = useRoute();
const router = useRouter();

// Parse query params with safe JSON parsing
const safeJsonParse = (str, fallback) => {
	try {
		return JSON.parse(str);
	} catch {
		return fallback;
	}
};

const collection = ref(route.query.collection);
const filter = ref(safeJsonParse(route.query.filter || '{}', {}));
const fields = ref(safeJsonParse(route.query.fields || '[]', []));
const permissions = ref(safeJsonParse(route.query.permissions || '{"edit": true, "delete": false, "create": false}', { edit: true, delete: false, create: false }));
const pageTitle = ref(route.query.title || 'Review Outputs');
const layout = ref(route.query.layout || 'table');

const selected = ref([]);
const showCreateModal = ref(false);
const activeFilter = ref('all');

// Fetch outputs
const { outputs, loading, stats, refresh } = useOutputs(collection, filter);

// Filtered outputs based on active quick filter
const filteredOutputs = computed(() => {
	if (!outputs.value || !Array.isArray(outputs.value)) {
		return [];
	}
	if (activeFilter.value === 'all') {
		return outputs.value;
	}
	if (activeFilter.value === 'edited') {
		// Filter for edited items (items with date_updated after date_created)
		return outputs.value.filter(item => {
			return item.date_updated && item.date_created &&
				   new Date(item.date_updated) > new Date(item.date_created);
		});
	}
	return outputs.value.filter(item => item.output_status === activeFilter.value);
});

// Calculate counts for each filter
const filterCounts = computed(() => {
	if (!outputs.value || !Array.isArray(outputs.value)) {
		return {
			all: 0,
			pending: 0,
			approved: 0,
			rejected: 0,
			edited: 0
		};
	}

	const counts = {
		all: outputs.value.length,
		pending: 0,
		approved: 0,
		rejected: 0,
		edited: 0
	};

	outputs.value.forEach(item => {
		if (item.output_status === 'pending') counts.pending++;
		if (item.output_status === 'approved') counts.approved++;
		if (item.output_status === 'rejected') counts.rejected++;

		// Count edited items
		if (item.date_updated && item.date_created &&
			new Date(item.date_updated) > new Date(item.date_created)) {
			counts.edited++;
		}
	});

	return counts;
});

// Approval actions
const { approve, reject, deleteOutputs, edit, approveAllRemaining } = useApproval(collection);

// Computed: count of pending items only (not rejected)
const remainingCount = computed(() => {
	return outputs.value.filter(item => item.output_status === 'pending').length;
});

// Layout component mapping
const layoutComponent = computed(() => {
	return {
		gallery: GalleryLayout,
		table: TableLayout
	}[layout.value] || TableLayout;
});

// Breadcrumb
const breadcrumb = computed(() => [
	{
		name: 'Collections',
		to: '/content',
	},
	{
		name: pageTitle.value,
		to: route.path,
	},
]);

// Navigation
const navigateBack = () => {
	router.back();
};

// Action handlers
const handleApprove = async (ids) => {
	await approve(ids);
	await refresh();
	selected.value = [];
};

const handleReject = async (ids) => {
	await reject(ids);
	await refresh();
	selected.value = [];
};

const handleDelete = async (ids) => {
	if (confirm(`Delete ${ids.length} item(s)?`)) {
		await deleteOutputs(ids);
		await refresh();
		selected.value = [];
	}
};

const handleEdit = async (id, changes) => {
	await edit(id, changes);
	await refresh();
};

const handleApproveAllRemaining = async () => {
	const remainingIds = outputs.value
		.filter(item => item.output_status === 'pending')
		.map(item => item.id);

	if (remainingIds.length > 0) {
		await approveAllRemaining(remainingIds);
		await refresh();
		selected.value = [];
	}
};

onMounted(() => {
	// Collection validation happens in template via v-else-if="!collection"
});
</script>

<style scoped>
.loading-container,
.error-container {
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 400px;
	padding: 40px;
}

/* Override Directus private-view's .container (max-width: 1024px constraint) */
:deep(.private-view) .container {
	max-width: none !important;
	width: 100% !important;
}

/* Also override any other potential wrappers */
:deep(.private-view) .content,
:deep(.private-view) .wrapper,
:deep(.container) {
	max-width: none !important;
	width: 100% !important;
}

.review-container {
	padding: 20px;
	max-width: none !important;
	width: 100% !important;
}

/* Force cascading full-width to table components */
:deep(.table-layout),
:deep(.v-table),
:deep(.v-table table) {
	width: 100% !important;
	max-width: none !important;
}

/* Remove spacer cells that prevent content columns from expanding */
:deep(.v-table td.spacer),
:deep(.v-table th.spacer) {
	width: 0 !important;
	padding: 0 !important;
	display: none !important;
}

.filters-row {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 16px;
	margin-bottom: 20px;
}

.approve-all-btn {
	--v-button-background-color: var(--foreground-normal) !important;
	--v-button-background-color-hover: var(--foreground-subdued) !important;
	--v-button-color: var(--background-page) !important;
	flex-shrink: 0;
}
</style>
