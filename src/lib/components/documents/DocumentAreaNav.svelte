<script lang="ts">
	import Icon from '../Icon.svelte';

	let { active }: { active: 'notes' | 'sermons' } = $props();
</script>

<nav
	class="document-area-nav"
	aria-label="Dokumentbereiche"
	data-tour-target="documents-unified-view"
>
	<a
		href="/notes"
		class:active={active === 'notes'}
		aria-current={active === 'notes' ? 'page' : undefined}
	>
		<Icon name="file-text" class="size-4" />
		Notizen
	</a>
	<a
		href="/sermons"
		class:active={active === 'sermons'}
		aria-current={active === 'sermons' ? 'page' : undefined}
	>
		<Icon name="message" class="size-4" />
		Predigten
	</a>
</nav>

<style>
	.document-area-nav {
		display: inline-grid;
		grid-template-columns: repeat(2, minmax(8rem, 1fr));
		gap: 0.3rem;
		margin-top: 1.35rem;
		padding: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 0.9rem;
		background: color-mix(in oklab, var(--surface-raised) 82%, var(--color-stone-100));
	}

	a {
		display: inline-flex;
		min-height: 2.55rem;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		border-radius: 0.65rem;
		padding: 0.55rem 1rem;
		color: var(--color-stone-500);
		font-size: 0.82rem;
		font-weight: 750;
	}

	a:hover,
	a:focus-visible {
		color: var(--color-accent-700);
	}

	a.active {
		background: var(--surface);
		box-shadow: 0 1px 4px rgb(28 25 23 / 0.1);
		color: var(--color-accent-700);
	}

	:global(.dark) a.active {
		color: var(--color-accent-300);
	}

	@media (max-width: 420px) {
		.document-area-nav {
			display: grid;
			width: 100%;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
