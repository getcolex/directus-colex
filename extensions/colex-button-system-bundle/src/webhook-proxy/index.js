/**
 * Webhook Proxy Endpoint
 *
 * Server-side webhook proxy to bypass CORS restrictions.
 * Accepts webhook requests from the Directus UI and executes them server-side.
 */

export default {
	id: 'webhook-proxy',
	handler: (router, { logger }) => {
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

					// Block private IPv4 ranges with proper octet validation
					const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
					const match = hostname.match(ipv4Regex);
					if (match) {
						// Parse octets correctly (skip the full match at index 0)
						const octets = match.slice(1).map(Number);

						// Validate octets are in valid range (0-255)
						if (octets.some(octet => octet > 255)) {
							return res.status(400).json({
								error: 'Invalid IP address.',
							});
						}

						// 0.0.0.0/8 - Current network (this network)
						if (octets[0] === 0) {
							return res.status(403).json({
								error: 'Internal network URLs are not allowed.',
							});
						}

						// 127.0.0.0/8 - Loopback (entire range, not just 127.0.0.1)
						if (octets[0] === 127) {
							return res.status(403).json({
								error: 'Internal network URLs are not allowed.',
							});
						}

						// 10.0.0.0/8 - Private network
						if (octets[0] === 10) {
							return res.status(403).json({
								error: 'Private IP ranges are not allowed.',
							});
						}

						// 169.254.0.0/16 - Link-local / AWS metadata endpoint
						// CRITICAL: 169.254.169.254 is used by AWS/Azure/GCP for metadata
						if (octets[0] === 169 && octets[1] === 254) {
							return res.status(403).json({
								error: 'Link-local addresses are not allowed.',
							});
						}

						// 172.16.0.0/12 - Private network (172.16.0.0 - 172.31.255.255)
						if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
							return res.status(403).json({
								error: 'Private IP ranges are not allowed.',
							});
						}

						// 192.168.0.0/16 - Private network
						if (octets[0] === 192 && octets[1] === 168) {
							return res.status(403).json({
								error: 'Private IP ranges are not allowed.',
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
				logger.info({
					url,
					method: normalizedMethod,
					user: req.accountability?.user || 'unknown',
				}, '[Webhook Proxy] Executing webhook');

				const startTime = Date.now();

				// Execute webhook request with timeout handling
				let response;
				try {
					response = await fetch(url, fetchOptions);
					clearTimeout(timeout);

					const duration = Date.now() - startTime;
					logger.info({
						url,
						status: response.status,
						duration: `${duration}ms`,
						ok: response.ok,
					}, '[Webhook Proxy] Webhook response');
				} catch (fetchError) {
					clearTimeout(timeout);

					if (fetchError.name === 'AbortError') {
						logger.warn({ url, duration: '30000ms' }, '[Webhook Proxy] Webhook timeout');
						throw new Error('Webhook request timed out after 30 seconds');
					}
					logger.error({ url, error: fetchError.message }, '[Webhook Proxy] Webhook fetch error');
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
				logger.error(error, '[Webhook Proxy] Error');
				return res.status(500).json({
					error: error.message || 'Failed to execute webhook',
				});
			}
		});
	},
};
