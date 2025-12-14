import { defineDisplay } from '@directus/extensions-sdk';
import DisplayComponent from './display.vue';

export default defineDisplay({
	id: 'configurable-button',
	name: 'Configurable Button',
	icon: 'touch_app',
	description: 'State-driven action buttons with dynamic visibility and actions',
	component: DisplayComponent,
	options: [
		{
			field: 'buttonConfigIds',
			name: 'Button Configurations',
			type: 'json',
			meta: {
				width: 'full',
				interface: 'input-code',
				options: {
					language: 'json',
					lineNumber: false,
					placeholder: '["uuid-1", "uuid-2", "uuid-3"]',
					template: '[]'
				},
				note: 'Enter array of button configuration UUIDs. View available configs at: /admin/content/configurable_buttons\n\nExample: ["a1b2c3d4-...", "e5f6g7h8-..."]'
			}
		},
		{
			field: 'layout',
			name: 'Button Layout',
			type: 'string',
			meta: {
				width: 'half',
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'Horizontal', value: 'horizontal' },
						{ text: 'Vertical (Stacked)', value: 'vertical' },
						{ text: 'Dropdown Menu', value: 'dropdown' }
					]
				},
				note: 'How to arrange multiple buttons'
			},
			schema: {
				default_value: 'horizontal'
			}
		},
		{
			field: 'buttonSize',
			name: 'Button Size',
			type: 'string',
			meta: {
				width: 'half',
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'Small', value: 'small' },
						{ text: 'Medium', value: 'medium' },
						{ text: 'Large', value: 'large' }
					]
				}
			},
			schema: {
				default_value: 'small'
			}
		}
	],
	types: ['string', 'integer', 'uuid', 'text', 'json'],
	localTypes: ['standard']
});
