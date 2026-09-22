<script lang="ts">
	let { source }: { source: { selectionTitle: string; sourceRevision: string | null } } = $props();
	const tooltip = $derived(
		`Vorkommen aus ${source.selectionTitle} · ${source.sourceRevision ? `Version ${source.sourceRevision}` : 'Importversion nicht ermittelt'}`
	);
</script>

<span class="study-source" title={tooltip}>{source.selectionTitle}</span>

<style>
	.study-source {
		max-width: 6.5rem;
		flex: none;
		overflow: hidden;
		margin-right: 0.3rem;
		padding: 0.15rem 0.35rem;
		border: 1px solid color-mix(in oklab, #39834b 30%, var(--line));
		border-radius: 999px;
		background: color-mix(in oklab, #39834b 9%, transparent);
		color: color-mix(in oklab, #39834b 85%, var(--color-stone-800));
		font-size: 0.58rem;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
