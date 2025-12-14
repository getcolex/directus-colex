<template>
	<div
		ref="cellRef"
		class="editable-cell"
		:class="{
			'is-editing': isEditing,
			'is-editable': editable,
			'has-changes': hasChanges
		}"
	>
		<!-- Display Mode - click anywhere on cell to edit -->
		<div v-if="!isEditing" class="cell-display" @click.stop="startEdit">
			<span class="cell-value">{{ displayValue }}</span>
		</div>

		<!-- Edit Mode -->
		<div v-else class="cell-edit" @click.stop>
			<textarea
				ref="inputRef"
				v-model="localValue"
				class="edit-input"
				:style="{ minHeight: capturedHeight ? capturedHeight + 'px' : '36px' }"
				@blur="saveEdit"
				@keydown.escape.stop="cancelEdit"
				@keydown.ctrl.enter.stop="saveEdit"
				@keydown.meta.enter.stop="saveEdit"
			/>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';

const props = defineProps({
	value: {
		type: [String, Number, Boolean, Object],
		default: null
	},
	fieldName: {
		type: String,
		default: ''
	},
	editable: {
		type: Boolean,
		default: true
	}
});

const emit = defineEmits(['update']);

// State
const isEditing = ref(false);
const localValue = ref(props.value);
const originalValue = ref(props.value);
const inputRef = ref(null);
const cellRef = ref(null);
const capturedHeight = ref(null);

// Watch for external value changes
watch(() => props.value, (newVal) => {
	if (!isEditing.value) {
		localValue.value = newVal;
		originalValue.value = newVal;
	}
});

// Computed
const hasChanges = computed(() => {
	return localValue.value !== originalValue.value;
});

const displayValue = computed(() => {
	if (props.value === null || props.value === undefined) {
		return '—';
	}
	if (typeof props.value === 'boolean') {
		return props.value ? 'Yes' : 'No';
	}
	return String(props.value);
});

const inputType = computed(() => {
	if (typeof props.value === 'number') {
		return 'number';
	}
	return 'text';
});

// Methods
async function startEdit() {
	if (!props.editable) return;

	// Capture height before switching to edit mode
	if (cellRef.value) {
		capturedHeight.value = cellRef.value.offsetHeight;
	}

	isEditing.value = true;
	localValue.value = props.value;
	originalValue.value = props.value;

	await nextTick();
	if (inputRef.value) {
		inputRef.value.focus();
		inputRef.value.select();
	}
}

function saveEdit() {
	if (localValue.value !== originalValue.value) {
		emit('update', localValue.value);
	}
	isEditing.value = false;
	capturedHeight.value = null;
}

function cancelEdit() {
	localValue.value = originalValue.value;
	isEditing.value = false;
	capturedHeight.value = null;
}
</script>

<style scoped>
.editable-cell {
	display: flex;
	align-items: stretch;
	min-height: 24px;
	width: 100%;
	height: 100%;
}

.cell-display {
	display: flex;
	align-items: flex-end;
	width: 100%;
	height: 100%;
	gap: 8px;
}

.cell-value {
	flex: 1;
	word-wrap: break-word;
	overflow-wrap: break-word;
	white-space: normal;
	align-self: flex-start;
}

/* Subtle highlight on hover for editable cells */
.editable-cell.is-editable .cell-display {
	cursor: pointer;
	border-radius: var(--border-radius);
	transition: background-color 0.15s ease;
}

.editable-cell.is-editable:hover .cell-display {
	background-color: var(--background-normal-alt);
}

/* Edit mode styling */
.cell-edit {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: stretch;
}

.edit-input {
	width: 100%;
	height: 100%;
	min-height: 36px;
	padding: 8px 10px;
	background: var(--background-input);
	border: 2px solid var(--primary);
	border-radius: var(--border-radius);
	color: var(--foreground-normal);
	font-family: inherit;
	font-size: inherit;
	outline: none;
	resize: vertical;
	/* Text alignment and wrapping */
	text-align: left;
	vertical-align: top;
	word-wrap: break-word;
	overflow-wrap: break-word;
	white-space: pre-wrap;
}

.edit-input:focus {
	outline: none;
	box-shadow: 0 0 0 2px var(--primary-alt);
}

/* Visual feedback for changes */
.editable-cell.has-changes .edit-input {
	border-color: var(--warning);
}

/* When editing, fill the cell */
.editable-cell.is-editing {
	background: var(--background-subdued);
	border-radius: var(--border-radius);
}
</style>
