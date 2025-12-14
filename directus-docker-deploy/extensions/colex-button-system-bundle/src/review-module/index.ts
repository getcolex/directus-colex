/**
 * Module Extension: Review Outputs
 *
 * Configurable review interface for task outputs triggered by configurable buttons.
 *
 * Route: /review (with query params)
 *
 * Features:
 * - Gallery layout for images
 * - Table layout for structured data
 * - Form layout for creating outputs
 * - Configurable CRUD permissions
 * - Programmatic filtering (not URL-based)
 * - Bulk approve/reject/delete actions
 */

import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';

export default defineModule({
	id: 'review',
	name: 'Review Outputs',
	icon: 'rate_review',
	routes: [
		{
			path: '',
			component: ModuleComponent,
		},
	],
	hidden: true, // Don't show in sidebar (accessed via buttons only)
});
