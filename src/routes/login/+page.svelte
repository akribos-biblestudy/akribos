<script lang="ts">
	import { t } from '$lib/i18n';
	import AuthForm from '$lib/components/AuthForm.svelte';
	import TextField from '$lib/components/TextField.svelte';

	let { data, form } = $props();
	const step = $derived(form?.step ?? (data.pending ? 'code' : 'email'));
	const email = $derived(form?.email ?? data.pending?.email ?? '');
	const redirectTo = $derived(form?.redirectTo ?? data.redirectTo);
	const errorMessage = $derived(
		form?.error === 'throttled'
			? t('auth.login.throttled')
			: form?.error === 'unverified'
				? t('auth.login.unverified')
				: form?.error === 'email'
					? t('auth.login.emailInvalid')
					: form?.error === 'code'
						? t('auth.login.codeInvalid')
						: form?.error === 'mail'
							? t('auth.login.mailFailed')
							: form?.error === 'unavailable'
								? t('auth.login.unavailable')
								: form?.error
									? t('auth.login.failed')
									: null
	);
</script>

<AuthForm
	title={step === 'code' ? t('auth.login.codeTitle') : t('auth.login.title')}
	error={errorMessage}
	notice={form?.resent ? t('auth.register.resendSent') : null}
	submitLabel={step === 'email' ? t('auth.login.continue') : t('auth.login.submit')}
	action={step === 'email' ? '?/start' : step === 'code' ? '?/code' : '?/login'}
>
	<input type="hidden" name="redirectTo" value={redirectTo} />
	{#if step === 'email'}
		<p class="text-sm text-stone-600 dark:text-stone-300">{t('auth.login.emailIntro')}</p>
		<TextField
			name="email"
			type="email"
			label={t('auth.email')}
			value={email}
			autocomplete="email"
			maxlength={254}
			required
		/>
		<div class="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
			<label for="company">Firma</label>
			<input
				type="text"
				id="company"
				name="company"
				tabindex="-1"
				autocomplete="off"
				style="opacity: 0; pointer-events: none;"
			/>
		</div>
	{:else}
		<TextField
			name="email"
			type="email"
			label={t('auth.email')}
			value={email}
			autocomplete="username"
			readonly
		/>
		{#if step === 'password'}
			<TextField
				name="password"
				type="password"
				label={t('auth.password')}
				autocomplete="current-password"
				required
			/>
			{#if form?.error === 'unverified'}
				<button
					type="submit"
					formaction="?/resend"
					formnovalidate
					class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm dark:border-stone-700"
					>{t('auth.register.resendVerification')}</button
				>
			{/if}
		{:else}
			<p class="text-sm text-stone-600 dark:text-stone-300">{t('auth.login.codeSent')}</p>
			<TextField
				name="code"
				label={t('auth.login.codeLabel')}
				autocomplete="one-time-code"
				inputmode="numeric"
				maxlength={11}
				pattern={'[0-9\\s]{6,11}'}
				hint={t('auth.login.codeHint')}
				required
			/>
		{/if}
	{/if}

	{#snippet footer()}
		{#if step !== 'email'}
			<a
				class="text-accent-600 hover:underline dark:text-accent-400"
				href="/login?restart=1&redirectTo={encodeURIComponent(redirectTo)}"
				>{t('auth.login.changeEmail')}</a
			>
		{/if}
		{#if step === 'password'}
			<p class="mt-2">
				<a class="text-accent-600 hover:underline dark:text-accent-400" href="/password-reset"
					>{t('auth.passwordReset.title')}</a
				>
			</p>
		{:else if step === 'code'}
			<form method="POST" action="?/start" class="mt-3">
				<input type="hidden" name="email" value={email} />
				<input type="hidden" name="redirectTo" value={redirectTo} />
				<button type="submit" class="text-accent-600 hover:underline dark:text-accent-400"
					>{t('auth.login.resend')}</button
				>
			</form>
		{/if}
	{/snippet}
</AuthForm>
