import 'dotenv/config';
import express from 'express';
import { executeAgent } from './agent.js';
import { validateInput, validateOutput } from './schema.js';

const app = express();
app.use(express.json());

// POST /execute - Main endpoint for task execution
app.post('/execute', async (req, res) => {
  const { task_id, execution_id, task, project, tenant_id } = req.body;

  console.log(`\n[Test Agent] ========================================`);
  console.log(`[Test Agent] Executing task: ${task_id || req.body.item_id || 'unknown'}`);
  console.log(`[Test Agent] ========================================\n`);

  try {
    // 1. Validate input
    console.log('[Test Agent] Step 1: Validating input...');
    let rawInput;
    if (req.body.item_id && req.body.collection) {
      rawInput = req.body;  // Orchestrator enrichment format
    } else if (task?.input_data) {
      rawInput = task.input_data;  // Task workflow format
    } else if (req.body.input) {
      rawInput = req.body.input;  // Explicit input
    } else {
      rawInput = {};
    }
    const input = validateInput(rawInput);
    console.log('[Test Agent] ✓ Input valid');

    // 2. Execute agent logic
    console.log('\n[Test Agent] Step 2: Executing agent logic...');
    const result = await executeAgent(input, { task, project, tenant_id });
    console.log('[Test Agent] ✓ Agent execution complete');

    // 3. Validate output
    console.log('\n[Test Agent] Step 3: Validating output...');
    const output = validateOutput(result);
    console.log('[Test Agent] ✓ Output valid');

    // 4. Return success
    console.log('\n[Test Agent] ========================================');
    console.log('[Test Agent] SUCCESS');
    console.log('[Test Agent] ========================================\n');

    res.json({
      ...output,
      success: true,
      task_id: task_id,
      execution_id: execution_id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('\n[Test Agent] ========================================');
    console.error('[Test Agent] ERROR:', error.message);
    console.error('[Test Agent] ========================================\n');

    res.status(500).json({
      success: false,
      error: error.message,
      task_id: task_id,
      execution_id: execution_id,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /health - Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// GET / - Agent info
app.get('/', (req, res) => {
  res.json({
    name: 'my-test-agent',
    displayName: 'Test Agent',
    version: '1.0.0',
    endpoints: {
      execute: 'POST /execute',
      health: 'GET /health'
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log(`🚀 Test Agent running on http://localhost:${PORT}`);
  console.log('========================================');
  console.log(`Endpoints:`);
  console.log(`  POST   http://localhost:${PORT}/execute`);
  console.log(`  GET    http://localhost:${PORT}/health`);
  console.log('========================================\n');
});
