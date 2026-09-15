<script lang="ts">
	import AuthForm from '$lib/components/AuthForm.svelte';
	import { t } from '$lib/i18n';
	let { data, form } = $props();
</script>

{#if !data.pending || form?.error}
	<main
		class="mx-auto my-8 w-[calc(100%-2rem)] max-w-sm space-y-4 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
	>
		<h1 class="font-serif text-2xl font-semibold">{t('auth.login.title')}</h1>
		<p role="alert">
			{form?.error === 'throttled' ? t('auth.login.throttled') : t('auth.login.codeInvalid')}
		</p>
		<a href="/login?restart=1" class="text-accent-600 underline dark:text-accent-400"
			>{t('auth.login.requestNew')}</a
		>
	</main>
{:else}
	<AuthForm title={t('auth.login.title')} submitLabel={t('auth.login.submit')}>
		<p class="text-sm text-stone-600 dark:text-stone-300">{t('auth.login.confirmLink')}</p>
		<p class="font-medium break-words">{data.pending.email}</p>
	</AuthForm>
{/if}
