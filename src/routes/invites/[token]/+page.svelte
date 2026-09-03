<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n';

	let { data, form } = $props();

	const redirectTo = $derived(encodeURIComponent(page.url.pathname));
</script>

<main
	class="mx-auto my-8 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-stone-200 bg-white px-6 py-7
			 shadow-[0_12px_40px_rgb(28_25_23/0.08)] dark:border-stone-800 dark:bg-stone-900/70"
>
	<div class="mb-6 flex items-center gap-3 border-b border-stone-100 pb-4 dark:border-stone-800">
		<img src="/icon.png" alt="" class="size-9 rounded-sm" />
		<h1 class="font-serif text-2xl font-semibold text-stone-800 dark:text-stone-100">
			{t('invites.title')}
		</h1>
	</div>

	{#if !data.invite || form?.error === 'invalid'}
		<p
			class="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800
			       dark:border-red-900 dark:bg-red-950 dark:text-red-200"
			role="alert"
		>
			{t('invites.invalid')}
		</p>
		<p class="text-sm">
			<a class="text-accent-600 hover:underline dark:text-accent-400" href="/account">
				{t('lists.backToOverview')}
			</a>
		</p>
	{:else if data.emailMismatch || form?.error === 'emailMismatch'}
		<p
			class="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800
			       dark:border-red-900 dark:bg-red-950 dark:text-red-200"
			role="alert"
		>
			{t('invites.emailMismatch', { email: data.invite.email })}
		</p>
		<p class="mb-3 text-xs text-stone-500 dark:text-stone-400">
			{t('invites.reopenAfterSignIn')}
		</p>
		<form method="POST" action="/logout">
			<button
				type="submit"
				class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm font-medium
				       hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
			>
				{t('invites.signInWithThatAccount')}
			</button>
		</form>
	{:else if !data.user}
		<p class="text-sm text-stone-600 dark:text-stone-300">
			{t('invites.body', { inviter: data.invite.invitedByName, list: data.invite.listTitle })}
		</p>
		<div class="mt-4 flex flex-col gap-2">
			<a
				href="/login?redirectTo={redirectTo}"
				class="w-full rounded-md bg-accent-600 px-3 py-2 text-center text-sm font-medium text-white
				       hover:bg-accent-700"
			>
				{t('invites.loginCta')}
			</a>
			<p class="text-center text-xs text-stone-500 dark:text-stone-400">
				{t('invites.needAccount')}
				<a class="text-accent-600 hover:underline dark:text-accent-400" href="/register">
					{t('invites.registerCta')}
				</a>
				{t('invites.reopenAfterSignIn')}
			</p>
		</div>
	{:else}
		<p class="text-sm text-stone-600 dark:text-stone-300">
			{t('invites.body', { inviter: data.invite.invitedByName, list: data.invite.listTitle })}
		</p>
		<form method="POST" class="mt-4">
			<button
				type="submit"
				class="w-full rounded-md bg-accent-600 px-3 py-2 text-sm font-medium text-white
				       hover:bg-accent-700 focus-visible:outline-2"
			>
				{t('invites.accept')}
			</button>
		</form>
	{/if}
</main>
