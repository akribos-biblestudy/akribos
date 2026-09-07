<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';
	import Menu from './Menu.svelte';
	import ProductTour from './ProductTour.svelte';
	import ReaderViewMenu from './ReaderViewMenu.svelte';
	import ReaderLayoutPicker from './ReaderLayoutPicker.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import type { ReaderLayout } from '$lib/reader/workspace';
	import { startTour } from '$lib/tour/tour-state.svelte';
	import { tourStepsForRoute, GUEST_TOUR_STEPS, MEMBER_TOUR_STEPS } from '$lib/tour/steps';

	let {
		user = null,
		readerPreferences = null,
		guestTourDone = false
	}: {
		user?: {
			displayName: string | null;
			email: string;
			role: string;
			tourCompletedAt: Date | string | null;
		} | null;
		readerPreferences?: { fontScale: number; layout: ReaderLayout } | null;
		/** Whether this device already finished (or dismissed) the tour while signed out. */
		guestTourDone?: boolean;
	} = $props();

	/**
	 * The first-run tour still auto-starts only in the Reader. Signed-in users can additionally restart
	 * route-specific tours from the document library, editor, import and sermon screens. A reader who
	 * never finished the first run sees the full sequence unless this device already completed the
	 * signed-out part; then only the member steps are new. `tourCompletedAt` is the durable cross-device
	 * record, while the guest cookie only shortens what a first sign-in shows.
	 */
	const autoStartTourSteps = $derived.by(() => {
		if (user)
			return user.tourCompletedAt
				? []
				: guestTourDone
					? MEMBER_TOUR_STEPS
					: tourStepsForRoute(page.url.pathname, true, true);
		return guestTourDone ? [] : GUEST_TOUR_STEPS;
	});

	function restartTour(): void {
		userMenu?.close();
		startTour(tourStepsForRoute(page.url.pathname, !!user, !!readerPreferences), !!user);
	}

	let userMenu: Menu | undefined = $state();
	const userInitial = $derived(
		(user?.displayName?.trim() || user?.email || '').charAt(0).toLocaleUpperCase('de')
	);
</script>

<header
	class="sticky top-0 z-30 border-b border-stone-200/70 bg-[color:var(--surface)]/92 shadow-[0_1px_12px_rgb(28_25_23/0.045)]
	       backdrop-blur-xl before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-accent-500
	       dark:border-white/8 dark:shadow-black/20"
>
	<div
		class="mx-auto flex h-[var(--header-height)] max-w-[var(--content-max-width)] items-center gap-2 px-3 pt-0.5 sm:gap-5 sm:px-5"
	>
		<a href="/" class="group shrink-0 focus-visible:rounded-sm" aria-label="Akribos – Startseite">
			{#if readerPreferences}
				<img src="/logo.png" alt="Akribos" class="h-8 w-auto sm:h-10" />
			{:else}
				<img src="/logo.png" alt="Akribos" class="hidden h-10 w-auto sm:block" />
				<img src="/icon.png" alt="" class="size-9 rounded-sm sm:hidden" />
			{/if}
		</a>

		<div class="flex min-w-0 flex-1 items-center justify-end gap-0.5">
			{#if readerPreferences}<ReaderLayoutPicker
					layout={readerPreferences.layout}
					notesAvailable={user !== null}
				/>{/if}
		</div>

		<nav class="flex shrink-0 items-center gap-0.5 sm:gap-1">
			{#if readerPreferences}
				<ReaderViewMenu fontScale={readerPreferences.fontScale} />
			{:else}
				<ThemeToggle />
			{/if}
			<ProductTour signedIn={!!user} autoStart={readerPreferences ? autoStartTourSteps : []} />

			<button
				type="button"
				data-tour-target="user-menu"
				aria-label={t('nav.userMenu')}
				aria-haspopup="menu"
				class="group ml-3 flex min-h-9 items-center gap-2 rounded-lg p-1 text-stone-600 transition-colors hover:bg-stone-200/65
				       dark:text-stone-300 dark:hover:bg-white/8"
				onclick={(event) => userMenu?.openAt(event.currentTarget)}
			>
				{#if user}
					<span
						class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-800 ring-1 ring-accent-600/10 dark:bg-accent-900/45 dark:text-accent-200"
						aria-hidden="true"
					>
						{userInitial}
					</span>
					<span class="hidden max-w-32 truncate pr-1 text-sm font-medium sm:block">
						{user.displayName ?? user.email}
					</span>
				{:else}
					<span
						class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors group-hover:bg-white dark:bg-white/7 dark:text-stone-300 dark:group-hover:bg-white/10"
						aria-hidden="true"
					>
						<Icon name="user" class="size-4.5" />
					</span>
				{/if}
			</button>

			<Menu bind:this={userMenu} label={t('nav.userMenu')} minWidth="16rem">
				{#if user}
					<a href="/notes" role="menuitem" data-sveltekit-preload-data="hover"
						>{t('nav.documents')}</a
					>
					<a href="/account" role="menuitem" data-sveltekit-preload-data="hover"
						>{t('nav.account')}</a
					>
					{#if user.role === 'admin'}
						<a href="/admin" role="menuitem" data-sveltekit-preload-data="hover">{t('nav.admin')}</a
						>
					{/if}
					<hr />
				{/if}
				{#if !user}<a href="/notes/published" role="menuitem" data-sveltekit-preload-data="hover"
						>{t('nav.publishedNotes')}</a
					>{/if}
				{#if tourStepsForRoute(page.url.pathname, !!user, !!readerPreferences).length > 0}
					<button type="button" role="menuitem" onclick={restartTour}>{t('nav.tour')}</button>
				{/if}
				<a href="/help" role="menuitem">{t('nav.help')}</a>
				<a href="/about" role="menuitem">{t('nav.about')}</a>
				{#if !user}
					<hr />
					<a href="/login" role="menuitem">{t('nav.login')}</a>
				{/if}
				<hr />
				<a href="/impressum" role="menuitem">{t('nav.impressum')}</a>
				<a href="/datenschutz" role="menuitem">{t('nav.datenschutz')}</a>
				{#if user}
					<hr />
					<form method="POST" action="/logout" role="none">
						<button type="submit" role="menuitem">{t('auth.logout.submit')}</button>
					</form>
				{/if}
			</Menu>
		</nav>
	</div>
</header>

<style>
	/* Medium-width screens need generous targets, but the regular header controls remain visually
	   borderless. A viewport width alone does not mean that the device is an e-ink display. */
	@media (min-width: 640px) and (max-width: 1280px) {
		:global(.icon-button) {
			min-width: 2.75rem;
			min-height: 2.75rem;
		}
	}

	/* On actual e-ink/monochrome displays, subtle translucent controls and hover-only boundaries are
	   difficult to see, so those devices retain the deliberately stronger treatment. */
	@media (update: slow), (monochrome) {
		:global(.icon-button) {
			border: 1px solid var(--color-stone-400);
			background: var(--surface-raised);
			color: var(--color-stone-800);
		}
	}
</style>
