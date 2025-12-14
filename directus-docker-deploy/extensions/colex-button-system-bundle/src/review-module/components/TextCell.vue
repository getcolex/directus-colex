<template>
	<div
		v-tooltip="shouldShowTooltip ? fullText : undefined"
		class="text-cell"
		:class="{ truncated: shouldShowTooltip }"
	>
		{{ displayValue }}
	</div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';

const props = defineProps({
	value: {
		type: [String, Number, Boolean],
		default: null
	}
});

const cellRef = ref(null);

// Display value - handle null/undefined
const displayValue = computed(() => {
	if (props.value == null) return '—';
	return String(props.value);
});

// Full text for tooltip
const fullText = computed(() => {
	if (props.value == null) return '';
	return String(props.value);
});

// Show tooltip only for long text (>50 chars)
const shouldShowTooltip = computed(() => {
	const text = fullText.value;
	return text && text.length > 50;
});
</script>

<style scoped>
.text-cell {
	display: block;
	max-width: 200px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	padding: 0 8px;
}

.text-cell.truncated {
	cursor: help;
}
</style>
