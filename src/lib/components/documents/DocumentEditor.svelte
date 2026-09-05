<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import {
		loadBibleQuotation,
		verseHoverPopover,
		type BibleQuotation
	} from '$lib/actions/verse-hover-popover';
	import { parsePassage } from '$lib/bible/passage';
	import {
		documentHtmlToMarkdown,
		documentMarkdownToHtml,
		safeLinkHref
	} from '$lib/notes/document-markdown';
	import { t } from '$lib/i18n';
	import { Editor } from '@tiptap/core';
	import { Placeholder } from '@tiptap/extension-placeholder';
	import { StarterKit } from '@tiptap/starter-kit';
	import { onMount, untrack } from 'svelte';
	import Icon from '../Icon.svelte';
	import { BibleReferenceDecorations } from './bible-reference-decorations';
	import { DocumentHighlight } from './document-highlight';

	type EditableDocument = {
		id: string;
		title: string;
		bodyMarkdown: string;
		bodyHtml: string;
		revision: number;
	};

	let {
		document,
		bibleId = null,
		compact = false,
		onSaved,
		onState
	}: {
		document: Omit<EditableDocument, 'bodyHtml'>;
		bibleId?: string | null;
		/** Fits the same editor and autosave implementation into the Reader's notes column. */
		compact?: boolean;
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
	let saveQueue: Promise<void> = Promise.resolve();
	let destroyed = false;
	let applyingContent = false;
	let resumingNavigation = false;
	let pendingNavigation = false;
	let quotationState = $state<'idle' | 'loading' | 'error'>('idle');
	let linkEditorOpen = $state(false);
	let linkUrl = $state('');
	let linkError = $state(false);
	let linkInput: HTMLInputElement | undefined = $state();
	const headingLevels = [1, 2, 3, 4, 5, 6] as const;
	const bibleReferenceTooltipId = untrack(() => `document-bible-reference-preview-${document.id}`);
	let lastSavedSignature = untrack(() => signature(title, markdown));

	const editor = $derived(editorState.editor);
	const statusText = $derived(
		saveState === 'saving'
			? t('documents.editor.saving')
			: saveState === 'dirty'
				? t('documents.editor.unsaved')
				: saveState === 'error'
					? saveMessage || t('documents.editor.saveError')
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

	function save(): Promise<void> {
		if (destroyed || saveState === 'conflict') return Promise.resolve();
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = undefined;
		// Every caller joins the same serial queue. In particular, a metadata submit that flushes while
		// an autosave is in flight waits for that request and then persists any newer editor state.
		saveQueue = saveQueue.then(persistLatest, persistLatest);
		return saveQueue;
	}

	async function persistLatest(): Promise<void> {
		while (!destroyed && saveState !== 'conflict') {
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
				if (!response.ok || !result.document) {
					if (response.status === 401) {
						throw new Error(t('documents.editor.authenticationRequired'));
					}
					if (response.status === 404) throw new Error(t('documents.editor.notFound'));
					if (response.status === 413) throw new Error(t('documents.editor.tooLarge'));
					throw new Error(t('documents.editor.saveError'));
				}

				revision = result.document.revision;
				lastSavedSignature = signature(requestedTitle, requestedMarkdown);
				onSaved?.(result.document);
				// If typing continued during the request, loop immediately with the new revision so flush()
				// cannot return before the newest title/body is durable.
				if (signature(title, markdown) === lastSavedSignature) {
					saveState = 'saved';
					return;
				}
			} catch (error) {
				saveState = 'error';
				saveMessage = error instanceof Error ? error.message : String(error);
				return;
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

	function onModeTabKeydown(event: KeyboardEvent): void {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const nextMode =
			event.key === 'Home'
				? ('visual' as const)
				: event.key === 'End'
					? ('markdown' as const)
					: mode === 'visual'
						? ('markdown' as const)
						: ('visual' as const);
		switchMode(nextMode);
		requestAnimationFrame(() => {
			window.document.getElementById(`document-${nextMode}-tab`)?.focus();
		});
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

	beforeNavigate(({ cancel, to }) => {
		if (resumingNavigation) {
			resumingNavigation = false;
			return;
		}
		if (!to?.url || signature(title, markdown) === lastSavedSignature) return;

		cancel();
		if (pendingNavigation) return;
		pendingNavigation = true;
		const destination = to.url;
		void flush().then((saved) => {
			pendingNavigation = false;
			if (!saved) return;
			resumingNavigation = true;
			void goto(destination);
		});
	});

	function onVisibilityChange(): void {
		if (window.document.visibilityState === 'hidden' && saveState === 'dirty') void save();
	}

	function insertBibleQuotation(quotation: BibleQuotation): void {
		if (!editor) return;
		const source = [quotation.reference, quotation.translation].filter(Boolean).join(' · ');
		editor
			.chain()
			.focus()
			.insertContent({
				type: 'blockquote',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: quotation.text }] },
					{
						type: 'paragraph',
						content: [{ type: 'text', marks: [{ type: 'bold' }], text: source }]
					}
				]
			})
			.run();
		quotationState = 'idle';
	}

	function editLink(): void {
		if (!editor) return;
		linkUrl = editor.getAttributes('link').href ?? '';
		linkError = false;
		linkEditorOpen = true;
		requestAnimationFrame(() => linkInput?.focus());
	}

	function applyLink(): void {
		if (!editor) return;
		const href = safeLinkHref(linkUrl);
		if (!href) {
			linkError = true;
			return;
		}
		const chain = editor.chain().focus().extendMarkRange('link');
		if (editor.state.selection.empty && !editor.isActive('link')) {
			chain
				.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
				.run();
		} else chain.setLink({ href }).run();
		linkEditorOpen = false;
	}

	function onEditorLinkClick(event: MouseEvent): boolean {
		const target = event.target instanceof Element ? event.target : null;
		const link = target?.closest('a');
		if (!link) return false;
		event.preventDefault();
		if (event.ctrlKey || event.metaKey) {
			const reference =
				target?.closest('[data-reference]') ?? link.querySelector('[data-reference]');
			const href = safeLinkHref(reference?.getAttribute('href') ?? link.getAttribute('href') ?? '');
			if (href) window.open(href, '_blank', 'noopener,noreferrer');
		}
		return true;
	}

	async function insertBibleQuotationFromReference(reference: string): Promise<void> {
		if (!editor || !bibleId || !parsePassage(reference)) {
			quotationState = 'error';
			return;
		}
		quotationState = 'loading';
		try {
			insertBibleQuotation(await loadBibleQuotation(bibleId, reference));
		} catch {
			quotationState = 'error';
		}
	}

	onMount(() => {
		if (!editorHost) return;
		const instance = new Editor({
			element: editorHost,
			extensions: [
				StarterKit.configure({
					heading: { levels: [...headingLevels] },
					link: { openOnClick: false, isAllowedUri: (url) => safeLinkHref(url) !== null }
				}),
				DocumentHighlight,
				Placeholder.configure({ placeholder: t('documents.editor.bodyPlaceholder') }),
				BibleReferenceDecorations.configure({ tooltipId: bibleReferenceTooltipId })
			],
			content: documentMarkdownToHtml(markdown).html,
			editorProps: {
				handleDOMEvents: {
					click: (_view, event) => onEditorLinkClick(event),
					auxclick: (_view, event) => onEditorLinkClick(event)
				},
				attributes: {
					class: 'document-prose prose-like',
					role: 'textbox',
					'aria-label': t('documents.editor.bodyPlaceholder'),
					'aria-multiline': 'true',
					...(compact ? { 'data-testid': 'reader-notes-sidecar-body' } : {})
				},
				handleKeyDown: (view, event) => {
					if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
						event.preventDefault();
						editLink();
						return true;
					}
					if (
						event.key !== 'Enter' ||
						event.shiftKey ||
						event.ctrlKey ||
						event.metaKey ||
						event.altKey
					) {
						return false;
					}
					const resolvedPosition = view.state.selection.$from;
					if (!resolvedPosition.parent.isTextblock) return false;
					const before = resolvedPosition.parent.textBetween(
						0,
						resolvedPosition.parentOffset,
						'\n',
						'\n'
					);
					const command = /(?:^|\s)\/(?:bibel|stelle)\s+(.+)$/iu.exec(before);
					const reference = command?.[1]?.trim();
					if (!command || !reference || !parsePassage(reference)) return false;
					event.preventDefault();
					const from =
						resolvedPosition.start() + command.index + (command[0].startsWith(' ') ? 1 : 0);
					view.dispatch(view.state.tr.delete(from, resolvedPosition.pos));
					void insertBibleQuotationFromReference(reference);
					return true;
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
	class:compact
	data-document-editor
	data-testid="document-editor"
>
	<header class="border-b border-stone-200/80 px-4 py-4 sm:px-7 sm:py-5 dark:border-white/8">
		<label class="sr-only" for="document-title">{t('documents.editor.title')}</label>
		<input
			id="document-title"
			data-testid={compact ? 'reader-notes-sidecar-title' : undefined}
			bind:value={title}
			oninput={markDirty}
			maxlength="200"
			placeholder={t('documents.editor.titlePlaceholder')}
			class="w-full rounded-sm border-0 bg-transparent font-serif text-2xl leading-tight font-semibold tracking-tight placeholder:text-stone-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-500 sm:text-3xl dark:placeholder:text-stone-600"
		/>

		<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
			<div
				class="inline-flex rounded-lg bg-stone-100 p-1 dark:bg-white/6"
				role="tablist"
				aria-label={t('documents.editor.markdown')}
			>
				<button
					id="document-visual-tab"
					type="button"
					role="tab"
					aria-selected={mode === 'visual'}
					aria-controls="document-visual-panel"
					tabindex={mode === 'visual' ? 0 : -1}
					class:active={mode === 'visual'}
					class="mode-tab"
					onclick={() => switchMode('visual')}
					onkeydown={onModeTabKeydown}
				>
					{t('documents.editor.visual')}
				</button>
				<button
					id="document-markdown-tab"
					type="button"
					role="tab"
					aria-selected={mode === 'markdown'}
					aria-controls="document-markdown-panel"
					tabindex={mode === 'markdown' ? 0 : -1}
					class:active={mode === 'markdown'}
					class="mode-tab"
					onclick={() => switchMode('markdown')}
					onkeydown={onModeTabKeydown}
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
				data-testid={compact ? 'reader-notes-sidecar-save-status' : undefined}
			>
				{#if saveState === 'saved'}<Icon name="check" class="size-3.5" />{/if}
				{statusText}
			</p>
		</div>
	</header>

	<div
		id="document-visual-panel"
		role="tabpanel"
		aria-labelledby="document-visual-tab"
		hidden={mode !== 'visual'}
	>
		{#if editor}
			<div class="editor-toolbar" role="toolbar" aria-label={t('documents.editor.formatting')}>
				<button
					type="button"
					class:active={editor.isActive('bold')}
					aria-pressed={editor.isActive('bold')}
					onclick={() => editor.chain().focus().toggleBold().run()}
					aria-label={t('documents.editor.bold')}><Icon name="bold" class="size-4" /></button
				>
				<button
					type="button"
					class:active={editor.isActive('italic')}
					aria-pressed={editor.isActive('italic')}
					onclick={() => editor.chain().focus().toggleItalic().run()}
					aria-label={t('documents.editor.italic')}><Icon name="italic" class="size-4" /></button
				>
				<button
					type="button"
					class:active={editor.isActive('strike')}
					aria-pressed={editor.isActive('strike')}
					onclick={() => editor.chain().focus().toggleStrike().run()}
					aria-label={t('documents.editor.strike')}
					><Icon name="strikethrough" class="size-4" /></button
				>
				<span class="toolbar-separator"></span>
				<button
					type="button"
					class:active={editor.isActive('underline')}
					aria-pressed={editor.isActive('underline')}
					aria-label={t('documents.editor.underline')}
					onclick={() => editor.chain().focus().toggleUnderline().run()}
					><Icon name="underline" class="size-4" /></button
				>
				<button
					type="button"
					class:active={editor.isActive('highlight')}
					aria-pressed={editor.isActive('highlight')}
					aria-label={t('documents.editor.highlight')}
					onclick={() => editor.chain().focus().toggleMark('highlight').run()}
					><Icon name="highlight" class="size-4" /></button
				>
				<button
					type="button"
					class:active={editor.isActive('link')}
					aria-expanded={linkEditorOpen}
					aria-label={t('documents.editor.link')}
					onclick={editLink}><Icon name="link" class="size-4" /></button
				>
				<select
					aria-label={t('documents.editor.heading')}
					value={editor.isActive('heading') ? editor.getAttributes('heading').level : 'paragraph'}
					onchange={(event) => {
						const level = headingLevels.find(
							(level) => String(level) === event.currentTarget.value
						);
						if (level) editor.chain().focus().setHeading({ level }).run();
						else editor.chain().focus().setParagraph().run();
					}}
				>
					<option value="paragraph">{t('documents.editor.paragraph')}</option>
					{#each headingLevels as level (level)}<option value={level}
							>{t('documents.editor.heading')} {level}</option
						>{/each}
				</select>
				<button
					type="button"
					class:active={editor.isActive('bulletList')}
					aria-pressed={editor.isActive('bulletList')}
					onclick={() => editor.chain().focus().toggleBulletList().run()}
					aria-label={t('documents.editor.list')}><Icon name="list" class="size-4" /></button
				>
				<button
					type="button"
					class:active={editor.isActive('orderedList')}
					aria-pressed={editor.isActive('orderedList')}
					onclick={() => editor.chain().focus().toggleOrderedList().run()}
					aria-label={t('documents.editor.orderedList')}
					><Icon name="list-ordered" class="size-4" /></button
				>
				<button
					type="button"
					class:active={editor.isActive('blockquote')}
					aria-pressed={editor.isActive('blockquote')}
					onclick={() => editor.chain().focus().toggleBlockquote().run()}
					aria-label={t('documents.editor.quote')}><Icon name="quote" class="size-4" /></button
				>
				<button
					type="button"
					class:active={editor.isActive('code')}
					aria-pressed={editor.isActive('code')}
					onclick={() => editor.chain().focus().toggleCode().run()}
					aria-label={t('documents.editor.code')}><Icon name="code" class="size-4" /></button
				>
				<span class="toolbar-separator"></span>
				<button
					type="button"
					disabled={!editor.can().undo()}
					onclick={() => editor.chain().focus().undo().run()}
					aria-label={t('documents.editor.undo')}><Icon name="undo" class="size-4" /></button
				>
				<button
					type="button"
					disabled={!editor.can().redo()}
					onclick={() => editor.chain().focus().redo().run()}
					aria-label={t('documents.editor.redo')}><Icon name="redo" class="size-4" /></button
				>
			</div>
		{/if}
		{#if linkEditorOpen}
			<form
				class="link-editor"
				onsubmit={(event) => {
					event.preventDefault();
					applyLink();
				}}
			>
				<label
					>{t('documents.editor.linkUrl')}
					<input
						bind:this={linkInput}
						bind:value={linkUrl}
						placeholder="https://… oder /Joh3,16"
						onkeydown={(event) => {
							if (event.key === 'Escape') {
								linkEditorOpen = false;
								editor?.commands.focus();
							}
						}}
					/>
				</label>
				<button type="submit">{t('documents.editor.linkApply')}</button>
				<button
					type="button"
					onclick={() => {
						editor?.chain().focus().extendMarkRange('link').unsetLink().run();
						linkEditorOpen = false;
					}}>{t('documents.editor.linkRemove')}</button
				>
				<button
					type="button"
					onclick={() => {
						linkEditorOpen = false;
						editor?.commands.focus();
					}}>{t('documents.editor.linkCancel')}</button
				>
				{#if linkError}<p role="alert">{t('documents.editor.linkInvalid')}</p>{/if}
			</form>
		{/if}
		<p class="quotation-hint">{t('documents.editor.linkHint')}</p>
		<p
			class="quotation-hint"
			class:error={quotationState === 'error'}
			role="status"
			aria-live="polite"
		>
			{quotationState === 'loading'
				? t('documents.editor.bibleQuoteLoading')
				: quotationState === 'error'
					? t('documents.editor.bibleQuoteError')
					: t('documents.editor.bibleQuoteHint')}
		</p>
		<div
			class="editor-host"
			bind:this={editorHost}
			use:verseHoverPopover={{
				bibleId,
				tooltipId: bibleReferenceTooltipId,
				onInsert: insertBibleQuotation,
				insertLabel: t('documents.editor.insertBibleQuote')
			}}
		></div>
	</div>
	{#if mode === 'markdown'}
		<div
			id="document-markdown-panel"
			class="markdown-editor"
			role="tabpanel"
			aria-labelledby="document-markdown-tab"
		>
			<label class="sr-only" for="document-markdown">{t('documents.editor.markdown')}</label>
			<textarea
				id="document-markdown"
				data-testid={compact ? 'reader-notes-sidecar-body-markdown' : undefined}
				bind:value={markdown}
				oninput={markDirty}
				spellcheck="true"
				class="min-h-[32rem] w-full resize-y rounded-sm bg-transparent font-mono text-[0.9rem] leading-7 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-500"
			></textarea>
			<p class="mt-3 text-xs text-stone-500 dark:text-stone-400">
				{t('documents.editor.markdownHint')}
			</p>
		</div>
	{/if}
</section>

<style>
	.link-editor {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--line);
		font-size: 0.8rem;
	}
	.link-editor label {
		flex: 1;
	}
	.link-editor input {
		display: block;
		width: 100%;
		min-width: 12rem;
		padding: 0.4rem;
		border: 1px solid var(--line);
		border-radius: 0.3rem;
	}
	.link-editor button,
	.editor-toolbar select {
		padding: 0.4rem;
		border: 1px solid var(--line);
		border-radius: 0.3rem;
		font-size: 0.8rem;
	}
	.editor-host :global(.document-prose h4) {
		font-size: 1.1rem;
		font-weight: 700;
	}
	.editor-host :global(.document-prose h5) {
		font-size: 1rem;
		font-weight: 700;
	}
	.editor-host :global(.document-prose h6) {
		font-size: 0.9rem;
		font-weight: 700;
	}
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
	.quotation-hint {
		margin: 0;
		border-bottom: 1px solid var(--line);
		padding: 0.4rem 1rem;
		color: var(--color-stone-500);
		font-size: 0.7rem;
	}
	.quotation-hint.error {
		color: var(--color-red-700);
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
	.editor-host :global(.document-prose:focus-visible) {
		border-radius: 0.2rem;
		outline: 2px solid var(--color-accent-500);
		outline-offset: 0.45rem;
	}
	.editor-host :global(.document-prose > * + *) {
		margin-top: 0.85em;
	}
	.editor-host :global(.document-prose h2) {
		margin-top: 1.9em;
		font-size: 1.55rem;
		font-weight: 700;
	}
	.editor-host :global(.document-prose h1) {
		margin-top: 1.2em;
		font-size: 1.9rem;
		font-weight: 750;
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
	.editor-host :global(.document-prose a),
	.editor-host :global(.document-prose .bible-reference) {
		color: var(--color-accent-700);
		text-decoration: underline;
		text-decoration-thickness: 0.08em;
		text-underline-offset: 0.14em;
		cursor: pointer;
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
	:global(.dark) .editor-host :global(.document-prose a),
	:global(.dark) .editor-host :global(.document-prose .bible-reference) {
		color: var(--color-accent-300);
	}

	.document-editor.compact {
		display: flex;
		height: 100%;
		min-height: 0;
		flex-direction: column;
		border: 0;
		border-radius: 0;
		box-shadow: none;
	}
	.document-editor.compact > header {
		padding: 0.8rem 0.9rem;
	}
	.document-editor.compact > header input {
		font-size: 1.25rem;
	}
	.document-editor.compact > header > div {
		margin-top: 0.65rem;
		gap: 0.5rem;
	}
	.document-editor.compact .mode-tab {
		min-width: 4.5rem;
		padding-inline: 0.5rem;
	}
	.document-editor.compact > [role='tabpanel'] {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
	}
	.document-editor.compact > [role='tabpanel'][hidden] {
		display: none;
	}
	.document-editor.compact .editor-toolbar {
		top: 0;
		padding: 0.4rem 0.6rem;
	}
	.document-editor.compact .editor-host {
		display: flex;
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}
	.document-editor.compact .editor-host :global(.document-prose) {
		width: 100%;
		min-height: 100%;
		flex: 1;
		padding-bottom: 3rem;
		font-size: 0.98rem;
	}
	.document-editor.compact .markdown-editor {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		padding: 0.8rem 1rem 1rem;
	}
	.document-editor.compact .markdown-editor textarea {
		min-height: 0;
		max-height: 100%;
		flex: 1;
		resize: none;
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
