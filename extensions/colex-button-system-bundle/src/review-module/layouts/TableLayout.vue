<template>
	<div class="table-layout">
		<!-- Loading skeleton -->
		<div v-if="loading && items.length === 0" class="skeleton-container">
			<v-skeleton-loader
				v-for="n in 5"
				:key="n"
				type="table-row"
			/>
		</div>

		<!-- Simple table with native rendering -->
		<v-table
			v-else-if="items.length > 0"
			v-model:headers="tableHeaders"
			:items="items"
			item-key="id"
			fixed-header
			:loading="loading"
			:style="{ '--dynamic-grid-template': gridTemplate }"
		>
			<!-- Editable cell slots for each field -->
			<template v-for="field in fields" :key="field" #[`item.${field}`]="{ item }">
				<EditableCell
					:value="item[field]"
					:field-name="field"
					:editable="permissions.edit"
					@update="(newValue) => handleCellUpdate(item.id, field, newValue)"
				/>
			</template>

			<!-- Status column with chip -->
			<template #item.output_status="{ item }">
				<div class="status-cell">
					<div
						v-if="item.date_updated && item.date_created && new Date(item.date_updated) > new Date(item.date_created)"
						class="edited-badge"
					>
						<v-icon name="edit" small />
					</div>
					<v-chip :class="`status-${item.output_status}`" small>
						{{ item.output_status }}
					</v-chip>
				</div>
			</template>

			<!-- Actions column with inline buttons -->
			<template #item.actions="{ item }">
				<div class="action-buttons">
					<v-button
						small
						icon
						:secondary="item.output_status !== 'approved'"
						@click.stop="emit('approve', [item.id])"
						:disabled="!permissions.edit"
						:class="{ 'active-approve': item.output_status === 'approved' }"
					>
						<v-icon name="check" />
					</v-button>

					<v-button
						small
						icon
						:secondary="item.output_status !== 'rejected'"
						@click.stop="emit('reject', [item.id])"
						:disabled="!permissions.edit"
						:class="{ 'active-reject': item.output_status === 'rejected' }"
					>
						<v-icon name="close" />
					</v-button>
				</div>
			</template>
		</v-table>

		<!-- Empty state -->
		<div v-else class="empty-state">
			<div class="empty-state-icon">
				<v-icon name="rate_review" x-large color="var(--foreground-subdued)" />
			</div>
			<div class="empty-state-content">
				<h3>No outputs to review</h3>
				<p>There are no items matching your current filters.</p>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed } from 'vue';
import EditableCell from '../components/EditableCell.vue';

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
		default: () => ({ edit: true, delete: false })
	},
	loading: {
		type: Boolean,
		default: false
	},
	selected: {
		type: Array,
		default: () => []
	}
});

const emit = defineEmits(['approve', 'reject', 'delete', 'edit', 'update:selected']);

// v-model for v-table selection
const selectedItems = computed({
	get: () => props.selected,
	set: (value) => emit('update:selected', value)
});

// Format field names for headers
const formatFieldName = (field) => {
	return field
		.replace(/_/g, ' ')
		.replace(/\b\w/g, c => c.toUpperCase());
};

// Build table headers with intelligent column widths
const tableHeaders = computed(() => {
	const headers = [];

	// Only show fields explicitly passed by user (no fallback, no filtering)
	const fieldsToShow = props.fields || [];
	const fieldCount = fieldsToShow.length;

	// Calculate appropriate column width based on number of fields
	// More columns = smaller minimum widths, but always readable
	const getColumnWidth = (field) => {
		// Short fields get smaller widths
		const shortFields = ['id', 'status', 'output_status'];
		if (shortFields.includes(field)) return 80;

		// Date fields need medium width
		if (field.includes('date') || field.includes('_at')) return 140;

		// UUID/ID fields need more space
		if (field === 'image' || field.includes('_id')) return 160;

		// Dynamic width based on total column count
		if (fieldCount <= 3) return 200; // Few columns - wider
		if (fieldCount <= 5) return 160; // Medium - balanced
		return 140; // Many columns - compact but readable
	};

	// Add data field headers with calculated widths
	fieldsToShow.forEach(field => {
		headers.push({
			text: formatFieldName(field),
			value: field,
			width: getColumnWidth(field),
			sortable: false
		});
	});

	// Add status column
	headers.push({
		text: 'Status',
		value: 'output_status',
		width: 130,
		sortable: false,
		align: 'right'
	});

	// Add actions column (wider for two inline buttons)
	headers.push({
		text: 'Actions',
		value: 'actions',
		width: 100,
		sortable: false,
		align: 'right'
	});

	return headers;
});

