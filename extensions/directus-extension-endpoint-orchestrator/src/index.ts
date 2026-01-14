// Legacy endpoint export pattern (not using defineEndpoint)
import { persistAgentResults } from './persistAgentResults';

/**
 * Circuit Breaker implementation for resilient agent calls
 */
class CircuitBreaker {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  failureCount: number = 0;
  threshold: number;
  timeout: number;
  resetTimeout: number;
  openedAt: number | null = null;
  nextRetry: number | null = null;
  name: string;

  constructor({
    threshold = 5,
    timeout = 60000,
    resetTimeout = 30000,
    name = 'CircuitBreaker',
  }: {
    threshold?: number;
    timeout?: number;
    resetTimeout?: number;
    name?: string;
  }) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.resetTimeout = resetTimeout;
    this.name = name;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextRetry!) {
        this.state = 'HALF_OPEN';
        console.log(`[${this.name}] Transitioning to HALF_OPEN state (testing recovery)`);
      } else {
        const retryIn = Math.ceil((this.nextRetry! - Date.now()) / 1000);
        throw new Error(`Circuit breaker OPEN (retry in ${retryIn}s after ${this.failureCount} failures)`);
      }
    }

    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') {
        console.log(`[${this.name}] Success in HALF_OPEN → Closing circuit`);
        this.close();
      }
      this.failureCount = 0;
      return result;
    } catch (error: any) {
      this.failureCount++;
      console.log(`[${this.name}] Failure ${this.failureCount}/${this.threshold}:`, error.message);
      if (this.state === 'HALF_OPEN' || this.failureCount >= this.threshold) {
        this.open();
      }
      throw error;
    }
  }

  open(): void {
    this.state = 'OPEN';
    this.openedAt = Date.now();
    this.nextRetry = this.openedAt + this.timeout;
    const retryTime = new Date(this.nextRetry).toLocaleTimeString();
    console.log(`[${this.name}] ⚠️  Circuit OPENED (${this.failureCount} consecutive failures, retry at ${retryTime})`);
  }

  close(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.openedAt = null;
    this.nextRetry = null;
    console.log(`[${this.name}] ✓ Circuit CLOSED (normal operation resumed)`);
  }

  getState(): {
    state: string;
    failureCount: number;
    threshold: number;
    openedAt: number | null;
    nextRetry: number | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      threshold: this.threshold,
      openedAt: this.openedAt,
      nextRetry: this.nextRetry,
    };
  }

  reset(): void {
    console.log(`[${this.name}] Manual reset`);
    this.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const circuitBreakers = new Map<string, CircuitBreaker>();

function getOrCreateCircuitBreaker(agentId: string, agentName?: string): CircuitBreaker {
  if (!circuitBreakers.has(agentId)) {
    circuitBreakers.set(
      agentId,
      new CircuitBreaker({
        threshold: 5,
        timeout: 60000,
        resetTimeout: 30000,
        name: `CB-${agentName || agentId.substring(0, 8)}`,
      })
    );
  }
  return circuitBreakers.get(agentId)!;
}

function determineTriggerType(requestBody: any, agentType: string): string {
  if (requestBody.scheduled_trigger) return 'scheduled';
  if (requestBody.manual_trigger) return 'manual';
  if (agentType === 'enrichment') return 'enrichment';
  return 'task';
}

async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn(attempt);
      if (attempt > 1) {
        console.log(`[Retry] ✓ Success on attempt ${attempt}`);
      }
      return result;
    } catch (error: any) {
      lastError = error;
      if (attempt === maxRetries) {
        console.log(`[Retry] ✗ Failed after ${maxRetries} attempts:`, error.message);
        throw error;
      }
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay) + Math.random() * 1000;
      console.log(`[Retry] Attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${Math.ceil(delay)}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function performHealthCheck(agent: any, logger: any): Promise<boolean> {
  if (!agent.health_endpoint) return true;

  try {
    const response = await fetch(agent.health_endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error: any) {
    logger.warn(`[Health] Agent ${agent.name} health check failed:`, error.message);
    return false;
  }
}

function calculateCost(tokensUsed: number, model: string): number {
  if (!tokensUsed) return 0;

  const costPerMillion: Record<string, number> = {
    'claude-3.5-sonnet': 0.003,
    'claude-3-opus': 0.015,
    'gpt-4': 0.03,
    'gpt-3.5-turbo': 0.0015,
  };

  const rate = costPerMillion[model] || costPerMillion['claude-3.5-sonnet'];
  return (tokensUsed / 1000000) * rate;
}

function validateAgentOutput(output: any, agent: any): { valid: boolean; errors: string[] | null } {
  const errors: string[] = [];

  if (!output || typeof output !== 'object') {
    errors.push('Output is not an object');
    return { valid: false, errors };
  }

  if (agent.agent_type === 'enrichment' && !output.enriched_fields) {
    errors.push('Missing enriched_fields');
  }

  if (agent.agent_type === 'workflow' && output.items_created === undefined) {
    errors.push('Missing items_created count');
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : null };
}

async function determineFieldsToEnrich(
  itemId: string,
  collection: string,
  fieldsToEnrich: string[],
  currentData: any,
  services: any,
  schema: any,
  logger: any,
  traceId: string
): Promise<string[]> {
  logger.info(`[DetermineFields] ${traceId} - Checking ${fieldsToEnrich?.length || 0} fields`);

  if (!fieldsToEnrich || fieldsToEnrich.length === 0) return [];

  logger.info(`[DetermineFields] ${traceId} - Creating enrichment_history service`);
  const historyService = new services.ItemsService('enrichment_history', {
    schema,
    accountability: { admin: true },
  });
  logger.info(`[DetermineFields] ${traceId} - enrichment_history service created`);

  const fieldsNeedingEnrichment: string[] = [];
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

  for (const field of fieldsToEnrich) {
    try {
      const history = await historyService.readByQuery({
        filter: {
          item_id: { _eq: String(itemId) },
          collection: { _eq: collection },
          field_name: { _eq: field },
        },
        sort: ['-enriched_at'],
        limit: 1,
      });

      const lastEnrichment = history[0];
      if (lastEnrichment) {
        const age = Date.now() - new Date(lastEnrichment.enriched_at).getTime();
        const currentValue = currentData[field];

        if (age < maxAge && JSON.stringify(lastEnrichment.new_value) === JSON.stringify(currentValue)) {
          logger.info(`[Orchestrator] ${traceId} - Skipping ${field} (enriched ${Math.floor(age / 86400000)} days ago)`);
          continue;
        }
      }

      fieldsNeedingEnrichment.push(field);
    } catch (error: any) {
      logger.warn(`[Orchestrator] ${traceId} - Error checking history for ${field}:`, error.message);
      fieldsNeedingEnrichment.push(field);
    }
  }

  logger.info(`[Orchestrator] ${traceId} - Fields to enrich: ${fieldsNeedingEnrichment.length}/${fieldsToEnrich.length}`);
  return fieldsNeedingEnrichment;
}

async function buildAgentPayload(
  agent: any,
  requestBody: any,
  context: {
    services: any;
    schema: any;
    accountability: any;
    logger: any;
    traceId: string;
    getSchema: () => Promise<any>;
    ItemsService: any;
  }
): Promise<any> {
  const { services, schema, accountability, logger, traceId, getSchema, ItemsService } = context;

  if (agent.agent_type === 'workflow') {
    const freshSchema = await getSchema();
    const tasksService = new ItemsService('tasks', {
      schema: freshSchema,
      accountability: { admin: true },
    });

    const task = await tasksService.readOne(requestBody.task_id, {
      fields: ['*', 'project_id.*'],
    });

    // Determine directus_item: either from source_collection or task.input_data
    let directusItem = task.input_data || {};
    let resolvedSourceItemId = requestBody.source_item_id;

    // If task has source_collection configured, fetch from that collection
    if (task.source_collection) {
      const sourceService = new ItemsService(task.source_collection, {
        schema: freshSchema,
        accountability: { admin: true },
      });

      // Auto-lookup source_item_id if not provided but source_collection is set
      if (!resolvedSourceItemId) {
        const projectId = task.project_id?.id || task.project_id;
        if (projectId) {
          logger.info(`[BuildPayload] ${traceId} - Auto-lookup: finding source item in ${task.source_collection} for project ${projectId}`);
          const sourceItems = await sourceService.readByQuery({
            filter: { project_id: { _eq: projectId } },
            sort: ['-date_created'],
            limit: 1,
          });
          if (sourceItems && sourceItems.length > 0) {
            resolvedSourceItemId = sourceItems[0].id;
            logger.info(`[BuildPayload] ${traceId} - Auto-lookup: found source item ${resolvedSourceItemId}`);
          } else {
            logger.warn(`[BuildPayload] ${traceId} - Auto-lookup: no source item found in ${task.source_collection} for project ${projectId}`);
          }
        }
      }

      // Fetch the source item if we have an ID
      if (resolvedSourceItemId) {
        logger.info(`[BuildPayload] ${traceId} - Fetching from source_collection: ${task.source_collection}/${resolvedSourceItemId}`);
        directusItem = await sourceService.readOne(resolvedSourceItemId);
        logger.info(`[BuildPayload] ${traceId} - Loaded source item with ${Object.keys(directusItem || {}).length} fields`);
      }
    }

    // Include directus_item at root level for agent compatibility
    // Agents expect either directus_item or current_data with the input data
    return {
      task_id: task.id,
      task: {
        title: task.title || task.name,
        name: task.name,
        description: task.description,
        input_data: task.input_data,
        action_type: task.action_type,
        // Include generalist agent fields
        source_collection: task.source_collection,
        output_collection: task.output_collection,
        output_mode: task.output_mode,
        field_mappings: task.field_mappings,
        prompt: task.prompt,
        instructions: task.instructions,
        model: task.model,
        model_tier: task.model_tier,
        tool_mode: task.tool_mode,
      },
      project: task.project_id,
      tenant_id: task.tenant_id,
      source_item_id: resolvedSourceItemId,
      // Provide input data as directus_item for agent server compatibility
      directus_item: directusItem,
      context: {
        trace_id: traceId,
        task_id: task.id,
        project_id: task.project_id?.id || task.project_id || null,
        source_collection: task.source_collection,
        source_item_id: resolvedSourceItemId,
      },
    };
  }

  if (agent.agent_type === 'enrichment') {
    logger.info(`[BuildPayload] ${traceId} - Getting fresh schema for admin access...`);
    const freshSchema = await getSchema();
    logger.info(`[BuildPayload] ${traceId} - Fresh schema collections: ${Object.keys(freshSchema.collections || {}).length} total`);
    logger.info(`[BuildPayload] ${traceId} - Collection ${requestBody.collection} in schema: ${!!freshSchema.collections?.[requestBody.collection]}`);

    logger.info(`[BuildPayload] ${traceId} - Creating itemsService for ${requestBody.collection} using direct ItemsService`);
    const itemsService = new ItemsService(requestBody.collection, {
      schema: freshSchema,
      accountability: { admin: true },
    });

    logger.info(`[BuildPayload] ${traceId} - Reading item ${requestBody.item_id} from ${requestBody.collection}`);
    const currentData = await itemsService.readOne(requestBody.item_id);
    logger.info(`[BuildPayload] ${traceId} - Item loaded successfully`);

    const fieldsToEnrich = await determineFieldsToEnrich(
      requestBody.item_id,
      requestBody.collection,
      requestBody.fields_to_enrich || agent.enrichment_config?.fields || [],
      currentData,
      services,
      schema,
      logger,
      traceId
    );

    return {
      item_id: requestBody.item_id,
      collection: requestBody.collection,
      fields_to_enrich: fieldsToEnrich,
      current_data: currentData,
    };
  }

  // Default payload for other agent types
  return {
    agent_name: agent.name,
    output_collection: agent.output_collection,
    agent_config: agent.enrichment_config || {},
  };
}

export default {
  id: 'orchestrator',
  handler: (router: any, context: any) => {
  const { services, exceptions, logger, env, getSchema } = context;

  console.log('🚀 [Orchestrator] Extension handler called - registering routes...');
  logger.info('🚀 [Orchestrator] Extension handler called - registering routes...');

  const { ItemsService } = services;

  // Main execute endpoint
  router.post('/execute', async (req: any, res: any) => {
    const { agent_type, action_type, agent_id, ...restBody } = req.body;
    const { accountability } = req;
    const traceId = crypto.randomUUID();
    const startTime = Date.now();

    logger.info(`[Orchestrator] ${traceId} - Execute request:`, {
      trace_id: traceId,
      agent_type,
      action_type,
      agent_id: agent_id || 'auto',
    });

    let runId: string | null = null;
    let agent: any = null;

    try {
      logger.info(`[Orchestrator] ${traceId} - Getting schema...`);
      const schema = await getSchema();
      logger.info(`[Orchestrator] ${traceId} - Schema obtained. Collections: ${Object.keys(schema.collections || {}).slice(0, 10).join(', ')}...`);

      logger.info(`[Orchestrator] ${traceId} - Creating registryService for agent_registry...`);
      const registryService = new ItemsService('agent_registry', {
        schema,
        accountability: { admin: true },
      });

      let filter: any;
      logger.info(`[Orchestrator] ${traceId} - registryService created`);

      if (agent_type === 'workflow' && action_type) {
        filter = {
          agent_type: 'workflow',
          action_type: { _eq: action_type },
          enabled: { _eq: true },
          health_status: { _in: ['healthy', 'degraded'] },
        };
      } else if (agent_id) {
        filter = {
          id: { _eq: agent_id },
          enabled: { _eq: true },
          health_status: { _in: ['healthy', 'degraded'] },
        };
      } else {
        throw new Error('Missing agent_type+action_type or agent_id');
      }

      logger.info(`[Orchestrator] ${traceId} - Querying agents with filter:`, filter);
      const agents = await registryService.readByQuery({
        filter,
        limit: 1,
        sort: ['-version'],
      });

      logger.info(`[Orchestrator] ${traceId} - Query returned ${agents?.length || 0} agents`);

      if (!agents || agents.length === 0) {
        logger.error(`[Orchestrator] ${traceId} - No healthy agent found`, { filter });
        return res.status(404).json({
          error: `No healthy agent found for ${JSON.stringify(filter)}`,
          trace_id: traceId,
        });
      }

      agent = agents[0];
      logger.info(`[Orchestrator] ${traceId} - Agent found: ${agent.name} v${agent.version || '1.0.0'}`);

      // Health check if needed
      const healthCheckAge = Date.now() - new Date(agent.last_health_check || 0).getTime();
      logger.info(`[Orchestrator] ${traceId} - Health check age: ${healthCheckAge}ms, endpoint: ${agent.health_endpoint}`);

      if (agent.health_endpoint && healthCheckAge > 60000) {
        logger.info(`[Orchestrator] ${traceId} - Performing health check`);
        const isHealthy = await performHealthCheck(agent, logger);
        logger.info(`[Orchestrator] ${traceId} - Health check result: ${isHealthy}`);

        logger.info(`[Orchestrator] ${traceId} - Updating agent health status...`);
        await registryService.updateOne(agent.id, {
          health_status: isHealthy ? 'healthy' : 'unhealthy',
          last_health_check: new Date().toISOString(),
        });
        logger.info(`[Orchestrator] ${traceId} - Agent health status updated`);

        if (!isHealthy) {
          throw new Error(`Agent ${agent.name} failed health check`);
        }
      }

      // Create run record
      logger.info(`[Orchestrator] ${traceId} - Creating runsService for agent_runs...`);
      const runsService = new ItemsService('agent_runs', {
        schema,
        accountability: { admin: true },
      });
      logger.info(`[Orchestrator] ${traceId} - runsService created`);

      logger.info(`[Orchestrator] ${traceId} - Creating agent_run record...`);
      runId = await runsService.createOne({
        agent_id: agent.id,
        agent_version: agent.version || '1.0.0',
        trigger_type: determineTriggerType(restBody, agent_type),
        status: 'running',
        started_at: new Date().toISOString(),
        input_payload: restBody,
        trace_id: traceId,
        tenant_id: accountability?.user?.tenant_id || null,
      });
      logger.info(`[Orchestrator] ${traceId} - Created run ${runId}`);

      // Build payload for agent
      const agentPayload = await buildAgentPayload(agent, restBody, {
        services,
        schema,
        accountability,
        logger,
        traceId,
        getSchema,
        ItemsService,
      });

      // Call agent with circuit breaker and retry
      const circuitBreaker = getOrCreateCircuitBreaker(agent.id, agent.name);
      const agentCallStart = Date.now();

      logger.info(`[Orchestrator] ${traceId} - Calling agent (circuit: ${circuitBreaker.getState().state})`);

      const agentResponse = await circuitBreaker.execute(async () =>
        retryWithBackoff(async (attempt) => {
          logger.info(`[Orchestrator] ${traceId} - HTTP request attempt ${attempt}`);

          const response = await fetch(agent.endpoint_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Trace-Id': traceId,
              'X-Run-Id': String(runId),
            },
            body: JSON.stringify(agentPayload),
            signal: AbortSignal.timeout((agent.timeout_seconds || 300) * 1000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Agent HTTP ${response.status}: ${errorText}`);
          }

          return response.json();
        }, agent.max_retries || 3)
      );

      const agentDuration = Math.floor((Date.now() - agentCallStart) / 1000);
      logger.info(`[Orchestrator] ${traceId} - Agent completed in ${agentDuration}s`);

      // Calculate cost and validate output
      const costUsd = calculateCost(agentResponse.tokens_used, agent.model || 'claude-3.5-sonnet');
      const validation = validateAgentOutput(agentResponse, agent);

      // Update run record
      await runsService.updateOne(runId, {
        completed_at: new Date().toISOString(),
        status: validation.valid ? 'success' : 'failed',
        duration_seconds: agentDuration,
        items_created: agentResponse.items_created || 0,
        items_updated: agentResponse.items_updated || 0,
        tokens_used: agentResponse.tokens_used || 0,
        cost_usd: costUsd,
        quality_score: agentResponse.confidence_score || null,
        validation_errors: validation.valid ? null : validation.errors,
        output_data: agentResponse,
        enriched_item_id: agent.agent_type === 'enrichment' ? restBody.item_id : null,
      });

      // Persist agent results (enrichment history or workflow records)
      const persistResult = await persistAgentResults(agent, { ...restBody, ...agentPayload }, agentResponse, {
        services,
        schema,
        accountability,
        run: runId,
        logger,
        traceId,
        getSchema,
      });

      // Update agent registry
      await registryService.updateOne(agent.id, {
        last_run_at: new Date().toISOString(),
        last_run_status: 'success',
        consecutive_failures: 0,
        circuit_breaker_state: circuitBreaker.getState().state,
      });

      const totalDuration = Math.floor((Date.now() - startTime) / 1000);
      logger.info(`[Orchestrator] ${traceId} - ✓ Completed successfully in ${totalDuration}s`, {
        cost_usd: costUsd,
        items_created: persistResult.items_created,
        items_updated: persistResult.items_updated,
      });

      return res.json({
        success: true,
        agent_id: agent.id,
        run_id: runId,
        trace_id: traceId,
        duration_seconds: totalDuration,
        cost_usd: costUsd,
        items_created: persistResult.items_created,
        items_updated: persistResult.items_updated,
      });
    } catch (error: any) {
      logger.error(`[Orchestrator] ${traceId} - ✗ Error: ${error.message}`, {
        error: error.message,
        stack: error.stack,
      });

      // Update run record with failure
      if (runId) {
        try {
          const schema = await getSchema();
          const runsService = new ItemsService('agent_runs', {
            schema,
            accountability: { admin: true },
          });
          await runsService.updateOne(runId, {
            completed_at: new Date().toISOString(),
            status: 'failed',
            error_message: error.message,
            duration_seconds: Math.floor((Date.now() - startTime) / 1000),
          });
        } catch (updateError: any) {
          logger.error(`[Orchestrator] ${traceId} - Failed to update run:`, updateError);
        }
      }

      // Update agent registry with failure
      if (agent?.id) {
        try {
          const schema = await getSchema();
          const registryService = new ItemsService('agent_registry', {
            schema,
            accountability: { admin: true },
          });
          await registryService.updateOne(agent.id, {
            consecutive_failures: (agent.consecutive_failures || 0) + 1,
            last_run_status: 'failed',
            circuit_breaker_state: getOrCreateCircuitBreaker(agent.id, agent.name).getState().state,
          });
        } catch (updateError: any) {
          logger.error(`[Orchestrator] ${traceId} - Failed to update registry:`, updateError);
        }
      }

      return res.status(500).json({ error: error.message, trace_id: traceId });
    }
  });

  // Health check endpoint
  router.get('/health', async (req: any, res: any) => {
    logger.info('🏥 [Orchestrator] Health check received');
    res.json({
      status: 'healthy',
      service: 'orchestrator',
      version: '2.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Webhook endpoint for batch processing
  router.post('/webhook', async (req: any, res: any) => {
    const { agent_name, agent_id, collection, item_id, item_ids, fields, callback_url } = req.body;
    const traceId = crypto.randomUUID();

    logger.info(`[Webhook] ${traceId} - Received webhook:`, {
      agent_name,
      agent_id,
      collection,
      item_id: item_id || item_ids,
    });

    try {
      const schema = await getSchema();
      let resolvedAgentId = agent_id;

      if (!resolvedAgentId && agent_name) {
        const registryService = new ItemsService('agent_registry', {
          schema,
          accountability: { admin: true },
        });
        const agents = await registryService.readByQuery({
          filter: { name: { _eq: agent_name }, enabled: { _eq: true } },
          limit: 1,
        });

        if (!agents || agents.length === 0) {
          return res.status(404).json({ error: `Agent '${agent_name}' not found`, trace_id: traceId });
        }

        resolvedAgentId = agents[0].id;
      }

      if (!resolvedAgentId) {
        return res.status(400).json({ error: 'Either agent_name or agent_id required', trace_id: traceId });
      }

      const itemsToProcess = item_ids || (item_id ? [item_id] : []);

      if (itemsToProcess.length === 0) {
        return res.status(400).json({ error: 'Either item_id or item_ids required', trace_id: traceId });
      }

      const results: any[] = [];

      for (const itemToProcess of itemsToProcess) {
        try {
          const payload = {
            agent_id: resolvedAgentId,
            item_id: String(itemToProcess),
            collection,
            fields_to_enrich: fields || [],
          };

          const response = await fetch(`http://localhost:${process.env.PORT || 8055}/orchestrator/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: req.headers.authorization || '',
              'X-Trace-Id': traceId,
            },
            body: JSON.stringify(payload),
          });

          const result = await response.json();
          results.push({
            item_id: itemToProcess,
            success: result.success || false,
            run_id: result.run_id,
            error: result.error,
          });
        } catch (error: any) {
          results.push({
            item_id: itemToProcess,
            success: false,
            error: error.message,
          });
        }
      }

      // Send callback if specified
      if (callback_url) {
        try {
          await fetch(callback_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trace_id: traceId, status: 'completed', results }),
          });
          logger.info(`[Webhook] ${traceId} - Callback sent to ${callback_url}`);
        } catch (error: any) {
          logger.warn(`[Webhook] ${traceId} - Callback failed:`, error.message);
        }
      }

      return res.json({
        success: true,
        trace_id: traceId,
        items_processed: results.length,
        results,
      });
    } catch (error: any) {
      logger.error(`[Webhook] ${traceId} - Error:`, error);
      return res.status(500).json({ error: error.message, trace_id: traceId });
    }
  });

  // List agents endpoint
  router.get('/agents', async (req: any, res: any) => {
    try {
      const schema = await getSchema();
      const registryService = new ItemsService('agent_registry', {
        schema,
        accountability: { admin: true },
      });

      const agents = await registryService.readByQuery({
        filter: { enabled: { _eq: true } },
        fields: ['id', 'name', 'agent_type', 'health_status', 'last_run_status'],
      });

      return res.json({
        agents: agents.map((agent: any) => ({
          id: agent.id,
          name: agent.name,
          type: agent.agent_type,
          status: agent.health_status,
          last_run: agent.last_run_status,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Rollback endpoint
  router.post('/enrichment/rollback', async (req: any, res: any) => {
    const { item_id, collection, field_name, version } = req.body;
    const traceId = crypto.randomUUID();

    try {
      const schema = await getSchema();
      const historyService = new ItemsService('enrichment_history', {
        schema,
        accountability: { admin: true },
      });

      const history = await historyService.readByQuery({
        filter: {
          item_id: { _eq: item_id },
          collection: { _eq: collection },
          field_name: { _eq: field_name },
          version: { _eq: version },
        },
        limit: 1,
      });

      if (!history || history.length === 0) {
        return res.status(404).json({ error: 'Version not found', trace_id: traceId });
      }

      const historyRecord = history[0];

      if (!historyRecord.can_rollback) {
        return res.status(403).json({ error: 'This enrichment cannot be rolled back', trace_id: traceId });
      }

      const itemsService = new ItemsService(collection, {
        schema,
        accountability: { admin: true },
      });

      await itemsService.updateOne(item_id, { [field_name]: historyRecord.old_value });

      logger.info(`[Rollback] ${traceId} - ${collection}/${item_id}.${field_name} → version ${version}`);

      return res.json({
        success: true,
        item_id,
        field_name,
        rolled_back_to_version: version,
        value: historyRecord.old_value,
        trace_id: traceId,
      });
    } catch (error: any) {
      logger.error(`[Rollback] ${traceId} - Error:`, error);
      return res.status(500).json({ error: error.message, trace_id: traceId });
    }
  });

  logger.info('✅ [Orchestrator] FINAL: All routes registered - /execute, /health, /webhook, /agents, /enrichment/rollback');
  console.log('✅ [Orchestrator] FINAL: All routes registered');
  }
};
