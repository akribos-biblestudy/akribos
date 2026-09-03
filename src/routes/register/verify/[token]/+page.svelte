<script lang="ts">
	import { t } from '$lib/i18n';

	let { data, form } = $props();

	const invalid = $derived(form?.error === 'token' || !data.valid);
</script>

<main
	class="mx-auto my-8 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-stone-200 bg-white px-6 py-7
			 shadow-[0_12px_40px_rgb(28_25_23/0.08)] dark:border-stone-800 dark:bg-stone-900/70"
>
	<div class="mb-6 flex items-center gap-3 border-b border-stone-100 pb-4 dark:border-stone-800">
		<img src="/icon.png" alt="" class="size-9 rounded-sm" />
		<h1 class="font-serif text-2xl font-semibold text-stone-800 dark:text-stone-100">
			{t('auth.register.verifyTitle')}
		</h1>
	</div>

	{#if invalid}
		<p
			class="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800
			       dark:border-red-900 dark:bg-red-950 dark:text-red-200"
			role="alert"
		>
			{t('auth.register.verifyInvalid')}
		</p>
		<p class="text-sm">
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="/register">
				{t('auth.register.title')}
			</a>
		</p>
	{:else}
		<p class="text-sm text-stone-600 dark:text-stone-300">{t('auth.register.verifyBody')}</p>
		<form method="POST" class="mt-4">
			<button
				type="submit"
				class="w-full rounded-md bg-accent-600 px-3 py-2 text-sm font-medium text-white
				       hover:bg-accent-700 focus-visible:outline-2"
			>
				{t('auth.register.verifySubmit')}
			</button>
		</form>
	{/if}
</main>
