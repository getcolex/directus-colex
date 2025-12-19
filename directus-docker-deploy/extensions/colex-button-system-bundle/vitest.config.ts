import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'url';

export default defineConfig({
	plugins: [vue()],
	test: {
		globals: true,
		environment: 'happy-dom',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
		},
		setupFiles: ['./vitest.setup.ts'],
	},
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
			'vue-router': fileURLToPath(new URL('./test/mocks/vue-router.ts', import.meta.url)),
			'@directus/extensions-sdk': fileURLToPath(new URL('./test/mocks/directus-sdk.ts', import.meta.url)),
		},
	},
});
