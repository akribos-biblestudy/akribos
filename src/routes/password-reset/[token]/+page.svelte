<script lang="ts">
	import { t } from '$lib/i18n';
	import AuthForm from '$lib/components/AuthForm.svelte';
	import TextField from '$lib/components/TextField.svelte';

	let { data, form } = $props();

	const message = $derived(
		form?.error === 'token'
			? t('auth.passwordReset.invalidToken')
			: form?.error === 'mismatch'
				? t('auth.register.passwordMismatch')
				: form?.error === 'weak'
					? t('auth.register.passwordTooShort', { min: data.minPasswordLength })
					: null
	);
</script>

<AuthForm title={t('auth.passwordReset.title')} error={message} submitLabel={t('action.save')}>
	<TextField
		name="password"
		type="password"
		label={t('auth.password')}
		autocomplete="new-password"
		minlength={data.minPasswordLength}
		required
	/>
	<TextField
		name="passwordRepeat"
		type="password"
		label={t('auth.passwordRepeat')}
		autocomplete="new-password"
		required
	/>
</AuthForm>
