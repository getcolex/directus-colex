/**
 * Hook: Task Dependency Resolution (v2)
 *
 * Automatically updates dependent tasks to 'ready' status when all their
 * dependencies are marked as 'done'.
 *
 * How it works:
 * 1. Watches for task updates where status becomes 'done'
 * 2. Finds all tasks in the same project that depend on this task
 * 3. For each dependent task, checks if ALL its dependencies are 'done'
 * 4. If yes, updates the dependent task to 'ready' status
 *
 * Supports: tasks and shipping_tasks collections
 */

// Parse JSON field (handles string or array)
function parseJsonField(value) {
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch (e) {
			return null;
		}
	}
	return value;
}

// Collections that support task dependencies
const SUPPORTED_COLLECTIONS = ['tasks', 'shipping_tasks'];

export default ({ action }, { services, getSchema }) => {
	const { ItemsService } = services;

	action('items.update', async (meta, context) => {
		const { payload, keys, collection } = meta;

		// Only process supported collections
		if (!SUPPORTED_COLLECTIONS.includes(collection)) return;

		// Only process when task is marked as 'done'
		if (payload?.status !== 'done') return;

		try {
			const schema = await getSchema();
			const itemsService = new ItemsService(collection, {
				schema,
				accountability: { admin: true }, // Bypass permissions for system operation
			});

			// Process each updated task
			for (const taskId of keys) {
				// Get the completed task details
				const completedTask = await itemsService.readOne(taskId, {
					fields: ['*'],
				});

				if (!completedTask) continue;

				const completedTaskName = completedTask.name;

				// Find all tasks in the same project that might depend on this task
				const potentialDependents = await itemsService.readByQuery({
					filter: {
						_and: [
							{ project_id: { _eq: completedTask.project_id } },
							{ status: { _eq: 'new' } }, // Only 'new' tasks can become 'ready'
							{ depends_on: { _nnull: true } }, // Must have dependencies
						],
					},
					fields: ['id', 'name', 'depends_on', 'status'],
				});

				if (potentialDependents.length === 0) continue;

				// Filter tasks that actually depend on the completed task
				const dependentTasks = potentialDependents.filter((task) => {
					const dependencies = parseJsonField(task.depends_on);
					if (!Array.isArray(dependencies)) return false;
					return dependencies.includes(completedTaskName);
				});

				if (dependentTasks.length === 0) continue;

				// Check each dependent task to see if ALL its dependencies are done
				for (const dependentTask of dependentTasks) {
					const dependencies = parseJsonField(dependentTask.depends_on);
					if (!Array.isArray(dependencies) || dependencies.length === 0) continue;

					// Get status of all dependency tasks
					const dependencyTasks = await itemsService.readByQuery({
						filter: {
							_and: [
								{ name: { _in: dependencies } },
								{ project_id: { _eq: completedTask.project_id } },
							],
						},
						fields: ['id', 'name', 'status'],
					});

					// Verify all dependencies exist and are 'done'
					const allDependenciesExist = dependencyTasks.length === dependencies.length;
					const allDependenciesDone = dependencyTasks.every((task) => task.status === 'done');

					if (allDependenciesExist && allDependenciesDone) {
						// All dependencies are complete - mark this task as ready
						await itemsService.updateOne(dependentTask.id, {
							status: 'ready',
						});
					}
				}
			}
		} catch (error) {
			// Silently fail - don't block task updates
			// In production, you might want to log this to a monitoring service
		}
	});
};
