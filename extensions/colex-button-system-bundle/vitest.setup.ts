import { vi } from 'vitest';

// Mock global Directus composables
vi.mock('@directus/extensions-sdk', () => ({
	useApi: vi.fn(() => ({
		get: vi.fn().mockResolvedValue({ data: {} }),
		post: vi.fn().mockResolvedValue({ data: {} }),
		patch: vi.fn().mockResolvedValue({ data: {} }),
		delete: vi.fn().mockResolvedValue({ data: {} }),
	})),
	useStores: vi.fn(() => ({
		useNotificationsStore: vi.fn(() => ({
			add: vi.fn(),
		})),
		useFieldsStore: vi.fn(() => ({
			getField: vi.fn(),
			fields: [],
		})),
	})),
}));

// Mock vue-router
vi.mock('vue-router', () => ({
	useRouter: vi.fn(() => ({
		push: vi.fn(),
		replace: vi.fn(),
		go: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
	})),
	useRoute: vi.fn(() => ({
		path: '/',
		query: {},
		params: {},
	})),
}));
