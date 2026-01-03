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

		<!-- Custom table with sticky columns and resizable headers -->
		<div v-else-if="items.length > 0" class="custom-table-container">
			<div class="table-wrapper">
				<table class="custom-table">
					<!-- Header row -->
					<thead>
						<tr>
							<!-- Content column headers (resizable) -->
							<th
								v-for="(field, index) in fields"
								:key="field"
								class="content-header"
								:style="{ width: columnWidths[field] + 'px', minWidth: '80px' }"
							>
								<span class="header-text">{{ formatFieldName(field) }}</span>
								<div
									class="resize-handle"
									@mousedown.prevent.stop="(e) => startResize(e, field)"
								></div>
							</th>
							<!-- Sticky Status header -->
							<th class="sticky-header status-header" style="background-color: #F8F7F4;">Status</th>
							<!-- Sticky Actions header -->
							<th class="sticky-header actions-header" style="background-color: #F8F7F4;">Actions</th>
						</tr>
					</thead>
					<!-- Body rows -->
					<tbody>
						<tr v-for="item in items" :key="item.id">
							<!-- Content cells -->
							<td
								v-for="field in fields"
								:key="field"
								class="content-cell"
								:style="{ width: columnWidths[field] + 'px', minWidth: '80px' }"
							>
								<EditableCell
									:value="item[field]"
									:field-name="field"
									:editable="permissions.edit"
									@update="(newValue) => handleCellUpdate(item.id, field, newValue)"
								/>
							</td>
							<!-- Sticky Status cell -->
							<td class="sticky-cell status-cell-td" style="background-color: #F8F7F4;">
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
							</td>
							<!-- Sticky Actions cell -->
							<td class="sticky-cell actions-cell-td" style="background-color: #F8F7F4;">
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
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

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
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue';
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
	},
	collection: {
		type: String,
		default: ''
	}
});

const emit = defineEmits(['approve', 'reject', 'delete', 'edit', 'update:selected']);

// Format field names for headers
const formatFieldName = (field) => {
	return field
		.replace(/_/g, ' ')
		.replace(/\b\w/g, c => c.toUpperCase());
};

// Calculate initial column width based on field type
const getInitialColumnWidth = (field) => {
	const fieldCount = props.fields?.length || 1;

	// Short fields get smaller widths
	const shortFields = ['id', 'status'];
	if (shortFields.includes(field)) return 100;

	// Date fields need medium width
	if (field.includes('date') || field.includes('_at')) return 180;

	// UUID/ID fields need more space
	if (field === 'image' || field.includes('_id')) return 200;

	// Dynamic width based on total column count
	if (fieldCount <= 2) return 300; // Few columns - wider
	if (fieldCount <= 4) return 220; // Medium - balanced
	return 180; // Many columns - compact but readable
};

// Storage key for column widths based on collection and fields
const getStorageKey = () => {
	if (!props.collection) return null;
	// Include sorted fields in key so different field selections get their own widths
	const fieldsKey = [...props.fields].sort().join(',');
	return `review-table-widths:${props.collection}:${fieldsKey}`;
};

// Load saved widths from localStorage
const loadSavedWidths = () => {
	const key = getStorageKey();
	if (!key) return null;
	try {
		const saved = localStorage.getItem(key);
		return saved ? JSON.parse(saved) : null;
	} catch {
		return null;
	}
};

// Save widths to localStorage
const saveWidths = () => {
	const key = getStorageKey();
	if (!key) return;
	try {
		localStorage.setItem(key, JSON.stringify({ ...columnWidths }));
	} catch {
		// Ignore storage errors
	}
};

// Reactive column widths - initialize with computed widths
const columnWidths = reactive({});

// Initialize column widths when fields change
watch(() => props.fields, (newFields) => {
	if (newFields) {
		const savedWidths = loadSavedWidths();
		newFields.forEach(field => {
			if (!(field in columnWidths)) {
				// Use saved width if available, otherwise calculate initial width
				columnWidths[field] = savedWidths?.[field] || getInitialColumnWidth(field);
			}
		});
	}
}, { immediate: true });

// Column resize functionality
const resizing = ref(null); // { field, startX, startWidth }

const startResize = (event, field) => {
	event.preventDefault();
	resizing.value = {
		field,
		startX: event.clientX,
		startWidth: columnWidths[field] || 150
	};
	document.addEventListener('mousemove', handleResize);
	document.addEventListener('mouseup', stopResize);
	document.body.style.cursor = 'col-resize';
	document.body.style.userSelect = 'none';
};

const handleResize = (event) => {
	if (!resizing.value) return;
	const diff = event.clientX - resizing.value.startX;
	const newWidth = Math.max(80, resizing.value.startWidth + diff); // Minimum 80px
	columnWidths[resizing.value.field] = newWidth;
};

const stopResize = () => {
	resizing.value = null;
	document.removeEventListener('mousemove', handleResize);
	document.removeEventListener('mouseup', stopResize);
	document.body.style.cursor = '';
	document.body.style.userSelect = '';
	// Save widths to localStorage after resize
	saveWidths();
};

