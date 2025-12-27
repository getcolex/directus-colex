import { useApi, useStores } from '@directus/extensions-sdk';

export function useApproval(collection) {
	const api = useApi();
	const { useNotificationsStore } = useStores();
	const notificationsStore = useNotificationsStore();

	// Shared validation
	const validateCollection = () => {
		if (!collection.value) {
			throw new Error('Collection is required');
		}
	};

	// Generic batch status update using Directus batch PATCH
	const updateItemsStatus = async (ids, status, successMessage) => {
		validateCollection();

		if (ids.length === 0) return;

		const reviewedAt = new Date().toISOString();
		const payload = ids.map(id => ({
			id,
			output_status: status,
			reviewed_at: reviewedAt
		}));

		try {
			await api.patch(`/items/${collection.value}`, payload);

			notificationsStore.add({
				title: 'Success',
				text: successMessage,
				type: 'success'
			});
		} catch (error) {
			notificationsStore.add({
				title: 'Error',
				text: `Failed to update outputs`,
				type: 'error'
			});
			throw error;
		}
	};

	// Approve multiple items (batch)
	const approve = async (ids) => {
		await updateItemsStatus(ids, 'approved', `Approved ${ids.length} output(s)`);
	};

	// Reject multiple items (batch)
	const reject = async (ids) => {
		await updateItemsStatus(ids, 'rejected', `Rejected ${ids.length} output(s)`);
	};

	// Approve all remaining (batch) - same as approve but with different message
	const approveAllRemaining = async (ids) => {
		await updateItemsStatus(ids, 'approved', `Approved ${ids.length} remaining output(s)`);
	};

	// Delete multiple items (sequential - Directus REST doesn't support batch DELETE)
	const deleteOutputs = async (ids) => {
		validateCollection();

		try {
			// Directus REST API doesn't support batch DELETE, so we use Promise.all for parallel execution
			await Promise.all(ids.map(id => api.delete(`/items/${collection.value}/${id}`)));

			notificationsStore.add({
				title: 'Success',
				text: `Deleted ${ids.length} output(s)`,
				type: 'success'
			});
		} catch (error) {
			notificationsStore.add({
				title: 'Error',
				text: 'Failed to delete outputs',
				type: 'error'
			});
			throw error;
		}
	};

	// Edit single item
	const edit = async (id, changes) => {
		validateCollection();

		try {
			await api.patch(`/items/${collection.value}/${id}`, changes);

			notificationsStore.add({
				title: 'Success',
				text: 'Output updated',
				type: 'success'
			});
		} catch (error) {
			notificationsStore.add({
				title: 'Error',
				text: 'Failed to update output',
				type: 'error'
			});
			throw error;
		}
	};

	// Create single item
	const create = async (data) => {
		validateCollection();

		try {
			const response = await api.post(`/items/${collection.value}`, {
				...data,
				output_status: 'approved',
				reviewed_at: new Date().toISOString()
			});

			notificationsStore.add({
				title: 'Success',
				text: 'Output created',
				type: 'success'
			});

			return response.data.data;
		} catch (error) {
			notificationsStore.add({
				title: 'Error',
				text: 'Failed to create output',
				type: 'error'
			});
			throw error;
		}
	};

	return {
		approve,
		reject,
		deleteOutputs,
		edit,
		create,
		approveAllRemaining
	};
}
