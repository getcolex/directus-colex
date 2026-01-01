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

		<div ref="cardRef" class="card-content" :style="isEditMode && capturedContentHeight ? { minHeight: capturedContentHeight + 'px' } : {}">
			<!-- View Mode -->
			<div v-if="!isEditMode" class="metadata">
				<h4 v-if="item.name" class="item-name">{{ item.name }}</h4>
				<p v-if="item.rationale" class="rationale">{{ item.rationale }}</p>

				<!-- Display other fields -->
				<div v-for="field in displayFields" :key="field" class="field-display">
					<label>{{ formatFieldName(field) }}</label>
					<span>{{ item[field] }}</span>
				</div>
			</div>

			<!-- Edit Mode -->
			<div v-else class="metadata edit-mode">
				<!-- Name field (if exists) -->
				<div v-if="'name' in item" class="field-edit">
					<label>Name</label>
					<textarea
						v-model="editData.name"
						@blur="saveField('name')"
						@keydown.escape="cancelEdit"
						@keydown.ctrl.enter="saveField('name')"
						@keydown.meta.enter="saveField('name')"
						class="edit-input"
					/>
				</div>

				<!-- Rationale field (if exists) -->
				<div v-if="'rationale' in item" class="field-edit">
					<label>Rationale</label>
					<textarea
						v-model="editData.rationale"
						@blur="saveField('rationale')"
						@keydown.escape="cancelEdit"
						@keydown.ctrl.enter="saveField('rationale')"
						@keydown.meta.enter="saveField('rationale')"
						class="edit-input"
					/>
				</div>

				<!-- Other editable fields -->
				<div v-for="field in displayFields" :key="field" class="field-edit">
					<label>{{ formatFieldName(field) }}</label>
					<textarea
						v-model="editData[field]"
						@blur="saveField(field)"
						@keydown.escape="cancelEdit"
						@keydown.ctrl.enter="saveField(field)"
						@keydown.meta.enter="saveField(field)"
						class="edit-input"
					/>
				</div>
			</div>

			<!-- Card Actions -->
			<div class="card-actions">
				<!-- Edit/Done button -->
				<v-button
					v-if="permissions.edit"
					small
					secondary
					@click.stop="toggleEditMode"
				>
					<v-icon :name="isEditMode ? 'check' : 'edit'" x-small />
					{{ isEditMode ? 'Done' : 'Edit' }}
				</v-button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
	item: {
		type: Object,
		required: true
	},
	fields: {
		type: Array,
		default: () => []
	},
	permissions: {
		type: Object,
		default: () => ({ edit: true, delete: false })
	}
});

const emit = defineEmits(['approve', 'reject', 'delete', 'edit']);

// Edit mode state
const isEditMode = ref(false);
const editData = ref({ ...props.item });
const originalData = ref({ ...props.item });
const cardRef = ref(null);
const capturedContentHeight = ref(null);

// Sync editData when item prop changes (after save/refresh)
watch(() => props.item, (newItem) => {
	if (!isEditMode.value) {
		editData.value = { ...newItem };
		originalData.value = { ...newItem };
	}
}, { deep: true });

// Format field names for display
const formatFieldName = (field) => {
	return field
		.replace(/_/g, ' ')
		.replace(/\b\w/g, c => c.toUpperCase());
};

// Toggle edit mode
const toggleEditMode = () => {
	if (isEditMode.value) {
		// Exiting edit mode
		isEditMode.value = false;
		capturedContentHeight.value = null;
	} else {
		// Capture height before switching to edit mode
		if (cardRef.value) {
			capturedContentHeight.value = cardRef.value.offsetHeight;
		}
		// Entering edit mode - copy current item data
		editData.value = { ...props.item };
		originalData.value = { ...props.item };
		isEditMode.value = true;
	}
};

// Save a single field (auto-save on blur/Enter)
const saveField = (field) => {
	if (editData.value[field] !== originalData.value[field]) {
		emit('edit', { [field]: editData.value[field] });
		// Update original to prevent re-saving same value
		originalData.value[field] = editData.value[field];
	}
};

// Cancel edit mode
const cancelEdit = () => {
	editData.value = { ...props.item };
	isEditMode.value = false;
	capturedContentHeight.value = null;
};

// Auto-detect image field
const imageUrl = computed(() => {
	// Try common image field names
	const imageFields = ['url', 'image', 'thumbnail_url', 'file', 'image_url', 'thumbnail'];
	for (const field of imageFields) {
		if (props.item[field]) {
			// If it's a Directus file object, extract the ID
			if (typeof props.item[field] === 'object' && props.item[field].id) {
				return `/assets/${props.item[field].id}`;
			}
			// If it's a direct URL or path
			if (typeof props.item[field] === 'string') {
				// If it's a UUID (Directus file ID), construct URL
				if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(props.item[field])) {
					return `/assets/${props.item[field]}`;
				}
				return props.item[field];
			}
		}
	}
	return null;
});

