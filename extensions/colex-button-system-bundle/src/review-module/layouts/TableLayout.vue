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

		<!-- Flexbox-based table with fixed right columns -->
		<div v-else-if="items.length > 0" class="table-container">
			<!-- Header wrapper - syncs scroll with body -->
			<div class="header-wrapper" ref="headerWrapperRef">
				<div class="table-header">
					<!-- Content headers -->
					<div class="content-columns">
						<div
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
						</div>
					</div>
					<!-- Fixed headers (Status & Actions) -->
					<div class="fixed-columns fixed-columns-header">
						<div class="fixed-header status-header">Status</div>
						<div class="fixed-header actions-header">Actions</div>
					</div>
				</div>
			</div>

			<!-- Body rows -->
			<div class="table-body" ref="bodyScrollRef" @scroll="syncScroll">
				<div v-for="item in items" :key="item.id" class="table-row">
					<!-- Content cells -->
					<div class="content-columns">
						<div
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
						</div>
					</div>
					<!-- Fixed cells (Status & Actions) -->
					<div class="fixed-columns">
						<div class="fixed-cell status-cell">
							<div class="status-content">
								<div
									v-if="isEdited(item)"
									class="edited-badge"
								>
									<v-icon name="edit" small />
								</div>
								<v-chip :class="`status-${item.output_status}`" small>
									{{ item.output_status }}
								</v-chip>
							</div>
						</div>
						<div class="fixed-cell actions-cell">
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
						</div>
					</div>
				</div>
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

// Refs for scroll sync
const headerWrapperRef = ref(null);
const bodyScrollRef = ref(null);

// Sync horizontal scroll between header and body
const syncScroll = (e) => {
	if (headerWrapperRef.value) {
		headerWrapperRef.value.scrollLeft = e.target.scrollLeft;
	}
};

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

// Check if item was content-edited (not just status-changed)
const isEdited = (item) => {
	if (!item.date_updated) return false;

	const updated = new Date(item.date_updated).getTime();

	// For reviewed items: was content edited after the review?
	if (item.reviewed_at) {
		const reviewed = new Date(item.reviewed_at).getTime();
		// 2 second buffer for near-simultaneous operations
		return (updated - reviewed) > 2000;
	}

	// For pending items (never reviewed): was it edited after creation?
	if (item.date_created) {
		const created = new Date(item.date_created).getTime();
		// 5 second buffer for creation variance
		return (updated - created) > 5000;
	}

	return false;
};
</script>

<style scoped>
.table-layout {
	width: 100%;
	height: calc(100vh - 200px);
	min-height: 400px;
	display: flex;
	flex-direction: column;
}

/* Main table container */
.table-container {
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border: 1px solid var(--border-subdued);
	border-radius: var(--border-radius);
	background: var(--background-page);
}

/* Header wrapper - handles horizontal scroll sync */
.header-wrapper {
	flex-shrink: 0;
	overflow-x: hidden; /* Hide scrollbar, sync'd via JS */
	border-bottom: 2px solid var(--border-normal);
	background: var(--background-subdued);
}

/* Header row */
.table-header {
	display: flex;
	min-width: fit-content; /* Expand to fit content */
}

/* Body container - scrollable both directions */
.table-body {
	flex: 1;
	overflow: auto;
}

/* Each data row - must be wide enough for content + fixed columns */
.table-row {
	display: flex;
	border-bottom: 1px solid var(--border-subdued);
	min-width: fit-content; /* Row expands to fit all content */
}

.table-row:hover {
	background-color: #F0EFEC;
}

/* Content columns container */
.content-columns {
	display: flex;
	flex-shrink: 0; /* Don't shrink - allow overflow for scroll */
}

/* Header content columns need same styling */
.table-header .content-columns {
	display: flex;
	flex-shrink: 0;
}

/* Fixed columns container - never shrinks or grows */
.fixed-columns {
	display: flex;
	flex: 0 0 260px; /* 160px Status + 100px Actions */
	border-left: 1px solid var(--border-subdued);
	background-color: #F8F7F4;
}

/* Fixed columns need sticky positioning to stay visible during scroll */
.fixed-columns {
	position: sticky;
	right: 0;
	z-index: 10;
}

/* Ensure fixed columns stay visible */
.table-row:hover .fixed-columns {
	background-color: #F0EFEC;
}

/* Content header cells */
.content-header {
	position: relative;
	flex-shrink: 0;
	padding: 12px 16px;
	padding-right: 24px; /* Space for resize handle */
	font-weight: 600;
	font-size: 13px;
	color: var(--foreground-normal);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.header-text {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* Resize handle */
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

.resize-handle:hover::before,
.content-header:hover .resize-handle::before {
	background: var(--foreground-subdued, #a2b5cd);
}

/* Content cells */
.content-cell {
	flex-shrink: 0;
	padding: 12px 16px;
	font-size: 14px;
	line-height: 1.5;
	color: var(--foreground-normal);
	word-wrap: break-word;
	overflow-wrap: break-word;
	overflow: hidden;
}

/* Fixed header cells */
.fixed-header {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 12px 16px;
	font-weight: 600;
	font-size: 13px;
	color: var(--foreground-normal);
	white-space: nowrap;
	background-color: #F8F7F4;
}

.status-header {
	width: 160px;
	min-width: 160px;
	max-width: 160px;
}

.actions-header {
	width: 100px;
	min-width: 100px;
	max-width: 100px;
}

/* Fixed body cells */
.fixed-cell {
	display: flex;
	align-items: flex-start;
	justify-content: center;
	padding: 12px 8px;
}

.status-cell {
	width: 160px;
	min-width: 160px;
	max-width: 160px;
}

.actions-cell {
	width: 100px;
	min-width: 100px;
	max-width: 100px;
}

/* Status content layout */
.status-content {
	display: flex;
	align-items: center;
	gap: 8px;
	justify-content: flex-end;
	width: 100%;
}

.edited-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: var(--foreground-subdued);
	border-radius: 4px;
	padding: 0 6px;
	height: 24px;
	color: var(--background-page);
	flex-shrink: 0;
}

/* Action buttons */
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

.action-buttons :deep(.v-button[secondary]) {
	--v-button-background-color: transparent;
	--v-button-background-color-hover: var(--background-normal);
	--v-button-color: var(--foreground-subdued);
	--v-button-color-hover: var(--foreground-normal);
	border: 1px solid var(--border-normal);
}

.action-buttons :deep(.v-button.active-approve) {
	--v-button-background-color: var(--success);
	--v-button-background-color-hover: var(--success-125);
	--v-button-color: white;
	border: none;
}

.action-buttons :deep(.v-button.active-reject) {
	--v-button-background-color: var(--danger);
	--v-button-background-color-hover: var(--danger-125);
	--v-button-color: white;
	border: none;
}

.action-buttons :deep(.v-button:hover:not(:disabled)) {
	transform: translateY(-1px);
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.action-buttons :deep(.v-button:disabled) {
	opacity: 0.4;
	cursor: not-allowed;
}

/* Status chip styles */
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

/* Loading skeleton */
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
</style>
