<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
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

	type Section = 'profileSecurity' | 'appearance';

	const DEFAULT_SECTION: Section = 'profileSecurity';

	function isSection(value: string | null): value is Section {
		return value === 'profileSecurity' || value === 'appearance';
	}

	/**
	 * Which settings section is showing. Every section already lives on this one page, so switching
	 * between them does not need fresh server data — only a different section visible. The section is
	 * nonetheless tracked in the `tab` query parameter (not just local state), so reloading the page
	 * shows the same section again and the browser's back/forward buttons step between sections. A
	 * link here can point straight at a section (e.g. appearance settings use
	 * `/account?tab=appearance`) by naming it in that parameter.
	 */
	const activeSection = $derived<Section>(
		(() => {
			const requested = page.url.searchParams.get('tab');
			return isSection(requested) ? requested : DEFAULT_SECTION;
		})()
	);

	function selectSection(id: Section): void {
		if (id === activeSection) return;
		const url = new URL(page.url);
		if (id === DEFAULT_SECTION) {
			url.searchParams.delete('tab');
		} else {
			url.searchParams.set('tab', id);
		}
		// A real (non-shallow) client-side navigation, so the browser gets a history entry and
		// back/forward reliably updates `page.url` — no full page reload since the route is unchanged.
		void goto(url, { replaceState: false, keepFocus: true, noScroll: true });
	}

	const sections = [
		{ id: 'profileSecurity' as const, label: t('account.nav.profileSecurity') },
		{ id: 'appearance' as const, label: t('account.appearance') }
	];
</script>

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
					onclick={() => selectSection(section.id)}
				>
					{section.label}
				</button>
			{/each}
		</nav>

		<div class="min-w-0 flex-1 space-y-5">
			{#if activeSection === 'profileSecurity'}
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

					<form
						class="mt-5 space-y-3 border-t border-stone-200 pt-5 dark:border-stone-800"
						method="POST"
						action="?/defaultBible"
						use:enhance
						data-testid="default-bible-settings"
					>
						<label for="default-bible" class="block text-sm font-medium">Standardübersetzung</label>
						<p id="default-bible-hint" class="text-xs text-stone-500 dark:text-stone-400">
							Für Bibelvorschauen beim Überfahren einer Stelle und für „Bibeltext einfügen“.
						</p>
						<select
							id="default-bible"
							name="defaultBibleId"
							value={data.defaultBibleId ?? ''}
							aria-describedby="default-bible-hint"
							class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
						>
							<option value="">Automatisch</option>
							{#each data.bibles as bible (bible.id)}<option value={bible.id}>{bible.name}</option
								>{/each}
						</select>
						<div class="flex items-center gap-3">
							<Button type="submit">Standardübersetzung speichern</Button>
							{#if form?.defaultBibleSaved}<span role="status" class="text-sm text-stone-500"
									>{t('account.saved')}</span
								>{/if}
							{#if form?.defaultBibleError}<span role="alert" class="text-sm text-red-700"
									>Bitte eine verfügbare Bibelübersetzung wählen.</span
								>{/if}
						</div>
					</form>
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
</style>