// Cleanup on unmount
onUnmounted(() => {
	document.removeEventListener('mousemove', handleResize);
	document.removeEventListener('mouseup', stopResize);
});

// Handle cell edits - emit to parent
const handleCellUpdate = (itemId, field, newValue) => {
	emit('edit', itemId, { [field]: newValue });
};
</script>

<style scoped>
.table-layout {
	width: 100%;
	height: calc(100vh - 200px); /* Fill available height */
	min-height: 400px;
	display: flex;
	flex-direction: column;
}

/* Custom table container - full width with horizontal scroll for content */
.custom-table-container {
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border: 1px solid var(--border-subdued);
	border-radius: var(--border-radius);
	background: var(--background-page);
}

.table-wrapper {
	flex: 1;
	overflow: auto;
	position: relative;
	/* Force GPU acceleration for better layer handling */
	transform: translateZ(0);
	will-change: transform;
}

/* Custom table styles */
.custom-table {
	width: 100%;
	border-collapse: separate;
	border-spacing: 0;
	table-layout: fixed;
}

/* Header styles */
.custom-table thead {
	position: sticky;
	top: 0;
	z-index: 20;
}

.custom-table th {
	background: var(--background-subdued);
	padding: 12px 16px;
	text-align: left;
	font-weight: 600;
	font-size: 13px;
	color: var(--foreground-normal);
	border-bottom: 2px solid var(--border-normal);
	white-space: nowrap;
}

/* Content column headers - resizable */
.content-header {
	position: relative;
	padding-right: 16px; /* Space for resize handle */
}

.header-text {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* Resize handle - positioned at right edge of header */
.resize-handle {
	position: absolute;
	top: 0;
	right: 0;
	width: 8px;
	height: 100%;
	cursor: col-resize;
	background: transparent;
	z-index: 10;
}

/* Visible resize indicator line - subtle gray line */
.resize-handle::before {
	content: '';
	position: absolute;
	top: 25%;
	right: 2px;
	width: 1px;
	height: 50%;
	background: var(--border-subdued, #e4e4e4);
	transition: background 0.15s ease;
}

/* Darker on hover */
.resize-handle:hover::before,
.content-header:hover .resize-handle::before {
	background: var(--foreground-subdued, #a2b5cd);
}

/* Sticky columns (Status & Actions) - pinned to right with solid backgrounds */
.sticky-header,
.sticky-cell {
	position: sticky;
	right: 0;
	z-index: 100;
	background-color: #F8F7F4 !important;
}

/* Content cells - clip overflow so text doesn't extend past cell bounds */
.content-header,
.content-cell {
	position: relative;
	z-index: 1;
	overflow: hidden;
	/* Force paint containment to clip content properly */
	contain: paint;
}

/* Status header/cell positioning */
.status-header {
	right: 100px; /* Width of actions column */
	width: 160px;
	min-width: 160px;
	text-align: center;
	border-left: 1px solid var(--border-subdued);
}

.status-cell-td {
	right: 100px; /* Width of actions column */
	width: 160px;
	min-width: 160px;
	text-align: center;
	border-left: 1px solid var(--border-subdued);
	padding-left: 16px !important;
	padding-right: 8px !important;
}

/* Actions header/cell positioning */
.actions-header,
.actions-cell-td {
	right: 0;
	width: 100px;
	min-width: 100px;
	text-align: center;
}

/* Shadow to indicate sticky columns */
.status-header::before,
.status-cell-td::before {
	content: '';
	position: absolute;
	left: -10px;
	top: 0;
	bottom: 0;
	width: 10px;
	background: linear-gradient(to right, transparent, rgba(0,0,0,0.05));
	pointer-events: none;
}

/* Body cell styles */
.custom-table td {
	padding: 12px 16px;
	vertical-align: top;
	border-bottom: 1px solid var(--border-subdued);
	color: var(--foreground-normal);
	font-size: 14px;
	line-height: 1.5;
}

/* Content cells - allow text wrapping */
.content-cell {
	word-wrap: break-word;
	overflow-wrap: break-word;
	white-space: normal;
}

/* Row hover effect */
.custom-table tbody tr:hover td {
	background-color: #F0EFEC !important;
}

/* Ensure sticky cells maintain solid background on hover */
.custom-table tbody tr:hover .sticky-cell {
	background-color: #F0EFEC !important; /* Slightly darker than #F8F7F4 for hover */
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

/* Status chip styles - uniform width for all status types */
:deep(.status-approved),
:deep(.status-rejected),
:deep(.status-pending) {
	min-width: 80px;
	justify-content: center;
	text-align: center;
}

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

/* Status cell layout */
.status-cell {
	display: flex;
	align-items: center;
	gap: 8px;
	justify-content: flex-end;
	padding: 4px 8px;
}

.edited-badge {
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

/* Action buttons layout */
.action-buttons {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 4px;
}

.action-buttons :deep(.v-button) {
	min-width: 32px;
	height: 32px;
	transition: all 0.2s ease;
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
