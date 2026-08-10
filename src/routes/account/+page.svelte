<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { formatReference, referencePath } from '$lib/bible/reference';
	import { t } from '$lib/i18n';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { data, form } = $props();

	const passwordMessage = $derived(
		form?.passwordError === 'current'
			? t('auth.login.failed')
			: form?.passwordError === 'mismatch'
				? t('auth.register.passwordMismatch')
				: form?.passwordError === 'weak'
					? t('auth.register.passwordTooShort', { min: data.minPasswordLength })
					: null
	);

	function verseCount(count: number): string {
		if (count === 0) return t('lists.countNone');
		if (count === 1) return t('lists.countOne');
		return t('lists.count', { count });
	}

	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

	let copiedKey = $state(false);

	async function copyKey(key: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(key);
			copiedKey = true;
		} catch {
			// A denied clipboard permission just leaves the key to be selected and copied by hand.
		}
	}

	let newColor = $state('#FFF1C6');

	type Section = 'lists' | 'profileSecurity' | 'appearance';

	function isSection(value: string): value is Section {
		return value === 'lists' || value === 'profileSecurity' || value === 'appearance';
	}

	/**
	 * Which settings section is showing. Pure client-side state — every section already lives on this
	 * one page, so switching between them does not need a round trip, only a different section visible.
	 * A link here can still point straight at a section (e.g. the verse list detail page's "back" link
	 * uses `/account#lists`) by naming it in the hash.
	 */
	const initialHash = page.url.hash.slice(1);
	let activeSection = $state<Section>(isSection(initialHash) ? initialHash : 'profileSecurity');

	const sections = [
		{ id: 'profileSecurity' as const, label: t('account.nav.profileSecurity') },
		{ id: 'lists' as const, label: t('lists.title') },
		{ id: 'appearance' as const, label: t('account.appearance') }
	];
</script>

<svelte:head><title>{t('account.title')} — Akribos</title></svelte:head>

