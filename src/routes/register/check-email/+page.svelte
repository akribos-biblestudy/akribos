<script lang="ts">
	import { t } from '$lib/i18n';
</script>

<main
	class="mx-auto my-8 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-stone-200 bg-white px-6 py-7
			 text-center shadow-[0_12px_40px_rgb(28_25_23/0.08)] dark:border-stone-800 dark:bg-stone-900/70"
>
	<div
		class="mb-6 flex items-center justify-center gap-3 border-b border-stone-100 pb-4 dark:border-stone-800"
	>
		<img src="/icon.png" alt="" class="size-9 rounded-sm" />
		<h1 class="font-serif text-2xl font-semibold text-stone-800 dark:text-stone-100">
			{t('auth.register.checkEmailTitle')}
		</h1>
	</div>

	<p class="text-sm text-stone-600 dark:text-stone-300">{t('auth.register.checkEmailBody')}</p>

	<p class="mt-5 text-sm">
		<a class="text-accent-600 hover:underline dark:text-accent-400" href="/login">
			{t('auth.login.title')}
		</a>
	</p>
</main>
