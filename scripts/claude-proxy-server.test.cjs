#!/usr/bin/env node
/**
 * Tests for Claude Code Proxy Server
 *
 * Run with: node scripts/claude-proxy-server.test.cjs
 *
 * These tests verify:
 * 1. POST /claude-stream returns SSE headers
 * 2. POST /claude-stream streams data events
 * 3. POST /claude-stream handles errors gracefully
 * 4. POST /claude-stream requires prompt parameter
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const SERVER_PORT = 3457; // Different port to avoid conflicts
const SERVER_PATH = path.join(__dirname, 'claude-proxy-server.cjs');

let serverProcess = null;

// Simple test runner
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

function assertIncludes(str, substr, message) {
  if (!str.includes(substr)) {
    throw new Error(`${message}: expected "${str}" to include "${substr}"`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

// Helper to make HTTP requests
function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ res, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Helper to collect SSE events from a streaming response
function collectSSEEvents(options, body, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const events = [];
    let headers = {};
    let statusCode;
    let timeoutId;

    const req = http.request(options, (res) => {
      statusCode = res.statusCode;
      headers = { ...res.headers };

      res.on('data', chunk => {
        const lines = chunk.toString().split('\n\n').filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              events.push(JSON.parse(line.slice(6)));
            } catch {
              events.push(line.slice(6));
            }
          }
        }
      });

      res.on('end', () => {
        clearTimeout(timeoutId);
        resolve({ statusCode, headers, events });
      });
    });

    req.on('error', reject);

    // Timeout to prevent hanging - but preserve the status code and headers we got
    timeoutId = setTimeout(() => {
      req.destroy();
      resolve({ statusCode, headers, events });
    }, timeout);

    if (body) req.write(body);
    req.end();
  });
}

// Start server for testing
async function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', [SERVER_PATH], {
      env: { ...process.env, PORT: SERVER_PORT.toString() },
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('running on')) {
        // Give server a moment to fully initialize
        setTimeout(resolve, 100);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    serverProcess.on('error', reject);

    // Timeout if server doesn't start
    setTimeout(() => reject(new Error('Server startup timeout')), 5000);
  });
}

// Stop server after testing
function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// === TEST SUITE ===

async function runTests() {
  console.log('\nClaude Proxy Server Tests\n');
  console.log('='.repeat(50));

  // Test 1: /claude-stream endpoint exists and returns correct headers
  // We make ONE call and verify all headers together to avoid multiple Claude invocations
  console.log('\n[SSE Headers Tests]');

  // Make a single request to test all headers at once
  const headerTestResult = await collectSSEEvents({
    hostname: 'localhost',
    port: SERVER_PORT,
    path: '/claude-stream',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ prompt: 'Say "test" and nothing else' }), 30000);

  await test('POST /claude-stream returns 200 status for valid request', async () => {
    assertEqual(headerTestResult.statusCode, 200, 'Status code');
  });

  await test('POST /claude-stream returns SSE Content-Type header', async () => {
    assertEqual(headerTestResult.headers['content-type'], 'text/event-stream', 'Content-Type header');
  });

  await test('POST /claude-stream returns Cache-Control header', async () => {
    assertEqual(headerTestResult.headers['cache-control'], 'no-cache', 'Cache-Control header');
  });

  await test('POST /claude-stream returns Connection header', async () => {
    assertEqual(headerTestResult.headers['connection'], 'keep-alive', 'Connection header');
  });

  // Test 2: Validation tests
  console.log('\n[Validation Tests]');

  await test('POST /claude-stream returns 400 when prompt is missing', async () => {
    const { res, data } = await makeRequest({
      hostname: 'localhost',
      port: SERVER_PORT,
      path: '/claude-stream',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, JSON.stringify({}));

    assertEqual(res.statusCode, 400, 'Status code');
    const json = JSON.parse(data);
    assertIncludes(json.error, 'prompt', 'Error message mentions prompt');
  });

  await test('POST /claude-stream returns 400 for invalid JSON', async () => {
    const { res } = await makeRequest({
      hostname: 'localhost',
      port: SERVER_PORT,
      path: '/claude-stream',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, 'not valid json');

    assertEqual(res.statusCode, 400, 'Status code');
  });

  // Test 3: Streaming functionality (integration test with real Claude)
  // We reuse the headerTestResult which already has events from the Claude call
  console.log('\n[Streaming Tests - Integration]');

  await test('POST /claude-stream streams events from Claude CLI', async () => {
    // Reuse events from the header test request
    assert(headerTestResult.events.length > 0, 'Should receive at least one event');
  });

  await test('POST /claude-stream events have expected structure', async () => {
    // Each event should be a valid JSON object with a type
    for (const event of headerTestResult.events) {
      if (typeof event === 'object') {
        assert('type' in event, 'Event should have a type property');
      }
    }
  });

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log(`\nResults: ${passed} passed, ${failed} failed`);

  return failed === 0;
}

// Main execution
async function main() {
  try {
    console.log('Starting test server...');
    await startServer();
    console.log(`Server started on port ${SERVER_PORT}`);

    const success = await runTests();

    stopServer();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Test setup failed:', error.message);
    stopServer();
    process.exit(1);
  }
}

main();
