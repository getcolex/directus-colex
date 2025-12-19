<template>
	<div class="cell-renderer">
		<!-- Status column with chip -->
		<v-chip v-if="columnType === 'status'" :class="`status-${item.output_status}`" small>
			{{ item.output_status || 'unknown' }}
		</v-chip>

		<!-- Actions column with three-dot menu -->
		<v-menu v-else-if="columnType === 'actions'" show-arrow placement="bottom-end">
			<template #activator="{ toggle }">
				<v-icon
					name="more_vert"
					clickable
					@click.stop="toggle"
					class="action-trigger"
				/>
			</template>

			<v-list>
				<v-list-item
					v-if="item.output_status !== 'approved' && permissions.edit"
					clickable
					@click="$emit('approve', item.id)"
				>
					<v-list-item-icon>
						<v-icon name="check" color="var(--success)" />
					</v-list-item-icon>
					<v-list-item-content>
						<v-text-overflow :text="'Approve'" />
					</v-list-item-content>
				</v-list-item>

				<v-list-item
					v-if="item.output_status !== 'rejected' && permissions.edit"
					clickable
					@click="$emit('reject', item.id)"
				>
					<v-list-item-icon>
						<v-icon name="close" color="var(--danger)" />
					</v-list-item-icon>
					<v-list-item-content>
						<v-text-overflow :text="'Reject'" />
					</v-list-item-content>
				</v-list-item>

				<v-divider v-if="permissions.delete && permissions.edit" />

				<v-list-item
					v-if="permissions.delete"
					clickable
					@click="$emit('delete', item.id)"
				>
					<v-list-item-icon>
						<v-icon name="delete" color="var(--danger)" />
					</v-list-item-icon>
					<v-list-item-content>
						<v-text-overflow :text="'Delete'" />
					</v-list-item-content>
				</v-list-item>
			</v-list>
		</v-menu>

		<!-- Regular data fields with tooltip -->
		<span
			v-else
			v-tooltip="shouldShowTooltip ? String(value) : undefined"
			class="cell-value"
		>
			{{ value || '—' }}
		</span>
	</div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
	item: {
		type: Object,
		required: true
	},
	fieldKey: {
		type: String,
		required: true
	},
	permissions: {
		type: Object,
		default: () => ({ edit: true, delete: false })
	}
});

const emit = defineEmits(['approve', 'reject', 'delete']);

// Determine column type
const columnType = computed(() => {
	if (props.fieldKey === 'output_status') return 'status';
	if (props.fieldKey === 'actions') return 'actions';
	return 'data';
});

// Get the value for data fields
const value = computed(() => {
	return props.item[props.fieldKey];
});

// Show tooltip for long text
const shouldShowTooltip = computed(() => {
	if (!value.value) return false;
	return String(value.value).length > 50;
});
</script>

<style scoped>
.cell-renderer {
	display: contents; /* Make wrapper transparent to layout */
}

.cell-value {
	display: block;
	max-width: 200px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.action-trigger {
	cursor: pointer;
	transition: color 0.2s;
}

.action-trigger:hover {
	color: var(--primary);
}
</style>
