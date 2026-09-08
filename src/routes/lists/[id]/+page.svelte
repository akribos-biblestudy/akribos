<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { formatReference, referencePath } from '$lib/bible/reference';
	import { t } from '$lib/i18n';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import CommentThread from '$lib/components/CommentThread.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import VerseText from '$lib/components/VerseText.svelte';

	let { data, form } = $props();

	const shareUrl = $derived(
		data.list.slug ? new URL(`/l/${data.list.slug}`, page.url.origin).toString() : null
	);

	let copied = $state(false);
	let inviteEmail = $state('');

	async function copyShareUrl(): Promise<void> {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// Nothing to do; the field next to the button is selectable.
		}
	}

	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

	const inviteErrorMessage = $derived(
		form?.inviteError === 'invalidEmail'
			? t('lists.inviteErrorInvalidEmail')
			: form?.inviteError === 'isOwner'
				? t('lists.inviteErrorIsOwner')
				: form?.inviteError === 'alreadyMember'
					? t('lists.inviteErrorAlreadyMember')
					: form?.inviteError === 'throttled'
						? t('lists.inviteErrorThrottled')
						: null
	);
</script>

<main class="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
	<nav class="text-sm">
		<Button href="/lists" size="sm" variant="secondary">
			<Icon name="chevron-left" class="size-4" />
			{t('lists.backToOverview')}
		</Button>
	</nav>

	<header class="space-y-3">
		{#if data.isOwner}
			<form method="POST" action="?/rename" class="flex gap-2">
				<label class="sr-only" for="list-title">{t('lists.rename')}</label>
				<input
					id="list-title"
					name="title"
					value={data.list.title}
					class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 text-2xl
					       font-semibold tracking-tight hover:border-stone-300 focus:border-accent-500
					       focus:outline-none dark:hover:border-stone-700"
				/>
				<Button>{t('action.save')}</Button>
			</form>
		{:else}
			<h1 class="px-1 text-2xl font-semibold tracking-tight">{data.list.title}</h1>
		{/if}

		<p class="px-1 text-sm text-stone-500 dark:text-stone-400">
			{data.items.length === 0
				? t('lists.countNone')
				: data.items.length === 1
					? t('lists.countOne')
					: t('lists.count', { count: data.items.length })}
		</p>
	</header>

	<Card title={t('lists.addVerse')} description={t('lists.addVerseHint')}>
		<form method="POST" action="?/addVerse" use:enhance class="flex gap-2">
			<label class="sr-only" for="add-verse">{t('lists.addVerse')}</label>
			<input
				id="add-verse"
				name="reference"
				placeholder="Joh 3,16"
				class="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm
				       focus:border-accent-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
			/>
			<Button variant="primary">{t('lists.addVerse')}</Button>
		</form>
	</Card>

	{#if data.items.length === 0}
		<p class="rounded-xl bg-stone-50 p-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
			{t('lists.empty')}
		</p>
	{:else}
		<ol class="space-y-4">
			{#each data.items as item (item.id)}
				<li
					id="note-{item.id}"
					data-bible-id={data.primaryBibleId ?? undefined}
					class="rounded-xl border border-stone-200 p-4 dark:border-stone-800"
				>
					<div class="mb-2 flex items-baseline justify-between gap-3">
						<a
							class="text-sm font-semibold text-accent-600 hover:underline dark:text-accent-400"
							href={referencePath({ book: item.book, chapter: item.chapter, verse: item.verse })}
							title={t('lists.readInContext')}
						>
							{formatReference(
								{ book: item.book, chapter: item.chapter, verse: item.verse },
								{ style: 'full' }
							)}
						</a>
						{#if item.canDelete}
							<form method="POST" action="?/removeVerse" use:enhance>
								<input
									type="hidden"
									name="reference"
									value={formatReference({
										book: item.book,
										chapter: item.chapter,
										verse: item.verse
									})}
								/>
								<Button variant="ghost" size="sm" ariaLabel={t('lists.removeVerse')}>
									<Icon name="x" class="size-4" />
								</Button>
							</form>
						{/if}
					</div>

					{#if item.segments}
						<p
							class="scripture-sized mb-1 font-serif leading-relaxed"
							data-reference={formatReference(item)}
						>
							<VerseText segments={item.segments} />
						</p>
					{/if}

					{#if data.members.length > 0 && item.addedByUserId !== data.currentUserId}
						<p class="mb-2 text-xs text-stone-400 dark:text-stone-500">
							{t('lists.addedBy', { name: item.addedByName })}
						</p>
					{/if}

					<CommentThread
						itemId={item.id}
						comments={data.comments[item.id] ?? []}
						currentUserId={data.currentUserId}
						isOwner={data.isOwner}
					/>
				</li>
			{/each}
		</ol>
	{/if}

	<Card title={t('lists.members')} description={data.isOwner ? t('lists.membersHint') : undefined}>
		{#if !data.isOwner && data.list.ownerName}
			<p class="mb-3 text-sm text-stone-600 dark:text-stone-300">
				{t('lists.sharedByOwner', { owner: data.list.ownerName })}
			</p>
		{/if}
		<ul class="mb-4 space-y-2">
			{#each data.members as member (member.kind + member.id)}
				<li class="flex items-center justify-between gap-3 text-sm">
					<span>
						{#if member.kind === 'accepted'}
							{member.name}
							<span class="ml-1 text-xs text-stone-500 dark:text-stone-400">
								({t('lists.memberJoinedAt', {
									date: dateFormat.format(new Date(member.joinedAt))
								})})
							</span>
						{:else}
							{member.email}
							<span class="ml-1 text-xs text-stone-500 dark:text-stone-400">
								({t('lists.memberPending')} · {t('lists.memberInvitedAt', {
									date: dateFormat.format(new Date(member.invitedAt))
								})})
							</span>
						{/if}
					</span>
					{#if data.isOwner}
						<form
							method="POST"
							action={member.kind === 'accepted' ? '?/removeMember' : '?/revokeInvite'}
							use:enhance
						>
							<input
								type="hidden"
								name={member.kind === 'accepted' ? 'memberId' : 'inviteId'}
								value={member.id}
							/>
							<Button variant="ghost" size="sm">
								{member.kind === 'accepted' ? t('lists.memberRemove') : t('lists.memberRevoke')}
							</Button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>

		{#if data.isOwner}
			<form method="POST" action="?/inviteMember" use:enhance class="flex gap-2">
				<label class="sr-only" for="invite-email">{t('lists.inviteEmailLabel')}</label>
				<input
					id="invite-email"
					name="email"
					type="email"
					required
					bind:value={inviteEmail}
					placeholder={t('lists.inviteEmailPlaceholder')}
					class="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm
					       focus:border-accent-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
				/>
				<Button variant="primary">{t('lists.inviteSubmit')}</Button>
			</form>
			{#if form?.invited}
				<p class="mt-2 text-sm text-accent-700 dark:text-accent-400">{t('lists.inviteSent')}</p>
			{/if}
			{#if inviteErrorMessage}
				<p class="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
					{inviteErrorMessage}
				</p>
			{/if}
		{:else}
			<details>
				<summary class="cursor-pointer text-sm text-red-700 dark:text-red-300">
					{t('lists.leaveList')}
				</summary>
				<div class="mt-2 flex items-center justify-end gap-3">
					<p class="text-sm text-stone-600 dark:text-stone-300">{t('lists.leaveListConfirm')}</p>
					<form method="POST" action="?/leaveList">
						<Button variant="danger">{t('lists.leaveList')}</Button>
					</form>
				</div>
			</details>
		{/if}
	</Card>

	{#if data.isOwner}
		<Card
			title={t('lists.share')}
			description={data.list.isPublic ? undefined : t('lists.shareOff')}
		>
			<div class="flex flex-wrap items-center gap-2">
				<form method="POST" action="?/share" use:enhance>
					<input type="hidden" name="isPublic" value={data.list.isPublic ? 'false' : 'true'} />
					<Button variant={data.list.isPublic ? 'secondary' : 'primary'}>
						{data.list.isPublic ? t('lists.shareOff') : t('lists.share')}
					</Button>
				</form>

				{#if shareUrl}
					<input
						readonly
						value={shareUrl}
						aria-label={t('lists.shareOn')}
						onclick={(event) => event.currentTarget.select()}
						class="min-w-0 flex-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs
						       dark:border-stone-800 dark:bg-stone-900"
					/>
					<Button variant="secondary" type="button" onclick={copyShareUrl}>
						{copied ? t('action.copied') : t('action.copy')}
					</Button>
				{/if}
			</div>

			{#if data.list.isPublic}
				<p class="mt-2 text-xs text-stone-500 dark:text-stone-400">{t('lists.shareOn')}</p>
			{/if}
		</Card>

		<!-- Two steps rather than a `confirm()` dialog: deleting a list takes its notes with it, and a
		     native dialog blocks the page for everything else on it. `<details>` keeps both steps working
		     without scripting. -->
		<details class="text-right">
			<summary
				class="inline-block cursor-pointer rounded-lg border border-red-300 bg-[color:var(--surface-raised)]
				       px-3 py-1.5 text-sm font-semibold text-red-700 shadow-sm transition-colors
				       hover:border-red-400 hover:bg-red-50 dark:border-red-900 dark:text-red-300
				       dark:hover:bg-red-950/60"
			>
				{t('lists.delete')}
			</summary>
			<div class="mt-2 flex items-center justify-end gap-3">
				<p class="text-sm text-stone-600 dark:text-stone-300">{t('lists.deleteConfirm')}</p>
				<form method="POST" action="?/delete">
					<Button variant="danger">{t('action.delete')}</Button>
				</form>
			</div>
		</details>
	{/if}
</main>
