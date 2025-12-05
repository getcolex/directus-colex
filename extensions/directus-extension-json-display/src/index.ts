import { defineDisplay } from '@directus/extensions-sdk';
import DisplayComponent from './display.vue';

export default defineDisplay({
	id: 'json-formatted',
	name: 'JSON Formatted',
	icon: 'data_object',
	description: 'Display JSON in a formatted view with syntax highlighting',
	component: DisplayComponent,
	options: [
		{
			field: 'maxDepth',
			name: 'Max Depth',
			type: 'integer',
			meta: {
				width: 'half',
				interface: 'input',
				options: {
					placeholder: '3',
				},
			},
			schema: {
				default_value: 3,
			},
		},
		{
			field: 'collapsed',
			name: 'Start Collapsed',
			type: 'boolean',
			meta: {
				width: 'half',
				interface: 'boolean',
			},
			schema: {
				default_value: false,
			},
		},
		{
			field: 'showLineNumbers',
			name: 'Show Line Numbers',
			type: 'boolean',
			meta: {
				width: 'half',
				interface: 'boolean',
			},
			schema: {
				default_value: false,
			},
		},
		{
			field: 'maxHeight',
			name: 'Max Height (px)',
			type: 'integer',
			meta: {
				width: 'half',
				interface: 'input',
				options: {
					placeholder: '200',
				},
			},
			schema: {
				default_value: 200,
			},
		},
		{
			field: 'colorScheme',
			name: 'Color Scheme',
			type: 'string',
			meta: {
				width: 'half',
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'Default', value: 'default' },
						{ text: 'Dark', value: 'dark' },
						{ text: 'Light', value: 'light' },
						{ text: 'Monokai', value: 'monokai' },
					],
				},
			},
			schema: {
				default_value: 'default',
			},
		},
	],
	types: ['json', 'text'],
});