const isApproved = computed(() => props.item.output_status === 'approved');
const isRejected = computed(() => props.item.output_status === 'rejected');
const isEdited = computed(() => {
	return props.item.date_updated && props.item.date_created &&
		new Date(props.item.date_updated) > new Date(props.item.date_created);
});

const cardClasses = computed(() => ({
	approved: isApproved.value,
	rejected: isRejected.value,
	editing: isEditMode.value
}));

// Fields to display (exclude system fields and image fields)
const displayFields = computed(() => {
	const excludeFields = ['id', 'output_status', 'reviewed_by', 'reviewed_at', 'task_id', 'task_run_id', 'url', 'image', 'thumbnail_url', 'file', 'name', 'rationale', 'date_created', 'date_updated'];
	return props.fields.filter(f => !excludeFields.includes(f));
});

const confirmDelete = () => {
	if (confirm('Delete this output?')) {
		emit('delete');
	}
};

const toggleReject = () => {
	if (props.item.output_status === 'rejected') {
		emit('approve');  // Toggle back to approved
	} else {
		emit('reject');  // Toggle to rejected
	}
};

const openImage = () => {
	if (imageUrl.value) {
		window.open(imageUrl.value, '_blank');
	}
};
</script>

<style scoped>
.image-card {
	border: 2px solid var(--border-normal);
	border-radius: 8px;
	overflow: hidden;
	transition: all 0.2s;
	position: relative;
	background: var(--background-page);
	break-inside: avoid;
	margin-bottom: 16px;
	display: inline-block;
	width: 100%;
}

.image-card:hover {
	border-color: var(--border-normal-alt);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.image-card.approved {
	border-color: var(--success);
}

.image-card.rejected {
	opacity: 0.7;
}

.status-header {
	display: flex;
	gap: 4px;
	padding: 12px 12px 0;
	justify-content: flex-end;
}

.image-container {
	position: relative;
	overflow: hidden;
	cursor: pointer;
	background: var(--background-subdued);
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 150px;
}

.image-container img {
	width: 100%;
	height: auto;
	display: block;
	transition: all 0.3s ease;
}

/* Rejected state - dull/grayscale */
.image-card.rejected .image-container img {
	filter: grayscale(100%);
	opacity: 0.4;
}


.status-badges {
	position: absolute;
	top: 8px;
	right: 8px;
	display: flex;
	gap: 4px;
}

.status-badge {
	padding: 4px 8px;
	background: var(--background-page);
	border-radius: 4px;
	font-size: 11px;
	text-transform: uppercase;
	font-weight: 600;
	letter-spacing: 0.5px;
}

.status-badge.status-edited {
	background: var(--primary);
	color: white;
	display: flex;
	align-items: center;
	justify-content: center;
}

.status-badge.status-approved {
	background: var(--success);
	color: white;
}

.status-badge.status-rejected {
	background: var(--danger);
	color: white;
}

.status-badge.status-pending {
	background: var(--warning);
	color: white;
}

.card-content {
	padding: 12px;
	display: flex;
	flex-direction: column;
}

.metadata {
	margin-bottom: 12px;
	flex: 1;
	display: flex;
	flex-direction: column;
}

.item-name {
	margin: 0 0 8px;
	font-size: 14px;
	font-weight: 600;
	color: var(--foreground-normal);
}

.rationale {
	font-size: 12px;
	color: var(--foreground-subdued);
	margin: 0 0 12px;
	line-height: 1.4;
}

.field-display {
	margin-bottom: 6px;
	font-size: 12px;
}

.field-display label {
	display: block;
	color: var(--foreground-subdued);
	margin-bottom: 2px;
	text-transform: capitalize;
}

.field-display span {
	color: var(--foreground-normal);
}

/* Edit Mode Styles */
.edit-mode {
	display: flex;
	flex-direction: column;
	gap: 12px;
	flex: 1;
}

.field-edit {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1;
}

.field-edit label {
	font-size: 11px;
	color: var(--foreground-subdued);
	text-transform: uppercase;
	font-weight: 600;
	letter-spacing: 0.5px;
}

.edit-input {
	width: 100%;
	padding: 8px 10px;
	background: var(--background-input);
	border: 1px solid var(--border-normal);
	border-radius: var(--border-radius);
	color: var(--foreground-normal);
	font-family: inherit;
	font-size: 13px;
	outline: none;
	transition: border-color 0.15s ease;
	flex: 1;
	min-height: 36px;
	/* Text alignment and wrapping */
	text-align: left;
	vertical-align: top;
	word-wrap: break-word;
	overflow-wrap: break-word;
	white-space: pre-wrap;
}

.edit-input:focus {
	border-color: var(--primary);
	box-shadow: 0 0 0 2px var(--primary-alt);
}

/* Edited indicator */
.edited-indicator {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 11px;
	color: var(--foreground-subdued);
	margin-bottom: 8px;
}

/* Card Actions */
.card-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	padding-top: 12px;
	border-top: 1px solid var(--border-subdued);
	margin-top: 8px;
}

.card-actions :deep(.v-button) {
	transition: all 0.2s ease;
}

/* Edit mode card styling */
.image-card.editing {
	border-color: var(--primary);
}
</style>
