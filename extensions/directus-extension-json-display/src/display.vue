<template>
	<div class="json-display" :class="[colorSchemeClass]" :style="containerStyle">
		<div v-if="!parsedValue" class="empty-state">
			<span class="null-value">null</span>
		</div>
		<div v-else class="json-content" :class="{ 'with-line-numbers': showLineNumbers }">
			<div v-if="showLineNumbers" class="line-numbers">
				<span v-for="n in lineCount" :key="n" class="line-number">{{ n }}</span>
			</div>
			<div class="json-tree">
				<json-node
					:data="parsedValue"
					:depth="0"
					:max-depth="maxDepth"
					:initially-collapsed="collapsed"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from 'vue';

interface Props {
	value: any;
	maxDepth?: number;
	collapsed?: boolean;
	showLineNumbers?: boolean;
	maxHeight?: number;
	colorScheme?: 'default' | 'dark' | 'light' | 'monokai';
}

const props = withDefaults(defineProps<Props>(), {
	maxDepth: 3,
	collapsed: false,
	showLineNumbers: false,
	maxHeight: 400,
	colorScheme: 'default',
});

const parsedValue = computed(() => {
	if (props.value === null || props.value === undefined) return null;
	
	if (typeof props.value === 'string') {
		try {
			return JSON.parse(props.value);
		} catch {
			return props.value;
		}
	}
	
	return props.value;
});

const containerStyle = computed(() => ({
	maxHeight: props.maxHeight ? `${props.maxHeight}px` : 'none',
}));

const colorSchemeClass = computed(() => `scheme-${props.colorScheme}`);

const lineCount = computed(() => {
	if (!parsedValue.value) return 0;
	const jsonString = JSON.stringify(parsedValue.value, null, 2);
	return jsonString.split('\n').length;
});

// JSON Node Component
const JsonNode = defineComponent({
	name: 'JsonNode',
	props: {
		data: { required: true },
		depth: { type: Number, default: 0 },
		maxDepth: { type: Number, default: 3 },
		initiallyCollapsed: { type: Boolean, default: false },
		keyName: { type: String, default: '' },
	},
	setup(props) {
		const isCollapsed = ref(props.initiallyCollapsed && props.depth > 0);

		const isObject = computed(() => 
			props.data !== null && typeof props.data === 'object' && !Array.isArray(props.data)
		);

		const isArray = computed(() => Array.isArray(props.data));

		const isPrimitive = computed(() => !isObject.value && !isArray.value);

		const canCollapse = computed(() => 
			(isObject.value || isArray.value) && props.depth < props.maxDepth
		);

		const itemCount = computed(() => {
			if (isArray.value) return (props.data as any[]).length;
			if (isObject.value) return Object.keys(props.data as object).length;
			return 0;
		});

		const toggleCollapse = () => {
			if (canCollapse.value) {
				isCollapsed.value = !isCollapsed.value;
			}
		};

		return () => {
			const children: any[] = [];

			// Key name
			if (props.keyName) {
				children.push(
					h('span', { class: 'json-key' }, `"${props.keyName}"`),
					h('span', { class: 'json-colon' }, ': ')
				);
			}

			if (isPrimitive.value) {
				// Render primitive value
				const valueClass = getValueClass(props.data);
				const displayValue = formatValue(props.data);
				children.push(h('span', { class: valueClass }, displayValue));
			} else if (isObject.value || isArray.value) {
				const openBracket = isArray.value ? '[' : '{';
				const closeBracket = isArray.value ? ']' : '}';
				const entries = isArray.value 
					? (props.data as any[]).map((v, i) => [i.toString(), v])
					: Object.entries(props.data as object);

				if (canCollapse.value) {
					children.push(
						h('span', { 
							class: ['json-bracket', 'collapsible', { collapsed: isCollapsed.value }],
							onClick: toggleCollapse,
						}, [
							h('span', { class: 'collapse-icon' }, isCollapsed.value ? '▶' : '▼'),
							openBracket,
						])
					);

					if (isCollapsed.value) {
						children.push(
							h('span', { class: 'collapsed-preview' }, 
								` ${itemCount.value} ${isArray.value ? 'items' : 'properties'} `
							),
							h('span', { class: 'json-bracket' }, closeBracket)
						);
					} else {
						children.push(h('div', { class: 'json-children' }, 
							entries.map(([key, value], index) => 
								h('div', { class: 'json-entry', key }, [
									h(JsonNode, {
										data: value,
										depth: props.depth + 1,
										maxDepth: props.maxDepth,
										initiallyCollapsed: props.initiallyCollapsed,
										keyName: isArray.value ? '' : key,
									}),
									index < entries.length - 1 ? h('span', { class: 'json-comma' }, ',') : null,
								])
							)
						));
						children.push(h('span', { class: 'json-bracket' }, closeBracket));
					}
				} else {
					// Max depth reached, show inline preview
					children.push(
						h('span', { class: 'json-bracket' }, openBracket),
						h('span', { class: 'depth-exceeded' }, '...'),
						h('span', { class: 'json-bracket' }, closeBracket)
					);
				}
			}

			return h('span', { class: 'json-node' }, children);
		};
	},
});

