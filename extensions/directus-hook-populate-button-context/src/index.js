/**
 * Populate Button Context Hook
 * Auto-populates button_context field on tasks when created/updated
 */

export default ({ action }, { services, getSchema }) => {
  const { ItemsService } = services;

  action('items.create', async (meta, { database, schema, accountability }) => {
    const { collection, key, payload } = meta;

    if (collection !== 'tasks') return;

    try {
      const itemsService = new ItemsService('configurable_buttons', {
        schema,
        accountability: { admin: true }
      });

      // Get buttons configured for this task's status
      const buttons = await itemsService.readByQuery({
        filter: {
          collection: { _eq: 'tasks' },
          status: { _eq: 'active' }
        }
      });

      if (buttons.length > 0) {
        const tasksService = new ItemsService('tasks', {
          schema,
          accountability: { admin: true }
        });

        await tasksService.updateOne(key, {
          button_context: JSON.stringify({
            buttons: buttons.map(b => b.id),
            updated_at: new Date().toISOString()
          })
        });
      }
    } catch (error) {
      console.error('[populate-button-context] Error:', error.message);
    }
  });
};
