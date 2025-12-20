<template>
	<div class="configurable-button-display" @click.stop>
		<div :class="`button-container layout-${layout}`">
			<!-- Dropdown menu layout -->
			<v-menu v-if="layout === 'dropdown' && visibleButtons.length > 0" placement="bottom-start" show-arrow>
				<template #activator="{ toggle }">
					<v-button :x-small="buttonSize === 'small'" :small="buttonSize === 'medium'" @click="toggle">
						<v-icon name="more_horiz" />
						Actions
					</v-button>
				</template>
				<v-list>
					<v-list-item
						v-for="button in visibleButtons"
						:key="button.id"
						:disabled="isButtonDisabled(button)"
						clickable
						@click="handleButtonClick(button)"
					>
						<v-list-item-icon v-if="button.button_icon">
							<v-icon :name="button.button_icon" />
						</v-list-item-icon>
						<v-list-item-content>
							{{ interpolate(button.button_label, item) }}
						</v-list-item-content>
					</v-list-item>
				</v-list>
			</v-menu>

			<!-- Horizontal or Vertical layout -->
			<template v-else>
				<v-button
					v-for="button in visibleButtons"
					:key="button.id"
					:x-small="buttonSize === 'small'"
					:small="buttonSize === 'medium'"
					:kind="getButtonKind(button)"
					:loading="loadingButtons[button.id]"
					:disabled="isButtonDisabled(button)"
					@click="handleButtonClick(button)"
					:aria-label="interpolate(button.button_label, item)"
					:aria-busy="loadingButtons[button.id]"
					role="button"
					class="button-spacing"
				>
					<v-icon v-if="button.button_icon" :name="button.button_icon" small left />
					{{ interpolate(button.button_label, item) }}
				</v-button>
			</template>
		</div>

		<!-- Confirmation Dialog -->
		<v-dialog v-model="showConfirmDialog" @esc="showConfirmDialog = false">
			<v-card>
				<v-card-title>Confirm Action</v-card-title>
				<v-card-text>
					{{ confirmationMessage }}
				</v-card-text>
				<v-card-actions>
					<v-button secondary @click="showConfirmDialog = false">Cancel</v-button>
					<v-button @click="executeConfirmedAction">Confirm</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Create Item Drawer -->
		<v-drawer
			v-model="showCreateDrawer"
			:title="`Create ${createDrawerCollection}`"
			icon="add"
			@cancel="cancelCreateDrawer"
		>
			<template #actions>
				<v-button
					v-tooltip.bottom="'Save'"
					icon
					rounded
					:loading="createDrawerLoading"
					@click="saveCreateDrawerItem"
				>
					<v-icon name="check" />
				</v-button>
			</template>

			<div class="drawer-content">
				<v-form
					v-model="createDrawerFormData"
					:fields="createDrawerFields"
					:loading="createDrawerLoading"
					:primary-key="'+'"
					:collection="createDrawerCollection"
				/>
			</div>
		</v-drawer>
	</div>
</template>

<script>
import { defineComponent, ref, computed, watch, toRefs, onBeforeUnmount } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';
import { useRouter } from 'vue-router';