// Generate dynamic grid template based on calculated header widths
const gridTemplate = computed(() => {
	const headers = tableHeaders.value;
	if (headers.length === 0) return '130px 100px';

	const fieldCount = props.fields?.length || 0;

	// For few columns (≤3 content fields), use flexible widths so columns stretch
	// Status (130px) and Actions (100px) stay fixed, content columns flex
	if (fieldCount <= 3) {
		const colWidths = headers.map(h => {
			// Keep status and actions fixed
			if (h.value === 'output_status') return '130px';
			if (h.value === 'actions') return '100px';
			// Content columns get flexible width with minimum
			return `minmax(${h.width}px, 1fr)`;
		});
		return colWidths.join(' ');
	}

	// For many columns, use fixed widths to ensure readability
	const colWidths = headers.map(h => `${h.width}px`);
	return colWidths.join(' ');
});

const handleRowClick = ({ item }) => {
	// Toggle selection on row click
	const newSelected = props.selected.includes(item.id)
		? props.selected.filter(id => id !== item.id)
		: [...props.selected, item.id];
	emit('update:selected', newSelected);
};

// Handle cell edits - emit to parent
const handleCellUpdate = (itemId, field, newValue) => {
	emit('edit', itemId, { [field]: newValue });
};
</script>

<style scoped>
.table-layout {
	width: 100%;
	min-height: 400px;
}

/* Full-width table with flexible columns */
:deep(.v-table) {
	width: 100%;
	max-width: 100%;
	max-height: 70vh; /* Scrollable table with sticky headers */
	overflow: auto; /* Allow both horizontal and vertical scrolling */
}

/* Ensure table can expand beyond container when many columns */
:deep(.v-table table) {
	min-width: 100%;
}

/* Override v-table's CSS Grid column widths - force content columns to use flexible sizing */
/* v-table uses CSS Grid with custom properties instead of traditional table layout */
:deep(.v-table),
:deep(.v-table table),
:deep(.v-table tbody) {
	/* Use dynamic grid template based on number of fields passed */
	--b7a37058: var(--dynamic-grid-template) !important;
	--401415c8: var(--dynamic-grid-template) !important;
}

:deep(.v-table table) {
	width: 100%;
	max-width: 100%;
	table-layout: fixed; /* Force full width, distribute space evenly among columns */
}

/* Content columns - word wrap for long content */
:deep(.v-table td) {
	word-wrap: break-word;
	overflow-wrap: break-word;
}

/* Override Directus v-table's default text truncation for review/approval workflow */
/* Users need to scan content to make decisions, not just navigate */
:deep(.v-table tbody .cell:not(.select):not(.drag)) {
	white-space: normal !important;
	text-overflow: clip !important;
	overflow: visible !important;
}

/* Allow cell children to wrap and display full text */
:deep(.v-table tbody .cell:not(.select):not(.drag) > *:not(.status-cell):not(.action-buttons)) {
	white-space: normal !important;
	text-overflow: clip !important;
	overflow: visible !important;
	word-wrap: break-word;
	overflow-wrap: break-word;
	display: block !important;
}

/* Ensure rows can expand vertically to fit content */
:deep(.v-table tbody tr) {
	height: auto !important;
	min-height: 48px;
}

