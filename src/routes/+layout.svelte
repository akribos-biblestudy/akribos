<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { setContext } from 'svelte';
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
	setContext<ReaderWorkspaceCapture>(READER_WORKSPACE_CONTEXT, { capture: null });
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
</svelte:head>

{#if standalonePage}
	{@render children()}
{:else}
	<div
		class="flex min-h-full flex-col"
		style="--reader-font-scale: {data.readerFontScale /
			100}; --reader-text-size: calc(1.08rem * {data.readerFontScale /
			100}); --header-height: {reader ? '3.25rem' : '4rem'}"
	>
		<SiteHeader
			savedWorkspaces={data.savedWorkspaces}
			user={data?.user ?? null}
			readerPreferences={reader && readerWorkspace
				? { fontScale: data.readerFontScale, layout: readerWorkspace.layout }
				: null}
			guestTourDone={data.tourGuestDone}
		/>

		{@render children()}
	</div>
{/if}

<ReferenceContextMenu
	userId={data.user?.id ?? null}
	bibleId={data.defaultBibleId ?? data.previewBibleId}
	resources={data.readerResources}
/>
