<template>
	<div class="json-interface" :class="[colorSchemeClass, { disabled }]">
		<div class="toolbar">
			<button type="button" class="toolbar-btn" @click="formatJson" title="Format JSON">
				<span class="icon">✨</span> Format
			</button>
			<button type="button" class="toolbar-btn" @click="collapseAll" title="Collapse All">
				<span class="icon">➖</span> Collapse
			</button>
			<button type="button" class="toolbar-btn" @click="expandAll" title="Expand All">
				<span class="icon">➕</span> Expand
			</button>
			<button type="button" class="toolbar-btn" @click="copyToClipboard" title="Copy JSON">
				<span class="icon">📋</span> Copy
			</button>
			<span v-if="validationError" class="validation-error">
				⚠️ {{ validationError }}
			</span>
			<span v-else-if="parsedValue" class="validation-ok">
				✓ Valid JSON
			</span>
		</div>
		
		<div class="editor-container" :style="{ maxHeight: maxHeight + 'px' }">
			<div v-if="showLineNumbers" class="line-numbers">
				<span v-for="n in lineCount" :key="n" class="line-number">{{ n }}</span>
			</div>
			<textarea
				ref="textareaRef"
				class="json-textarea"
				:value="internalValue"
				:disabled="disabled"
				:placeholder="placeholder"
				@input="onInput"
				@keydown.tab.prevent="handleTab"
				spellcheck="false"
			></textarea>
		</div>
		
		<div v-if="parsedValue && !validationError" class="preview-section">
			<div class="preview-header" @click="showPreview = !showPreview">
				<span class="toggle-icon">{{ showPreview ? '▼' : '▶' }}</span>
				Preview
			</div>
			<div v-if="showPreview" class="json-preview">
				<json-node
					:data="parsedValue"
					:depth="0"
					:max-depth="10"
					:initially-collapsed="false"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch, defineComponent, h } from 'vue';

interface Props {
	value: any;
	disabled?: boolean;
	placeholder?: string;
	maxHeight?: number;
	showLineNumbers?: boolean;
	colorScheme?: 'auto' | 'light' | 'dark';
	indentSize?: number;
}

const props = withDefaults(defineProps<Props>(), {
	disabled: false,
	placeholder: 'Enter JSON...',
	maxHeight: 400,
	showLineNumbers: true,
	colorScheme: 'auto',
	indentSize: 2,
});

const emit = defineEmits(['input']);

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const internalValue = ref('');
const validationError = ref<string | null>(null);
const showPreview = ref(true);

// Initialize internal value from prop
watch(() => props.value, (newVal) => {
	if (newVal === null || newVal === undefined) {
		internalValue.value = '';
	} else if (typeof newVal === 'string') {
		internalValue.value = newVal;
	} else {
		internalValue.value = JSON.stringify(newVal, null, props.indentSize);
	}
	validateJson();
}, { immediate: true });

const parsedValue = computed(() => {
	if (!internalValue.value.trim()) return null;
	try {
		return JSON.parse(internalValue.value);
	} catch {
		return null;
	}
});

const lineCount = computed(() => {
	return internalValue.value.split('\n').length;
});

const colorSchemeClass = computed(() => {
	if (props.colorScheme === 'auto') {
		return 'scheme-auto';
	}
	return `scheme-${props.colorScheme}`;
});

function validateJson() {
	if (!internalValue.value.trim()) {
		validationError.value = null;
		return;
	}
	try {
		JSON.parse(internalValue.value);
		validationError.value = null;
	} catch (e: any) {
		validationError.value = e.message;
	}
}

function onInput(event: Event) {
	const target = event.target as HTMLTextAreaElement;
	internalValue.value = target.value;
	validateJson();
	
	if (!validationError.value && internalValue.value.trim()) {
		emit('input', JSON.parse(internalValue.value));
	} else if (!internalValue.value.trim()) {
		emit('input', null);
	}
}

function formatJson() {
	if (parsedValue.value) {
		internalValue.value = JSON.stringify(parsedValue.value, null, props.indentSize);
		emit('input', parsedValue.value);
	}
}

