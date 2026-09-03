<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n';

	/**
	 * Error page.
	 *
	 * A missing Strong's number carries a suggestion for the other dictionary, which is what the old
	 * error page did: ask for H430 and get pointed at G430.
	 */
	const alternative = $derived(page.error?.alternative);
	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="mx-auto w-full max-w-lg px-4 py-16 text-center">
	<p class="text-5xl font-semibold text-stone-300 dark:text-stone-700">{page.status}</p>

	<h1 class="mt-3 text-xl font-semibold">
		{notFound ? t('error.notFound.title') : t('error.server.title')}
	</h1>

	<p class="mt-2 text-stone-600 dark:text-stone-300">
		{page.error?.message || (notFound ? t('error.notFound.body') : t('error.server.body'))}
	</p>

	{#if alternative}
		<p class="mt-4">
			<a
				class="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
				href="/{alternative}"
			>
				{t('strong.tryOther', { id: alternative })}
			</a>
		</p>
	{/if}

	<p class="mt-6 flex justify-center gap-4 text-sm">
		<a class="text-accent-600 hover:underline dark:text-accent-400" href="/">{t('nav.home')}</a>
		<a class="text-accent-600 hover:underline dark:text-accent-400" href="/help">{t('nav.help')}</a>
	</p>
</main>