/* Align content to top when rows are tall, with padding for readability */
:deep(.v-table tbody td) {
	vertical-align: top !important;
	padding-top: 12px !important;
	padding-bottom: 12px !important;
}

/* Ensure cell content divs are also top-aligned */
:deep(.v-table tbody .cell) {
	align-items: flex-start !important;
}

/* Top-align any nested content wrappers */
:deep(.v-table tbody .cell > *) {
	vertical-align: top !important;
}

/* Also top-align header cells for consistency */
:deep(.v-table thead th) {
	vertical-align: top !important;
}

/* Loading skeleton styles */
.skeleton-container {
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

/* Empty state */
.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	min-height: 400px;
	padding: 60px 40px;
	text-align: center;
	animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
	from {
		opacity: 0;
		transform: translateY(10px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.empty-state-icon {
	margin-bottom: 20px;
	opacity: 0.5;
}

.empty-state-content h3 {
	margin: 0 0 8px 0;
	font-size: 18px;
	font-weight: 600;
	color: var(--foreground-normal);
}

.empty-state-content p {
	margin: 0;
	font-size: 14px;
	color: var(--foreground-subdued);
}

/* Status chip styles */
:deep(.status-approved) {
	--v-chip-background-color: var(--success);
	--v-chip-color: white;
}

:deep(.status-rejected) {
	--v-chip-background-color: var(--danger);
	--v-chip-color: white;
}

:deep(.status-pending) {
	--v-chip-background-color: var(--primary);
	--v-chip-color: var(--primary-alt);
}

/* Status cell with edited icon - target through :deep to override v-table */
:deep(.v-table .status-cell) {
	display: flex !important;
	flex-direction: row !important;
	flex-wrap: nowrap !important;
	align-items: center !important;
	gap: 6px;
	justify-content: flex-end !important;
}

:deep(.v-table .edited-badge) {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: var(--primary);
	border-radius: 4px;
	padding: 0 6px;
	height: 24px;
	color: white;
	flex-shrink: 0;
}

/* Right-align Status and Actions columns */
:deep(.v-table td[data-column="output_status"]) {
	text-align: right !important;
}

:deep(.v-table td[data-column="actions"]) {
	text-align: right !important;
}

/* Override v-table cell flex direction for status column */
:deep(.v-table td[data-column="output_status"] .cell) {
	justify-content: flex-end !important;
	flex-direction: row !important;
}

/* Action buttons layout - needs to be within v-table scope */
:deep(.v-table .action-buttons) {
	display: flex;
	justify-content: flex-end !important;
	align-items: center;
}

.action-buttons :deep(.v-button) {
	min-width: 32px;
	height: 32px;
	transition: all 0.2s ease;
}

/* Use margin instead of gap for reliability */
.action-buttons :deep(.v-button:not(:last-child)) {
	margin-right: 8px;
}

/* Outlined/inactive state (secondary buttons) */
.action-buttons :deep(.v-button[secondary]) {
	--v-button-background-color: transparent;
	--v-button-background-color-hover: var(--background-normal);
	--v-button-color: var(--foreground-subdued);
	--v-button-color-hover: var(--foreground-normal);
	border: 1px solid var(--border-normal);
}

/* Active approve button - filled green */
.action-buttons :deep(.v-button.active-approve) {
	--v-button-background-color: var(--success);
	--v-button-background-color-hover: var(--success-125);
	--v-button-color: white;
	border: none;
}

/* Active reject button - filled red */
.action-buttons :deep(.v-button.active-reject) {
	--v-button-background-color: var(--danger);
	--v-button-background-color-hover: var(--danger-125);
	--v-button-color: white;
	border: none;
}

/* Hover effect */
.action-buttons :deep(.v-button:hover:not(:disabled)) {
	transform: translateY(-1px);
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Disabled state */
.action-buttons :deep(.v-button:disabled) {
	opacity: 0.4;
	cursor: not-allowed;
}
</style>
