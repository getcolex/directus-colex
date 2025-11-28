import { defineDisplay } from '@directus/extensions-sdk';
import DisplayComponent from './display.vue';

export default defineDisplay({
	id: 'colex-button-display',
	name: 'Action Buttons',
	icon: 'box',
	description: 'This display renders buttons to open links or trigger flows.',
	component: DisplayComponent,
	options: null,
	types: ["json"],
	fields: ["status", "user_created", "date_created", "id"],
});
