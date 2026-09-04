<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy, tick } from 'svelte';
	import type { ReaderCreatedDocument } from '$lib/reader/document-notes';
	import type { ReaderNotesContext } from './ReaderNotesPanel.svelte';
	import Icon from './Icon.svelte';
	import DocumentEditor from './documents/DocumentEditor.svelte';

	type SidecarDocument = {
		id: string;
		title: string;
		bodyMarkdown: string;
		bodyHtml: string;
		revision: number;
	};

	let {
		bibleId = null,
		context = null,
		onDocumentCreated,
		onClose
	}: {
		bibleId?: string | null;
		context?: ReaderNotesContext | null;
		onDocumentCreated?: (document: ReaderCreatedDocument) => void;
		onClose: () => void;
	} = $props();

	let activeDocumentId = $state<string | null>(null);
	let loadedDocument = $state<SidecarDocument | null>(null);
	let editor = $state<DocumentEditor>();
	let loadState = $state<'empty' | 'loading' | 'ready' | 'error'>('empty');
	let errorMessage = $state('');
	let requestGeneration = 0;
	let request: AbortController | undefined;
	let createError = $state('');

	const enhanceCreate: SubmitFunction = ({ formData }) => {
		createError = '';
		formData.set('readerSidecar', '1');
		const passage = context?.passage ?? '';
		const resourceId = String(formData.get('resourceId') ?? '').trim() || null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				const resultData = result.data as
					{ documentId?: unknown; documentTitle?: unknown } | undefined;
				if (typeof resultData?.documentId === 'string') {
					if (await openDocument(resultData.documentId)) {
						onDocumentCreated?.({
							id: resultData.documentId,
							title:
								typeof resultData.documentTitle === 'string'
									? resultData.documentTitle
									: 'Neue Notiz',
							kind: 'note',
							source: 'native',
							passage,
							resourceId
						});
					}
					return;
				}
			}
			if (result.type === 'failure') {
				createError =
					'Die Notiz konnte nicht erstellt werden. Prüfe die Angaben und versuche es erneut.';
			}
			await update({ reset: false });
		};
	};

	function loadError(status: number): string {
		if (status === 401) return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';
		if (status === 404) return 'Die Notiz wurde nicht gefunden oder du hast keinen Zugriff.';
		return 'Die Notiz konnte nicht geladen werden. Versuche es erneut.';
	}

	/** Opens an owned working copy without exposing its id in the Reader URL or history state. */
	export async function openDocument(id: string): Promise<boolean> {
		if (id === activeDocumentId && loadedDocument && loadState === 'ready') return true;
		if (loadedDocument && editor && !(await editor.flush())) return false;

		request?.abort();
		const generation = ++requestGeneration;
		request = new AbortController();
		activeDocumentId = id;
		loadedDocument = null;
		loadState = 'loading';
		errorMessage = '';

		try {
			const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
				headers: { accept: 'application/json' },
				signal: request.signal
			});
			const result = (await response.json().catch(() => ({}))) as {
				document?: SidecarDocument;
			};
			if (generation !== requestGeneration) return false;
			if (!response.ok || !result.document) {
				loadState = 'error';
				errorMessage = loadError(response.status);
				return false;
			}

			loadedDocument = result.document;
			loadState = 'ready';
			await tick();
			return true;
		} catch (caught) {
			if (
				generation !== requestGeneration ||
				(caught instanceof DOMException && caught.name === 'AbortError')
			) {
				return false;
			}
			loadState = 'error';
			errorMessage = loadError(0);
			return false;
		}
	}

	export async function flush(): Promise<boolean> {
		return editor ? editor.flush() : true;
	}

	/** Leaves a dirty/conflicted editor visible until its serial autosave can complete safely. */
	export async function requestClose(): Promise<boolean> {
		if (!(await flush())) return false;
		onClose();
		return true;
	}

	export async function showContext(): Promise<boolean> {
		if (!(await flush())) return false;
		request?.abort();
		requestGeneration += 1;
		activeDocumentId = null;
		loadedDocument = null;
		loadState = 'empty';
		errorMessage = '';
		createError = '';
		return true;
	}

	function retry(): void {
		if (activeDocumentId) void openDocument(activeDocumentId);
	}

	onDestroy(() => request?.abort());
</script>

<aside
	class="reader-notes-sidecar"
	aria-label="Notizen im Reader"
	aria-busy={loadState === 'loading'}
	data-testid="reader-notes-sidecar"
