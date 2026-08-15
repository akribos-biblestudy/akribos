<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { formatReference, referencePath } from '$lib/bible/reference';
	import { readerLocation } from '$lib/reader-location.svelte';
	import SiteHeader from '$lib/components/SiteHeader.svelte';

	let { children, data } = $props();

	/**
	 * The header needs the current reference for its previous/next links and its search field, and the
	 * reader is the only route that has one. Reading it from page data keeps the header dumb.
	 */
	const reader = $derived(
		page.data.navigation as
			| {
					previous: { book: number; chapter: number } | null;
					next: { book: number; chapter: number } | null;
			  }
			| undefined
	);

	/**
	 * The reader keeps `readerLocation` in step with whatever chapter and verse are actually on screen
	 * while scrolling (see `[...reference]/+page.svelte`). It cannot use `page.url` for that: SvelteKit's
	 * `replaceState`, which the reader uses to update the address bar without re-running `load`,
	 * deliberately only updates `page.state`, not the reactive `page.url` — so this component would
	 * never see the change that way.
	 */
	const query = $derived.by(() => {
		if (reader && readerLocation.reference) return formatReference(readerLocation.reference);
		return (page.data.title as string | undefined) ?? '';
	});
	const standalonePage = $derived(
		page.url.pathname === '/about' || (page.url.pathname === '/' && !data.user)
	);
</script>

<svelte:head><link rel="icon" href="/icon.png" /></svelte:head>

{#if standalonePage}
	{@render children()}
{:else}
	<div class="flex min-h-full flex-col" style="--reader-font-scale: {data.readerFontScale / 100}">
		<SiteHeader
			{query}
			previous={reader?.previous ? referencePath(reader.previous) : null}
			next={reader?.next ? referencePath(reader.next) : null}
			user={data?.user ?? null}
			readerPreferences={reader ? { fontScale: data.readerFontScale } : null}
			guestTourDone={data.tourGuestDone}
		/>

		{@render children()}
	</div>
{/if}
