<script lang="ts">
	import type { ComponentProps } from 'svelte';
	let props: ComponentProps<typeof import('./GlossChart.svelte').default> = $props();
</script>

{#await import('./GlossChart.svelte')}
	<div class="chart-placeholder" role="status">Diagramm wird geladen …</div>
{:then { default: Chart }}
	<Chart {...props} />
{:catch}
	<p role="alert">Das Diagramm konnte nicht geladen werden.</p>
{/await}

<style>
	.chart-placeholder {
		min-height: 290px;
		display: grid;
		place-items: center;
		color: var(--color-stone-500);
		font-size: 0.8rem;
	}
</style>
