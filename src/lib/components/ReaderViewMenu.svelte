<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import ThemeToggle from './ThemeToggle.svelte';

	let {
		fontScale
	}: {
		fontScale: number;
	} = $props();
</script>

<div class="flex items-center gap-0.5" aria-label={t('reader.view')}>
	<div
		class="hidden items-center rounded-lg bg-stone-100/80 p-0.5 sm:flex dark:bg-white/6"
		aria-label={t('account.readerFontSize')}
	>
		<form method="POST" action="?/adjustFontSize" use:enhance>
			<input type="hidden" name="delta" value="-5" />
			<button
				type="submit"
				disabled={fontScale <= 85}
				aria-label={t('reader.fontSmaller')}
				class="text-size-button"
			>
				A−
			</button>
		</form>
		<form method="POST" action="?/adjustFontSize" use:enhance>
			<input type="hidden" name="delta" value="5" />
			<button
				type="submit"
				disabled={fontScale >= 140}
				aria-label={t('reader.fontLarger')}
				class="text-size-button"
			>
				A+
			</button>
		</form>
	</div>
	<ThemeToggle />
</div>

<style>
	.text-size-button {
		display: inline-flex;
		width: 2rem;
		height: 1.9rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.375rem;
		color: var(--color-stone-500);
		font-size: 0.76rem;
		font-weight: 700;
		transition:
			color 120ms ease,
			background 120ms ease;
	}

	.text-size-button:hover:not(:disabled) {
		background: var(--surface-raised);
		color: var(--color-stone-900);
	}

	.text-size-button:disabled {
		opacity: 0.35;
	}
	:global(.dark) .text-size-button {
		color: var(--color-stone-400);
	}
	:global(.dark) .text-size-button:hover:not(:disabled) {
		color: var(--color-stone-100);
	}
</style>
