<script lang="ts">
	import { t } from '$lib/i18n';
	import AuthForm from '$lib/components/AuthForm.svelte';
	import TextField from '$lib/components/TextField.svelte';

	let { data, form } = $props();

	const message = $derived(
		form?.error === 'taken'
			? t('auth.register.emailTaken')
			: form?.error === 'mismatch'
				? t('auth.register.passwordMismatch')
				: form?.error === 'weak'
					? t('auth.register.passwordTooShort', { min: data.minPasswordLength })
					: form?.error === 'email'
						? t('auth.email')
						: form?.error === 'throttled'
							? t('auth.register.throttled')
							: null
	);
</script>

<AuthForm title={t('auth.register.title')} error={message} submitLabel={t('auth.register.submit')}>
	<TextField
		name="email"
		type="email"
		label={t('auth.email')}
		value={form?.email ?? ''}
		autocomplete="email"
		required
	/>
	<TextField
		name="displayName"
		label={t('auth.displayName')}
		value={form?.displayName ?? ''}
		autocomplete="name"
	/>
	<TextField
		name="password"
		type="password"
		label={t('auth.password')}
		autocomplete="new-password"
		minlength={data.minPasswordLength}
		hint={t('auth.register.passwordTooShort', { min: data.minPasswordLength })}
		required
	/>
	<TextField
		name="passwordRepeat"
		type="password"
		label={t('auth.passwordRepeat')}
		autocomplete="new-password"
		required
	/>

	<!--
		Honeypot: a native input, not TextField, since a person must never be able to focus, read or
		fill it. A script that fills every field in the form (rather than the ones a person sees) trips
		it; the server then answers as if registration succeeded without creating an account.
	-->
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

	{#snippet footer()}
		<p>
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="/login">
				{t('auth.login.title')}
			</a>
		</p>
	{/snippet}
</AuthForm>
