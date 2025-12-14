import { ref } from 'vue';
import { vi } from 'vitest';

export const useRouter = vi.fn(() => ({
	push: vi.fn(),
	replace: vi.fn(),
	go: vi.fn(),
	back: vi.fn(),
	forward: vi.fn(),
	currentRoute: ref({ path: '/', query: {}, params: {} }),
}));

export const useRoute = vi.fn(() => ({
	path: '/',
	query: {},
	params: {},
	name: null,
	meta: {},
}));