>
	<header class="sidecar-header">
		<div class="min-w-0">
			<p>Notizen</p>
			{#if loadedDocument}
				<span title={loadedDocument.title}>{loadedDocument.title}</span>
			{:else}
				<span>Arbeitsbereich neben dem Bibeltext</span>
			{/if}
		</div>
		<div class="header-actions">
			{#if loadedDocument}
				{#if context}
					<button
						type="button"
						class="icon-button"
						aria-label={`Notizen für ${context.reference} anzeigen`}
						title={`Notizen für ${context.reference}`}
						onclick={() => void showContext()}
					>
						<Icon name="list" class="size-4" />
					</button>
				{/if}
				<a
					href={`/notes/${encodeURIComponent(loadedDocument.id)}`}
					class="icon-button"
					aria-label="Im vollständigen Notiz-Editor öffnen"
					title="Im vollständigen Editor öffnen"><Icon name="open-external" class="size-4" /></a
				>
			{/if}
			<button
				type="button"
				class="icon-button"
				aria-label="Notizbereich schließen"
				onclick={() => void requestClose()}
			>
				<Icon name="x" class="size-4" />
			</button>
		</div>
	</header>

	{#if loadState === 'loading'}
		<div class="sidecar-state" role="status">
			<Icon name="file-text" class="size-6" />
			<p>Notiz wird geladen …</p>
		</div>
	{:else if loadState === 'error'}
		<div class="sidecar-state error" role="alert">
			<Icon name="info" class="size-6" />
			<p>{errorMessage}</p>
			<button type="button" onclick={retry}>Erneut versuchen</button>
		</div>
	{:else if loadState === 'ready' && loadedDocument}
		<div class="sidecar-editor" data-testid="reader-notes-sidecar-editor">
			{#key loadedDocument.id}
				<DocumentEditor
					bind:this={editor}
					document={loadedDocument}
					{bibleId}
					compact
					onSaved={(next) => (loadedDocument = next)}
				/>
			{/key}
		</div>
	{:else if context}
		<div class="context-picker" data-testid="reader-notes-sidecar-context">
			<div class="context-heading">
				<span class="empty-icon"><Icon name="file-text" class="size-6" /></span>
				<div>
					<p>Aktueller Bibelvers</p>
					<h2>{context.reference}</h2>
				</div>
			</div>

			{#if context.documents.length > 0}
				<p class="context-count">
					{context.documents.length === 1
						? 'Eine verknüpfte Notiz'
						: `${context.documents.length} verknüpfte Notizen`}
				</p>
				<ul class="context-documents">
					{#each context.documents as document (document.id)}
						<li>
							<button
								type="button"
								data-testid="reader-notes-open-document"
								data-document-id={document.id}
								onclick={() => void openDocument(document.id)}
							>
								<Icon name="file-text" class="size-4" />
								<span>{document.title}</span>
								<Icon name="chevron-right" class="size-4" />
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="context-empty">Für diesen Vers ist noch keine Notiz verknüpft.</p>
			{/if}

			<form
				method="POST"
				action="/notes?/create"
				class="context-create"
				use:enhance={enhanceCreate}
			>
				<input type="hidden" name="kind" value="note" />
				<input type="hidden" name="passage" value={context.passage} />
				<input type="hidden" name="returnTo" value={context.returnTo} />
				<label>
					<span>Übersetzungsbezug</span>
					<select name="resourceId">
						<option value={context.resource.id}>{context.resource.title}</option>
						<option value="">Kanonisch (alle Übersetzungen)</option>
					</select>
				</label>
				<button type="submit" class="create-button" data-testid="reader-notes-sidecar-create">
					<Icon name="plus" class="size-4" />
					Notiz für {context.reference} anlegen
				</button>
				{#if createError}<p class="create-error" role="alert">{createError}</p>{/if}
			</form>
		</div>
	{:else}
		<div class="sidecar-state empty">
			<span class="empty-icon"><Icon name="file-text" class="size-7" /></span>
			<h2>Noch keine Notiz geöffnet</h2>
			<p>
				Öffne die Notizmarkierung an einem Vers, um eine verknüpfte Notiz hier zu bearbeiten oder
				eine neue anzulegen.
			</p>
		</div>
	{/if}
</aside>

<style>
	.reader-notes-sidecar {
		display: flex;
		height: 100%;
		min-width: 0;
		min-height: 0;
		flex-direction: column;
		border-left: 1px solid var(--line);
		background: var(--surface);
		color: var(--color-stone-900);
	}
	:global(.dark) .reader-notes-sidecar {
		color: var(--color-stone-100);
	}
	.sidecar-header {
		display: flex;
		min-height: 3.75rem;
		flex: 0 0 auto;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.8rem 0.65rem 1rem;
		border-bottom: 1px solid var(--line);
	}
	.sidecar-header p {
		margin: 0;
		color: var(--color-accent-700);
		font-size: 0.68rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	:global(.dark) .sidecar-header p {
		color: var(--color-accent-300);
	}
	.sidecar-header span {
		display: block;
		overflow: hidden;
		margin-top: 0.12rem;
		color: var(--color-stone-500);
		font-size: 0.72rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.header-actions {
		display: flex;
		flex: 0 0 auto;
		gap: 0.2rem;
	}
	.icon-button {
		display: inline-flex;
		width: 2.1rem;
		height: 2.1rem;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		color: var(--color-stone-500);
	}
	.icon-button:hover,
	.icon-button:focus-visible {
		background: var(--color-stone-100);
		color: var(--color-stone-900);
	}
	:global(.dark) .icon-button:hover,
	:global(.dark) .icon-button:focus-visible {
		background: rgb(255 255 255 / 0.08);
		color: var(--color-stone-100);
	}
	.sidecar-editor {
		min-height: 0;
		flex: 1;
		overflow: hidden;
	}
	.sidecar-state {
		display: flex;
		min-height: 15rem;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		padding: 2rem;
		color: var(--color-stone-500);
		text-align: center;
	}
	.sidecar-state p,
	.sidecar-state h2 {
		margin: 0;
	}
	.sidecar-state h2 {
		color: var(--color-stone-800);
		font-family: var(--font-serif);
		font-size: 1.15rem;
	}
	:global(.dark) .sidecar-state h2 {
		color: var(--color-stone-100);
	}
	.sidecar-state p {
		max-width: 24rem;
		font-size: 0.82rem;
		line-height: 1.55;
	}
	.sidecar-state button {
		border-radius: 0.5rem;
		background: var(--color-accent-600);
		padding: 0.45rem 0.75rem;
		color: white;
		font-size: 0.78rem;
		font-weight: 700;
	}
	.sidecar-state.error {
		color: var(--color-red-700);
	}
	.context-picker {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		padding: 1.1rem;
	}
	.context-heading {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.context-heading p,
	.context-heading h2,
	.context-count,
	.context-empty,
	.create-error {
		margin: 0;
	}
	.context-heading p {
		color: var(--color-stone-500);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.context-heading h2 {
		font-family: var(--font-serif);
		font-size: 1.15rem;
	}
	.context-count,
	.context-empty {
		margin-top: 1.2rem;
		color: var(--color-stone-500);
		font-size: 0.78rem;
	}
	.context-documents {
		display: grid;
		gap: 0.45rem;
		margin: 0.55rem 0 0;
		padding: 0;
		list-style: none;
	}
	.context-documents button {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.55rem;
		padding: 0.7rem;
		border: 1px solid var(--line);
		border-radius: 0.55rem;
		color: var(--color-stone-800);
		font-size: 0.82rem;
		text-align: left;
	}
	.context-documents button span {
		overflow: hidden;
		min-width: 0;
		flex: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.context-documents button:hover,
	.context-documents button:focus-visible {
		border-color: var(--color-accent-400);
		background: var(--color-accent-50);
	}
	:global(.dark) .context-documents button {
		color: var(--color-stone-100);
	}
	:global(.dark) .context-documents button:hover,
	:global(.dark) .context-documents button:focus-visible {
		background: color-mix(in oklab, var(--color-accent-900) 45%, transparent);
	}
	.context-create {
		display: grid;
		gap: 0.7rem;
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}
	.context-create label {
		display: grid;
		gap: 0.3rem;
		color: var(--color-stone-500);
		font-size: 0.72rem;
		font-weight: 650;
	}
	.context-create select {
		width: 100%;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		background: var(--surface);
		color: inherit;
	}
	.create-button {
		display: inline-flex;
		min-height: 2.55rem;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border-radius: 0.55rem;
		background: var(--color-accent-600);
		color: white;
		font-size: 0.8rem;
		font-weight: 700;
	}
	.create-button:hover,
	.create-button:focus-visible {
		background: var(--color-accent-700);
	}
	.create-error {
		color: var(--color-red-700);
		font-size: 0.75rem;
	}
	:global(.dark) .sidecar-state.error {
		color: var(--color-red-300);
	}
	.empty-icon {
		display: inline-flex;
		width: 3.25rem;
		height: 3.25rem;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: var(--color-accent-50);
		color: var(--color-accent-700);
	}
	:global(.dark) .empty-icon {
		background: color-mix(in oklab, var(--color-accent-900) 52%, transparent);
		color: var(--color-accent-300);
	}
</style>