export default defineComponent({
	props: {
		value: {
			type: [String, Number, Object],
			default: null,
		},
		collection: {
			type: String,
			required: true,
		},
		primaryKey: {
			type: [String, Number],
			required: false,
		},
		field: {
			type: Object,
			required: true,
		},
		item: {
			type: Object,
			default: () => ({}),
		},
		// Custom options
		buttonConfigIds: {
			type: [Array, String],
			default: null,
		},
		buttonConfigs: {
			type: Array,
			default: () => [],
		},
		layout: {
			type: String,
			default: 'horizontal',
		},
		buttonSize: {
			type: String,
			default: 'small',
		},
	},
	setup(props) {
		// Extract props as refs so they can be used in template
		const { layout, buttonSize } = toRefs(props);

		const api = useApi();
		const router = useRouter();
		const { useNotificationsStore, useFieldsStore } = useStores();
		const notificationsStore = useNotificationsStore();
		const fieldsStore = useFieldsStore();

		const buttonConfigsData = ref([]);
		const loadingButtons = ref({});
		const showConfirmDialog = ref(false);
		const confirmationMessage = ref('');
		const pendingAction = ref(null);
		let abortController = null;

		// Fetch button configurations
		const fetchButtonConfigs = async () => {
			// Cancel previous request
			if (abortController) {
				abortController.abort();
			}

			abortController = new AbortController();
			try {
				let configIds = [];

				// NEW FORMAT: buttonConfigIds prop (JSON array of UUIDs)
				if (props.buttonConfigIds) {
					if (typeof props.buttonConfigIds === 'string') {
						// Parse JSON string
						try {
							configIds = JSON.parse(props.buttonConfigIds);
						} catch (e) {
							console.error('Failed to parse buttonConfigIds JSON:', e);
							notificationsStore.add({
								title: 'Configuration Error',
								text: 'Invalid JSON in button configurations',
								type: 'error',
							});
							return;
						}
					} else if (Array.isArray(props.buttonConfigIds)) {
						// Already an array
						configIds = props.buttonConfigIds;
					}
				}
				// LEGACY FORMAT: buttonConfigs prop (backwards compatibility)
				else if (props.buttonConfigs && props.buttonConfigs.length > 0) {
					configIds = props.buttonConfigs
						.map((item) => {
							// Handle different legacy structures
							if (item.button_config_id) return item.button_config_id;
							if (typeof item === 'string') return item;
							if (item.configurable_buttons_id) return item.configurable_buttons_id;
							if (item.id) return item.id;
							return null;
						})
						.filter((id) => id !== null);
				}

				// Validate we have UUIDs
				configIds = configIds.filter((id) => id && typeof id === 'string');

				if (configIds.length === 0) return;

				const response = await api.get('/items/configurable_buttons', {
					signal: abortController.signal,
					params: {
						filter: {
							id: {
								_in: configIds,
							},
						},
						sort: 'sort',
						limit: -1,
					fields: [
						'id',
						'name',
						'button_label',
						'button_icon',
						'button_color',
						'visibility_condition',
						'disabled_condition',
						'require_confirmation',
						'confirmation_message',
						'action_type',
						'action_config',
						'sort'
					]
					},
				});

			// Parse JSON string fields (Directus returns JSON fields as strings)
			const parsedData = (response.data.data || []).map((button) => {
				const parsed = { ...button };

				const parseField = (field, fallback = null) => {
					if (typeof parsed[field] === 'string') {
						try {
							parsed[field] = JSON.parse(parsed[field]);
						} catch (e) {
							console.warn(`[Configurable Button] Failed to parse ${field}:`, e);
							parsed[field] = fallback;
						}
					}
				};

				parseField('visibility_condition');
				parseField('disabled_condition');
				parseField('action_config', {});

				return parsed;
			});

			buttonConfigsData.value = parsedData;
			} catch (error) {
				// Ignore aborted requests
				if (error.name === 'AbortError') return;

				console.error('Failed to fetch button configs:', error);
				notificationsStore.add({
					title: 'Error',
					text: 'Failed to load button configurations',
					type: 'error',
				});
			}
		};

		// Fetch configs on mount and when config props change
		const stopWatcher = watch(
			() => [props.buttonConfigIds, props.buttonConfigs],
			() => {
				fetchButtonConfigs();
			},
			{ immediate: true }
		);

		// Cleanup on unmount
		onBeforeUnmount(() => {
			stopWatcher();
			if (abortController) {
				abortController.abort();
			}
		});

		// Constants
		const OPERATORS = {
			EQ: 'eq',
			NEQ: 'neq',
			IN: 'in',
			NIN: 'nin',
			GT: 'gt',
			GTE: 'gte',
			LT: 'lt',
			LTE: 'lte',
			CONTAINS: 'contains',
			NULL: 'null',
			NNULL: 'nnull',
		};

		// Helper: Create enhanced item with current field value
		const createEnhancedItem = () => {
			// Get the field name (props.field can be either a string or an object)
			const fieldName = typeof props.field === 'string' ? props.field : props.field?.field || 'status';

			// This display MUST be attached to button_context field
			if (fieldName !== 'button_context') {
				console.error(
					'[Configurable Button] This display must be attached to a "button_context" field. ' +
					`Current field: "${fieldName}". Please update your field configuration.`
				);
				// Return minimal fallback to prevent crashes
				return { ...props.item };
			}

			if (!props.value || typeof props.value !== 'object') {
				console.error(
					'[Configurable Button] button_context field value is invalid. ' +
					'Make sure the populate-button-context hook is running.'
				);
				return { ...props.item };
			}

			// button_context contains all task fields synced by the hook
			// Map it to match expected item structure for interpolation
			return {
				...props.item, // Include any additional props.item data (spread first so button_context overrides)
				// button_context values take precedence over props.item
				id: props.value.task_id,
				task_id: props.value.task_id,
				project_id: props.value.project_id,
				output_collection: props.value.output_collection,
				status: props.value.status,
				title: props.value.title,
				action_type: props.value.action_type,
				action_config: props.value.action_config,
				display_fields: props.value.display_fields,
				needs_approval: props.value.needs_approval,
				// Action-specific fields for dynamic button configuration
				flow_id: props.value.flow_id,
				webhook_url: props.value.webhook_url,
				webhook_method: props.value.webhook_method,
				link_url: props.value.link_url,
				module_path: props.value.module_path,
			};
		};

		// HTML escape function to prevent XSS
		const escapeHtml = (str) => {
			if (str === null || str === undefined) return str;
			const map = {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#039;'
			};
			return String(str).replace(/[&<>"']/g, (m) => map[m]);
		};

		// Validation: Collection names (prevents path traversal)
		const isValidCollectionName = (name) => {
			if (!name || typeof name !== 'string') return false;
			// Only allow: letters, numbers, underscore. Must start with letter.
			return /^[a-z][a-z0-9_]*$/i.test(name);
		};

		// Validation: Module paths (prevents protocol injection)
		const isValidModulePath = (path) => {
			if (!path || typeof path !== 'string') return false;
			// Must start with single /
			if (!path.startsWith('/')) return false;
			// Block protocol-relative URLs (//evil.com)
			if (path.startsWith('//')) return false;
			// Block URLs with protocols (javascript:, data:, etc)
			if (path.includes(':')) return false;
			return true;
		};

		// Validation: Webhook URLs (SSRF protection)
		const validateWebhookUrl = (url) => {
			let urlObj;
			try {
				urlObj = new URL(url);
			} catch {
				throw new Error('Invalid URL');
			}

			const hostname = urlObj.hostname.toLowerCase();

			// Block non-http protocols
			if (!['http:', 'https:'].includes(urlObj.protocol)) {
				throw new Error('Invalid URL protocol. Only http and https are allowed.');
			}

			// Block 'localhost' hostname
			if (hostname === 'localhost') {
				throw new Error('Internal network URLs are not allowed');
			}

			// IPv4 validation with proper octet parsing
			// Matches: xxx.xxx.xxx.xxx where xxx is 0-255
			const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
			const ipv4Match = hostname.match(ipv4Regex);

			if (ipv4Match) {
				// Parse octets as numbers for proper range checking
				const octets = ipv4Match.slice(1).map(Number);

				// Validate octets are in valid range (0-255)
				if (octets.some(octet => octet > 255)) {
					throw new Error('Invalid IP address');
				}

				// 0.0.0.0/8 - Current network (this network)
				if (octets[0] === 0) {
					throw new Error('Internal network URLs are not allowed');
				}

				// 127.0.0.0/8 - Loopback (entire range, not just 127.0.0.1)
				if (octets[0] === 127) {
					throw new Error('Internal network URLs are not allowed');
				}

				// 10.0.0.0/8 - Private network
				if (octets[0] === 10) {
					throw new Error('Internal network URLs are not allowed');
				}

				// 169.254.0.0/16 - Link-local / AWS metadata endpoint
				// CRITICAL: 169.254.169.254 is used by AWS/Azure/GCP for metadata
				if (octets[0] === 169 && octets[1] === 254) {
					throw new Error('Internal network URLs are not allowed');
				}

				// 172.16.0.0/12 - Private network (172.16.0.0 - 172.31.255.255)
				// More efficient than checking each /16 subnet individually
				if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
					throw new Error('Internal network URLs are not allowed');
				}

				// 192.168.0.0/16 - Private network
				if (octets[0] === 192 && octets[1] === 168) {
					throw new Error('Internal network URLs are not allowed');
				}
			}

			// IPv6 localhost (::1 appears as [::1] in URL hostname or just ::1)
			if (hostname === '[::1]' || hostname === '::1') {
				throw new Error('Internal network URLs are not allowed');
			}

			// IPv6 link-local (fe80::/10)
			if (hostname.startsWith('[fe80:') || hostname.startsWith('fe80:')) {
				throw new Error('Internal network URLs are not allowed');
			}

			// IPv6 unique local (fc00::/7 = fc00:: and fd00::)
			if (
				hostname.startsWith('[fc') || hostname.startsWith('fc') ||
				hostname.startsWith('[fd') || hostname.startsWith('fd')
			) {
				throw new Error('Internal network URLs are not allowed');
			}

			return true;
		};

		// Template interpolation function with HTML escaping
		const interpolate = (template, item) => {
			if (template === null || template === undefined) return template;
			if (typeof template !== 'string') return template;
			return template.replace(/\{(\w+)\}/g, (match, key) => {
				const value = item[key];
				// Warn if variable is missing or null
				if (value === undefined || value === null) {
					console.warn(
						`[Configurable Button] Template variable "{${key}}" is ${value === undefined ? 'undefined' : 'null'}. ` +
						`Template: "${template}". Available fields: [${Object.keys(item).join(', ')}]`
					);
					// Return empty string instead of broken template literal
					return '';
				}
				return escapeHtml(String(value));
			});
		};

		// Interpolate object recursively
		const interpolateObject = (obj, item) => {
			if (!obj) return obj;
			if (typeof obj === 'string') return interpolate(obj, item);
			if (Array.isArray(obj)) return obj.map((v) => interpolateObject(v, item));
			if (typeof obj === 'object') {
				const result = {};
				// Use Object.keys() to iterate only over own properties (prototype pollution protection)
				// This prevents processing of inherited properties like __proto__, constructor, etc.
				for (const key of Object.keys(obj)) {
					result[key] = interpolateObject(obj[key], item);
				}
				return result;
			}
			return obj;
		};

		// Condition evaluation function
		const evaluateCondition = (condition, item) => {
			if (!condition) return true; // No condition means always true
			if (!item) return false; // No item data means condition cannot be evaluated

			// Handle AND/OR logic
			if (condition.and) {
				return condition.and.every((c) => evaluateCondition(c, item));
			}
			if (condition.or) {
				return condition.or.some((c) => evaluateCondition(c, item));
			}

			// Single condition evaluation
			const { field, operator, value } = condition;
			if (!field || !operator) return true;

			const itemValue = item[field];

			switch (operator) {
				case OPERATORS.EQ:
					return itemValue === value;
				case OPERATORS.NEQ:
					return itemValue !== value;
				case OPERATORS.IN:
					return Array.isArray(value) && value.includes(itemValue);
				case OPERATORS.NIN:
					return Array.isArray(value) && !value.includes(itemValue);
				case OPERATORS.GT:
					return itemValue > value;
				case OPERATORS.GTE:
					return itemValue >= value;
				case OPERATORS.LT:
					return itemValue < value;
				case OPERATORS.LTE:
					return itemValue <= value;
				case OPERATORS.CONTAINS:
					return String(itemValue).includes(String(value));
				case OPERATORS.NULL:
					return itemValue === null || itemValue === undefined;
				case OPERATORS.NNULL:
					return itemValue !== null && itemValue !== undefined;
				default:
					return true;
			}
		};

		// Get visible buttons (filter by visibility condition)
		const visibleButtons = computed(() => {
			if (!buttonConfigsData.value || !Array.isArray(buttonConfigsData.value)) {
				return [];
			}

			const enhancedItem = createEnhancedItem();
			return buttonConfigsData.value.filter((button) => {
				return evaluateCondition(button.visibility_condition, enhancedItem);
			});
		});

		// Check if button should be disabled
		const isButtonDisabled = (button) => {
			if (!button.disabled_condition) return false;
			const enhancedItem = createEnhancedItem();
			return evaluateCondition(button.disabled_condition, enhancedItem);
		};

		// Get button kind/color
		const getButtonKind = (button) => {
			const colorMap = {
				primary: 'primary',
				secondary: 'secondary',
				success: 'success',
				warning: 'warning',
				danger: 'danger',
				info: 'info',
			};
			return colorMap[button.button_color] || 'primary';
		};

		// Handle button click
		const handleButtonClick = async (button) => {
			if (isButtonDisabled(button) || loadingButtons.value[button.id]) {
				return;
			}

			// Show confirmation dialog if required
			if (button.require_confirmation) {
				pendingAction.value = button;
				const enhancedItem = createEnhancedItem();
				confirmationMessage.value =
					interpolate(button.confirmation_message, enhancedItem) || 'Are you sure you want to proceed?';
				showConfirmDialog.value = true;
				return;
			}

			// Execute action directly
			await executeAction(button);
		};

		// Execute confirmed action
		const executeConfirmedAction = async () => {
			showConfirmDialog.value = false;
			if (pendingAction.value) {
				await executeAction(pendingAction.value);
				pendingAction.value = null;
			}
		};

		// Execute action based on type
		const executeAction = async (button) => {
			// Get item context (uses button_context from props.value if available)
			const item = createEnhancedItem();
			// Button's action_type takes precedence (defines button behavior)
			// Falls back to task's action_type for generic buttons (Run Task has action_type="")
			const actionType = button.action_type || item.action_type;

			// Allow task to override action_config (complete override if provided)
			// If task provides action_config, it takes full precedence
			const actionConfig = item.action_config || button.action_config || {};

			// Merge button config with item fields for dynamic configuration
			const baseConfig = interpolateObject(actionConfig, item);
			const config = { ...baseConfig, ...item };

			// Map output_collection to collection for handler compatibility
			if (config.output_collection && !config.collection) {
				config.collection = config.output_collection;
			}

			// Map webhook_url to url for handler compatibility
			if (config.webhook_url && !config.url) {
				config.url = config.webhook_url;
			}

			// Map webhook_method to method for handler compatibility
			if (config.webhook_method && !config.method) {
				config.method = config.webhook_method;
			}

			loadingButtons.value[button.id] = true;

			try {
				switch (actionType) {
					case 'link':
						await handleLinkAction(config);
						break;
					case 'webhook':
						await handleWebhookAction(config);
						break;
					case 'navigate_collection':
						await handleNavigateCollectionAction(config);
						break;
					case 'review_outputs':
						await handleReviewOutputsAction(config);
						break;
					case 'create_item_single':
						await handleCreateItemSingleAction(config);
						break;
					default:
						notificationsStore.add({
							title: 'Error',
							text: `Unknown action type: ${actionType}`,
							type: 'error',
						});
				}
			} catch (error) {
				console.error('Action execution failed:', error);
				notificationsStore.add({
					title: 'Error',
					text: error.message || 'Action failed',
					type: 'error',
				});
			} finally {
				loadingButtons.value[button.id] = false;
			}
		};

		// Action Handlers
		const handleLinkAction = async (config) => {
			const { url, new_tab = true } = config;

			if (!url) {
				throw new Error('URL is required for link action');
			}

			// Validate URL protocol
			try {
				const urlObj = new URL(url);
				if (!['http:', 'https:'].includes(urlObj.protocol)) {
					throw new Error('Invalid URL protocol. Only http and https are allowed.');
				}
			} catch (e) {
				throw new Error('Invalid URL format');
			}

			if (new_tab) {
				const newWindow = window.open(url, '_blank');
				// Prevent tabnabbing
				if (newWindow) newWindow.opener = null;
			} else {
				window.location.href = url;
			}
		};

		const handleWebhookAction = async (config) => {
			const { url, method = 'POST', payload = {}, success_message, error_message, id, task_id } = config;

			if (!url) {
				throw new Error('URL is required for webhook action');
			}

			// Validate URL for SSRF protection (includes IPv6)
			validateWebhookUrl(url);

			const taskIdToUpdate = task_id || id;

			try {
				// Use server-side webhook proxy to bypass CORS
				const response = await api.post('/webhook-proxy', {
					url: url,
					method: method.toUpperCase(),
					body: payload,
				});

				if (!response.success && response.status >= 400) {
					throw new Error(`Webhook failed with status ${response.status}: ${response.statusText}`);
				}

				// Update task with webhook tracking fields (success case)
				if (taskIdToUpdate) {
					try {
						await api.patch(`/items/tasks/${taskIdToUpdate}`, {
							webhook_last_status: response.status,
							webhook_last_response: JSON.stringify(response.data).substring(0, 1000),
							webhook_last_error: null,
						});
					} catch (updateError) {
						console.warn('[Webhook] Failed to update tracking fields:', updateError);
						// Don't fail the webhook if tracking update fails
					}
				}

				notificationsStore.add({
					title: 'Success',
					text: success_message || 'Webhook executed successfully',
					type: 'success',
				});

				return response.data;
			} catch (error) {
				// Update task with webhook tracking fields (error case)
				if (taskIdToUpdate) {
					try {
						await api.patch(`/items/tasks/${taskIdToUpdate}`, {
							webhook_last_status: error.response?.status || null,
							webhook_last_response: null,
							webhook_last_error: error.message,
						});
					} catch (updateError) {
						console.warn('[Webhook] Failed to update tracking fields:', updateError);
						// Don't fail the webhook if tracking update fails
					}
				}

				throw new Error(error_message || error.message || 'Webhook failed');
			}
		};

		const handleNavigateCollectionAction = async (config) => {
			const { collection } = config;

			if (!collection) {
				throw new Error('Collection is required for navigate action');
			}

			// Validate collection name to prevent path traversal
			if (!isValidCollectionName(collection)) {
				throw new Error('Invalid collection name');
			}

			// Navigate to collection (filtering not supported by Directus admin UI)
			router.push(`/content/${collection}`);
		};

		// State for create item drawer
		const showCreateDrawer = ref(false);
		const createDrawerCollection = ref('');
		const createDrawerFormData = ref({});
		const createDrawerFields = ref([]);
		const createDrawerLoading = ref(false);
		const createDrawerItemId = ref(null); // Track item ID for edit mode

	const saveCreateDrawerItem = async () => {
		createDrawerLoading.value = true;
		try {
			let response;
			let successMessage;

			if (createDrawerItemId.value) {
				// Edit mode - PATCH existing item
				response = await api.patch(`/items/${createDrawerCollection.value}/${createDrawerItemId.value}`, createDrawerFormData.value);
				successMessage = 'Item updated successfully';
			} else {
				// Create mode - POST new item
				response = await api.post(`/items/${createDrawerCollection.value}`, createDrawerFormData.value);
				successMessage = 'Item created successfully';
			}


			notificationsStore.add({
				title: 'Success',
				text: successMessage,
				type: 'success',
			});

			showCreateDrawer.value = false;
			createDrawerFormData.value = {};
			createDrawerItemId.value = null;

		} catch (error) {
			notificationsStore.add({
				title: 'Error',
				text: error.response?.data?.errors?.[0]?.message || error.message || 'Failed to save item',
				type: 'error',
			});
		} finally {
			createDrawerLoading.value = false;
		}
	};

		const cancelCreateDrawer = () => {
			showCreateDrawer.value = false;
			createDrawerFormData.value = {};
			createDrawerItemId.value = null;
		};

		const handleCreateItemSingleAction = async (config) => {
			const { collection, prefill = {}, lookup_filter = {}, existing_message = 'Item already exists' } = config;

			if (!collection) {
				throw new Error('Collection is required for create_item_single action');
			}

			// Validate collection name to prevent path traversal
			if (!isValidCollectionName(collection)) {
				throw new Error('Invalid collection name');
			}

			// Build lookup filter from prefill if not explicitly provided
			// This allows checking if an item with the same key fields already exists
			let filterToUse = lookup_filter;
			if (Object.keys(lookup_filter).length === 0 && Object.keys(prefill).length > 0) {
				// Use prefill values as the lookup filter
				filterToUse = {};
				for (const [key, value] of Object.entries(prefill)) {
					if (value !== null && value !== undefined && value !== '') {
						filterToUse[key] = { _eq: value };
					}
				}
			}

		// Check if an item already exists
		if (Object.keys(filterToUse).length > 0) {
			try {
				const existingResponse = await api.get(`/items/${collection}`, {
					params: {
						filter: filterToUse,
						limit: 1,
					},
				});

				const existingItems = existingResponse.data.data || [];
				if (existingItems.length > 0) {
					// Item already exists - open drawer with existing data
					const existingItem = existingItems[0];


					// Open drawer with existing item data for editing
					createDrawerCollection.value = collection;
					createDrawerFormData.value = existingItem;
					createDrawerItemId.value = existingItem.id; // Track ID for PATCH

					try {
						createDrawerFields.value = fieldsStore.getFieldsForCollection(collection);
					} catch (error) {
						createDrawerFields.value = [];
					}

					showCreateDrawer.value = true;
					return;
				}
			} catch (error) {
				// If lookup fails, proceed to create (fail-open for better UX)
				console.warn('Lookup for existing item failed:', error);
			}
		}

			// No existing item found - proceed with creation using the drawer
			// Build initial form data from prefill, filtering out empty values
			const initialData = {};
			for (const [key, value] of Object.entries(prefill)) {
				if (value !== null && value !== undefined && value !== '') {
					// Convert numeric strings to numbers for ID fields
					if ((key.endsWith('_id') || key === 'id') && !isNaN(value)) {
						initialData[key] = Number(value);
					} else {
						initialData[key] = value;
					}
				}
			}

			// Set drawer state
			createDrawerCollection.value = collection;
			createDrawerFormData.value = initialData;

			// Fetch fields for the collection
			try {
				createDrawerFields.value = fieldsStore.getFieldsForCollection(collection);
			} catch (error) {
				createDrawerFields.value = [];
			}

			// Open the drawer
		createDrawerItemId.value = null; // Create mode
			showCreateDrawer.value = true;
		};

		const handleReviewOutputsAction = async (config) => {
			let {
				collection,
				task_mappings,
				layout = 'table',
				filter = {},
				fields = [],
				allow_edit = true,
				allow_delete = false,
				allow_create = false,
				title = 'Review Outputs'
			} = config;

			// NEW: Try to extract task ID from filter and lookup collection from mappings
			if (task_mappings && filter?.task_id?._eq) {
				const taskId = String(filter.task_id._eq);
				const mappedCollection = task_mappings[taskId];

				if (mappedCollection) {
					collection = mappedCollection;
				}
			}

			if (!collection) {
				throw new Error('Collection is required for review_outputs action');
			}

			// Validate collection name to prevent path traversal
			if (!isValidCollectionName(collection)) {
				throw new Error('Invalid collection name');
			}

			// Build query params
			const params = new URLSearchParams({
				collection,
				layout,
				filter: JSON.stringify(filter),
				fields: JSON.stringify(fields),
				permissions: JSON.stringify({
					edit: allow_edit,
					delete: allow_delete,
					create: allow_create
				}),
				title
			});

			// Navigate to review module
			router.push(`/review?${params.toString()}`);
		};

		// Create enhanced item for template access
		const item = computed(() => createEnhancedItem());

		return {
			visibleButtons,
			isButtonDisabled,
			getButtonKind,
			handleButtonClick,
			loadingButtons,
			showConfirmDialog,
			confirmationMessage,
			executeConfirmedAction,
			interpolate,
			layout,
			buttonSize,
			item,
			// Create item drawer
			showCreateDrawer,
			createDrawerCollection,
			createDrawerFormData,
			createDrawerFields,
			createDrawerLoading,
			saveCreateDrawerItem,
			cancelCreateDrawer,
		};
	},
});
</script>

<style scoped>
.configurable-button-display {
	display: inline-flex;
	align-items: center;
}

.button-container {
	display: flex;
	gap: 8px;
	align-items: center;
}

.button-container.layout-horizontal {
	flex-direction: row;
	flex-wrap: wrap;
}

.button-container.layout-vertical {
	flex-direction: column;
	align-items: stretch;
}

.button-container.layout-dropdown {
	flex-direction: row;
}

.button-spacing {
	margin-right: 8px;
}

.drawer-content {
	padding: var(--content-padding);
	padding-bottom: var(--content-padding-bottom);
}
</style>
