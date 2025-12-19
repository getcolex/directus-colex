import { vi } from 'vitest';
import { ref } from 'vue';

export const useApi = vi.fn(() => ({
	get: vi.fn().mockResolvedValue({ data: {} }),
	post: vi.fn().mockResolvedValue({ data: {} }),
	patch: vi.fn().mockResolvedValue({ data: {} }),
	delete: vi.fn().mockResolvedValue({ data: {} }),
}));

export const useStores = vi.fn(() => ({
	useNotificationsStore: {
		add: vi.fn(),
	},
}));

export const useItems = vi.fn(() => ({
	getItems: vi.fn().mockResolvedValue({ data: [] }),
	getItem: vi.fn().mockResolvedValue({ data: {} }),
	createItem: vi.fn().mockResolvedValue({ data: {} }),
	updateItem: vi.fn().mockResolvedValue({ data: {} }),
	deleteItem: vi.fn().mockResolvedValue({ data: {} }),
}));
