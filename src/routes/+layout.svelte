<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import type { ReaderWorkspace } from '$lib/reader/workspace';

	let { children, data } = $props();

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
			user={data?.user ?? null}
			readerPreferences={reader && readerWorkspace
				? { fontScale: data.readerFontScale, layout: readerWorkspace.layout }
				: null}
			guestTourDone={data.tourGuestDone}
		/>

		{@render children()}
	</div>
{/if}
