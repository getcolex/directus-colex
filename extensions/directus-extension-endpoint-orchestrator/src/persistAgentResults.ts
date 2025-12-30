/**
 * Persist agent results to Directus collections.
 * Returns counts of items created and updated.
 */
export async function persistAgentResults(
  agent: any,
  requestBody: any,
  agentResponse: any,
  context: {
    services: any;
    schema: any;
    accountability: any;
    run: string;
    logger: any;
    traceId: string;
    getSchema: () => Promise<any>;
  }
): Promise<{ items_created: number; items_updated: number }> {
  let items_created = 0;
  let items_updated = 0;
  const { services, schema, accountability, run, logger, traceId, getSchema } = context;

  if (agent.agent_type === 'enrichment' && agentResponse.enriched_fields) {
    const freshSchema = await getSchema();
    const historyService = new services.ItemsService('enrichment_history', {
      schema: freshSchema,
      accountability: { admin: true },
    });
    const itemsService = new services.ItemsService(requestBody.collection, {
      schema: freshSchema,
      accountability: { admin: true },
    });

    const currentItem = await itemsService.readOne(requestBody.item_id);

    for (const [fieldName, newValue] of Object.entries(agentResponse.enriched_fields)) {
      const oldValue = currentItem[fieldName];

      const versionHistory = await historyService.readByQuery({
        filter: {
          item_id: { _eq: String(requestBody.item_id) },
          collection: { _eq: requestBody.collection },
          field_name: { _eq: fieldName },
        },
        sort: ['-version'],
        limit: 1,
        fields: ['version'],
      });

      const nextVersion = (versionHistory[0]?.version || 0) + 1;

      await historyService.createOne({
        item_id: String(requestBody.item_id),
        collection: requestBody.collection,
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
        enriched_at: new Date().toISOString(),
        enriched_by_run: run,
        version: nextVersion,
        cost_usd: agentResponse.cost_usd || 0,
        confidence_score: agentResponse.confidence_score || null,
        can_rollback: true,
      });
    }

    await itemsService.updateOne(requestBody.item_id, agentResponse.enriched_fields);
    items_updated = 1;
    logger.info(`[Orchestrator] ${traceId} - Saved enrichment history (${Object.keys(agentResponse.enriched_fields).length} fields)`);
  } else if (agent.agent_type === 'workflow') {
    const freshSchema = await getSchema();
    const outputCollection = requestBody.task?.output_collection || agent.output_collection || 'brand_inspirations';
    const outputMode = requestBody.task?.output_mode || agentResponse.output_mode || 'records';
    const projectId = requestBody.project?.id || requestBody.context?.project_id || null;
    const taskId = requestBody.task_id;
    const sourceItemId = requestBody.source_item_id || requestBody.context?.source_item_id;

    const outputService = new services.ItemsService(outputCollection, {
      schema: freshSchema,
      accountability: { admin: true },
    });

    const agentUpdateData = agentResponse.update || agentResponse.enriched_fields;
    if (outputMode === 'update' && agentUpdateData && Object.keys(agentUpdateData).length > 0) {
      logger.info(`[Orchestrator] ${traceId} - Update mode: upserting to ${outputCollection}`);

      const updatePayload: any = { ...agentUpdateData };
      if (projectId) updatePayload.project_id = projectId;

      delete updatePayload.confidence;

      try {
        if (projectId) {
          const existing = await outputService.readByQuery({
            filter: { project_id: { _eq: projectId } },
            limit: 1,
          });

          if (existing && existing.length > 0) {
            await outputService.updateOne(existing[0].id, updatePayload);
            items_updated = 1;
            logger.info(`[Orchestrator] ${traceId} - Updated existing record ${existing[0].id} in ${outputCollection}`);
          } else {
            const created = await outputService.createOne(updatePayload);
            items_created = 1;
            logger.info(`[Orchestrator] ${traceId} - Created new record ${created} in ${outputCollection}`);
          }
        } else {
          const created = await outputService.createOne(updatePayload);
          items_created = 1;
          logger.info(`[Orchestrator] ${traceId} - Created record ${created} in ${outputCollection} (no project_id)`);
        }
      } catch (error: any) {
        logger.error(`[Orchestrator] ${traceId} - Failed to upsert record in ${outputCollection}:`, error.message);
      }
    } else if (agentResponse.records && agentResponse.records.length > 0) {
      logger.info(`[Orchestrator] ${traceId} - Records mode: writing ${agentResponse.records.length} records to ${outputCollection}`);

      for (const record of agentResponse.records) {
        try {
          const recordToCreate: any = { ...record };
          if (projectId) recordToCreate.project_id = projectId;
          if (taskId) recordToCreate.task_id = taskId;
          if (sourceItemId) recordToCreate.source_item_id = sourceItemId;

          await outputService.createOne(recordToCreate);
          items_created++;
        } catch (error: any) {
          logger.error(`[Orchestrator] ${traceId} - Failed to create record in ${outputCollection}:`, error.message);
        }
      }

      logger.info(`[Orchestrator] ${traceId} - Created ${items_created}/${agentResponse.records.length} records in ${outputCollection}`);
    } else {
      logger.info(`[Orchestrator] ${traceId} - Workflow completed for task ${requestBody.task_id} (no data to persist)`);
    }
  }

  return { items_created, items_updated };
}
