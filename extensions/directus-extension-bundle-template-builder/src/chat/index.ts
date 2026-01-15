/**
 * Template Builder Chat Endpoint
 *
 * AI conversation routes with SSE streaming and tool use.
 */

import { randomUUID } from 'crypto';

export default {
  id: 'tb-chat',
  handler: (router: any, context: any) => {
    const { services } = context;
    const { ItemsService } = services;

    console.log('🚀 [TB-Chat] Extension loaded - registering routes...');

    /**
     * POST /chat-v2
     * AI conversation with SSE streaming and structured tool use
     */
    router.post('/chat-v2', async (req: any, res: any) => {
      const traceId = randomUUID();
      const { message, projectId, conversationId, taskId, enrichmentContext } = req.body;

      // Input validation
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required', traceId });
      }
      if (message.length > 10000) {
        return res.status(400).json({ error: 'Message too long (max 10,000 characters)', traceId });
      }
      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId is required for chat-v2', traceId });
      }

      // Check for API key
      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

      if (!openrouterApiKey && !anthropicApiKey) {
        return res.status(503).json({ error: 'Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY configured', traceId });
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      // Helper function to send SSE events
      let clientDisconnected = false;
      const sendEvent = (eventType: string, data: any) => {
        if (clientDisconnected) return;
        try {
          res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
          console.error(`[TB-Chat][${traceId}] Failed to send SSE event:`, e);
        }
      };

      // Handle client disconnect
      req.on('close', () => {
        clientDisconnected = true;
      });

      try {
        // TODO: Implement full chat-v2 logic
        // For now, send a placeholder response
        sendEvent('text', { chunk: 'Chat-v2 endpoint is under construction.' });
        sendEvent('complete', { actions: [] });
        res.end();
      } catch (error: any) {
        sendEvent('error', { message: error.message });
        res.end();
      }
    });

    /**
     * POST /chat
     * Legacy AI conversation (non-streaming JSON response)
     */
    router.post('/chat', async (req: any, res: any) => {
      const traceId = randomUUID();
      const { message, projectId, conversationHistory } = req.body;

      // Input validation
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required', traceId });
      }

      try {
        // TODO: Implement full chat logic
        res.json({
          response: 'Chat endpoint is under construction.',
          suggestions: [],
          traceId,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message, traceId });
      }
    });

    /**
     * POST /chat-stream
     * SSE streaming chat (legacy, simpler than chat-v2)
     */
    router.post('/chat-stream', async (req: any, res: any) => {
      const { message, projectId, conversationHistory } = req.body;

      // Input validation
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      try {
        // TODO: Implement full chat-stream logic
        res.write(`event: content\ndata: ${JSON.stringify({ text: 'Chat stream is under construction.' })}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify({ response: 'Chat stream is under construction.', suggestions: [] })}\n\n`);
        res.end();
      } catch (error: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
        res.end();
      }
    });

    console.log('✓ [TB-Chat] Routes registered: /chat-v2, /chat, /chat-stream');
  },
};
