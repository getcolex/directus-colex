import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'json-formatted',
	name: 'Formatted JSON',
	icon: 'data_object',
	description: 'Edit JSON with syntax highlighting and tree view',
	component: InterfaceComponent,
	types: ['json'],
	group: 'standard',
	options: [
		{
			field: 'maxHeight',
			name: 'Max Height',
			type: 'integer',
			meta: {
				width: 'half',
				interface: 'input',
			},
			schema: {
				default_value: 400,
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
				default_value: true,
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
						{ text: 'Auto (follows theme)', value: 'auto' },
						{ text: 'Light', value: 'light' },
						{ text: 'Dark', value: 'dark' },
					],
				},
			},
			schema: {
				default_value: 'auto',
			},
		},
		{
			field: 'indentSize',
			name: 'Indent Size',
			type: 'integer',
			meta: {
				width: 'half',
				interface: 'input',
			},
			schema: {
				default_value: 2,
			},
		},
	],
});
