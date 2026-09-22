<script lang="ts">
	import { linkDocumentFootnotes } from './footnote-rendering';
	import { verseHoverPopover } from '$lib/actions/verse-hover-popover';
	import { linkBibleReferences, rewriteBibleReferenceLinks } from '$lib/bible/link-references';

	let {
		html,
		bibleId,
		tooltipId,
		class: className = '',
		testId
	}: {
		/** HTML must already have passed the shared server-side document sanitiser. */
		html: string;
		bibleId: string | null;
		/** Must be unique within the rendered page. */
		tooltipId: string;
		class?: string;
		testId?: string;
	} = $props();

	const footnoteInstance = $props.id();
	const linkedHtml = $derived(
		linkDocumentFootnotes(
			linkBibleReferences(rewriteBibleReferenceLinks(html, { tooltipId }), { tooltipId }),
			footnoteInstance
		)
	);

	function followFootnote(event: MouseEvent): void {
		const target =
			event.target instanceof Element
				? event.target.closest<HTMLAnchorElement>('a[data-footnote-link]')
				: null;
		const root = event.currentTarget as HTMLElement;
		if (!target || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
		const destination = root.querySelector<HTMLElement>(
			`[id="${CSS.escape(decodeURIComponent(target.hash.slice(1)))}"]`
		);
		if (!destination) return;
		event.preventDefault();
		destination.focus({ preventScroll: true });
		destination.scrollIntoView({ block: 'nearest' });
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
	class={className}
	data-testid={testId}
	data-bible-reference-prose
	onclick={followFootnote}
	use:verseHoverPopover={{ bibleId, tooltipId }}
>
	<!-- Only already-sanitised HTML may enter this component; linkBibleReferences adds fixed attrs. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html linkedHtml}
</div>
