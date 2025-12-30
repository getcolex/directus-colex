import { ref, computed, watch } from 'vue';
import { useItems } from '@directus/extensions-sdk';

export function useOutputs(collection, filter) {
	const outputs = ref([]);
	const loading = ref(false);
	const error = ref(null);

	const stats = computed(() => {
		const total = outputs.value?.length || 0;
		const pending = outputs.value?.filter(o => o.output_status === 'pending').length || 0;
		const approved = outputs.value?.filter(o => o.output_status === 'approved').length || 0;
		const rejected = outputs.value?.filter(o => o.output_status === 'rejected').length || 0;

		return { total, pending, approved, rejected };
	});

	// Build query object for useItems
	const query = {
		fields: ref(['*']),
		limit: ref(-1),
		sort: ref(['-id']),
		filter: filter,
	};

	// Use the official useItems composable
	const { getItems, items, loading: itemsLoading, error: itemsError } = useItems(collection, query);

	// Watch items from useItems and sync to outputs
	watch(items, (newItems) => {
		outputs.value = newItems || [];
	}, { immediate: true });

	// Watch loading state
	watch(itemsLoading, (newLoading) => {
		loading.value = newLoading;
	}, { immediate: true });

	// Watch error state
	watch(itemsError, (newError) => {
		if (newError) {
			error.value = newError;
		}
	}, { immediate: true });

	const refresh = async () => {
		if (!collection.value) {
			return;
		}

		loading.value = true;
		error.value = null;

		try {
			await getItems();
		} catch (err) {
			error.value = err;
		} finally {
			loading.value = false;
		}
	};

	// Auto-fetch on mount
	refresh();

	return {
		outputs,
		loading,
		stats,
		refresh,
		error
	};
}
