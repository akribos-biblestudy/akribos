<script lang="ts">
	import { documentHtmlToMarkdown, documentMarkdownToHtml } from '$lib/notes/document-markdown';
	import { t } from '$lib/i18n';
	import { Editor } from '@tiptap/core';
	import { Placeholder } from '@tiptap/extension-placeholder';
	import { StarterKit } from '@tiptap/starter-kit';
	import { onMount, untrack } from 'svelte';
	import Icon from '../Icon.svelte';

	type EditableDocument = {
		id: string;
		title: string;
		bodyMarkdown: string;
		bodyHtml: string;
		revision: number;
	};

	let {
		document,
		onSaved,
		onState
	}: {
		document: EditableDocument;
		onSaved?: (document: EditableDocument) => void;
		onState?: (state: { status: SaveState; revision: number }) => void;
	} = $props();

	type Mode = 'visual' | 'markdown';
	type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

	let editorHost: HTMLDivElement | undefined = $state();
	let editorState = $state<{ editor: Editor | null }>({ editor: null });
	let mode = $state<Mode>('visual');
	let title = $state(untrack(() => document.title));
	let markdown = $state(untrack(() => document.bodyMarkdown));
	let revision = $state(untrack(() => document.revision));
	let saveState = $state<SaveState>('saved');
	let saveMessage = $state('');
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let saving = false;
	let saveAgain = false;
	let destroyed = false;
	let applyingContent = false;
	let lastSavedSignature = untrack(() => signature(title, markdown));

	const editor = $derived(editorState.editor);
	const statusText = $derived(
		saveState === 'saving'
			? t('documents.editor.saving')
			: saveState === 'dirty'
				? t('documents.editor.unsaved')
				: saveState === 'error'
					? t('documents.editor.saveError')
					: saveState === 'conflict'
						? t('documents.editor.conflict')
						: t('documents.editor.saved')
	);

	$effect(() => {
		if (document.revision > revision) revision = document.revision;
	});

	$effect(() => {
		onState?.({ status: saveState, revision });
	});

	function signature(nextTitle: string, nextMarkdown: string): string {
		return `${nextTitle}\u0000${nextMarkdown}`;
	}

	function markDirty(): void {
		if (signature(title, markdown) === lastSavedSignature) {
			saveState = 'saved';
			return;
		}
		if (saveState !== 'conflict') saveState = 'dirty';
		scheduleSave();
	}

	function scheduleSave(delay = 650): void {
		if (saveState === 'conflict' || destroyed) return;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => void save(), delay);
	}

	async function save(): Promise<void> {
		if (destroyed || saveState === 'conflict') return;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = undefined;

		const saveSignature = signature(title, markdown);
		if (saveSignature === lastSavedSignature) {
			saveState = 'saved';
			return;
		}
		if (!title.trim()) {
			saveState = 'error';
			saveMessage = t('documents.editor.titlePlaceholder');
			return;
		}
		if (saving) {
			saveAgain = true;
			return;
		}

		saving = true;
		saveState = 'saving';
		saveMessage = '';
		const requestedRevision = revision;
		const requestedTitle = title;
		const requestedMarkdown = markdown;

		try {
			const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify({
					revision: requestedRevision,
					title: requestedTitle,
					markdown: requestedMarkdown
				})
			});
			const result = (await response.json().catch(() => ({}))) as {
				document?: EditableDocument;
				error?: string;
				currentRevision?: number;
			};

			if (response.status === 409 || result.error === 'conflict') {
				saveState = 'conflict';
				saveMessage = t('documents.editor.conflict');
				return;
			}
			if (!response.ok || !result.document) throw new Error(result.error ?? response.statusText);

			revision = result.document.revision;
			lastSavedSignature = signature(requestedTitle, requestedMarkdown);
			onSaved?.(result.document);
			if (signature(title, markdown) === lastSavedSignature) saveState = 'saved';
			else saveAgain = true;
		} catch (error) {
			saveState = 'error';
			saveMessage = error instanceof Error ? error.message : String(error);
		} finally {
			saving = false;
			if (saveAgain && saveState !== 'conflict') {
				saveAgain = false;
				scheduleSave(50);
			}
		}
	}

	/** Used by metadata forms before they perform their own revisioned mutation. */
	export async function flush(): Promise<boolean> {
		await save();
		return saveState === 'saved';
	}

	function updateFromVisual(): void {
		if (!editor || applyingContent) return;
		markdown = documentHtmlToMarkdown(editor.isEmpty ? '' : editor.getHTML());
		markDirty();
	}

	function switchMode(nextMode: Mode): void {
		if (nextMode === mode) return;
		if (nextMode === 'markdown') {
			updateFromVisual();
		} else if (editor) {
			applyingContent = true;
			const { html } = documentMarkdownToHtml(markdown);
			editor.commands.setContent(html, { emitUpdate: false });
			applyingContent = false;
		}
		mode = nextMode;
	}

	function onWindowKeydown(event: KeyboardEvent): void {
		if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 's') {
			event.preventDefault();
			void save();
		}

		if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'm') {
			const target = event.target as HTMLElement | null;
			if (target?.closest('[data-document-editor]')) {
				event.preventDefault();
				switchMode(mode === 'visual' ? 'markdown' : 'visual');
			}
		}
	}

	function onBeforeUnload(event: BeforeUnloadEvent): void {
		if (signature(title, markdown) === lastSavedSignature) return;
		event.preventDefault();
		event.returnValue = '';
	}

	function onVisibilityChange(): void {
		if (window.document.visibilityState === 'hidden' && saveState === 'dirty') void save();
	}

	onMount(() => {
		if (!editorHost) return;
		const instance = new Editor({
			element: editorHost,
			extensions: [
				StarterKit.configure({ heading: { levels: [2, 3] } }),
				Placeholder.configure({ placeholder: t('documents.editor.bodyPlaceholder') })
			],
			content: document.bodyHtml,
			editorProps: {
				attributes: {
					class: 'document-prose prose-like',
					role: 'textbox',
					'aria-label': t('documents.editor.bodyPlaceholder'),
					'aria-multiline': 'true'
				}
			},
			onCreate: ({ editor }) => (editorState = { editor }),
			onUpdate: ({ editor }) => {
				editorState = { editor };
				updateFromVisual();
			},
			onTransaction: ({ editor }) => (editorState = { editor })
		});
		editorState = { editor: instance };
		window.document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			destroyed = true;
			if (debounceTimer) clearTimeout(debounceTimer);
			window.document.removeEventListener('visibilitychange', onVisibilityChange);
			instance.destroy();
		};
	});
