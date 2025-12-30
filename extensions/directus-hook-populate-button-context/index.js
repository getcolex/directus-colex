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
		titleField: 'name',
		syncFields: ['status', 'name', 'output_collection', 'display_fields', 'project_id', 'action_type', 'action_config', 'needs_approval', 'flow_id', 'webhook_url', 'webhook_method', 'link_url', 'module_path']
	},
	shipping_tasks: {
		titleField: 'name',
		syncFields: ['status', 'name', 'output_collection', 'display_fields', 'project_id', 'action_type', 'action_config', 'needs_approval', 'flow_id', 'webhook_url', 'webhook_method', 'link_url', 'module_path']
	}
};

// Helper: Parse JSON field (handles string or array/object)
function parseJsonField(value, fallback = null) {
	if (value === null || value === undefined) return fallback;
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch (e) {
			return fallback;
		}
	}
	return value;
}

// Helper: Build button_context object for an item
function buildButtonContext(item, config) {
	return {
		task_id: item.id,
		project_id: item.project_id || null,
		action_type: item.action_type || null,
		action_config: parseJsonField(item.action_config, null),
		output_collection: item.output_collection || null,
		status: item.status || 'new',
		title: item[config.titleField] || 'Untitled Task',
		display_fields: parseJsonField(item.display_fields, null),
		needs_approval: item.needs_approval || false,
		// Action-specific fields for dynamic button configuration
		flow_id: item.flow_id || null,
		webhook_url: item.webhook_url || null,
		webhook_method: item.webhook_method || 'POST',
		link_url: item.link_url || null,
		module_path: item.module_path || null
	};
}

export default ({ filter, action }) => {
	// Filter hook for creates - populate button_context before insert
	filter('items.create', async (input, { collection }) => {
		const config = COLLECTION_CONFIG[collection];
		if (!config) return input;

		// Auto-populate button_context with item data
		input.button_context = {
			task_id: input.id || null,
			project_id: input.project_id || null,
			action_type: input.action_type || null,
			action_config: parseJsonField(input.action_config, null),
			output_collection: input.output_collection || null,
			status: input.status || 'new',
			title: input[config.titleField] || 'Untitled Task',
			display_fields: parseJsonField(input.display_fields, null),
			needs_approval: input.needs_approval || false,
			// Action-specific fields for dynamic button configuration
			flow_id: input.flow_id || null,
			webhook_url: input.webhook_url || null,
			webhook_method: input.webhook_method || 'POST',
			link_url: input.link_url || null,
			module_path: input.module_path || null
		};

		return input;
	});

	// Action hook for creates - ensures button_context has correct ID after auto-generation
	action('items.create', async ({ payload, key, collection }, { database }) => {
		const config = COLLECTION_CONFIG[collection];
		if (!config) return;

		try {
			const item = await database(collection).where({ id: key }).first();
			if (!item) return;

			const button_context = buildButtonContext(item, config);

			await database(collection)
				.where({ id: key })
				.update({ button_context: JSON.stringify(button_context) });
		} catch (error) {
			// Silently fail - don't block item creation
		}
	});

	// Action hook for updates - merges changes with existing button_context
	action('items.update', async ({ payload, keys, collection }, { database }) => {
		const config = COLLECTION_CONFIG[collection];
		if (!config) return;

		// Only sync if relevant fields were updated
		const hasRelevantUpdate = config.syncFields.some(field => payload[field] !== undefined);
		if (!hasRelevantUpdate) return;

		try {
			for (const key of keys) {
				const item = await database(collection).where({ id: key }).first();
				if (!item) continue;

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
				button_context = { ...button_context, ...updated };

				await database(collection)
					.where({ id: key })
					.update({ button_context: JSON.stringify(button_context) });
			}
		} catch (error) {
			// Silently fail - don't block item update
		}
	});
};
