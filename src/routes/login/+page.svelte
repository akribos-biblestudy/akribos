<script lang="ts">
	import { t } from '$lib/i18n';
	import AuthForm from '$lib/components/AuthForm.svelte';
	import TextField from '$lib/components/TextField.svelte';

	let { data, form } = $props();

	const errorMessage = $derived(
		form?.error === 'throttled'
			? t('auth.login.throttled')
			: form?.error === 'unverified'
				? t('auth.login.unverified')
				: form?.error
					? t('auth.login.failed')
					: null
	);
	const notice = $derived(!form?.error && form?.resent ? t('auth.register.resendSent') : null);
</script>

<AuthForm
	title={t('auth.login.title')}
	error={errorMessage}
	{notice}
	submitLabel={t('auth.login.submit')}
	action="?/login"
>
	<input type="hidden" name="redirectTo" value={data.redirectTo} />
	<TextField
		name="email"
		type="email"
		label={t('auth.email')}
		value={form?.email ?? ''}
		autocomplete="email"
		required
	/>
	<TextField
		name="password"
		type="password"
		label={t('auth.password')}
		autocomplete="current-password"
		required
	/>

	{#if form?.error === 'unverified'}
		<!-- formnovalidate: the resend action only needs the email above, not the (possibly empty
			 after the reload) password field, which `required` would otherwise block this on. -->
		<button
			type="submit"
			formaction="?/resend"
			formnovalidate
			class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm font-medium
			       hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
		>
			{t('auth.register.resendVerification')}
		</button>
	{/if}

	{#snippet footer()}
		<p>
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="/register"
				>{t('auth.register.title')}</a
			>
		</p>
		<p class="mt-1">
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="/password-reset">
				{t('auth.passwordReset.title')}
			</a>
		</p>
	{/snippet}
</AuthForm>
