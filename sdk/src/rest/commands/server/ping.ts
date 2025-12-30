import type { RestCommand } from '../../types.js';

/**
 * Ping... pong! 🏓
 * @returns Pong
 */
export const serverPing =
	<Schema>(): RestCommand<string, Schema> =>
	() => ({
		method: 'GET',
		path: '/server/ping',
	});