function handleTab(event: KeyboardEvent) {
	const textarea = textareaRef.value;
	if (!textarea) return;
	
	const start = textarea.selectionStart;
	const end = textarea.selectionEnd;
	const spaces = ' '.repeat(props.indentSize);
	
	internalValue.value = 
		internalValue.value.substring(0, start) + 
		spaces + 
		internalValue.value.substring(end);
	
	// Set cursor position after inserted spaces
	setTimeout(() => {
		textarea.selectionStart = textarea.selectionEnd = start + props.indentSize;
	}, 0);
}

function copyToClipboard() {
	navigator.clipboard.writeText(internalValue.value);
}

function collapseAll() {
	showPreview.value = false;
}

function expandAll() {
	showPreview.value = true;
}

// JSON Node Component for Preview
const JsonNode = defineComponent({
	name: 'JsonNode',
	props: {
		data: { required: true },
		depth: { type: Number, default: 0 },
		maxDepth: { type: Number, default: 10 },
		initiallyCollapsed: { type: Boolean, default: false },
		keyName: { type: String, default: '' },
	},
	setup(nodeProps) {
		const isCollapsed = ref(nodeProps.initiallyCollapsed && nodeProps.depth > 0);

		const isObject = computed(() => 
			nodeProps.data !== null && typeof nodeProps.data === 'object' && !Array.isArray(nodeProps.data)
		);

		const isArray = computed(() => Array.isArray(nodeProps.data));
		const isPrimitive = computed(() => !isObject.value && !isArray.value);

		const canCollapse = computed(() => 
			(isObject.value || isArray.value) && nodeProps.depth < nodeProps.maxDepth
		);

		const itemCount = computed(() => {
			if (isArray.value) return (nodeProps.data as any[]).length;
			if (isObject.value) return Object.keys(nodeProps.data as object).length;
			return 0;
		});

		const toggleCollapse = () => {
			if (canCollapse.value) {
				isCollapsed.value = !isCollapsed.value;
			}
		};

		return () => {
			const children: any[] = [];

			// Add collapse toggle FIRST (on the left) for objects/arrays
			if ((isObject.value || isArray.value) && canCollapse.value) {
				children.push(
					h('span', { 
						class: 'collapse-toggle',
						onClick: toggleCollapse
					}, isCollapsed.value ? '▶' : '▼')
				);
			} else if (!isObject.value && !isArray.value) {
				// Add spacer for alignment on primitive values
				children.push(h('span', { class: 'collapse-spacer' }, ''));
			}

			if (nodeProps.keyName) {
				children.push(
					h('span', { class: 'json-key' }, `"${nodeProps.keyName}"`),
					h('span', { class: 'json-colon' }, ': ')
				);
			}

			if (isPrimitive.value) {
				const valueClass = getValueClass(nodeProps.data);
				const displayValue = formatValue(nodeProps.data);
				children.push(h('span', { class: valueClass }, displayValue));
			} else if (isObject.value || isArray.value) {
				const openBracket = isArray.value ? '[' : '{';
				const closeBracket = isArray.value ? ']' : '}';
				const entries = isArray.value 
					? (nodeProps.data as any[]).map((v, i) => [i.toString(), v])
					: Object.entries(nodeProps.data as object);

				children.push(h('span', { class: 'json-bracket' }, openBracket));

				if (isCollapsed.value) {
					children.push(
						h('span', { 
							class: 'collapsed-info',
							onClick: toggleCollapse 
						}, ` ... ${itemCount.value} items `)
					);
				} else if (entries.length > 0) {
					const childNodes = entries.map(([key, val], index) => 
						h('div', { class: 'json-item', key }, [
							h(JsonNode, {
								data: val,
								depth: nodeProps.depth + 1,
								maxDepth: nodeProps.maxDepth,
								initiallyCollapsed: nodeProps.initiallyCollapsed,
								keyName: isArray.value ? '' : key,
							}),
							index < entries.length - 1 ? h('span', { class: 'json-comma' }, ',') : null,
						])
					);
					children.push(h('div', { class: 'json-children' }, childNodes));
				}

				children.push(h('span', { class: 'json-bracket' }, closeBracket));
			}

			return h('span', { class: 'json-node' }, children);
		};
	},
});

function getValueClass(value: any): string {
	if (value === null) return 'json-value json-null';
	if (typeof value === 'boolean') return 'json-value json-boolean';
	if (typeof value === 'number') return 'json-value json-number';
	if (typeof value === 'string') return 'json-value json-string';
	return 'json-value';
}

