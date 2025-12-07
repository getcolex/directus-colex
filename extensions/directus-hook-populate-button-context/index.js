/**
 * Hook: Auto-populate button_context field on configured collections
 *
 * This hook ensures that the button_context field is always up-to-date
 * with the item's current state, providing all necessary data for dynamic
 * button actions without needing API calls.
 *
 * Supports multiple collections with different field mappings.
 * To add a new collection, simply add an entry to COLLECTION_CONFIG.
 */

// Collection configuration - easy to extend
// Adding a new collection = just add a new entry here
const COLLECTION_CONFIG = {
	tasks: {
		titleField: 'title',
		syncFields: ['status', 'title', 'output_collection', 'display_fields', 'project_id', 'action_types']
	},
	shipping_tasks: {
		titleField: 'name',
		syncFields: ['status', 'name', 'output_collection', 'display_fields', 'project_id', 'action_types']
	}
};

// Helper: Build button_context object for an item
function buildButtonContext(item, config) {
	return {
		task_id: item.id,
		project_id: item.project_id || null,
		action_types: item.action_types || [],
		output_collection: item.output_collection || null,
		status: item.status || 'new',
		title: item[config.titleField] || 'Untitled Task',
		display_fields: item.display_fields || null
	};
}

export default ({ filter, action }) => {
	// Filter hook for creates - populate button_context before insert
	filter('items.create', async (input, { collection }) => {
		const config = COLLECTION_CONFIG[collection];
		if (!config) return input;

		console.log(`[populate-button-context] Creating ${collection} item, populating button_context`);

		// Auto-populate button_context with item data
		input.button_context = {
			task_id: input.id || null,
			project_id: input.project_id || null,
			action_types: input.action_types || [],
			output_collection: input.output_collection || null,
			status: input.status || 'new',
			title: input[config.titleField] || 'Untitled Task',
			display_fields: input.display_fields || null
		};

		return input;
	});

	// Action hook for creates - ensures button_context has correct ID after auto-generation
	action('items.create', async ({ payload, key, collection }, { database }) => {
		const config = COLLECTION_CONFIG[collection];
		if (!config) return;

		console.log(`[populate-button-context] Post-create: Ensuring button_context has correct ID for ${collection}`);

		try {
			const item = await database(collection).where({ id: key }).first();
			if (!item) return;

			const button_context = buildButtonContext(item, config);

			await database(collection)
				.where({ id: key })
				.update({ button_context: JSON.stringify(button_context) });

			console.log(`[populate-button-context] Created button_context for ${collection} ${key}`);
		} catch (error) {
			console.error(`[populate-button-context] Error in post-create hook for ${collection}:`, error);
		}
	});

	// Action hook for updates - merges changes with existing button_context
	action('items.update', async ({ payload, keys, collection }, { database }) => {
		const config = COLLECTION_CONFIG[collection];
		if (!config) return;

		// Only sync if relevant fields were updated
		const hasRelevantUpdate = config.syncFields.some(field => payload[field] !== undefined);
		if (!hasRelevantUpdate) return;

		console.log(`[populate-button-context] Post-update: Syncing button_context for ${collection} keys:`, keys);

		try {
			for (const key of keys) {
				const item = await database(collection).where({ id: key }).first();
				if (!item) continue;

				console.log(`[populate-button-context] Item fetched:`, JSON.stringify({
					id: item.id,
					project_id: item.project_id,
					action_types: item.action_types,
					status: item.status
				}));

				// Parse existing button_context or create new
				let button_context = {};
				if (item.button_context) {
					try {
						button_context = typeof item.button_context === 'string'
							? JSON.parse(item.button_context)
							: item.button_context;
					} catch (e) {
						button_context = {};
					}
				}

				// Merge with current item values using config
				const updated = buildButtonContext(item, config);
				console.log(`[populate-button-context] Built context:`, JSON.stringify(updated));
				button_context = { ...button_context, ...updated };

				await database(collection)
					.where({ id: key })
					.update({ button_context: JSON.stringify(button_context) });

				console.log(`[populate-button-context] Synced button_context for ${collection} ${key}`);
			}
		} catch (error) {
			console.error(`[populate-button-context] Error in post-update hook for ${collection}:`, error);
		}
	});
};
