<script lang="ts">
	import { t } from '$lib/i18n';
	import AuthForm from '$lib/components/AuthForm.svelte';
	import TextField from '$lib/components/TextField.svelte';

	let { form } = $props();
</script>

<AuthForm
	title={t('auth.passwordReset.title')}
	error={form?.error === 'throttled' ? t('auth.login.throttled') : null}
	notice={form?.sent ? t('auth.passwordReset.sent') : null}
	submitLabel={t('auth.passwordReset.submit')}
>
	<TextField name="email" type="email" label={t('auth.email')} autocomplete="email" required />

	{#snippet footer()}
		<p>
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="/login">
				{t('auth.login.title')}
			</a>
		</p>
	{/snippet}
</AuthForm>
