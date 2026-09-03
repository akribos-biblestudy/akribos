<script lang="ts">
	import type { ReadableResource } from '$lib/server/repositories/resources';
	import Icon from './Icon.svelte';

	let { kind, class: className = '' }: { kind: ReadableResource['kind']; class?: string } =
		$props();
</script>

<span class="resource-kind-icon kind-{kind} {className}" aria-hidden="true">
	{#if kind === 'bible'}
		<Icon name="book-open" />
	{:else if kind === 'commentary'}
		<Icon name="message" />
	{:else if kind === 'lexicon'}
		<Icon name="book" />
	{:else}
		<Icon name="link" />
	{/if}
</span>

<style>
	.resource-kind-icon {
		--resource-tone: #526b78;
		position: relative;
		display: inline-flex;
		box-sizing: border-box;
		width: 1.25rem;
		height: 1.45rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in oklab, var(--resource-tone) 48%, var(--line));
		border-radius: 0.18rem 0.3rem 0.3rem 0.18rem;
		background: color-mix(in oklab, var(--resource-tone) 13%, var(--surface));
		box-shadow: inset 0.12rem 0 color-mix(in oklab, var(--resource-tone) 25%, transparent);
		color: var(--resource-tone);
	}

	.resource-kind-icon :global(svg) {
		width: 0.78rem;
		height: 0.78rem;
		stroke-width: 1.8;
	}

	.kind-bible {
		--resource-tone: #39834b;
	}

	.kind-commentary {
		--resource-tone: #806640;
	}

	.kind-lexicon {
		--resource-tone: #2f70a7;
	}

	.kind-xrefs {
		--resource-tone: #526b78;
	}

	:global(.dark) .resource-kind-icon {
		background: color-mix(in oklab, var(--resource-tone) 22%, var(--surface));
		color: color-mix(in oklab, var(--resource-tone) 72%, white);
	}
</style>
