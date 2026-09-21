<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	let { value = '', compact = false }: { value?: string; compact?: boolean } = $props();
	const id = $props.id();
</script>

<form
	action="/help"
	method="GET"
	autocomplete="off"
	class="help-search"
	class:compact
	role="search"
>
	<label for={id}>Hilfe durchsuchen</label>
	<div class="search-field">
		<input
			{id}
			name="q"
			type="search"
			{value}
			autocomplete="off"
			maxlength="160"
			placeholder={compact ? 'Suchbegriff' : 'Suchbegriff eingeben'}
		/>
		<button type="submit" title="Suchen" aria-label="Suchen">
			{#if compact}<Icon name="search" class="size-5" />{/if}
			<span class:sr-only={compact}>Suchen</span>
		</button>
	</div>
</form>

<style>
	.help-search {
		width: 100%;
		min-width: 0;
	}
	label {
		display: block;
		margin-bottom: 0.55rem;
		font-size: 0.8125rem;
		font-weight: 650;
	}
	.search-field {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--line);
		border-radius: 0.55rem;
		padding: 0.35rem;
		background: var(--surface-raised);
	}
	.search-field:focus-within {
		border-color: var(--color-accent-600);
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-accent-500) 14%, transparent);
	}
	input {
		min-width: 0;
		width: 0;
		flex: 1 1 0%;
		background: transparent;
		padding: 0.5rem 0.55rem;
		font-size: 0.9375rem;
		line-height: 1.5;
		outline: none;
	}
	input::placeholder {
		color: var(--color-stone-500);
	}
	button {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0.5rem 1rem;
		border-radius: 0.4rem;
		background: var(--color-accent-700);
		color: white;
		font-size: 0.8125rem;
		font-weight: 650;
		cursor: pointer;
	}
	button:hover {
		background: var(--color-accent-800);
	}
	button:focus-visible {
		outline: 2px solid var(--color-accent-600);
		outline-offset: 2px;
	}
	.compact .search-field {
		gap: 0.125rem;
		padding: 3px;
		border-radius: 0.45rem;
	}
	.compact input {
		padding: 0.4rem 0.45rem;
		font-size: 0.875rem;
	}
	.compact button {
		width: 2.25rem;
		min-height: 2.25rem;
		padding: 0;
		border-radius: 0.3rem;
	}
	@media (max-width: 500px) {
		input {
			font-size: 0.875rem;
		}
		button {
			padding-inline: 0.75rem;
		}
	}
</style>
