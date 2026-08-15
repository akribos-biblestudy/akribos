<script lang="ts">
	import { page } from '$app/state';
	import { formatReference, referencePath } from '$lib/bible/reference';
	import { t } from '$lib/i18n';
	import { SvelteSet } from 'svelte/reactivity';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import CommentBubble from '$lib/components/CommentBubble.svelte';
	import CommentToggle from '$lib/components/CommentToggle.svelte';
	import VerseText from '$lib/components/VerseText.svelte';

	let { data } = $props();

	const shareUrl = $derived(
		data.list.slug ? new URL(`/l/${data.list.slug}`, page.url.origin).toString() : null
	);

	let copied = $state(false);
	const expandedComments = new SvelteSet<string>();
	const draftComments = new SvelteSet<string>();

	function commentVisible(item: (typeof data.items)[number]): boolean {
		return draftComments.has(item.id) || Boolean(item.noteHtml && expandedComments.has(item.id));
	}

	function toggleComment(item: (typeof data.items)[number]) {
		if (expandedComments.has(item.id)) {
			expandedComments.delete(item.id);
			draftComments.delete(item.id);
		} else {
			expandedComments.add(item.id);
		}
	}

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
</script>

<svelte:head><title>{data.list.title} — Akribos</title></svelte:head>

<main class="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
	<nav class="text-sm">
		<Button href="/account?tab=lists" size="sm" variant="secondary">
			← {t('lists.backToOverview')}
		</Button>
	</nav>

	<header class="space-y-3">
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

		<p class="px-1 text-sm text-stone-500 dark:text-stone-400">
			{data.items.length === 0
				? t('lists.countNone')
				: data.items.length === 1
					? t('lists.countOne')
					: t('lists.count', { count: data.items.length })}
		</p>
	</header>

	<Card title={t('lists.addVerse')} description={t('lists.addVerseHint')}>
		<form method="POST" action="?/addVerse" class="flex gap-2">
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
				{@const visibleComment = commentVisible(item)}
				<li
					id="note-{item.id}"
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
						<form method="POST" action="?/removeVerse">
							<input
								type="hidden"
								name="reference"
								value={formatReference({
									book: item.book,
									chapter: item.chapter,
									verse: item.verse
								})}
							/>
							<Button variant="ghost" size="sm" ariaLabel={t('lists.removeVerse')}>×</Button>
						</form>
					</div>

					{#if item.segments}
						<p class="scripture-sized mb-3 font-serif leading-relaxed">
							<VerseText segments={item.segments} />{#if item.noteHtml}<CommentToggle
									hasComment
									active={visibleComment}
									onclick={() => toggleComment(item)}
								/>{/if}
						</p>
					{/if}
					{#if !item.noteHtml && !visibleComment}
						<button
							type="button"
							class="mb-1 text-xs text-stone-500 hover:text-accent-700 dark:hover:text-accent-300"
							onclick={() => draftComments.add(item.id)}
						>
							{t('comments.add')}
						</button>
					{/if}

					{#if visibleComment}
						<CommentBubble
							itemId={item.id}
							html={item.noteHtml}
							startEditing={draftComments.has(item.id)}
							onSaved={(html) => {
								item.noteHtml = html || null;
								draftComments.delete(item.id);
								expandedComments.add(item.id);
							}}
							onClose={() => draftComments.delete(item.id)}
						/>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}

	<Card title={t('lists.share')} description={data.list.isPublic ? undefined : t('lists.shareOff')}>
		<div class="flex flex-wrap items-center gap-2">
			<form method="POST" action="?/share">
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
</main>
