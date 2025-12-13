import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter, action }, { services, getSchema, logger }) => {
	const { ItemsService } = services;

	// Listen for task updates
	action('items.update', async ({ payload, key, collection }, { database, schema, accountability }) => {
		if (collection !== 'tasks') return;

		// Only process if webhook_triggered was set to true
		if (!payload?.webhook_triggered) return;

		try {
			const tasksService = new ItemsService('tasks', { database, schema, accountability });
			const task = await tasksService.readOne(key, {
				fields: ['id', 'webhook_url', 'webhook_method', 'button_context', 'name', 'project_id']
			});

			if (!task) {
				logger.warn(`Task ${key} not found for webhook trigger`);
				return;
			}

			// Get webhook URL and method from task or button_context
			const webhookUrl = task.webhook_url || task.button_context?.webhook_url;
			const webhookMethod = task.webhook_method || task.button_context?.webhook_method || 'POST';

			if (!webhookUrl) {
				logger.warn(`Task ${key} has no webhook URL configured`);
				return;
			}

			logger.info(`Triggering webhook for task ${key} (${task.name}): ${webhookMethod} ${webhookUrl}`);

			// Make the webhook call server-side
			const response = await fetch(webhookUrl, {
				method: webhookMethod,
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'Directus-Webhook-Trigger/1.0'
				},
				body: webhookMethod !== 'GET' ? JSON.stringify({
					task_id: task.id,
					task_name: task.name,
					project_id: task.project_id,
					timestamp: new Date().toISOString()
				}) : undefined
			});

			const responseText = await response.text();
			
			logger.info(`Webhook response for task ${key}: ${response.status} ${response.statusText}`);
			
			if (response.ok) {
				logger.info(`Webhook response body: ${responseText}`);
				
				// Update task to mark webhook as completed
				await tasksService.updateOne(key, {
					webhook_triggered: false, // Reset the trigger
					webhook_last_status: response.status,
					webhook_last_response: responseText.substring(0, 1000), // Limit to 1000 chars
					last_webhook_trigger: new Date().toISOString()
				});
			} else {
				logger.error(`Webhook failed for task ${key}: ${response.status} ${responseText}`);
				
				await tasksService.updateOne(key, {
					webhook_triggered: false,
					webhook_last_status: response.status,
					webhook_last_error: `${response.status}: ${responseText.substring(0, 500)}`,
					last_webhook_trigger: new Date().toISOString()
				});
			}

		} catch (error) {
			logger.error(`Error triggering webhook for task ${key}: ${error.message}`);
			
			try {
				const tasksService = new ItemsService('tasks', { database, schema, accountability });
				await tasksService.updateOne(key, {
					webhook_triggered: false,
					webhook_last_error: error.message,
					last_webhook_trigger: new Date().toISOString()
				});
			} catch (updateError) {
				logger.error(`Failed to update task after webhook error: ${updateError.message}`);
			}
		}
	});
});