</script>

<svelte:window onkeydown={onWindowKeydown} onbeforeunload={onBeforeUnload} />

<section
	class="document-editor overflow-hidden rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] shadow-[var(--shadow-soft)] dark:border-white/8"
	data-document-editor
	data-testid="document-editor"
>
	<header class="border-b border-stone-200/80 px-4 py-4 sm:px-7 sm:py-5 dark:border-white/8">
		<label class="sr-only" for="document-title">{t('documents.editor.title')}</label>
		<input
			id="document-title"
			bind:value={title}
			oninput={markDirty}
			maxlength="200"
			placeholder={t('documents.editor.titlePlaceholder')}
			class="w-full border-0 bg-transparent font-serif text-2xl leading-tight font-semibold tracking-tight placeholder:text-stone-300 focus:outline-none sm:text-3xl dark:placeholder:text-stone-600"
		/>

		<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
			<div
				class="inline-flex rounded-lg bg-stone-100 p-1 dark:bg-white/6"
				role="tablist"
				aria-label={t('documents.editor.markdown')}
			>
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'visual'}
					class:active={mode === 'visual'}
					class="mode-tab"
					onclick={() => switchMode('visual')}
				>
					{t('documents.editor.visual')}
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'markdown'}
					class:active={mode === 'markdown'}
					class="mode-tab"
					onclick={() => switchMode('markdown')}
				>
					{t('documents.editor.markdown')}
				</button>
			</div>

			<p
				class:error={saveState === 'error' || saveState === 'conflict'}
				class="save-status"
				role={saveState === 'error' || saveState === 'conflict' ? 'alert' : 'status'}
				aria-live="polite"
				title={saveMessage}
			>
				{#if saveState === 'saved'}<Icon name="check" class="size-3.5" />{/if}
				{statusText}
			</p>
		</div>
	</header>

	{#if mode === 'visual'}
		{#if editor}
			<div class="editor-toolbar" role="toolbar" aria-label={t('documents.editor.formatting')}>
				<button
					type="button"
					class:active={editor.isActive('bold')}
					onclick={() => editor.chain().focus().toggleBold().run()}
					aria-label={t('documents.editor.bold')}><strong>B</strong></button
				>
				<button
					type="button"
					class:active={editor.isActive('italic')}
					onclick={() => editor.chain().focus().toggleItalic().run()}
					aria-label={t('documents.editor.italic')}><em>I</em></button
				>
				<button
					type="button"
					class:active={editor.isActive('strike')}
					onclick={() => editor.chain().focus().toggleStrike().run()}
					aria-label={t('documents.editor.strike')}><s>S</s></button
				>
				<span class="toolbar-separator"></span>
				<button
					type="button"
					class:active={editor.isActive('heading', { level: 2 })}
					onclick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
					aria-label={t('documents.editor.heading')}>H2</button
				>
				<button
					type="button"
					class:active={editor.isActive('bulletList')}
					onclick={() => editor.chain().focus().toggleBulletList().run()}
					aria-label={t('documents.editor.list')}>•</button
				>
				<button
					type="button"
					class:active={editor.isActive('orderedList')}
					onclick={() => editor.chain().focus().toggleOrderedList().run()}
					aria-label={t('documents.editor.orderedList')}>1.</button
				>
				<button
					type="button"
					class:active={editor.isActive('blockquote')}
					onclick={() => editor.chain().focus().toggleBlockquote().run()}
					aria-label={t('documents.editor.quote')}>„“</button
				>
				<button
					type="button"
					class:active={editor.isActive('code')}
					onclick={() => editor.chain().focus().toggleCode().run()}
					aria-label={t('documents.editor.code')}>&lt;/&gt;</button
				>
				<span class="toolbar-separator"></span>
				<button
					type="button"
					disabled={!editor.can().undo()}
					onclick={() => editor.chain().focus().undo().run()}
					aria-label={t('documents.editor.undo')}>↶</button
				>
				<button
					type="button"
					disabled={!editor.can().redo()}
					onclick={() => editor.chain().focus().redo().run()}
					aria-label={t('documents.editor.redo')}>↷</button
				>
			</div>
		{/if}
		<div class="editor-host" bind:this={editorHost}></div>
	{:else}
		<div class="markdown-editor">
			<label class="sr-only" for="document-markdown">{t('documents.editor.markdown')}</label>
			<textarea
				id="document-markdown"
				bind:value={markdown}
				oninput={markDirty}
				spellcheck="true"
				class="min-h-[32rem] w-full resize-y bg-transparent font-mono text-[0.9rem] leading-7 focus:outline-none"
			></textarea>
			<p class="mt-3 text-xs text-stone-500 dark:text-stone-400">
				{t('documents.editor.markdownHint')}
			</p>
		</div>
	{/if}
</section>

<style>
	.mode-tab {
		min-width: 5.2rem;
		border-radius: 0.38rem;
		padding: 0.32rem 0.72rem;
		color: var(--color-stone-500);
		font-size: 0.75rem;
		font-weight: 650;
	}
	.mode-tab.active {
		background: var(--surface-raised);
		box-shadow: 0 1px 2px rgb(28 25 23 / 0.09);
		color: var(--color-stone-900);
	}
	.save-status {
		display: inline-flex;
		max-width: 32rem;
		align-items: center;
		gap: 0.3rem;
		color: var(--color-stone-500);
		font-size: 0.72rem;
	}
	.save-status.error {
		color: var(--color-red-700);
	}
	.editor-toolbar {
		display: flex;
		position: sticky;
		top: var(--header-height);
		z-index: 5;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem;
		border-bottom: 1px solid var(--line);
		background: color-mix(in oklab, var(--surface) 94%, transparent);
		padding: 0.55rem 1rem;
		backdrop-filter: blur(10px);
	}
	.editor-toolbar button {
		min-width: 2rem;
		min-height: 2rem;
		border-radius: 0.4rem;
		padding: 0.2rem 0.45rem;
		color: var(--color-stone-600);
		font-size: 0.78rem;
		line-height: 1.1;
	}
	.editor-toolbar button:hover:not(:disabled),
	.editor-toolbar button.active {
		background: var(--color-stone-200);
		color: var(--color-accent-800);
	}
	.editor-toolbar button:disabled {
		opacity: 0.35;
	}
	.toolbar-separator {
		width: 1px;
		height: 1.35rem;
		margin: 0 0.18rem;
		background: var(--color-stone-300);
	}
	.editor-host {
		min-height: 36rem;
		padding: 2rem clamp(1.25rem, 5vw, 4.5rem) 5rem;
	}
	.editor-host :global(.document-prose) {
		min-height: 30rem;
		max-width: 50rem;
		margin: 0 auto;
		outline: none;
	}
	.editor-host :global(.document-prose > * + *) {
		margin-top: 0.85em;
	}
	.editor-host :global(.document-prose h2) {
		margin-top: 1.9em;
		font-size: 1.55rem;
		font-weight: 700;
	}
	.editor-host :global(.document-prose h3) {
		margin-top: 1.55em;
		font-size: 1.2rem;
		font-weight: 700;
	}
	.editor-host :global(.document-prose ul),
	.editor-host :global(.document-prose ol) {
		padding-left: 1.65rem;
	}
	.editor-host :global(.document-prose ul) {
		list-style: disc;
	}
	.editor-host :global(.document-prose ol) {
		list-style: decimal;
	}
	.editor-host :global(.document-prose blockquote) {
		border-left: 3px solid var(--color-accent-400);
		padding-left: 1rem;
		color: var(--color-stone-600);
		font-style: italic;
	}
	.editor-host :global(.document-prose code) {
		border-radius: 0.25rem;
		background: var(--color-stone-100);
		padding: 0.08em 0.28em;
		font-family: ui-monospace, monospace;
		font-size: 0.88em;
	}
	.editor-host :global(.document-prose p.is-editor-empty:first-child::before) {
		float: left;
		height: 0;
		color: var(--color-stone-400);
		content: attr(data-placeholder);
		pointer-events: none;
	}
	.markdown-editor {
		padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem) 4rem;
	}

	:global(.dark) .mode-tab.active {
		color: var(--color-stone-100);
	}
	:global(.dark) .editor-toolbar button:hover:not(:disabled),
	:global(.dark) .editor-toolbar button.active,
	:global(.dark) .editor-host :global(.document-prose code) {
		background: color-mix(in oklab, white 9%, transparent);
		color: var(--color-stone-100);
	}
	:global(.dark) .save-status.error {
		color: var(--color-red-300);
	}

	@media (max-width: 639px) {
		.editor-host {
			min-height: 28rem;
			padding-top: 1.35rem;
		}
		.editor-host :global(.document-prose) {
			min-height: 24rem;
			font-size: 1rem;
		}
	}
</style>
