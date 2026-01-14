#!/usr/bin/env node
/**
 * Claude Code Proxy Server
 *
 * Runs on the host machine and spawns Claude Code instances
 * for the Template Builder extension running in Docker.
 *
 * Usage:
 *   node scripts/claude-proxy-server.js
 *
 * Endpoints:
 *   POST /claude - Execute a Claude Code prompt
 *     Body: { prompt: string, timeout?: number }
 *     Returns: { response: string } or { error: string }
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3456;

// Use Sonnet 4 for speed - can be overridden via CLAUDE_MODEL env var
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'sonnet';

/**
 * Stream Claude CLI output as SSE events
 * @param {string} prompt - The prompt to send to Claude
 * @param {http.ServerResponse} res - The HTTP response to stream to
 * @param {number} timeout - Timeout in milliseconds
 */
function streamClaude(prompt, res, timeout = 120000) {
  console.log(`[Claude Stream] Executing prompt (${prompt.length} chars) with model: ${CLAUDE_MODEL}...`);

  // Write prompt to temp file to avoid shell escaping issues
  const tmpFile = path.join(os.tmpdir(), `claude-prompt-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, prompt);

  // Spawn Claude with streaming JSON output
  // Note: --verbose is required when using --output-format=stream-json with --print
  const claude = spawn('sh', [
    '-c',
    `cat "${tmpFile}" | claude --print --model ${CLAUDE_MODEL} --output-format stream-json --verbose`
  ], {
    env: { ...process.env },
  });

  let killed = false;

  const timer = setTimeout(() => {
    killed = true;
    claude.kill('SIGTERM');
    // Send error event before closing
    res.write(`data: ${JSON.stringify({ type: 'error', error: `Claude CLI timed out after ${timeout}ms` })}\n\n`);
    res.end();
  }, timeout);

  // Cleanup temp file after process ends
  claude.on('close', () => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  // Buffer for incomplete lines
  let buffer = '';
  let fullResponse = '';
  let doneSent = false;

  claude.stdout.on('data', (data) => {
    buffer += data.toString();

    // Process complete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);

        // Handle different Claude stream-json event types
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          // Token-by-token content
          fullResponse += parsed.delta.text;
          res.write(`event: content\ndata: ${JSON.stringify({ type: 'content', text: parsed.delta.text })}\n\n`);
        } else if (parsed.type === 'assistant' && parsed.message?.content) {
          // Initial message with content
          for (const block of parsed.message.content) {
            if (block.type === 'text' && block.text) {
              fullResponse += block.text;
              res.write(`event: content\ndata: ${JSON.stringify({ type: 'content', text: block.text })}\n\n`);
            }
          }
        } else if (parsed.type === 'message_stop' || parsed.type === 'result') {
          // Message complete - send done event
          if (!doneSent) {
            res.write(`event: done\ndata: ${JSON.stringify({ type: 'done', response: fullResponse })}\n\n`);
            doneSent = true;
          }
        }
        // Ignore other event types (message_start, content_block_start, etc.)
      } catch (parseError) {
        // If not valid JSON, forward as raw content
        console.log('[Claude Stream] Non-JSON line:', trimmed);
      }
    }
  });

  claude.stderr.on('data', (data) => {
    console.error('[Claude Stream] stderr:', data.toString());
  });

  claude.on('close', (code) => {
    clearTimeout(timer);
    if (killed) return;

    // Process any remaining buffer content
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        if (parsed.type === 'message_stop' || parsed.type === 'result') {
          if (!doneSent) {
            res.write(`event: done\ndata: ${JSON.stringify({ type: 'done', response: fullResponse })}\n\n`);
            doneSent = true;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    if (code === 0) {
      console.log(`[Claude Stream] Completed successfully`);
      // Send done event if not already sent
      if (!doneSent && fullResponse) {
        res.write(`event: done\ndata: ${JSON.stringify({ type: 'done', response: fullResponse })}\n\n`);
      }
    } else {
      console.error(`[Claude Stream] Failed with code ${code}`);
      res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: `Claude CLI exited with code ${code}` })}\n\n`);
    }

    res.end();
  });

  claude.on('error', (err) => {
    clearTimeout(timer);
    console.error(`[Claude Stream] Spawn error:`, err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: `Failed to spawn Claude CLI: ${err.message}` })}\n\n`);
    res.end();
  });

  // Handle client disconnect
  res.on('close', () => {
    if (!killed) {
      console.log('[Claude Stream] Client disconnected, killing process');
      killed = true;
      clearTimeout(timer);
      claude.kill('SIGTERM');
    }
  });
}

function callClaude(prompt, timeout = 120000) {
  return new Promise((resolve, reject) => {
    console.log(`[Claude] Executing prompt (${prompt.length} chars) with model: ${CLAUDE_MODEL}...`);

    // Write prompt to temp file to avoid shell escaping issues
    const tmpFile = path.join(os.tmpdir(), `claude-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, prompt);

    // Read prompt from file via shell - use --model flag to specify Sonnet 4
    const claude = spawn('sh', ['-c', `cat "${tmpFile}" | claude --print --model ${CLAUDE_MODEL}`], {
      env: { ...process.env },
    });

    // Cleanup temp file after process ends
    claude.on('close', () => {
      try { fs.unlinkSync(tmpFile); } catch {}
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      claude.kill('SIGTERM');
      reject(new Error(`Claude CLI timed out after ${timeout}ms`));
    }, timeout);

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;

      if (code === 0) {
        console.log(`[Claude] Success (${stdout.length} chars response)`);
        resolve(stdout.trim());
      } else {
        console.error(`[Claude] Failed with code ${code}`);
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr || stdout}`));
      }
    });

    claude.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers for Docker
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/claude') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { prompt, timeout } = JSON.parse(body);

        if (!prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'prompt is required' }));
          return;
        }

        const response = await callClaude(prompt, timeout || 120000);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ response }));
      } catch (error) {
        console.error('[Claude] Error:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/claude-stream') {
    // Streaming endpoint using SSE
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const { prompt, timeout } = parsed;

      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'prompt is required' }));
        return;
      }

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Start streaming
      streamClaude(prompt, res, timeout || 120000);
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'claude-proxy' }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Claude Code Proxy Server running on http://localhost:${PORT}`);
  console.log(`   Model: ${CLAUDE_MODEL} (set CLAUDE_MODEL env var to change)`);
  console.log(`   POST /claude        - Execute Claude Code prompt (wait for full response)`);
  console.log(`   POST /claude-stream - Execute Claude Code prompt (SSE streaming)`);
  console.log(`   GET /health         - Health check`);
  console.log('');
  console.log('Waiting for requests from Template Builder...');
});
