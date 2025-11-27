<template>
	
	<div v-if="buttons.length && buttons.length > 0" class="button-container">
		<button
			v-for="(button, index) in buttons"
			:key="index"
			:class="['custom-button', button.style]"
			:disabled="button.disabled"
			@click="handleClick(button.action, $event)"
		>
			{{ button.name }}
		</button>
	</div>
</template>

<script lang="ts">
import { defineComponent, PropType,  toRefs, ref, watchEffect, computed } from 'vue';
import { useApi,  useItems,  useStores } from '@directus/extensions-sdk';


const query = {
			fields: ref(["id","Action","status"]),
			limit: ref(-1),
			sort: ref(null),
			search: ref(null),
			filter: ref({}),
			page: ref(1),
			}


export default defineComponent({
	props: {
		value: {
			type: [String, Object, Array] as PropType<string | Record<string, any> | Array<any>>,
			required: false,
			default: null,
		},
		collection: {
			type: String,
			required: false,
			default: null,
		},
		// You may have other props like 'options', 'item', 'primaryKey'
		// which are common in Directus displays. I'll add 'options' for completeness.
		options: {
			type: Object,
			default: () => ({}),
		},
		item: {
			type: Object,
			default: () => ({}),
		},
		primaryKey: {
			type: String,
			default: 'id',
		},
		
	},
	setup: function (props) {
		const { value, item, collection } = toRefs(props);
		const api = useApi();
		const { useNotificationsStore } = useStores();
		const notificationsStore = useNotificationsStore();
		const isButtonDisabled = ref(true); // Buttons are disabled by default
		const isCheckingStatus = ref(true); // To know if we are currently fetching data
		const { getItems, items } = useItems(collection, query);

		
		
		//const { getItems, items } = useItems(collection, query);
		//getItems(); // Fetch all items once on setup

		const createNotification = (notification: any) => {
			notificationsStore.add(notification);
		};

		// This function checks the status of the previous task
		async function checkPreviousTaskStatus(): Promise<void> {
			isCheckingStatus.value = true;
		
			try {
				const currentTaskId = (value.value as any)?.task_id;
		
				if (!currentTaskId || !items.value || items.value.length === 0) {
					isButtonDisabled.value = true;
					return;
				}
		
				// Find the current task from the items list
				const currentTask = (items.value as any[]).find((task: any) => task.name === currentTaskId);
		
				if (!currentTask) {
					isButtonDisabled.value = true; // Current task not found
					return;
				}
		
				const dependentTaskNamesStr = currentTask.dependent_tasks.split(',');
				// If there are no dependent tasks, the button should be enabled.
				if (!dependentTaskNamesStr) {
					isButtonDisabled.value = false;
					return;
				}
		
				const dependentTaskNames = dependentTaskNamesStr.split(',').map((name: string) => name.trim());
		
				// Check if all dependent tasks are 'done'
				const allDependenciesMet = dependentTaskNames.every((depName: string) => {
					const dependentTask = (items.value as any[]).find((task: any) => task.name === depName);
					// If a dependent task is not found or its status is not 'done', the condition is not met.
					return dependentTask && dependentTask.status === 'done';
				});
		
				isButtonDisabled.value = !allDependenciesMet;
			} catch (error) {
				console.error('Error in checkPreviousTaskStatus:', error);
				isButtonDisabled.value = true; // Disable button on error
			} finally {
				isCheckingStatus.value = false;
			}
		}  

		watchEffect(async() => {
			// This will run on setup and whenever item.value changes,
			// effectively refreshing the status when the table row updates.
			await getItems();
			await checkPreviousTaskStatus();
		});

		async function triggerFlow(flowId: string) {
			if (!flowId) {
				console.warn('Flow trigger button clicked, but no flow ID was provided.');
				return;
			}
			try {
				// Use POST to trigger a flow. Pass current item context.
				const response = await api.get(`/flows/trigger/${flowId}`);
				console.log(response.data);
				createNotification({
					title: 'Flow Triggered',
					message: `The flow was started successfully.`,
				});
			} catch (error: any) {
				console.error('Failed to trigger flow:', error);
				createNotification({
					title: 'Error',
					message: error.message || 'An unknown error occurred while triggering the flow.',
					type: 'error',
				});
			}
		}

		function handleClick(action: Record<string, any> | null, event?: MouseEvent) {
			if (!action || !action.type) return;

			// Handle 'link' type action
			if (action.type === 'link' && typeof action.href === 'string') {
				window.open(action.href, '_blank', 'noopener,noreferrer');
				return;
			}

			// Handle 'flow' type action
			if (action.type === 'flow' && typeof action.id === 'string') {
				event?.stopPropagation();
				triggerFlow(action.id);
				return;
			}
		}

		const buttons = computed(() => {
			if (value.value && typeof value.value === 'object' && Array.isArray((value.value as any).button)) {
				const buttonsArray = (value.value as any).button;
				return buttonsArray.map((btn: any) => ({
					name: btn.name || 'Button',
					action: btn.onClick || null,
					style: btn.style || 'primary',
					// Use the reactive state variables for the disabled status
					disabled: (btn.onClick.type == 'flow') && (!btn.onClick || isButtonDisabled.value || isCheckingStatus.value),
				}));
			}
			return [];
		});

		return {
			buttons,
			handleClick,
			checkPreviousTaskStatus
		};
	},
});
</script>

<style scoped>
.button-container {
	display: flex;
	gap: 8px;
	align-items: center;
	height: 100%;
}
.custom-button {
	display: inline-flex;
	align-items: center;
	padding: 4px 10px;
	font-weight: 600;
	font-size: 14px;
	transition: background-color 0.15s ease-in-out;
	white-space: nowrap;
	border: none;
	cursor: pointer;
}


/* Primary Style (Default) */
.custom-button.primary {
	background-color: var(--primary);
	color: var(--white);
}
.custom-button.primary:hover:not(:disabled) {
	background-color: var(--primary-125);
}

/* Secondary Style */
.custom-button.secondary {
	background-color: var(--background-normal);
	color: var(--foreground-normal);
	border: 1px solid var(--border-normal);
}
.custom-button.secondary:hover:not(:disabled) {
	background-color: var(--background-normal-alt);
}

/* Danger Style */
.custom-button.danger {
	background-color: var(--danger);
	color: var(--white);
}
.custom-button.danger:hover:not(:disabled) {
	background-color: var(--danger-125);
}

/* Disabled State */
.custom-button:disabled {
	background-color: var(--background-normal);
	color: var(--foreground-subdued);
	cursor: not-allowed;
	border: 1px solid var(--border-subdued);
}
</style>