<main class="mx-auto w-full max-w-5xl space-y-5 px-4 py-8">
	<header>
		<h1 class="text-2xl font-semibold tracking-tight">{t('account.title')}</h1>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
			{data.user?.displayName ?? data.user?.email}
		</p>
	</header>

	<div class="flex flex-col gap-5 sm:flex-row sm:items-start">
		<nav class="flex shrink-0 gap-1 overflow-x-auto sm:w-56 sm:flex-col sm:overflow-visible">
			{#each sections as section (section.id)}
				<button
					type="button"
					class="settings-nav-item"
					class:active={activeSection === section.id}
					onclick={() => (activeSection = section.id)}
				>
					{section.label}
				</button>
			{/each}
		</nav>

		<div class="min-w-0 flex-1 space-y-5">
			{#if activeSection === 'lists'}
				<Card title={t('lists.title')} description={t('lists.subtitle')}>
					<form method="POST" action="?/createList" class="mb-5 flex gap-2">
						<label class="sr-only" for="new-list-title">{t('lists.titleLabel')}</label>
						<input
							id="new-list-title"
							name="title"
							placeholder={t('lists.defaultTitle')}
							class="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm
							       focus:border-accent-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
						/>
						<Button variant="primary">{t('lists.new')}</Button>
					</form>

					{#if data.lists.length === 0}
						<div
							class="rounded-xl border border-dashed border-stone-300 px-6 py-10 text-center dark:border-stone-700"
						>
							<p class="font-medium">{t('lists.overviewEmpty')}</p>
							<p class="mx-auto mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">
								{t('lists.overviewEmptyHint')}
							</p>
						</div>
					{:else}
						<ul class="grid gap-3 sm:grid-cols-2">
							{#each data.lists as list (list.id)}
								<li
									class="rounded-xl border border-stone-200 transition-colors hover:border-stone-300
									       dark:border-stone-800 dark:hover:border-stone-700"
								>
									<!-- The whole card is the link; there is nothing else to do with a list from here. -->
									<a href="/lists/{list.id}" class="block px-4 py-3">
										<span class="flex items-baseline justify-between gap-2">
											<span class="truncate font-medium">{list.title}</span>
											{#if list.isPublic}
												<span
													class="shrink-0 rounded-full bg-accent-50 px-2 py-0.5 text-xs text-accent-700
													       dark:bg-accent-900/40 dark:text-accent-300"
												>
													{t('lists.isPublic')}
												</span>
											{/if}
										</span>
										<span class="mt-1 block text-xs text-stone-500 dark:text-stone-400">
											{verseCount(list.itemCount)}
											<span aria-hidden="true"> · </span>
											{t('lists.updated', { date: dateFormat.format(new Date(list.updatedAt)) })}
										</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</Card>

				<Card title={t('lists.notesTitle')}>
					{#if data.notes.length === 0}
						<p class="text-sm text-stone-500 dark:text-stone-400">{t('lists.notesEmpty')}</p>
					{:else}
						<ul class="grid gap-3 sm:grid-cols-2">
							{#each data.notes as note (note.kind + note.id)}
								<li
									class="rounded-xl border border-stone-200 bg-white/50 p-4 dark:border-stone-800
									       dark:bg-stone-900/40"
								>
									<div class="flex items-start justify-between gap-3">
										<div>
											<a
												class="font-semibold text-accent-600 hover:underline dark:text-accent-400"
												href={note.kind === 'translation'
													? referencePath({
															book: note.book,
															chapter: note.chapter,
															verse: note.verse
														})
													: `/lists/${note.listId}#note-${note.id}`}
											>
												{formatReference({
													book: note.book,
													chapter: note.chapter,
													verse: note.verse
												})}
											</a>
											<p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
												{note.kind === 'translation'
													? t('comments.translation', { translation: note.resourceName ?? '' })
													: t('lists.verseNote', { list: note.listTitle ?? '' })}
											</p>
										</div>
										<time
											class="shrink-0 text-xs text-stone-400"
											datetime={new Date(note.updatedAt).toISOString()}
										>
											{dateFormat.format(new Date(note.updatedAt))}
										</time>
									</div>
									<!-- Both comment types are sanitised when saved. -->
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									<div class="note-preview mt-3 text-sm leading-relaxed">{@html note.html}</div>
								</li>
							{/each}
						</ul>
					{/if}
				</Card>
			{:else if activeSection === 'profileSecurity'}
				<Card title={t('account.profile')} description={t('account.profileHint')}>
					<form method="POST" action="?/profile" use:enhance class="max-w-sm space-y-3">
						<TextField
							name="displayName"
							label={t('auth.displayName')}
							value={data.user?.displayName ?? ''}
							autocomplete="name"
						/>
						<TextField
							name="email"
							label={t('auth.email')}
							value={data.user?.email ?? ''}
							hint={t('account.emailHint')}
							readonly
						/>
						<div class="flex items-center gap-3">
							<Button>{t('action.save')}</Button>
							{#if form?.saved}
								<span class="text-sm text-stone-500 dark:text-stone-400">{t('account.saved')}</span>
							{/if}
						</div>
					</form>
				</Card>

				<Card title={t('account.security')} description={t('account.securityHint')}>
					{#if form?.passwordSaved}
						<p class="mb-3 text-sm text-stone-600 dark:text-stone-300">{t('account.saved')}</p>
					{/if}
					<form method="POST" action="?/password" use:enhance class="max-w-sm space-y-3">
						<TextField
							name="currentPassword"
							type="password"
							label={t('auth.passwordCurrent')}
							autocomplete="current-password"
							error={form?.passwordError === 'current' ? (passwordMessage ?? undefined) : undefined}
							required
						/>
						<TextField
							name="password"
							type="password"
							label={t('auth.passwordNew')}
							autocomplete="new-password"
							minlength={data.minPasswordLength}
							error={form?.passwordError === 'weak' ? (passwordMessage ?? undefined) : undefined}
							required
						/>
						<TextField
							name="passwordRepeat"
							type="password"
							label={t('auth.passwordRepeat')}
							autocomplete="new-password"
							error={form?.passwordError === 'mismatch'
								? (passwordMessage ?? undefined)
								: undefined}
							required
						/>
						<Button>{t('action.save')}</Button>
					</form>
				</Card>

				<Card title={t('account.apiKeys')} description={t('account.apiKeysHint')}>
					{#snippet actions()}
						<Button href="/api" variant="secondary">{t('apiKeys.docs')}</Button>
					{/snippet}
					{#if form?.createdApiKey}
						<div
							class="dark:bg-accent-950/30 mb-4 rounded-md border border-accent-300 bg-accent-50 px-3
							       py-2.5 dark:border-accent-800"
						>
							<p class="text-sm font-medium text-accent-900 dark:text-accent-100">
								{t('apiKeys.createdTitle')}
							</p>
							<p class="mt-1 text-xs text-accent-800 dark:text-accent-200">
								{t('apiKeys.createdHint')}
							</p>
							<div class="mt-2 flex items-center gap-2">
								<code
									class="min-w-0 flex-1 truncate rounded border border-accent-300 bg-white px-2 py-1.5
									       font-mono text-xs dark:border-accent-800 dark:bg-stone-950"
								>
									{form.createdApiKey.key}
								</code>
								<Button
									size="sm"
									variant="secondary"
									onclick={() => copyKey(form?.createdApiKey?.key ?? '')}
								>
									{copiedKey ? t('action.copied') : t('action.copy')}
								</Button>
							</div>
						</div>
					{/if}

					{#if form?.apiKeyError === 'name'}
						<p class="mb-3 text-sm text-red-700 dark:text-red-300">{t('apiKeys.errorName')}</p>
					{:else if form?.apiKeyError === 'limit'}
						<p class="mb-3 text-sm text-red-700 dark:text-red-300">
							{t('apiKeys.errorLimit', { max: data.maxApiKeys })}
						</p>
					{/if}

					<form method="POST" action="?/createApiKey" use:enhance class="max-w-sm space-y-3">
						<TextField name="name" label={t('apiKeys.name')} required />

						<fieldset>
							<legend class="mb-1 text-sm font-medium">{t('apiKeys.scope')}</legend>
							<div class="space-y-2 text-sm">
								<label class="flex items-start gap-2">
									<input type="radio" name="scope" value="public" checked class="mt-0.5" />
									<span>
										<span class="block font-medium">{t('apiKeys.scope.public')}</span>
										<span class="block text-xs text-stone-500 dark:text-stone-400"
											>{t('apiKeys.scope.publicHint')}</span
										>
									</span>
								</label>
								<label class="flex items-start gap-2">
									<input type="radio" name="scope" value="personal" class="mt-0.5" />
									<span>
										<span class="block font-medium">{t('apiKeys.scope.personal')}</span>
										<span class="block text-xs text-stone-500 dark:text-stone-400"
											>{t('apiKeys.scope.personalHint')}</span
										>
									</span>
								</label>
							</div>
						</fieldset>

						<Button>{t('apiKeys.create')}</Button>
					</form>

					<div class="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
						{#if data.apiKeys.length === 0}
							<p class="text-sm text-stone-500 dark:text-stone-400">{t('apiKeys.empty')}</p>
						{:else}
							<ul class="space-y-3">
								{#each data.apiKeys as key (key.id)}
									<li
										class="flex items-start justify-between gap-3 rounded-md border border-stone-200 px-3
										       py-2.5 dark:border-stone-800"
									>
										<div class="min-w-0">
											<p class="truncate text-sm font-medium">{key.name}</p>
											<p class="mt-0.5 font-mono text-xs text-stone-500 dark:text-stone-400">
												{key.prefix}…
											</p>
											<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
												{key.scope === 'personal'
													? t('apiKeys.scope.personal')
													: t('apiKeys.scope.public')}
												· {t('apiKeys.createdAt', { date: dateFormat.format(key.createdAt) })}
											</p>
											<p class="text-xs text-stone-500 dark:text-stone-400">
												{#if key.revokedAt}
													{t('apiKeys.revoked', { date: dateFormat.format(key.revokedAt) })}
												{:else if key.lastUsedAt}
													{t('apiKeys.lastUsedAt', { date: dateFormat.format(key.lastUsedAt) })}
												{:else}
													{t('apiKeys.lastUsedNever')}
												{/if}
											</p>
										</div>
										{#if !key.revokedAt}
											<form method="POST" action="?/revokeApiKey" use:enhance>
												<input type="hidden" name="id" value={key.id} />
												<Button variant="danger" size="sm">{t('apiKeys.revoke')}</Button>
											</form>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</Card>
			{:else}
				<Card title={t('account.appearance')} description={t('account.appearanceHint')}>
					<!-- The toggle is icon-only in the header, where the context is obvious; here it needs saying. -->
					<div class="flex items-center gap-2">
						<ThemeToggle />
						<span class="text-sm text-stone-600 dark:text-stone-300">{t('account.theme')}</span>
					</div>

					<div class="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
						<div class="flex items-baseline justify-between gap-3">
							<p class="text-sm font-medium">{t('account.readerFontSize')}</p>
							<span class="text-sm text-stone-500 tabular-nums dark:text-stone-400">
								{data.readerFontScale} %
							</span>
						</div>
						<div class="mt-2 flex items-center gap-2">
							<form method="POST" action="?/reader" use:enhance>
								<input type="hidden" name="fontScale" value={data.readerFontScale - 5} />
								<Button
									type="submit"
									disabled={data.readerFontScale <= 85}
									ariaLabel={t('reader.fontSmaller')}>A−</Button
								>
							</form>
							<form method="POST" action="?/reader" use:enhance>
								<input type="hidden" name="fontScale" value={data.readerFontScale + 5} />
								<Button
									type="submit"
									disabled={data.readerFontScale >= 140}
									ariaLabel={t('reader.fontLarger')}>A+</Button
								>
							</form>
							{#if form?.readerSaved}
								<span class="text-sm text-stone-500 dark:text-stone-400">{t('account.saved')}</span>
							{/if}
						</div>
						<p
							class="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 font-serif
							       leading-relaxed dark:border-stone-800 dark:bg-stone-950"
							style="font-size: calc(1rem * {data.readerFontScale / 100})"
						>
							{t('account.readerFontPreview')}
						</p>
					</div>

					<div class="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
						<p class="text-sm font-medium">{t('account.readerTranslations')}</p>
						<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
							{t('account.readerTranslationsHint')}
						</p>
						<ul class="mt-2 flex flex-wrap gap-1.5">
							{#each data.columns as columnId (columnId)}
								{@const resource = data.readerResources.find((item) => item.id === columnId)}
								{#if resource}
									<li
										class="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs
										       dark:border-stone-700 dark:bg-stone-800"
									>
										{resource.tabTitle}
									</li>
								{/if}
							{/each}
						</ul>
					</div>
				</Card>

				<Card title={t('account.highlights')} description={t('account.highlightsHint')}>
					{#if form?.highlightStyleError === 'color'}
						<p class="mb-3 text-sm text-red-700 dark:text-red-300">{t('highlights.errorColor')}</p>
					{:else if form?.highlightStyleError === 'limit'}
						<p class="mb-3 text-sm text-red-700 dark:text-red-300">
							{t('highlights.errorLimit', { max: data.maxHighlightStyles })}
						</p>
					{/if}

					<ul class="space-y-2">
						{#each data.highlightStyles as style (style.id)}
							<li class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
								<span
									class="size-6 shrink-0 rounded-full border border-stone-300 dark:border-stone-600"
									style="background-color: {style.color}"
									data-color={style.color.toLowerCase()}
									aria-hidden="true"
								></span>
								<form
									method="POST"
									action="?/renameHighlightStyle"
									use:enhance
									class="flex min-w-0 flex-1 gap-2"
								>
									<input type="hidden" name="id" value={style.id} />
									<input
										type="text"
										name="name"
										value={style.name ?? ''}
										placeholder={t('highlights.namePlaceholder')}
										maxlength={60}
										class="w-full min-w-0 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm
										       shadow-inner shadow-stone-900/3 focus:border-accent-500 focus:ring-3
										       focus:ring-accent-500/10 focus:outline-none dark:border-stone-700
										       dark:bg-stone-900"
									/>
									<Button type="submit" size="sm" variant="secondary">{t('action.save')}</Button>
								</form>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									href="/account/highlights/{style.id}"
								>
									{t('highlights.showVerses')}
								</Button>
							</li>
						{/each}
					</ul>

					{#if data.highlightStyles.length < data.maxHighlightStyles}
						<form
							method="POST"
							action="?/addHighlightStyle"
							use:enhance
							class="mt-4 flex items-center gap-2 border-t border-stone-200 pt-4 dark:border-stone-800"
						>
							<input
								type="color"
								name="color"
								bind:value={newColor}
								aria-label={t('highlights.addColor')}
								class="size-8 shrink-0 rounded border border-stone-300 dark:border-stone-600"
							/>
							<input
								type="text"
								name="name"
								placeholder={t('highlights.namePlaceholder')}
								maxlength={60}
								class="w-full min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5
								       text-sm shadow-inner shadow-stone-900/3 focus:border-accent-500 focus:ring-3
								       focus:ring-accent-500/10 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
							/>
							<Button type="submit" size="sm" variant="secondary">{t('highlights.addColor')}</Button
							>
						</form>
					{/if}
				</Card>
			{/if}
		</div>
	</div>

	<form method="POST" action="/logout" class="flex justify-end">
		<Button variant="secondary">{t('auth.logout.submit')}</Button>
	</form>
</main>

<style>
	.settings-nav-item {
		flex-shrink: 0;
		border-left: 2px solid transparent;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
		white-space: nowrap;
		color: var(--color-stone-600);
		font-size: 0.875rem;
		font-weight: 500;
		text-align: left;
	}

	:global(.dark) .settings-nav-item {
		color: var(--color-stone-300);
	}

	.settings-nav-item:hover {
		background: var(--color-stone-100);
	}

	:global(.dark) .settings-nav-item:hover {
		background: var(--color-stone-800);
	}

	.settings-nav-item.active {
		border-left-color: var(--color-accent-500);
		background: color-mix(in oklab, var(--color-accent-500) 10%, transparent);
		color: var(--color-accent-700);
	}

	:global(.dark) .settings-nav-item.active {
		color: var(--color-accent-300);
	}

	.note-preview {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 5;
		line-clamp: 5;
	}

	.note-preview :global(ul) {
		list-style: disc;
		padding-left: 1.25rem;
	}
</style>
