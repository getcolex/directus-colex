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

export default ({ action }, { services, getSchema, logger }) => {
	const { ItemsService } = services;

	action('items.update', async (meta) => {
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

			// Optimization: Fetch all updated tasks in one query instead of N+1
			const completedTasks = await itemsService.readByQuery({
				filter: { id: { _in: keys } },
				fields: ['*'],
			});

			// Process each updated task
			await Promise.all(completedTasks.map(async (completedTask) => {
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

				if (potentialDependents.length === 0) return;

				// Filter tasks that actually depend on the completed task
				const dependentTasks = potentialDependents.filter((task) => {
					const dependencies = parseJsonField(task.depends_on);
					if (!Array.isArray(dependencies)) return false;
					return dependencies.includes(completedTaskName);
				});

				if (dependentTasks.length === 0) return;

				// Check each dependent task to see if ALL its dependencies are done
				await Promise.all(dependentTasks.map(async (dependentTask) => {
					const dependencies = parseJsonField(dependentTask.depends_on);
					if (!Array.isArray(dependencies) || dependencies.length === 0) return;

					// Optimization: Filter out the task we just finished (we know it's done)
					const remainingDependencies = dependencies.filter(name => name !== completedTaskName);

					// If that was the only dependency, we are ready!
					if (remainingDependencies.length === 0) {
						await itemsService.updateOne(dependentTask.id, {
							status: 'ready',
						});
						return;
					}

					// Get status of REMAINING dependency tasks
					const dependencyTasks = await itemsService.readByQuery({
						filter: {
							_and: [
								{ name: { _in: remainingDependencies } },
								{ project_id: { _eq: completedTask.project_id } },
							],
						},
						fields: ['id', 'name', 'status'],
					});

					// Verify all dependencies exist and are 'done'
					const allDependenciesExist = dependencyTasks.length === remainingDependencies.length;
					const allDependenciesDone = dependencyTasks.every((task) => task.status === 'done');

					if (allDependenciesExist && allDependenciesDone) {
						// All dependencies are complete - mark this task as ready
						await itemsService.updateOne(dependentTask.id, {
							status: 'ready',
						});
					}
				}));
			}));
		} catch (error) {
			logger.warn(`[Task Dependency] Error processing update: ${error.message}`);
		}
	});
};
