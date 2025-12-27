import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import webhookProxy from './index.js';

/**
 * TDD RED PHASE: Unit tests for webhook-proxy SSRF vulnerability
 *
 * These tests verify that the webhook-proxy endpoint blocks ALL private IP ranges.
 * They will FAIL initially because the current implementation is incomplete.
 *
 * After the fix (GREEN phase), all tests should PASS.
 */
describe('Webhook Proxy - SSRF Protection (Server-Side)', () => {
	let mockRouter;
	let postHandler;

	beforeEach(() => {
		// Create mock router that captures the POST handler
		mockRouter = {
			post: vi.fn((path, handler) => {
				postHandler = handler;
			})
		};

		// Initialize the webhook proxy (registers the route)
		webhookProxy.handler(mockRouter);

		// Verify the route was registered
		expect(mockRouter.post).toHaveBeenCalledWith('/', expect.any(Function));
	});

	/**
	 * Helper function to create mock Express request/response objects
	 * This simulates what Express does when handling HTTP requests
	 */
	const createMockReqRes = (body) => {
		const req = {
			body,
			accountability: { user: 'test-user' }
		};

		const res = {
			statusCode: null,
			jsonData: null,
			status: vi.fn(function(code) {
				this.statusCode = code;
				return this;
			}),
			json: vi.fn(function(data) {
				this.jsonData = data;
				return this;
			})
		};

		return { req, res };
	};

	/**
	 * Helper to execute the webhook handler and get the response
	 */
	const executeWebhook = async (url, method = 'POST') => {
		const { req, res } = createMockReqRes({ url, method });
		await postHandler(req, res);
		return res;
	};

	describe('RED: IPv4 Loopback Range (127.0.0.0/8)', () => {
		/**
		 * Current problem: Only blocks 127.0.0.1
		 * Missing: 127.0.0.2 through 127.255.255.255
		 */
		it('should block 127.0.0.1 (already working)', async () => {
			const res = await executeWebhook('http://127.0.0.1:8055/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/localhost|Internal network/i);
		});

		it('should block 127.0.0.2 (currently FAILS - not blocked)', async () => {
			// RED: This will FAIL because 127.0.0.2 is not blocked
			const res = await executeWebhook('http://127.0.0.2:8055/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/Internal network/i);
		});

		it('should block 127.255.255.255 (end of loopback range)', async () => {
			// RED: This will FAIL
			const res = await executeWebhook('http://127.255.255.255/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/Internal network/i);
		});
	});

	describe('RED: AWS Metadata Endpoint (169.254.169.254)', () => {
		/**
		 * CRITICAL: AWS/Azure/GCP metadata endpoint
		 * Contains credentials, API keys, secrets
		 */
		it('should block 169.254.169.254 (AWS metadata endpoint)', async () => {
			// This might already pass if the range check exists
			const res = await executeWebhook('http://169.254.169.254/latest/meta-data/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/link-local|Internal network/i);
		});

		it('should block entire 169.254.0.0/16 range', async () => {
			const res = await executeWebhook('http://169.254.1.1/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/link-local|Internal network/i);
		});
	});

	describe('RED: Current Network (0.0.0.0/8)', () => {
		/**
		 * Current problem: NOT CHECKED AT ALL
		 * 0.0.0.0 can resolve to localhost or bypass firewall rules
		 */
		it('should block 0.0.0.0 (currently FAILS - not blocked)', async () => {
			// RED: This will FAIL
			const res = await executeWebhook('http://0.0.0.0:8080/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/Internal network/i);
		});

		it('should block 0.1.2.3 (anything in 0.0.0.0/8)', async () => {
			// RED: This will FAIL
			const res = await executeWebhook('http://0.1.2.3/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/Internal network/i);
		});
	});

	describe('GREEN: Existing Protections Should Remain', () => {
		/**
		 * These verify we don't break existing security checks
		 */
		it('should block 10.0.0.1 (private network)', async () => {
			const res = await executeWebhook('http://10.0.0.1/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/Private IP/i);
		});

		it('should block 172.16.0.1 (private network)', async () => {
			const res = await executeWebhook('http://172.16.0.1/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/Private IP/i);
		});

		it('should block 172.31.255.255 (end of 172.16.0.0/12)', async () => {
			const res = await executeWebhook('http://172.31.255.255/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/Private IP/i);
		});

		it('should block 192.168.1.1 (private network)', async () => {
			const res = await executeWebhook('http://192.168.1.1/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/Private IP/i);
		});

		it('should block localhost by name', async () => {
			const res = await executeWebhook('http://localhost:8055/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/localhost|Internal network/i);
		});
	});

	describe('GREEN: Legitimate URLs Should Work', () => {
		/**
		 * These verify we don't break legitimate use cases
		 * Note: These will make REAL network requests unless we mock fetch
		 */

		// Mock fetch for these tests to avoid real network calls
		const originalFetch = global.fetch;

		beforeEach(() => {
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					statusText: 'OK',
					headers: new Map([['content-type', 'application/json']]),
					json: () => Promise.resolve({ success: true })
				})
			);
		});

		afterEach(() => {
			global.fetch = originalFetch;
		});

		it('should allow httpbin.org (legitimate external URL)', async () => {
			const res = await executeWebhook('https://httpbin.org/post', 'POST');

			// Should NOT be blocked (status should be 200 or 500 from fetch, not 403)
			expect(res.statusCode).not.toBe(403);
		});

		it('should allow example.com (legitimate domain)', async () => {
			const res = await executeWebhook('https://example.com/', 'GET');

			expect(res.statusCode).not.toBe(403);
		});

		it('should allow public IPs like 8.8.8.8', async () => {
			const res = await executeWebhook('http://8.8.8.8/', 'GET');

			expect(res.statusCode).not.toBe(403);
		});
	});

	describe('Edge Cases', () => {
		it('should reject invalid URLs', async () => {
			const res = await executeWebhook('not-a-url');

			expect(res.statusCode).toBe(400);
			expect(res.jsonData.error).toMatch(/Invalid URL/i);
		});

		it('should reject non-http protocols (ftp)', async () => {
			const res = await executeWebhook('ftp://example.com/');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/protocol/i);
		});

		it('should reject non-http protocols (file)', async () => {
			const res = await executeWebhook('file:///etc/passwd');

			expect(res.statusCode).toBe(403);
			expect(res.jsonData.error).toMatch(/protocol/i);
		});

		it('should validate IP octets are <= 255', async () => {
			const res = await executeWebhook('http://256.1.2.3/');

			// Should be rejected as invalid (caught by URL parser or our validation)
			// Defense-in-depth: URL constructor catches it first, but we have backup validation
			expect(res.statusCode).toBe(400);
			expect(res.jsonData.error).toMatch(/Invalid (IP|URL)/i);
		});
	});
});
