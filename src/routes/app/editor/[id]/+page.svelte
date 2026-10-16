<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { referencePath } from '$lib/bible/reference';
	import { safeLinkHref } from '$lib/notes/document-markdown';
	import DocumentEditor from '$lib/components/documents/DocumentEditor.svelte';
	import {
		createAppEditorBridge,
		type AppEditorHandle,
		type AppEditorMode
	} from '$lib/app/editor-bridge';

	let { data } = $props();
	let editor: AppEditorHandle | undefined = $state();
	let locked = $state(true);
	let mode = $state<AppEditorMode>('edit');
	let bridge: ReturnType<typeof createAppEditorBridge> | undefined;
	type BridgeWindow = Window & {
		AkribosEditor?: { postMessage: (message: string) => void };
		akribosEditorBridge?: { receive: (message: unknown) => void };
	};
	async function ready() {
		await tick();
		if (!editor) return;
		bridge = createAppEditorBridge({
			documentId: data.document.id,
			userId: data.editorUserId,
			instanceId: data.instanceId,
			editor: () => editor!,
			view: async (nextMode, nextLocked) => {
				mode = nextMode;
				locked = nextLocked;
				await tick();
			},
			post: (message) =>
				(window as BridgeWindow).AkribosEditor?.postMessage(JSON.stringify(message))
		});
		(window as BridgeWindow).akribosEditorBridge = {
			receive: (message) => {
				void bridge?.receive(message);
			}
		};
		bridge.ready();
	}
	async function navigate(value: string): Promise<boolean> {
		if (!bridge || !safeLinkHref(value)) return false;
		const target = new URL(value, window.location.href);
		if (
			target.username ||
			target.password ||
			!['https:', 'http:', 'mailto:'].includes(target.protocol)
		)
			return false;
		const path =
			target.origin === window.location.origin
				? `${target.pathname}${target.search}${target.hash}`
				: target.href;
		return bridge.navigate(path);
	}
	function click(event: MouseEvent) {
		const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
		if (!(target instanceof HTMLAnchorElement)) return;
		// A tap in editable prose places the caret; explicit opening stays in its context menu.
		if (mode === 'edit' && target.closest('.tiptap')) return;
		const href = target.getAttribute('href');
		if (!href || href.startsWith('#')) return;
		// Links leave only through the native flush/route gate, never browser navigation.
		event.preventDefault();
		event.stopImmediatePropagation();
		void navigate(href);
	}
	onDestroy(() => {
		bridge?.dispose();
		if (typeof window !== 'undefined') delete (window as BridgeWindow).akribosEditorBridge;
	});
</script>

<svelte:head>
	<title>Akribos – Dokument</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>
<svelte:window onclickcapture={click} onauxclickcapture={click} />
<div
	class="reading-preferences app-document"
	data-sveltekit-preload-data="off"
	data-sveltekit-preload-code="off"
	class:dark={data.editorAppearance.theme === 'dark'}
	class:e-ink={data.editorAppearance.eInk}
	style={`--reader-font-scale: ${data.editorAppearance.fontScale / 100}; --header-height: 0rem`}
>
	<DocumentEditor
		bind:this={editor}
		document={data.document}
		bibleId={data.bibleId}
		compact
		appEmbedded
		readOnly={locked || mode === 'read'}
		onAppReady={ready}
		onAppSnapshot={(state) => bridge?.state(state)}
		onOpenDocument={(id) => navigate(`/notes/${id}`)}
		onOpenBibleReference={(reference) => navigate(referencePath(reference))}
	/>
</div>

<style>
	.app-document {
		height: 100dvh;
		overflow: hidden;
		background: var(--surface);
	}
	.e-ink :global(*) {
		animation: none !important;
		transition: none !important;
	}
</style>
