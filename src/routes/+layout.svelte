<script lang="ts">
	import './layout.css';
	import {
		browserReaderResume,
		clearBrowserReaderResume,
		restoreBrowserReaderResume,
		markReaderBrowserReady,
		rememberBrowserReaderView
	} from '$lib/reader/browser-tab';
	import readingFont from '$lib/assets/fonts/akribos-text-regular.woff2?url';
	import Analytics from '$lib/components/Analytics.svelte';
	import { page } from '$app/state';
	import { onMount, setContext } from 'svelte';
	import { goto, replaceState, beforeNavigate, invalidateAll } from '$app/navigation';
	import { createWorkspacePersistence, readWorkspacePersistence } from '$lib/reader/persistence';
	import { INITIAL_READER_COLUMNS_COOKIE, initialReaderColumns } from '$lib/reader/initial-layout';
	import {
		READER_WORKSPACE_CONTEXT,
		type ReaderWorkspaceCapture
	} from '$lib/reader/saved-workspaces';
	import ReferenceContextMenu from '$lib/components/ReferenceContextMenu.svelte';
	import { REFERENCE_NAVIGATION, type ReferenceNavigation } from '$lib/reader/reference-navigation';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import type { ReaderWorkspace } from '$lib/reader/workspace';
	import {
		DOCUMENT_READER_NAVIGATION,
		type DocumentReaderNavigation
	} from '$lib/reader/document-navigation';

	let { children, data } = $props();
	let browserWorkspaceError = $state('');
	let resumeOwner: string | null | undefined;
	$effect(() => {
		const owner = data.user?.id ?? null;
		if (resumeOwner !== undefined && owner !== resumeOwner) clearBrowserReaderResume();
		resumeOwner = owner;
	});
	onMount(() => {
		const resume = browserReaderResume(data.user?.id ?? null);
		if (!data.user) clearBrowserReaderResume();
		const isReaderPage = page.route.id === '/[...reference]';
		const isWorkspaceOpening = page.route.id === '/workspaces/[id]';
		if (!data.user || isWorkspaceOpening) markReaderBrowserReady();
		if (data.user && !isWorkspaceOpening) {
			const rootArrival = isReaderPage && page.url.searchParams.get('readerResume') === '1';
			void (async () => {
				const restored =
					resume && rootArrival ? await restoreBrowserReaderResume(data.user?.id ?? null) : null;
				if (resume && rootArrival && !restored) clearBrowserReaderResume();
				if (rootArrival) {
					await goto(restored ?? '/', { replaceState: true, invalidateAll: true, noScroll: true });
				} else {
					// Revalidate the tab context without performing another navigation: native POST responses
					// carry success/error form data which goto() deliberately clears, while invalidation keeps it.
					await invalidateAll();
				}
				markReaderBrowserReady();
				const current = workspaceCapture.capture?.();
				if (isReaderPage && current && !page.data.readerWorkspaceDetached)
					rememberBrowserReaderView(
						data.user?.id ?? null,
						`${window.location.pathname}?${current.readerState}`,
						workspaceCapture.persistence.read()
					);
			})().catch(() => {
				browserWorkspaceError =
					'Die lokale Leseansicht konnte nicht geladen werden. Bitte versuche es erneut.';
				delete document.documentElement.dataset.readerBootstrapping;
			});
		}

		// Send only a coarse width hint. Saved layouts ignore it, including on another device.
		const value = String(initialReaderColumns(window.innerWidth));
		try {
			document.cookie = `${INITIAL_READER_COLUMNS_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
			if (
				data.initializeReaderWorkspace &&
				document.cookie.split('; ').includes(`${INITIAL_READER_COLUMNS_COOKIE}=${value}`)
			) {
				void goto(page.url, { replaceState: true, invalidateAll: true, noScroll: true });
			}
		} catch {
			// Without cookies or JavaScript the first Bible remains usable in a single tile.
		}
	});
	const workspaceCapture: ReaderWorkspaceCapture = {
		capture: null,
		persistence: createWorkspacePersistence(
			() => readWorkspacePersistence(page.data, page.state.readerWorkspacePersistence),
			(token) =>
				replaceState(window.location.href, { ...page.state, readerWorkspacePersistence: token })
		)
	};
	setContext(READER_WORKSPACE_CONTEXT, workspaceCapture);
	beforeNavigate((navigation) => {
		if (navigation.to?.url.pathname !== '/' || navigation.willUnload) return;
		const resume = browserReaderResume(data.user?.id ?? null);
		if (!resume) return;
		navigation.cancel();
		void (async () => {
			await workspaceCapture.flush?.();
			const restored = await restoreBrowserReaderResume(data.user?.id ?? null);
			if (!restored) clearBrowserReaderResume();
			await goto(restored ?? '/', { invalidateAll: true });
		})();
	});
	setContext<DocumentReaderNavigation>(DOCUMENT_READER_NAVIGATION, { pending: null });
	setContext<ReferenceNavigation>(REFERENCE_NAVIGATION, {
		open: null,
		pending: null,
		returnTo: null
	});

	/** Reader route signal and its persisted workspace. */
	const reader = $derived(
		page.data.navigation as
			| {
					previous: { book: number; chapter: number } | null;
					next: { book: number; chapter: number } | null;
			  }
			| undefined
	);
	const readerWorkspace = $derived(page.data.workspace as ReaderWorkspace | undefined);

	const standalonePage = $derived(
		page.url.pathname === '/about' || (page.url.pathname === '/' && !data.user)
	);
</script>

<svelte:head>
	<title>Akribos - Die Bibel präzise studieren</title>
	<link rel="icon" href="/icon.png" />
	<link rel="preload" href={readingFont} as="font" type="font/woff2" crossorigin="anonymous" />
	<!-- Keep native same-origin form POSTs compatible with CSRF protection while withholding
		 referrers from external analytics requests. no-referrer also suppresses the form's Origin. -->
	{#if data.analytics.enabled}<meta name="referrer" content="same-origin" />{/if}
</svelte:head>

{#if browserWorkspaceError}
	<main class="mx-auto max-w-xl p-8" role="alert">
		<p>{browserWorkspaceError}</p>
		<button class="mt-4 rounded border px-4 py-2" onclick={() => window.location.reload()}
			>Erneut laden</button
		>
	</main>
{/if}

{#if standalonePage}
	{@render children()}
{:else}
	<div
		class="reading-preferences flex min-h-full flex-col"
		data-reader-authenticated={data.user ? '' : undefined}
		class:hidden={!!browserWorkspaceError}
		style="--reader-font-scale: {data.readerFontScale / 100}; --header-height: {reader
			? '3.25rem'
			: '4rem'}"
	>
		<SiteHeader
			savedWorkspaces={data.savedWorkspaces}
			user={data?.user ?? null}
			readerPreferences={reader && readerWorkspace
				? { fontScale: data.readerFontScale, layout: readerWorkspace.layout }
				: null}
			guestTourDone={data.tourGuestDone}
			initializingWorkspace={data.initializeReaderWorkspace}
		/>

		{@render children()}
	</div>
{/if}

<ReferenceContextMenu
	userId={data.user?.id ?? null}
	bibleId={data.defaultBibleId ?? data.previewBibleId}
	resources={data.readerResources}
/>

<Analytics config={data.analytics} />

<style>
	:global(html[data-reader-bootstrapping]) .reading-preferences[data-reader-authenticated] {
		visibility: hidden;
	}
</style>
