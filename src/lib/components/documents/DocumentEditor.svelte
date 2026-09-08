<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import {
		loadBibleQuotation,
		verseHoverPopover,
		type BibleQuotation
	} from '$lib/actions/verse-hover-popover';
	import { parsePassage } from '$lib/bible/passage';
	import type { VerseRef } from '$lib/bible/reference';
	import {
		documentHtmlToMarkdown,
		documentMarkdownToHtml,
		safeLinkHref
	} from '$lib/notes/document-markdown';
	import { t } from '$lib/i18n';
	import { Editor } from '@tiptap/core';
	import { Placeholder } from '@tiptap/extension-placeholder';
	import { StarterKit } from '@tiptap/starter-kit';
	import { onMount, tick, untrack } from 'svelte';
	import Icon from '../Icon.svelte';
	import { BibleReferenceDecorations } from './bible-reference-decorations';
	import { DocumentHighlight } from './document-highlight';
	import { editorAssistantTrigger, type EditorAssistantTrigger } from './editor-assistant';

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
		onState,
		onOpenDocument,
		onOpenBibleReference
	}: {
		document: Omit<EditableDocument, 'bodyHtml'>;
		bibleId?: string | null;
		/** Fits the same editor and autosave implementation into the Reader's notes column. */
		compact?: boolean;
		onSaved?: (document: EditableDocument) => void;
		onState?: (state: { status: SaveState; revision: number }) => void;
		/** Keeps document mentions inside the Reader sidecar when it supplies its owner-checked opener. */
		onOpenDocument?: (documentId: string) => boolean | Promise<boolean>;
		onOpenBibleReference?: (reference: VerseRef) => Promise<boolean>;
	} = $props();

	type Mode = 'visual' | 'markdown';
	type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

	let editorRoot: HTMLElement | undefined = $state();
	let zen = $state(false);
	let outlineOpen = $state(untrack(() => !compact));
	let sidePanelTab = $state<'outline' | 'links'>('outline');
	let floatingMenu: HTMLElement | undefined = $state();
	let selectionMenuOpen = $state(false);
	let floatingPosition = $state({ left: 8, top: 8 });
	let placementFrame = 0;
	let pointerSelecting = false;
	let selectionDismissed = false;
	let assistantElement: HTMLElement | undefined = $state();
	let assistantMenu = $state<EditorAssistantTrigger | null>(null);
	let assistantPosition = $state({ left: 8, top: 8 });
	let assistantIndex = $state(0);
	let writingArea: HTMLDivElement | undefined = $state();
	let outlinePanelElement: HTMLDivElement | undefined = $state();
	let outlinePanelPosition = $state({ top: 10, maxHeight: 320 });
	let mentionDocuments = $state<MentionDocument[]>([]);
	let mentionState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let mentionRequest: AbortController | undefined;
	let mentionTimer: ReturnType<typeof setTimeout> | undefined;
	let mentionGeneration = 0;
	let relations = $state<DocumentRelations>({ outgoing: [], incoming: [] });
	let relationsState = $state<'loading' | 'ready' | 'error'>('loading');
	let relationsRequest: AbortController | undefined;
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

	type MentionDocument = {
		id: string;
		kind: 'note' | 'sermon';
		title: string;
		updatedAt: string;
	};
	type DocumentRelation = MentionDocument & { deleted: boolean };
	type DocumentRelations = { outgoing: DocumentRelation[]; incoming: DocumentRelation[] };
	type SlashCommandId =
		| 'paragraph'
		| 'heading-1'
		| 'heading-2'
		| 'heading-3'
		| 'bullet-list'
		| 'ordered-list'
		| 'quote'
		| 'code-block'
		| 'divider'
		| 'bible';
	type SlashCommand = {
		id: SlashCommandId;
		label: string;
		description: string;
		keywords: string;
		icon:
			| 'file-text'
			| 'heading'
			| 'list'
			| 'list-ordered'
			| 'quote'
			| 'code'
			| 'more-horizontal'
			| 'book-open';
	};

	const slashCommands = $derived<SlashCommand[]>([
		{
			id: 'paragraph',
			label: t('documents.editor.command.paragraph'),
			description: t('documents.editor.command.paragraphDescription'),
			keywords: 'text absatz normal',
			icon: 'file-text'
		},
		{
			id: 'heading-1',
			label: t('documents.editor.command.heading1'),
			description: t('documents.editor.command.heading1Description'),
			keywords: 'titel überschrift h1',
			icon: 'heading'
		},
		{
			id: 'heading-2',
			label: t('documents.editor.command.heading2'),
			description: t('documents.editor.command.heading2Description'),
			keywords: 'überschrift h2',
			icon: 'heading'
		},
		{
			id: 'heading-3',
			label: t('documents.editor.command.heading3'),
			description: t('documents.editor.command.heading3Description'),
			keywords: 'überschrift h3',
			icon: 'heading'
		},
		{
			id: 'bullet-list',
			label: t('documents.editor.command.bulletList'),
			description: t('documents.editor.command.bulletListDescription'),
			keywords: 'liste aufzählung punkte',
			icon: 'list'
		},
		{
			id: 'ordered-list',
			label: t('documents.editor.command.orderedList'),
			description: t('documents.editor.command.orderedListDescription'),
			keywords: 'liste nummeriert zahlen',
			icon: 'list-ordered'
		},
		{
			id: 'quote',
			label: t('documents.editor.command.quote'),
			description: t('documents.editor.command.quoteDescription'),
			keywords: 'zitat blockquote',
			icon: 'quote'
		},
		{
			id: 'code-block',
			label: t('documents.editor.command.code'),
			description: t('documents.editor.command.codeDescription'),
			keywords: 'code programm',
			icon: 'code'
		},
		{
			id: 'divider',
			label: t('documents.editor.command.divider'),
			description: t('documents.editor.command.dividerDescription'),
			keywords: 'linie trennlinie horizontal',
			icon: 'more-horizontal'
		},
		{
			id: 'bible',
			label: t('documents.editor.command.bible'),
			description: t('documents.editor.command.bibleDescription'),
			keywords: 'bibel bibeltext vers stelle',
			icon: 'book-open'
		}
	]);

	function normalizeAssistantQuery(value: string): string {
		return value
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/gu, '')
			.toLocaleLowerCase('de-DE');
	}

	const visibleSlashCommands = $derived.by(() => {
		if (assistantMenu?.kind !== 'slash') return [];
		const query = normalizeAssistantQuery(assistantMenu.query);
		if (!query) return slashCommands;
		return slashCommands.filter((command) =>
			normalizeAssistantQuery(`${command.label} ${command.keywords}`).includes(query)
		);
	});
	const assistantOptionCount = $derived(
		assistantMenu?.kind === 'slash' ? visibleSlashCommands.length : mentionDocuments.length
	);

	const editor = $derived(editorState.editor);
	// Tiptap mutates one Editor instance. Derive toolbar state from the transaction wrapper,
	// not from Editor identity, so active marks and undo/redo update after every transaction.
	const formatting = $derived.by(() => {
		const current = editorState.editor;
		return {
			active: new Set(
				[
					'bold',
					'italic',
					'strike',
					'underline',
					'highlight',
					'link',
					'heading',
					'bulletList',
					'orderedList',
					'blockquote',
					'code'
				].filter((mark) => current?.isActive(mark))
			),
			heading: current?.isActive('heading') ? current.getAttributes('heading').level : 'paragraph',
			canUndo: current?.can().undo() ?? false,
			canRedo: current?.can().redo() ?? false
		};
	});
	const countText = $derived(documentMarkdownToHtml(markdown).plainText.trim());
	const wordCount = $derived(countText ? countText.split(/\s+/u).length : 0);
	const characterCount = $derived(Array.from(countText).length);
	const headings = $derived.by(() => {
		const result: { position: number; level: number; text: string }[] = [];
		editorState.editor?.state.doc.descendants((node, position) => {
			if (node.type.name === 'heading') {
				result.push({ position, level: node.attrs.level, text: node.textContent });
			}
		});
		return result;
	});
	const activeHeadingPosition = $derived.by(() => {
		const cursor = editorState.editor?.state.selection.from;
		if (cursor === undefined || headings.length === 0) return null;
		let active: number | null = null;
		for (const heading of headings) {
			if (heading.position >= cursor) break;
			active = heading.position;
		}
		return active;
	});

	// Move the existing editor into the browser's top layer; never recreate its history or autosave.
	$effect(() => {
		if (!zen || !editorRoot) return;
		const root = editorRoot;
		const marker = window.document.createComment('document editor');
		root.before(marker);
		const dialog = window.document.createElement('dialog');
		dialog.className = 'document-zen-dialog';
		dialog.setAttribute('aria-label', t('documents.editor.zen'));
		window.document.body.append(dialog);
		const focused = window.document.activeElement as HTMLElement | null;
		const scrollTop = editorHost?.scrollTop ?? 0;
		dialog.append(root);
		const overflow = window.document.body.style.overflow;
		window.document.body.style.overflow = 'hidden';
		dialog.addEventListener('cancel', (event) => {
			event.preventDefault();
			zen = false;
		});
		dialog.showModal();
		focused?.focus({ preventScroll: true });
		if (editorHost) editorHost.scrollTop = scrollTop;
		queuePlacement();
		return () => {
			const focused = window.document.activeElement as HTMLElement | null;
			marker.replaceWith(root);
			dialog.close();
			dialog.remove();
			window.document.body.style.overflow = overflow;
			if (root.contains(focused)) focused?.focus({ preventScroll: true });
		};
	});

	function queuePlacement(): void {
		cancelAnimationFrame(placementFrame);
		placementFrame = requestAnimationFrame(() => {
			void placeFloatingMenu();
			void placeAssistantMenu();
			void placeOutlinePanel();
		});
	}

	async function placeFloatingMenu(): Promise<void> {
		if (!editor || mode !== 'visual') return;
		if (!linkEditorOpen) {
			selectionMenuOpen =
				!assistantMenu &&
				!pointerSelecting &&
				!selectionDismissed &&
				!editor.state.selection.empty &&
				editor.isFocused;
		}
		if (!linkEditorOpen && !selectionMenuOpen) return;
		await tick();
		if (!floatingMenu || !editor || editor.isDestroyed) return;
		const { from, to } = editor.state.selection;
		const start = editor.view.coordsAtPos(from);
		const end = editor.view.coordsAtPos(to);
		const host = editorHost?.getBoundingClientRect();
		const visibleTop = Math.max(8, host?.top ?? 8);
		const visibleBottom = Math.min(window.innerHeight - 8, host?.bottom ?? window.innerHeight - 8);
		if (end.bottom < visibleTop || start.top > visibleBottom) {
			selectionMenuOpen = false;
			linkEditorOpen = false;
			return;
		}
		const box = floatingMenu.getBoundingClientRect();
		const top = Math.max(start.top, visibleTop);
		floatingPosition = {
			left: Math.max(8, Math.min(start.left, window.innerWidth - box.width - 8)),
			top: Math.max(
				8,
				Math.min(
					top - box.height - 8 >= visibleTop
						? top - box.height - 8
						: Math.min(end.bottom, visibleBottom) + 8,
					window.innerHeight - box.height - 8
				)
			)
		};
	}

	async function placeAssistantMenu(): Promise<void> {
		if (!assistantMenu || !editor || mode !== 'visual') return;
		await tick();
		if (!assistantElement || !assistantMenu || editor.isDestroyed) return;
		const caret = editor.view.coordsAtPos(assistantMenu.to);
		const box = assistantElement.getBoundingClientRect();
		const host = editorHost?.getBoundingClientRect();
		const visibleTop = Math.max(8, host?.top ?? 8);
		const visibleBottom = Math.min(window.innerHeight - 8, host?.bottom ?? window.innerHeight - 8);
		assistantPosition = {
			left: Math.max(8, Math.min(caret.left, window.innerWidth - box.width - 8)),
			top:
				caret.bottom + box.height + 8 <= visibleBottom
					? caret.bottom + 6
					: Math.max(visibleTop, caret.top - box.height - 6)
		};
	}

	async function placeOutlinePanel(): Promise<void> {
		if (!outlineOpen) return;
		await tick();
		if (!writingArea || !outlinePanelElement) return;
		const area = writingArea.getBoundingClientRect();
		const stickyHeader = Array.from(window.document.querySelectorAll<HTMLElement>('header')).find(
			(element) => window.getComputedStyle(element).position === 'sticky'
		);
		const visibleTop = Math.max(
			8,
			zen ? 8 : (stickyHeader?.getBoundingClientRect().bottom ?? 0) + 8
		);
		const visibleBottom = Math.min(window.innerHeight - 8, area.bottom - 8);
		const top = Math.max(8, visibleTop - area.top);
		outlinePanelPosition = {
			top,
			maxHeight: Math.max(96, visibleBottom - area.top - top)
		};
	}

	function updateAssistantMenu(current: Editor): void {
		if (
			mode !== 'visual' ||
			!current.isFocused ||
			!current.state.selection.empty ||
			current.isActive('code') ||
			current.isActive('codeBlock')
		) {
			assistantMenu = null;
			return;
		}
		const position = current.state.selection.$from;
		if (!position.parent.isTextblock) {
			assistantMenu = null;
			return;
		}
		const before = position.parent.textBetween(0, position.parentOffset, '\n', '\n');
		const next = editorAssistantTrigger(before, position.start(), position.pos);
		if (next?.kind === 'mention' && current.isActive('link')) {
			assistantMenu = null;
			return;
		}
		const changed =
			next?.kind !== assistantMenu?.kind ||
			next?.from !== assistantMenu?.from ||
			next?.query !== assistantMenu?.query;
		assistantMenu = next;
		if (changed) assistantIndex = 0;
		if (next) {
			selectionMenuOpen = false;
			queuePlacement();
		}
	}

	function onPointerDown(event: PointerEvent): void {
		if (!(event.target instanceof Node)) return;
		if (assistantElement?.contains(event.target)) return;
		if (editorHost?.contains(event.target)) {
			pointerSelecting = true;
			selectionDismissed = false;
			selectionMenuOpen = false;
			linkEditorOpen = false;
		} else if (!floatingMenu?.contains(event.target)) {
			assistantMenu = null;
			selectionDismissed = true;
			selectionMenuOpen = false;
			linkEditorOpen = false;
		}
	}

	function kindLabel(kind: MentionDocument['kind']): string {
		return kind === 'sermon' ? t('documents.kind.sermon') : t('documents.kind.note');
	}

	function runSlashCommand(command: SlashCommand): void {
		if (!editor || assistantMenu?.kind !== 'slash') return;
		const { from, to } = assistantMenu;
		assistantMenu = null;
		const chain = editor.chain().focus().deleteRange({ from, to });
		switch (command.id) {
			case 'paragraph':
				chain.setParagraph().run();
				break;
			case 'heading-1':
			case 'heading-2':
			case 'heading-3':
				chain.setHeading({ level: Number(command.id.at(-1)) as 1 | 2 | 3 }).run();
				break;
			case 'bullet-list':
				chain.toggleBulletList().run();
				break;
			case 'ordered-list':
				chain.toggleOrderedList().run();
				break;
			case 'quote':
				chain.toggleBlockquote().run();
				break;
			case 'code-block':
				chain.toggleCodeBlock().run();
				break;
			case 'divider':
				chain.setHorizontalRule().run();
				break;
			case 'bible':
				chain.insertContent('/bibel ').run();
				break;
		}
	}

	function insertDocumentMention(target: MentionDocument): void {
		if (!editor || assistantMenu?.kind !== 'mention') return;
		const { from, to } = assistantMenu;
		assistantMenu = null;
		editor
			.chain()
			.focus()
			.deleteRange({ from, to })
			.insertContent([
				{
					type: 'text',
					text: target.title,
					marks: [{ type: 'link', attrs: { href: `/notes/${target.id}` } }]
				},
				{ type: 'text', text: ' ' }
			])
			.run();
	}

	function handleAssistantKey(event: KeyboardEvent): boolean {
		if (!assistantMenu) return false;
		if (event.key === 'Escape') {
			event.preventDefault();
			assistantMenu = null;
			return true;
		}
		if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) || assistantOptionCount === 0) {
			return false;
		}
		event.preventDefault();
		if (event.key === 'ArrowDown') {
			assistantIndex = (assistantIndex + 1) % assistantOptionCount;
			return true;
		}
		if (event.key === 'ArrowUp') {
			assistantIndex = (assistantIndex - 1 + assistantOptionCount) % assistantOptionCount;
			return true;
		}
		if (assistantMenu.kind === 'slash') {
			const command = visibleSlashCommands[assistantIndex];
			if (command) runSlashCommand(command);
		} else {
			const target = mentionDocuments[assistantIndex];
			if (target) insertDocumentMention(target);
		}
		return true;
	}

	async function openRelatedDocument(event: MouseEvent, documentId: string): Promise<void> {
		event.preventDefault();
		if (onOpenDocument) {
			await onOpenDocument(documentId);
			return;
		}
		if (await flush()) await goto(`/notes/${documentId}`);
	}

	function onPointerUp(): void {
		pointerSelecting = false;
		queuePlacement();
	}

	function jumpToHeading(position: number): void {
		if (!editor) return;
		editor
			.chain()
			.focus()
			.setTextSelection(position + 1)
			.run();
		const node = editor.view.nodeDOM(position);
		if (node instanceof HTMLElement) node.scrollIntoView({ block: 'start' });
	}

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

	$effect(() => {
		void loadRelations();
		return () => relationsRequest?.abort();
	});

	$effect(() => {
		const trigger = assistantMenu;
		if (trigger?.kind !== 'mention') {
			mentionRequest?.abort();
			if (mentionTimer) clearTimeout(mentionTimer);
			mentionState = 'idle';
			mentionDocuments = [];
			return;
		}

		const query = trigger.query;
		const generation = ++mentionGeneration;
		mentionRequest?.abort();
		const request = new AbortController();
		mentionRequest = request;
		mentionState = 'loading';
		if (mentionTimer) clearTimeout(mentionTimer);
		mentionTimer = setTimeout(
			() => void loadMentionDocuments(query, generation, request),
			query ? 160 : 0
		);
		return () => {
			if (mentionTimer) clearTimeout(mentionTimer);
			mentionRequest?.abort();
		};
	});

	async function loadMentionDocuments(
		query: string,
		generation: number,
		request: AbortController
	): Promise<void> {
		try {
			const url = new URL('/api/documents', window.location.origin);
			if (query) url.searchParams.set('q', query);
			const response = await fetch(url, {
				headers: { accept: 'application/json' },
				signal: request.signal
			});
			const result = (await response.json().catch(() => ({}))) as {
				documents?: MentionDocument[];
			};
			if (generation !== mentionGeneration) return;
			if (!response.ok || !Array.isArray(result.documents)) {
				mentionState = 'error';
				mentionDocuments = [];
				return;
			}
			mentionDocuments = result.documents
				.filter((candidate) => candidate.id !== document.id)
				.slice(0, 8);
			mentionState = 'ready';
			assistantIndex = Math.min(assistantIndex, Math.max(0, mentionDocuments.length - 1));
			queuePlacement();
		} catch (caught) {
			if (
				generation !== mentionGeneration ||
				(caught instanceof DOMException && caught.name === 'AbortError')
			) {
				return;
			}
			mentionState = 'error';
			mentionDocuments = [];
		}
	}

	async function loadRelations(): Promise<void> {
		relationsRequest?.abort();
		const request = new AbortController();
		relationsRequest = request;
		relationsState = 'loading';
		try {
			const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}/links`, {
				headers: { accept: 'application/json' },
				signal: request.signal
			});
			const result = (await response.json().catch(() => ({}))) as Partial<DocumentRelations>;
			if (request !== relationsRequest) return;
			if (!response.ok || !Array.isArray(result.outgoing) || !Array.isArray(result.incoming)) {
				relationsState = 'error';
				return;
			}
			relations = { outgoing: result.outgoing, incoming: result.incoming };
			relationsState = 'ready';
		} catch (caught) {
			if (
				request !== relationsRequest ||
				(caught instanceof DOMException && caught.name === 'AbortError')
			) {
				return;
			}
			relationsState = 'error';
		}
	}

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
				void loadRelations();
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

	/** Reserve the autosave queue for file mutations, including time spent uploading the bytes. */
	export function withRevision(operation: (revision: number) => Promise<number>): Promise<boolean> {
		const run = async () => {
			await persistLatest();
			if (destroyed || saveState !== 'saved') return false;
			revision = await operation(revision);
			// Typing may continue during an upload. Persist that text with the new revision before
			// releasing the queue to another upload, a metadata form or a navigation flush.
			await persistLatest();
			return true;
		};
		const pending = saveQueue.then(run, run);
		saveQueue = pending.then(
			() => undefined,
			() => undefined
		);
		return pending;
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
		selectionMenuOpen = false;
		linkEditorOpen = false;
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
		if (
			(event.ctrlKey || event.metaKey) &&
			event.shiftKey &&
			event.key.toLowerCase() === 'f' &&
			(zen || editorRoot?.contains(event.target as Node))
		) {
			event.preventDefault();
			zen = !zen;
			return;
		}
		if (event.key === 'Escape' && (linkEditorOpen || selectionMenuOpen)) {
			selectionDismissed = true;
			event.preventDefault();
			linkEditorOpen = false;
			selectionMenuOpen = false;
			editor?.commands.focus();
		}

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
		selectionMenuOpen = false;
		queuePlacement();
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
					const plainEnter =
						event.key === 'Enter' &&
						!event.shiftKey &&
						!event.ctrlKey &&
						!event.metaKey &&
						!event.altKey;
					if (plainEnter) {
						const resolvedPosition = view.state.selection.$from;
						if (resolvedPosition.parent.isTextblock) {
							const before = resolvedPosition.parent.textBetween(
								0,
								resolvedPosition.parentOffset,
								'\n',
								'\n'
							);
							const command = /(?:^|\s)\/(?:bibel|stelle)\s+(.+)$/iu.exec(before);
							const reference = command?.[1]?.trim();
							if (command && reference && parsePassage(reference)) {
								event.preventDefault();
								const from =
									resolvedPosition.start() + command.index + (command[0].startsWith(' ') ? 1 : 0);
								view.dispatch(view.state.tr.delete(from, resolvedPosition.pos));
								void insertBibleQuotationFromReference(reference);
								return true;
							}
						}
					}
					return handleAssistantKey(event);
				}
			},
			onCreate: ({ editor }) => {
				editorState = { editor };
				updateAssistantMenu(editor);
			},
			onUpdate: ({ editor }) => {
				editorState = { editor };
				updateFromVisual();
			},
			onSelectionUpdate: () => {
				selectionDismissed = false;
				queuePlacement();
			},
			onTransaction: ({ editor }) => {
				editorState = { editor };
				updateAssistantMenu(editor);
				queuePlacement();
			}
		});
		editorState = { editor: instance };
		window.document.addEventListener('visibilitychange', onVisibilityChange);
		window.document.addEventListener('scroll', queuePlacement, true);

		return () => {
			destroyed = true;
			if (debounceTimer) clearTimeout(debounceTimer);
			window.document.removeEventListener('visibilitychange', onVisibilityChange);
			window.document.removeEventListener('scroll', queuePlacement, true);
			mentionRequest?.abort();
			relationsRequest?.abort();
			if (mentionTimer) clearTimeout(mentionTimer);
			cancelAnimationFrame(placementFrame);
			instance.destroy();
		};
	});
</script>

<svelte:window
	onkeydown={onWindowKeydown}
	onbeforeunload={onBeforeUnload}
	onpointerdown={onPointerDown}
	onpointerup={onPointerUp}
	onresize={queuePlacement}
/>

<section
	class="document-editor overflow-hidden rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] shadow-[var(--shadow-soft)] dark:border-white/8"
	class:compact
	class:zen
	bind:this={editorRoot}
	data-document-editor
	data-bible-id={bibleId ?? undefined}
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

			<div class="editor-view-actions">
				<button
					type="button"
					aria-label={t('documents.editor.sidebar')}
					title={t('documents.editor.sidebar')}
					aria-pressed={outlineOpen}
					onclick={() => (outlineOpen = !outlineOpen)}><Icon name="list" class="size-4" /></button
				>
				<button
					type="button"
					aria-label={zen ? t('documents.editor.exitZen') : t('documents.editor.zen')}
					title={`${t('documents.editor.zen')} · Strg/Cmd+Shift+F`}
					aria-keyshortcuts="Control+Shift+F Meta+Shift+F"
					aria-pressed={zen}
					onclick={() => (zen = !zen)}
					><Icon name={zen ? 'minimize' : 'maximize'} class="size-4" /></button
				>
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
					class:active={formatting.active.has('bold')}
					aria-pressed={formatting.active.has('bold')}
					onclick={() => editor.chain().focus().toggleBold().run()}
					aria-label={t('documents.editor.bold')}><Icon name="bold" class="size-4" /></button
				>
				<button
					type="button"
					class:active={formatting.active.has('italic')}
					aria-pressed={formatting.active.has('italic')}
					onclick={() => editor.chain().focus().toggleItalic().run()}
					aria-label={t('documents.editor.italic')}><Icon name="italic" class="size-4" /></button
				>
				<button
					type="button"
					class:active={formatting.active.has('strike')}
					aria-pressed={formatting.active.has('strike')}
					onclick={() => editor.chain().focus().toggleStrike().run()}
					aria-label={t('documents.editor.strike')}
					><Icon name="strikethrough" class="size-4" /></button
				>
				<span class="toolbar-separator"></span>
				<button
					type="button"
					class:active={formatting.active.has('underline')}
					aria-pressed={formatting.active.has('underline')}
					aria-label={t('documents.editor.underline')}
					onclick={() => editor.chain().focus().toggleUnderline().run()}
					><Icon name="underline" class="size-4" /></button
				>
				<button
					type="button"
					class:active={formatting.active.has('highlight')}
					aria-pressed={formatting.active.has('highlight')}
					aria-label={t('documents.editor.highlight')}
					onclick={() => editor.chain().focus().toggleMark('highlight').run()}
					><Icon name="highlight" class="size-4" /></button
				>
				<button
					type="button"
					class:active={formatting.active.has('link')}
					aria-expanded={linkEditorOpen}
					aria-label={t('documents.editor.link')}
					onclick={editLink}><Icon name="link" class="size-4" /></button
				>
				<select
					aria-label={t('documents.editor.heading')}
					value={formatting.heading}
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
					class:active={formatting.active.has('bulletList')}
					aria-pressed={formatting.active.has('bulletList')}
					onclick={() => editor.chain().focus().toggleBulletList().run()}
					aria-label={t('documents.editor.list')}><Icon name="list" class="size-4" /></button
				>
				<button
					type="button"
					class:active={formatting.active.has('orderedList')}
					aria-pressed={formatting.active.has('orderedList')}
					onclick={() => editor.chain().focus().toggleOrderedList().run()}
					aria-label={t('documents.editor.orderedList')}
					><Icon name="list-ordered" class="size-4" /></button
				>
				<button
					type="button"
					class:active={formatting.active.has('blockquote')}
					aria-pressed={formatting.active.has('blockquote')}
					onclick={() => editor.chain().focus().toggleBlockquote().run()}
					aria-label={t('documents.editor.quote')}><Icon name="quote" class="size-4" /></button
				>
				<button
					type="button"
					class:active={formatting.active.has('code')}
					aria-pressed={formatting.active.has('code')}
					onclick={() => editor.chain().focus().toggleCode().run()}
					aria-label={t('documents.editor.code')}><Icon name="code" class="size-4" /></button
				>
				<span class="toolbar-separator"></span>
				<button
					type="button"
					disabled={!formatting.canUndo}
					onclick={() => editor.chain().focus().undo().run()}
					aria-label={t('documents.editor.undo')}><Icon name="undo" class="size-4" /></button
				>
				<button
					type="button"
					disabled={!formatting.canRedo}
					onclick={() => editor.chain().focus().redo().run()}
					aria-label={t('documents.editor.redo')}><Icon name="redo" class="size-4" /></button
				>
			</div>
		{/if}

		{#if (selectionMenuOpen || linkEditorOpen) && editor}
			<div
				class="floating-menu"
				bind:this={floatingMenu}
				style:left={`${floatingPosition.left}px`}
				style:top={`${floatingPosition.top}px`}
			>
				{#if linkEditorOpen}
					<form
						aria-label={t('documents.editor.link')}
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
										event.preventDefault();
										event.stopPropagation();
										selectionDismissed = true;
										linkEditorOpen = false;
										editor?.commands.focus();
									}
								}}
							/>
						</label>

						{#if safeLinkHref(linkUrl)}
							<a
								href={safeLinkHref(linkUrl)!}
								target="_blank"
								rel="noopener noreferrer"
								class="open-link"
								>{t('documents.editor.openLink')}<Icon name="open-external" class="size-4" /></a
							>
						{/if}
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
				{#if !linkEditorOpen}
					<div
						class="selection-toolbar"
						role="toolbar"
						aria-label={t('documents.editor.selectionFormatting')}
					>
						{#each [{ mark: 'bold', icon: 'bold', label: 'documents.editor.bold' }, { mark: 'italic', icon: 'italic', label: 'documents.editor.italic' }, { mark: 'underline', icon: 'underline', label: 'documents.editor.underline' }, { mark: 'strike', icon: 'strikethrough', label: 'documents.editor.strike' }, { mark: 'highlight', icon: 'highlight', label: 'documents.editor.highlight' }] as const as item (item.mark)}
							<button
								type="button"
								aria-label={t(item.label)}
								aria-pressed={formatting.active.has(item.mark)}
								onpointerdown={(event) => event.preventDefault()}
								onclick={() => editor.chain().focus().toggleMark(item.mark).run()}
								><Icon name={item.icon} class="size-4" /></button
							>
						{/each}
						<button
							type="button"
							aria-label={t('documents.editor.link')}
							onpointerdown={(event) => event.preventDefault()}
							onclick={editLink}><Icon name="link" class="size-4" /></button
						>
					</div>
				{/if}
			</div>
		{/if}
		{#if assistantMenu && editor}
			<div
				class="assistant-menu"
				bind:this={assistantElement}
				style:left={`${assistantPosition.left}px`}
				style:top={`${assistantPosition.top}px`}
				role="listbox"
				aria-label={assistantMenu.kind === 'slash'
					? t('documents.editor.slashCommands')
					: t('documents.editor.ownDocuments')}
			>
				<p class="assistant-heading">
					{assistantMenu.kind === 'slash'
						? t('documents.editor.slashCommands')
						: t('documents.editor.ownDocuments')}
				</p>
				{#if assistantMenu.kind === 'slash'}
					{#each visibleSlashCommands as command, index (command.id)}
						<button
							type="button"
							role="option"
							aria-selected={assistantIndex === index}
							class:selected={assistantIndex === index}
							class="assistant-item"
							onpointerenter={() => (assistantIndex = index)}
							onpointerdown={(event) => event.preventDefault()}
							onclick={() => runSlashCommand(command)}
						>
							<span class="assistant-icon"><Icon name={command.icon} class="size-4" /></span>
							<span><strong>{command.label}</strong><small>{command.description}</small></span>
						</button>
					{:else}
						<p class="assistant-state">{t('documents.editor.commandsEmpty')}</p>
					{/each}
				{:else if mentionState === 'loading'}
					<p class="assistant-state" role="status">{t('documents.editor.mentionsLoading')}</p>
				{:else if mentionState === 'error'}
					<p class="assistant-state" role="alert">{t('documents.editor.mentionsError')}</p>
				{:else}
					{#each mentionDocuments as target, index (target.id)}
						<button
							type="button"
							role="option"
							aria-selected={assistantIndex === index}
							class:selected={assistantIndex === index}
							class="assistant-item"
							onpointerenter={() => (assistantIndex = index)}
							onpointerdown={(event) => event.preventDefault()}
							onclick={() => insertDocumentMention(target)}
						>
							<span class="assistant-icon"><Icon name="file-text" class="size-4" /></span>
							<span><strong>{target.title}</strong><small>{kindLabel(target.kind)}</small></span>
						</button>
					{:else}
						<p class="assistant-state">{t('documents.editor.mentionsEmpty')}</p>
					{/each}
				{/if}
			</div>
		{/if}
		{#if quotationState !== 'idle'}
			<p class="quotation-hint" class:error={quotationState === 'error'} role="status">
				{quotationState === 'loading'
					? t('documents.editor.bibleQuoteLoading')
					: t('documents.editor.bibleQuoteError')}
			</p>
		{/if}
		<div class="editor-writing-area" class:outline-visible={outlineOpen} bind:this={writingArea}>
			<div
				class="editor-host"
				bind:this={editorHost}
				use:verseHoverPopover={{
					bibleId,
					tooltipId: bibleReferenceTooltipId,
					onInsert: insertBibleQuotation,
					onOpen: onOpenBibleReference
						? async (reference) => (await flush()) && (await onOpenBibleReference!(reference))
						: undefined,
					insertLabel: t('documents.editor.insertBibleQuote'),
					openLabel: t('documents.editor.openBibleReference')
				}}
			></div>
			{#if outlineOpen}
				<aside class="document-outline" aria-label={t('documents.editor.sidebar')}>
					<button
						type="button"
						class="outline-rail"
						aria-label={t('documents.editor.sidebar')}
						aria-controls={`document-outline-panel-${document.id}`}
						onpointerenter={queuePlacement}
						onfocus={queuePlacement}
						onclick={() => (sidePanelTab = 'outline')}
					>
						<span class="outline-strokes" aria-hidden="true">
							{#each headings as heading (heading.position)}
								<span
									class:active={heading.position === activeHeadingPosition}
									style:margin-left={`${Math.min(heading.level - 1, 4) * 0.18}rem`}
									style:width={`${Math.max(0.65, 1.45 - (heading.level - 1) * 0.11)}rem`}
								></span>
							{:else}
								<span class="empty"></span>
							{/each}
						</span>
					</button>
					<div
						class="outline-panel"
						id={`document-outline-panel-${document.id}`}
						bind:this={outlinePanelElement}
						style:top={`${outlinePanelPosition.top}px`}
						style:max-height={`${outlinePanelPosition.maxHeight}px`}
					>
						<div class="outline-tabs" role="tablist" aria-label={t('documents.editor.sidebar')}>
							<button
								type="button"
								role="tab"
								aria-selected={sidePanelTab === 'outline'}
								class:active={sidePanelTab === 'outline'}
								onclick={() => (sidePanelTab = 'outline')}>{t('documents.editor.outline')}</button
							>
							<button
								type="button"
								role="tab"
								aria-selected={sidePanelTab === 'links'}
								class:active={sidePanelTab === 'links'}
								onclick={() => (sidePanelTab = 'links')}>{t('documents.editor.links')}</button
							>
						</div>
						{#if sidePanelTab === 'outline'}
							<div class="outline-content" role="tabpanel">
								{#each headings as heading (heading.position)}
									<button
										type="button"
										class:active={heading.position === activeHeadingPosition}
										style:padding-left={`${0.65 + (heading.level - 1) * 0.75}rem`}
										onclick={() => jumpToHeading(heading.position)}
										>{heading.text || t('documents.editor.heading')}</button
									>
								{:else}
									<small>{t('documents.editor.outlineEmpty')}</small>
								{/each}
							</div>
						{:else}
							<div class="relations-content" role="tabpanel">
								{#if relationsState === 'loading'}
									<small role="status">{t('documents.editor.linksLoading')}</small>
								{:else if relationsState === 'error'}
									<small role="alert">{t('documents.editor.linksError')}</small>
								{:else if relations.outgoing.length === 0 && relations.incoming.length === 0}
									<small>{t('documents.editor.linksEmpty')}</small>
								{:else}
									{#if relations.outgoing.length}
										<section class="relations-section">
											<h3>{t('documents.editor.outgoingLinks')}</h3>
											{#each relations.outgoing as relation (relation.id)}
												{#if relation.deleted}
													<span class="relation-link unavailable">
														<strong>{relation.title}</strong>
														<small>{t('documents.editor.linkedDeleted')}</small>
													</span>
												{:else}
													<a
														href={`/notes/${relation.id}`}
														class="relation-link"
														onclick={(event) => openRelatedDocument(event, relation.id)}
													>
														<strong>{relation.title}</strong><small
															>{kindLabel(relation.kind)}</small
														>
													</a>
												{/if}
											{/each}
										</section>
									{/if}
									{#if relations.incoming.length}
										<section class="relations-section">
											<h3>{t('documents.editor.incomingLinks')}</h3>
											{#each relations.incoming as relation (relation.id)}
												<a
													href={`/notes/${relation.id}`}
													class="relation-link"
													onclick={(event) => openRelatedDocument(event, relation.id)}
												>
													<strong>{relation.title}</strong><small>{kindLabel(relation.kind)}</small>
												</a>
											{/each}
										</section>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				</aside>
			{/if}
		</div>
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
	<footer
		class="editor-footer"
		title={t('documents.editor.countHint')}
		data-testid="document-counts"
	>
		<span>{wordCount.toLocaleString('de-DE')} {t('documents.editor.words')}</span>
		<span>{characterCount.toLocaleString('de-DE')} {t('documents.editor.characters')}</span>
	</footer>
</section>

<style>
	.document-editor {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - var(--header-height) - 7rem);
		max-height: calc(100dvh - var(--header-height) - 1rem);
		min-height: 0;
	}
	.document-editor > header,
	.editor-toolbar,
	.editor-footer {
		flex-shrink: 0;
	}
	.document-editor > header {
		padding: 0.8rem 1rem;
	}
	.editor-footer {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		border-top: 1px solid var(--line);
		padding: 0.55rem 1rem;
		font-size: 0.72rem;
		color: var(--color-stone-500);
	}
	.document-editor .document-outline {
		position: absolute;
		inset: 0;
		max-height: none;
		overflow: visible;
		pointer-events: none;
	}
	.document-editor.compact {
		max-height: 100dvh;
	}

	:global(.document-zen-dialog) {
		inset: 0;
		width: 100vw;
		max-width: none;
		height: 100dvh;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: var(--surface);
		color: inherit;
	}
	.document-editor.zen {
		height: 100dvh;
		max-height: 100dvh;
		border: 0;
		border-radius: 0;
		overflow: hidden;
	}
	.document-editor.zen > header {
		position: sticky;
		top: 0;
		z-index: 6;
		background: var(--surface);
	}
	.document-editor.zen .editor-toolbar {
		top: 0;
	}
	.editor-view-actions {
		display: flex;
		gap: 0.25rem;
		margin-left: auto;
	}
	.editor-view-actions button,
	.selection-toolbar button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 0.4rem;
	}
	.editor-view-actions button:hover,
	.selection-toolbar button:hover,
	.selection-toolbar button[aria-pressed='true'] {
		background: var(--surface-raised);
		color: var(--color-accent-600);
	}
	.floating-menu {
		position: fixed;
		z-index: 60;
		max-width: calc(100vw - 1rem);
		border: 1px solid var(--line);
		border-radius: 0.65rem;
		background: var(--surface);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.16);
	}
	.assistant-menu {
		position: fixed;
		z-index: 61;
		width: min(23rem, calc(100vw - 1rem));
		max-height: min(24rem, calc(100dvh - 1rem));
		overflow-y: auto;
		border: 1px solid var(--line);
		border-radius: 0.7rem;
		background: var(--surface);
		padding: 0.35rem;
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
	}
	.assistant-heading {
		padding: 0.45rem 0.55rem 0.3rem;
		color: var(--color-stone-500);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.assistant-item {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.7rem;
		border-radius: 0.5rem;
		padding: 0.55rem;
		text-align: left;
	}
	.assistant-item:hover,
	.assistant-item.selected {
		background: var(--surface-raised);
	}
	.assistant-icon {
		display: inline-flex;
		width: 2rem;
		height: 2rem;
		flex: 0 0 2rem;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--line);
		border-radius: 0.45rem;
		color: var(--color-accent-700);
	}
	.assistant-item strong,
	.assistant-item small {
		display: block;
	}
	.assistant-item strong {
		color: var(--color-stone-800);
		font-size: 0.82rem;
		font-weight: 650;
	}
	.assistant-item small,
	.assistant-state {
		color: var(--color-stone-500);
		font-size: 0.72rem;
	}
	.assistant-state {
		padding: 0.7rem 0.55rem;
	}
	.selection-toolbar {
		display: flex;
		padding: 0.25rem;
	}
	.open-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--color-accent-600);
	}
	.editor-writing-area {
		display: flex;
		min-height: 0;
		position: relative;
	}
	.editor-host {
		flex: 1;
		min-width: 0;
	}
	.editor-writing-area.outline-visible .editor-host {
		padding-right: 3.75rem;
	}
	.document-outline {
		color: var(--color-stone-500);
		font-size: 0.78rem;
	}
	.outline-rail {
		position: absolute;
		z-index: 4;
		top: 0;
		right: 0;
		display: flex;
		width: 3rem;
		height: 100%;
		align-items: flex-start;
		justify-content: center;
		border-left: 1px solid color-mix(in oklab, var(--line) 65%, transparent);
		background: color-mix(in oklab, var(--surface) 92%, transparent);
		padding: 1.6rem 0.45rem;
		pointer-events: auto;
	}
	.outline-strokes {
		display: flex;
		max-height: calc(100% - 1rem);
		width: 100%;
		flex-direction: column;
		align-items: center;
		gap: 0.68rem;
		overflow: hidden;
	}
	.outline-strokes > span {
		display: block;
		height: 2px;
		min-height: 2px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-stone-500) 55%, transparent);
		transition:
			background 120ms ease,
			transform 120ms ease;
	}
	.outline-strokes > span.active {
		background: var(--color-accent-500);
		transform: scaleX(1.08);
	}
	.outline-strokes > span.empty {
		width: 1.15rem;
		opacity: 0.45;
	}
	.outline-panel {
		position: absolute;
		z-index: 5;
		top: 0.65rem;
		right: 0.65rem;
		width: min(22rem, calc(100% - 1.3rem));
		max-height: calc(100% - 1.3rem);
		overflow-y: auto;
		visibility: hidden;
		border: 1px solid color-mix(in oklab, var(--line) 85%, transparent);
		border-radius: 1rem;
		background: color-mix(in oklab, var(--surface) 96%, var(--color-stone-100));
		padding: 0.8rem;
		opacity: 0;
		box-shadow: 0 16px 45px rgb(0 0 0 / 0.2);
		transform: translateX(0.35rem) scale(0.985);
		transform-origin: top right;
		transition:
			opacity 120ms ease,
			transform 120ms ease,
			visibility 120ms;
		pointer-events: none;
	}
	.outline-rail:hover + .outline-panel,
	.outline-panel:hover,
	.document-outline:focus-within .outline-panel {
		visibility: visible;
		opacity: 1;
		transform: translateX(0) scale(1);
		pointer-events: auto;
	}
	.outline-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.2rem;
		margin-bottom: 0.65rem;
		border-radius: 0.45rem;
		background: var(--surface-raised);
		padding: 0.2rem;
	}
	.outline-tabs button {
		border-radius: 0.35rem;
		padding: 0.4rem 0.3rem;
		font-weight: 650;
		text-align: center;
	}
	.outline-tabs button.active {
		background: var(--surface);
		box-shadow: 0 1px 2px rgb(28 25 23 / 0.08);
		color: var(--color-stone-800);
	}
	.outline-content > button {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-left: 1px solid var(--line);
		overflow-wrap: anywhere;
	}
	.outline-content > button:hover {
		color: var(--color-accent-600);
		background: var(--surface-raised);
	}
	.outline-content > button.active {
		border-left-color: var(--color-accent-500);
		border-radius: 0.4rem;
		background: color-mix(in oklab, var(--color-accent-500) 11%, transparent);
		color: var(--color-accent-700);
		font-weight: 650;
	}
	.relations-section + .relations-section {
		margin-top: 1rem;
	}
	.relations-section h3 {
		margin: 0 0 0.35rem;
		color: var(--color-stone-500);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.relation-link {
		display: block;
		border-radius: 0.4rem;
		padding: 0.45rem 0.5rem;
		color: var(--color-stone-700);
		overflow-wrap: anywhere;
	}
	.relation-link:hover {
		background: var(--surface-raised);
		color: var(--color-accent-700);
	}
	.relation-link strong,
	.relation-link small {
		display: block;
	}
	.relation-link strong {
		font-weight: 600;
	}
	.relation-link small {
		margin-top: 0.12rem;
		color: var(--color-stone-500);
		font-size: 0.68rem;
	}
	.relation-link.unavailable {
		opacity: 0.62;
	}
	.editor-host :global(.document-prose > :first-child) {
		margin-top: 0;
	}
	.editor-host :global(.document-prose :is(h1, h2, h3, h4, h5, h6)) {
		scroll-margin-top: 1rem;
	}
	.document-editor .editor-writing-area {
		flex: 1;
		overflow: hidden;
	}
	@media (max-width: 700px) {
		.editor-host {
			padding: 1rem;
		}
		.editor-writing-area.outline-visible .editor-host {
			padding-right: 3.4rem;
		}
		.outline-rail {
			width: 2.7rem;
		}
		.outline-panel {
			top: 0.4rem;
			right: 0.4rem;
			width: calc(100% - 0.8rem);
			max-height: calc(100% - 0.8rem);
		}
	}

	.link-editor {
		width: 23rem;
		max-width: calc(100vw - 1rem);
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
		position: relative;
		top: 0;
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
		padding: 1.25rem 1.5rem 3rem;
	}
	.editor-host :global(.document-prose) {
		min-height: 100%;
		width: 100%;
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
	.editor-host :global(.document-prose a[href^='/notes/']) {
		border-radius: 0.24em;
		background: color-mix(in oklab, var(--color-accent-500) 12%, transparent);
		padding: 0.04em 0.2em;
		font-weight: 600;
		text-decoration: none;
		box-decoration-break: clone;
	}
	.editor-host :global(.document-prose p.is-editor-empty:first-child::before) {
		float: left;
		height: 0;
		color: var(--color-stone-400);
		content: attr(data-placeholder);
		pointer-events: none;
	}
	.markdown-editor {
		padding: 1.25rem 1.5rem 3rem;
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
	:global(.dark) .assistant-item strong,
	:global(.dark) .outline-tabs button.active,
	:global(.dark) .relation-link {
		color: var(--color-stone-100);
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
	.document-editor > [role='tabpanel'] {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
	}
	.document-editor > [role='tabpanel'][hidden] {
		display: none;
	}
	.document-editor.compact .editor-toolbar {
		top: 0;
		padding: 0.4rem 0.6rem;
	}
	.document-editor .editor-host {
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
	.document-editor .markdown-editor {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		padding: 0.8rem 1rem 1rem;
	}
	.document-editor .markdown-editor textarea {
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