function getValueClass(value: any): string {
	if (value === null) return 'json-value null-value';
	if (value === undefined) return 'json-value undefined-value';
	if (typeof value === 'boolean') return 'json-value boolean-value';
	if (typeof value === 'number') return 'json-value number-value';
	if (typeof value === 'string') return 'json-value string-value';
	return 'json-value';
}

function formatValue(value: any): string {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (typeof value === 'string') return `"${value}"`;
	return String(value);
}
</script>

<style scoped>
.json-display {
	font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
	font-size: 12px;
	line-height: 1.6;
	overflow: auto;
	padding: 12px;
	border-radius: 6px;
	background: var(--json-bg, var(--background-subdued));
	min-height: 100px;
	max-height: 400px;
}

.json-content {
	display: flex;
}

.json-content.with-line-numbers {
	padding-left: 0;
}

.line-numbers {
	display: flex;
	flex-direction: column;
	padding-right: 12px;
	margin-right: 12px;
	border-right: 1px solid var(--border-subdued);
	user-select: none;
	color: var(--foreground-subdued);
}

.line-number {
	text-align: right;
	min-width: 24px;
}

.json-tree {
	flex: 1;
	overflow-x: auto;
}

.json-node {
	white-space: nowrap;
}

.json-key {
	color: var(--json-key, #9c27b0);
	font-weight: 600;
}

.json-colon {
	color: var(--foreground-subdued);
}

.json-bracket {
	color: var(--foreground-subdued);
}

.json-bracket.collapsible {
	cursor: pointer;
}

.json-bracket.collapsible:hover {
	background: var(--background-highlight);
	border-radius: 2px;
}

.collapse-icon {
	font-size: 10px;
	margin-right: 4px;
	color: var(--foreground-subdued);
}

.collapsed-preview {
	color: var(--foreground-subdued);
	font-style: italic;
}

.json-children {
	padding-left: 20px;
}

.json-entry {
	display: block;
}

.json-comma {
	color: var(--foreground-subdued);
}

.json-value {
	color: var(--foreground);
}

.string-value {
	color: var(--json-string, #2e7d32);
}

.number-value {
	color: var(--json-number, #1565c0);
}

.boolean-value {
	color: var(--json-boolean, #ef6c00);
}

.null-value,
.undefined-value {
	color: var(--json-null, #757575);
	font-style: italic;
}

.depth-exceeded {
	color: var(--foreground-subdued);
}

.empty-state {
	color: var(--foreground-subdued);
	font-style: italic;
}

/* Color Schemes */
.scheme-default {
	--json-bg: var(--background-subdued);
	--json-key: #9c27b0;
	--json-string: #2e7d32;
	--json-number: #1565c0;
	--json-boolean: #ef6c00;
	--json-null: #757575;
}

.scheme-dark {
	--json-bg: #1e1e1e;
	--json-key: #ce91d8;
	--json-string: #a5d6a7;
	--json-number: #90caf9;
	--json-boolean: #ffcc80;
	--json-null: #9e9e9e;
	color: #d4d4d4;
}

.scheme-light {
	--json-bg: #ffffff;
	--json-key: #7b1fa2;
	--json-string: #1b5e20;
	--json-number: #0d47a1;
	--json-boolean: #e65100;
	--json-null: #616161;
	color: #333333;
}

.scheme-monokai {
	--json-bg: #272822;
	--json-key: #f92672;
	--json-string: #e6db74;
	--json-number: #ae81ff;
	--json-boolean: #66d9ef;
	--json-null: #75715e;
	color: #f8f8f2;
}
</style>
