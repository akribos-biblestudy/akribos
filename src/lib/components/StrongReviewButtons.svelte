<script lang="ts">
	type Decision = 'confirmed' | 'incorrect';
	let {
		pending = null,
		disabled = false,
		onDecision
	}: {
		pending?: Decision | null;
		disabled?: boolean;
		onDecision: (decision: Decision | 'withdraw') => void;
	} = $props();
	const id = $props.id();
	const confirmText = $derived(
		pending === 'confirmed' ? 'Bestätigung zurückziehen' : 'Zuordnung bestätigen'
	);
	const incorrectText = $derived(
		pending === 'incorrect' ? 'Markierung als fehlerhaft zurückziehen' : 'Als fehlerhaft markieren'
	);
</script>

<div class="flex items-center gap-2" role="group" aria-label="Strong-Zuordnung prüfen">
	{#each [{ value: 'confirmed', text: confirmText }, { value: 'incorrect', text: incorrectText }] as choice (choice.value)}
		{@const selected = pending === choice.value}
		<button
			type="button"
			class="review-button group relative inline-flex size-10 items-center justify-center rounded-md border border-stone-300 text-stone-600 hover:border-accent-600 hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:opacity-50 dark:border-stone-600 dark:text-stone-300 dark:hover:text-accent-300"
			class:selected
			aria-label={choice.text}
			aria-pressed={selected}
			aria-describedby={`${id}-${choice.value}`}
			{disabled}
			onclick={() => onDecision(selected ? 'withdraw' : (choice.value as Decision))}
		>
			<svg
				viewBox="0 0 24 24"
				class="size-5"
				fill={selected ? 'currentColor' : 'none'}
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<g transform={choice.value === 'incorrect' ? 'rotate(180 12 12)' : undefined}>
					<path d="M7 10h-3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3z" />
					<path
						d="M7 10l4-7a2 2 0 0 1 2.5 2.4L13 9h6.4a2.5 2.5 0 0 1 2.4 3.1l-1.8 7A2.5 2.5 0 0 1 17.6 21H7z"
					/>
				</g>
			</svg>
			<span
				id={`${id}-${choice.value}`}
				role="tooltip"
				class="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden w-max max-w-56 rounded bg-stone-900 px-2 py-1 text-left text-xs font-normal text-white shadow-lg group-hover:block group-focus:block dark:bg-stone-100 dark:text-stone-900"
				>{choice.text}</span
			>
		</button>
	{/each}
</div>

<style>
	.review-button.selected {
		color: var(--color-accent-700);
		border-color: var(--color-accent-600);
		background: color-mix(in oklab, var(--color-accent-600) 10%, transparent);
	}
</style>
