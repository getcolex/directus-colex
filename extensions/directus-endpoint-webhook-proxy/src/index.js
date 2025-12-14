/**
 * Webhook Proxy Endpoint
 *
 * Server-side webhook proxy to bypass CORS restrictions.
 * Accepts webhook requests from the Directus UI and executes them server-side.
 */

export default {
	id: 'webhook-proxy',
	handler: (router) => {
		/**
		 * POST /webhook-proxy
		 *
		 * Execute a webhook request server-side
		 */
		router.post('/', async (req, res) => {
			try {
				const { url, method = 'POST', headers = {}, body } = req.body;

				// Validate required fields
				if (!url) {
					return res.status(400).json({
						error: 'URL is required',
					});
				}

				// Validate URL (SSRF protection)
				try {
					const urlObj = new URL(url);

					// Only allow http and https protocols
					if (!['http:', 'https:'].includes(urlObj.protocol)) {
						return res.status(403).json({
							error: 'Invalid URL protocol. Only http and https are allowed.',
						});
					}

					// Block private IP ranges (SSRF protection)
					const hostname = urlObj.hostname.toLowerCase();

					// Block localhost (IPv4 and IPv6)
					if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
						return res.status(403).json({
							error: 'Localhost URLs are not allowed for security reasons.',
						});
					}

					// Block IPv6 link-local addresses (fe80::/10)
					if (hostname.startsWith('[fe80:') || hostname.startsWith('fe80:')) {
						return res.status(403).json({
							error: 'IPv6 link-local addresses are not allowed.',
						});
					}

					// Block IPv6 unique local addresses (fc00::/7 - includes fc00:: and fd00::)
					if (hostname.startsWith('[fc') || hostname.startsWith('fc') ||
					    hostname.startsWith('[fd') || hostname.startsWith('fd')) {
						return res.status(403).json({
							error: 'IPv6 private addresses are not allowed.',
						});
					}

					// Block private IPv4 ranges
					const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
					const match = hostname.match(ipv4Regex);
					if (match) {
						const [, a, b, c, d] = match.map(Number);

						// 10.0.0.0/8
						if (a === 10) {
							return res.status(403).json({
								error: 'Private IP ranges are not allowed.',
							});
						}
						// 172.16.0.0/12
						if (a === 172 && b >= 16 && b <= 31) {
							return res.status(403).json({
								error: 'Private IP ranges are not allowed.',
							});
						}
						// 192.168.0.0/16
						if (a === 192 && b === 168) {
							return res.status(403).json({
								error: 'Private IP ranges are not allowed.',
							});
						}
						// 169.254.0.0/16 (link-local)
						if (a === 169 && b === 254) {
							return res.status(403).json({
								error: 'Link-local addresses are not allowed.',
							});
						}
					}
				} catch (urlError) {
					return res.status(400).json({
						error: 'Invalid URL format.',
					});
				}

				// Validate method
				const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
				const normalizedMethod = method.toUpperCase();
				if (!allowedMethods.includes(normalizedMethod)) {
					return res.status(400).json({
						error: `Invalid method. Allowed methods: ${allowedMethods.join(', ')}`,
					});
				}

				// Prepare fetch options with timeout
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

				const fetchOptions = {
					method: normalizedMethod,
					headers: {
						'Content-Type': 'application/json',
						...headers,
					},
					signal: controller.signal,
				};

				// Add body for methods that support it
				if (['POST', 'PUT', 'PATCH'].includes(normalizedMethod) && body) {
					fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
				}

				// Log webhook execution (for audit trail)
				console.log('[Webhook Proxy] Executing webhook:', {
					url,
					method: normalizedMethod,
					user: req.accountability?.user || 'unknown'
				});
				const startTime = Date.now();

				// Execute webhook request with timeout handling
				let response;
				try {
					response = await fetch(url, fetchOptions);
					clearTimeout(timeout);

					const duration = Date.now() - startTime;
					console.log('[Webhook Proxy] Webhook response:', {
						url,
						status: response.status,
						duration: `${duration}ms`,
						ok: response.ok
					});
				} catch (fetchError) {
					clearTimeout(timeout);

					if (fetchError.name === 'AbortError') {
						console.error('[Webhook Proxy] Webhook timeout:', { url, duration: '30000ms' });
						throw new Error('Webhook request timed out after 30 seconds');
					}
					console.error('[Webhook Proxy] Webhook fetch error:', { url, error: fetchError.message });
					throw fetchError;
				}

				// Get response body
				let responseBody;
				const contentType = response.headers.get('content-type');

				if (contentType && contentType.includes('application/json')) {
					try {
						responseBody = await response.json();
					} catch (e) {
						responseBody = await response.text();
					}
				} else {
					responseBody = await response.text();
				}

				// Return response
				return res.status(response.status).json({
					success: response.ok,
					status: response.status,
					statusText: response.statusText,
					headers: Object.fromEntries(response.headers.entries()),
					data: responseBody,
				});

			} catch (error) {
				console.error('[Webhook Proxy] Error:', error);
				return res.status(500).json({
					error: error.message || 'Failed to execute webhook',
				});
			}
		});
	},
};
