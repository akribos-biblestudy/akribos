<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import { Editor } from '@tiptap/core';
	import { Placeholder } from '@tiptap/extension-placeholder';
	import { StarterKit } from '@tiptap/starter-kit';
	import { onMount } from 'svelte';

	/** Shared Tiptap editor for private verse comments, verse-list comments and their replies. */
	let {
		itemId,
		resourceId,
		parentCommentId,
		html = null,
		action = '?/saveNote',
		reference,
		autofocus = false,
		placeholder = t('lists.notePlaceholder'),
		onSaved,
		onCancel
	}: {
		itemId?: string;
		resourceId?: string;
		/** Set when this editor posts a reply rather than a top-level verse-list comment. */
		parentCommentId?: string;
		html?: string | null;
		action?: string;
		reference?: string;
		autofocus?: boolean;
		placeholder?: string;
		onSaved?: (html: string) => void;
		onCancel?: () => void;
	} = $props();

	let form: HTMLFormElement | undefined = $state();
	let editorElement: HTMLDivElement | undefined = $state();
	let editorState = $state<{ editor: Editor | null }>({ editor: null });
	let dirty = $state(false);
	let saved = $state(false);
	let deleting = $state(false);
	let confirmingDelete = $state(false);

	const editor = $derived(editorState.editor);

	onMount(() => {
		if (!editorElement) return;
		const instance = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({
					heading: { levels: [2, 3] },
					codeBlock: false,
					horizontalRule: false
				}),
				Placeholder.configure({ placeholder })
			],
			content: html ?? '',
			editorProps: {
				attributes: {
					class: 'note-editor',
					role: 'textbox',
					'aria-label': t('comments.comment'),
					'aria-multiline': 'true'
				},
				handleKeyDown: (_view, event) => {
					if (event.key === 'Escape') {
						event.preventDefault();
						onCancel?.();
						return true;
					}
					if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
						event.preventDefault();
						form?.requestSubmit();
						return true;
					}
					return false;
				}
			},
			onCreate: ({ editor }) => {
				editorState = { editor };
				if (autofocus) editor.commands.focus('end');
			},
			onUpdate: ({ editor }) => {
				editorState = { editor };
				dirty = true;
			},
			onTransaction: ({ editor }) => (editorState = { editor })
		});
		editorState = { editor: instance };
		return () => instance.destroy();
	});

	function currentHtml(): string {
		return !editor || editor.isEmpty ? '' : editor.getHTML();
	}

	function requestDelete() {
		if (!confirmingDelete) {
			confirmingDelete = true;
			return;
		}
		deleting = true;
		form?.requestSubmit();
	}
</script>

<form
	bind:this={form}
	method="POST"
	{action}
	use:enhance={({ formData }) => {
		formData.set('note', deleting ? '' : currentHtml());

		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type !== 'success') return;
			const next = deleting ? '' : currentHtml();
			onSaved?.(next);
			dirty = false;
			deleting = false;
			confirmingDelete = false;
			saved = true;
			setTimeout(() => (saved = false), 2000);
		};
	}}