function formatValue(value: any): string {
	if (value === null) return 'null';
	if (typeof value === 'string') return `"${value}"`;
	return String(value);
}
</script>

<style scoped>
.json-interface {
	border: 1px solid var(--border-normal);
	border-radius: var(--border-radius);
	background: var(--background-input);
	overflow: hidden;
}

.json-interface.disabled {
	opacity: 0.6;
	pointer-events: none;
}

.toolbar {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	background: var(--background-subdued);
	border-bottom: 1px solid var(--border-subdued);
	flex-wrap: wrap;
}

.toolbar-btn {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 10px;
	font-size: 12px;
	border: 1px solid var(--border-normal);
	border-radius: 4px;
	background: var(--background-input);
	color: var(--foreground-normal);
	cursor: pointer;
	transition: all 0.15s ease;
}

.toolbar-btn:hover {
	background: var(--background-normal);
	border-color: var(--primary);
}

.toolbar-btn .icon {
	font-size: 12px;
}

.validation-error {
	color: var(--danger);
	font-size: 12px;
	margin-left: auto;
}

.validation-ok {
	color: var(--success);
	font-size: 12px;
	margin-left: auto;
}

.editor-container {
	display: flex;
	overflow: auto;
	min-height: 150px;
}

.line-numbers {
	display: flex;
	flex-direction: column;
	padding: 12px 8px;
	background: var(--background-subdued);
	border-right: 1px solid var(--border-subdued);
	user-select: none;
	text-align: right;
	min-width: 40px;
}

.line-number {
	font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
	font-size: 12px;
	line-height: 1.6;
	color: var(--foreground-subdued);
}

.json-textarea {
	flex: 1;
	padding: 12px;
	border: none;
	background: transparent;
	color: var(--foreground-normal);
	font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
	font-size: 12px;
	line-height: 1.6;
	resize: none;
	outline: none;
	min-height: 150px;
	width: 100%;
}

.json-textarea::placeholder {
	color: var(--foreground-subdued);
}

.preview-section {
	border-top: 1px solid var(--border-subdued);
}

.preview-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	background: var(--background-subdued);
	cursor: pointer;
	font-size: 12px;
	font-weight: 600;
	color: var(--foreground-subdued);
}

.preview-header:hover {
	background: var(--background-normal);
}

.toggle-icon {
	font-size: 10px;
}

.json-preview {
	padding: 16px;
	max-height: 400px;
	overflow: auto;
	font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
	font-size: 14px;
	line-height: 1.8;
}

/* JSON Node Styles */
.json-node {
	display: inline;
}

.json-key {
	color: #881391;
}

.json-colon {
	color: var(--foreground-normal);
}

.json-bracket {
	color: var(--foreground-subdued);
}

.json-comma {
	color: var(--foreground-subdued);
}

.json-string {
	color: #0b7500;
}

.json-number {
	color: #1a1aa6;
}

.json-boolean {
	color: #7c3aed;
}

.json-null {
	color: #6b7280;
	font-style: italic;
}

.json-children {
	display: block;
	padding-left: 24px;
	border-left: 1px solid var(--border-subdued);
	margin-left: 8px;
}

.json-item {
	display: block;
	padding: 2px 0;
}

.collapse-toggle {
	cursor: pointer;
	color: var(--foreground-subdued);
	margin-right: 6px;
	font-size: 12px;
	width: 14px;
	display: inline-block;
	text-align: center;
}

.collapse-toggle:hover {
	color: var(--primary);
}

.collapse-spacer {
	width: 20px;
	display: inline-block;
}

.collapsed-info {
	color: var(--foreground-subdued);
	font-style: italic;
	cursor: pointer;
}

/* Dark scheme */
.scheme-dark .json-key,
.scheme-auto :global(.dark) .json-key {
	color: #f472b6;
}

.scheme-dark .json-string,
.scheme-auto :global(.dark) .json-string {
	color: #4ade80;
}

.scheme-dark .json-number,
.scheme-auto :global(.dark) .json-number {
	color: #60a5fa;
}

.scheme-dark .json-boolean,
.scheme-auto :global(.dark) .json-boolean {
	color: #a78bfa;
}
</style>