>
	{#if itemId}<input type="hidden" name="itemId" value={itemId} />{/if}
	{#if resourceId}<input type="hidden" name="resourceId" value={resourceId} />{/if}
	{#if parentCommentId}<input type="hidden" name="parentCommentId" value={parentCommentId} />{/if}
	{#if reference}<input type="hidden" name="reference" value={reference} />{/if}
	<input type="hidden" name="note" value={html ?? ''} />

	{#if editor}
		<div class="editor-toolbar" role="toolbar" aria-label={t('lists.noteFormatting')}>
			<button
				type="button"
				class:active={editor.isActive('bold')}
				onclick={() => editor.chain().focus().toggleBold().run()}
				aria-label={t('lists.noteBold')}>B</button
			>
			<button
				type="button"
				class:active={editor.isActive('italic')}
				onclick={() => editor.chain().focus().toggleItalic().run()}
				aria-label={t('lists.noteItalic')}><i>I</i></button
			>
			<button
				type="button"
				class:active={editor.isActive('underline')}
				onclick={() => editor.chain().focus().toggleUnderline().run()}
				aria-label={t('lists.noteUnderline')}><u>U</u></button
			>
			<button
				type="button"
				class:active={editor.isActive('strike')}
				onclick={() => editor.chain().focus().toggleStrike().run()}
				aria-label={t('lists.noteStrike')}><s>S</s></button
			>
			<button
				type="button"
				class:active={editor.isActive('heading', { level: 2 })}
				onclick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
				aria-label={t('lists.noteHeading')}>H</button
			>
			<button
				type="button"
				class:active={editor.isActive('bulletList')}
				onclick={() => editor.chain().focus().toggleBulletList().run()}
				aria-label={t('lists.noteList')}>•</button
			>
			<button
				type="button"
				class:active={editor.isActive('orderedList')}
				onclick={() => editor.chain().focus().toggleOrderedList().run()}
				aria-label={t('lists.noteOrderedList')}>1.</button
			>
			<button
				type="button"
				class:active={editor.isActive('blockquote')}
				onclick={() => editor.chain().focus().toggleBlockquote().run()}
				aria-label={t('lists.noteQuote')}>„“</button
			>
			<span class="toolbar-separator"></span>
			<button
				type="button"
				disabled={!editor.can().undo()}
				onclick={() => editor.chain().focus().undo().run()}
				aria-label={t('lists.noteUndo')}>↶</button
			>
			<button
				type="button"
				disabled={!editor.can().redo()}
				onclick={() => editor.chain().focus().redo().run()}
				aria-label={t('lists.noteRedo')}>↷</button
			>
		</div>
	{/if}

	<div class="editor-shell" bind:this={editorElement}></div>

	<div class="editor-actions">
		{#if html}
			<button type="button" class="delete-button" onclick={requestDelete}>
				{confirmingDelete ? t('comments.deleteConfirm') : t('action.delete')}
			</button>
			{#if confirmingDelete}
				<button type="button" class="cancel-delete" onclick={() => (confirmingDelete = false)}>
					{t('action.cancel')}
				</button>
			{/if}
		{/if}
		<span class="action-spacer"></span>
		{#if saved}<span class="saved-state">{t('action.save')} ✓</span>{/if}
		{#if onCancel}
			<button type="button" class="cancel-button" onclick={onCancel}>{t('action.cancel')}</button>
		{/if}
		<button type="submit" class="save-button" disabled={!dirty}>{t('action.save')}</button>
	</div>
</form>

<style>
	.editor-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem;
		margin-bottom: 0.4rem;
	}
	.editor-toolbar button {
		min-width: 1.8rem;
		border-radius: 0.3rem;
		padding: 0.2rem 0.4rem;
		font-size: 0.8rem;
		line-height: 1.2;
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
		height: 1.2rem;
		margin: 0 0.15rem;
		background: var(--color-stone-300);
	}
	.editor-shell :global(.note-editor) {
		min-height: 5.5rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.4rem;
		background: var(--surface);
		padding: 0.55rem 0.7rem;
		font-size: inherit;
		line-height: 1.5;
		outline: none;
	}
	.editor-shell :global(.note-editor:focus) {
		border-color: var(--color-accent-500);
	}
	.editor-shell :global(.note-editor p.is-editor-empty:first-child::before) {
		float: left;
		height: 0;
		color: var(--color-stone-400);
		content: attr(data-placeholder);
		pointer-events: none;
	}
	.editor-shell :global(.note-editor p),
	.editor-shell :global(.note-editor h2),
	.editor-shell :global(.note-editor h3),
	.editor-shell :global(.note-editor blockquote) {
		margin: 0 0 0.5em;
	}
	.editor-shell :global(.note-editor h2) {
		font-size: 1.2em;
		font-weight: 700;
	}
	.editor-shell :global(.note-editor ul),
	.editor-shell :global(.note-editor ol) {
		padding-left: 1.25rem;
	}
	.editor-shell :global(.note-editor ul) {
		list-style: disc;
	}
	.editor-shell :global(.note-editor ol) {
		list-style: decimal;
	}
	.editor-shell :global(.note-editor blockquote) {
		border-left: 3px solid var(--color-stone-300);
		padding-left: 0.7rem;
	}
	.editor-actions {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.45rem;
	}
	.action-spacer {
		flex: 1;
	}
	.editor-actions button {
		border-radius: 0.35rem;
		padding: 0.25rem 0.55rem;
		font-size: 0.75rem;
	}
	.delete-button {
		color: var(--color-red-700);
	}
	.cancel-delete,
	.cancel-button,
	.saved-state {
		color: var(--color-stone-500);
		font-size: 0.75rem;
	}
	.save-button {
		border: 1px solid var(--color-stone-300);
	}
	.save-button:disabled {
		opacity: 0.4;
	}
	:global(.dark) .editor-toolbar button:hover:not(:disabled),
	:global(.dark) .editor-toolbar button.active {
		background: var(--color-stone-800);
		color: var(--color-accent-300);
	}
	:global(.dark) .editor-shell :global(.note-editor) {
		border-color: var(--color-stone-700);
	}
</style>
