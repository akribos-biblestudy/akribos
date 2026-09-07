<script module lang="ts">
	import type { ReaderDocumentSummary } from '$lib/reader/document-notes';

	export type ReaderNotesContext = {
		reference: string;
		passage: string;
		chapterPassage: string;
		linkGroup: string;
		returnTo: string;
		resource: { id: string; title: string };
		documents: ReaderDocumentSummary[];
	};
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy, tick } from 'svelte';
	import { t } from '$lib/i18n';
	import type { ReaderCreatedDocument } from '$lib/reader/document-notes';
	import Icon from './Icon.svelte';

	let {
		onOpenDocument,
		onDocumentCreated
	}: {
		onOpenDocument?: (id: string) => void | Promise<void>;
		onDocumentCreated?: (document: ReaderCreatedDocument) => void;
	} = $props();

	let open = $state(false);
	let context = $state<ReaderNotesContext | null>(null);
	let closeButton = $state<HTMLButtonElement>();
	let panel = $state<HTMLElement>();
	let overlayRoot = $state<HTMLElement>();
	let opener: HTMLElement | null = null;
	let releaseModal: (() => void) | undefined;
	let createError = $state('');

	const enhanceCreate: SubmitFunction = ({ formData }) => {
		createError = '';
		if (onOpenDocument) formData.set('readerSidecar', '1');
		const passage = context?.passage ?? '';
		const resourceId = String(formData.get('resourceId') ?? '').trim() || null;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				const resultData = result.data as
					| {
							documentId?: unknown;
							documentTitle?: unknown;
							documentKind?: unknown;
							documentSource?: unknown;
					  }
					| undefined;
				if (typeof resultData?.documentId === 'string' && onOpenDocument) {
					const documentId = resultData.documentId;
					onDocumentCreated?.({
						id: documentId,
						title:
							typeof resultData.documentTitle === 'string'
								? resultData.documentTitle
								: 'Neue Notiz',
						kind: 'note',
						source: 'native',
						passage,
						resourceId
					});
					close();
					await onOpenDocument(documentId);
					return;
				}
			}
			if (result.type === 'failure') {
				createError =
					'Die Notiz konnte nicht erstellt werden. Prüfe die Bibelstelle und versuche es erneut.';
			}
			await update({ reset: false });
		};
	};

	function containPageInteraction(): () => void {
		const root = overlayRoot;
		if (!root) return () => undefined;
		const previousOverflow = window.document.body.style.overflow;
		window.document.body.style.overflow = 'hidden';
		const disabled: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = [];
		let branch: HTMLElement = root;

		while (branch.parentElement) {
			const parent = branch.parentElement;
			for (const sibling of parent.children) {
				if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
				disabled.push({
					element: sibling,
					inert: sibling.inert,
					ariaHidden: sibling.getAttribute('aria-hidden')
				});
				sibling.inert = true;
				sibling.setAttribute('aria-hidden', 'true');
			}
			if (parent === window.document.body) break;
			branch = parent;
		}

		return () => {
			window.document.body.style.overflow = previousOverflow;
			for (const { element, inert, ariaHidden } of disabled) {
				element.inert = inert;
				if (ariaHidden === null) element.removeAttribute('aria-hidden');
				else element.setAttribute('aria-hidden', ariaHidden);
			}
		};
	}

	/** Opens the single reader-wide panel for the verse whose indicator or menu was activated. */
	export async function openForVerse(anchor: HTMLElement, next: ReaderNotesContext): Promise<void> {
		opener = anchor;
		context = next;
		createError = '';
		open = true;
		await tick();
		releaseModal ??= containPageInteraction();
		closeButton?.focus();
	}

	function close(): void {
		if (!open) return;
		open = false;
		releaseModal?.();
		releaseModal = undefined;
		const target = opener;
		opener = null;
		target?.focus();
	}

	function onKeydown(event: KeyboardEvent): void {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (!open || event.key !== 'Tab' || !panel) return;

		const focusable = [
			...panel.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		].filter((element) => !element.hidden && element.getClientRects().length > 0);
		const first = focusable[0];
		const last = focusable.at(-1);
		if (!first || !last) {
			event.preventDefault();
			return;
		}
		if (
			event.shiftKey &&
			(document.activeElement === first || !panel.contains(document.activeElement))
		) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function kindLabel(kind: ReaderDocumentSummary['kind']): string {
		if (kind === 'sermon') return t('documents.kind.sermon');
		return t('documents.kind.note');
	}

	function documentUrl(id: string): string {
		if (!context) return `/notes/${encodeURIComponent(id)}`;
		return `/notes/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(context.returnTo)}`;
	}

	function openInSidecar(id: string): void {
		if (!onOpenDocument) return;
		close();
		void onOpenDocument(id);
	}

	onDestroy(() => releaseModal?.());
</script>

<svelte:window onkeydown={onKeydown} />

{#if open && context}
	<div bind:this={overlayRoot}>
		<button
			type="button"
			class="reader-notes-backdrop"
			tabindex="-1"
			aria-label={t('documents.reader.panelClose')}
			onclick={close}
		></button>
		<div
			bind:this={panel}
			class="reader-notes-panel"
			role="dialog"
			aria-modal="true"
			aria-labelledby="reader-notes-panel-title"
			data-testid="reader-notes-panel"
		>
			<header>
				<div>
					<p class="eyebrow">{context.reference}</p>
					<h2 id="reader-notes-panel-title">{t('documents.reader.title')}</h2>
				</div>
				<button
					bind:this={closeButton}
					type="button"
					class="icon-button"
					aria-label={t('documents.reader.panelClose')}
					onclick={close}
				>
					<Icon name="x" class="size-5" />
				</button>
			</header>

			<div class="panel-body">
				{#if context.documents.length > 0}
					<p class="count">{t('documents.reader.count', { count: context.documents.length })}</p>
					<ul class="document-list">
						{#each context.documents as document (document.id)}
							<li>
								{#if onOpenDocument}
									<button
										type="button"
										data-testid="reader-notes-open-document"
										data-document-id={document.id}
										onclick={() => openInSidecar(document.id)}
									>
										<span class="document-icon"><Icon name="file-text" class="size-5" /></span>
										<span class="document-copy">
											<strong>{document.title}</strong>
											<span class="metadata">
												{kindLabel(document.kind)}
												{#if document.translationSpecific}
													<span>· {t('documents.reader.translationSpecific')}</span>
												{/if}
												{#if document.source === 'legacy-verse-comment'}
													<span>· {t('documents.library.sourceLegacy')}</span>
												{/if}
											</span>
										</span>
										<Icon name="pencil" class="size-4 shrink-0" />
									</button>
								{:else}
									<a href={documentUrl(document.id)}>
										<span class="document-icon"><Icon name="file-text" class="size-5" /></span>
										<span class="document-copy">
											<strong>{document.title}</strong>
											<span class="metadata">
												{kindLabel(document.kind)}
												{#if document.translationSpecific}
													<span>· {t('documents.reader.translationSpecific')}</span>
												{/if}
												{#if document.source === 'legacy-verse-comment'}
													<span>· {t('documents.library.sourceLegacy')}</span>
												{/if}
											</span>
										</span>
										<Icon name="open-external" class="size-4 shrink-0" />
									</a>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<form method="POST" action="/notes?/create" class="create-form" use:enhance={enhanceCreate}>
				<input type="hidden" name="kind" value="note" />
				<input type="hidden" name="passage" value={context.passage} />
				<input type="hidden" name="returnTo" value={context.returnTo} />
				<label>
					<span>{t('documents.passages.translation')}</span>
					<select name="resourceId" aria-label={t('documents.passages.translation')}>
						<option value={context.resource.id}>
							{t('documents.passages.translationSpecific', {
								translation: context.resource.title
							})}
						</option>
						<option value="">{t('documents.passages.canonical')}</option>
					</select>
				</label>
				<button type="submit" class="create-button">
					<Icon name="plus" class="size-4" />
					{t('documents.reader.create', { reference: context.reference })}
				</button>
				{#if createError}<p class="create-error" role="alert">{createError}</p>{/if}
			</form>
		</div>
	</div>
{/if}

<style>
	.reader-notes-backdrop {
		position: fixed;
		inset: 0;
		z-index: 70;
		border: 0;
		background: rgb(28 25 23 / 0.34);
		cursor: default;
	}

	.reader-notes-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 71;
		display: flex;
		width: min(27rem, 100vw);
		flex-direction: column;
		border-left: 1px solid var(--line);
		background: var(--surface);
		color: var(--color-stone-900);
		box-shadow: -1rem 0 3rem rgb(28 25 23 / 0.18);
	}

	:global(.dark) .reader-notes-panel {
		color: var(--color-stone-100);
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.15rem 1.2rem;
		border-bottom: 1px solid var(--line);
	}

	h2 {
		margin: 0.12rem 0 0;
		font-family: var(--font-serif);
		font-size: 1.25rem;
		font-weight: 750;
	}

	.eyebrow,
	.count {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.035em;
		color: var(--color-accent-700);
	}

	:global(.dark) .eyebrow,
	:global(.dark) .count {
		color: var(--color-accent-300);
	}

	.icon-button {
		display: inline-flex;
		width: 2.25rem;
		height: 2.25rem;
		flex: 0 0 auto;
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

	.panel-body {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.2rem;
	}

	.count {
		margin-bottom: 0.7rem;
		color: var(--color-stone-500);
	}

	.document-list {
		display: grid;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.document-list :is(a, button) {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.75rem;
		padding: 0.8rem;
		border: 1px solid var(--line);
		border-radius: 0.7rem;
		background: var(--surface);
		color: var(--color-stone-900);
		text-align: left;
		text-decoration: none;
	}

	.document-list :is(a, button):hover,
	.document-list :is(a, button):focus-visible {
		border-color: var(--color-accent-400);
		box-shadow: var(--shadow-soft);
	}

	.document-icon {
		display: inline-flex;
		width: 2.25rem;
		height: 2.25rem;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		border-radius: 0.55rem;
		background: var(--color-accent-50);
		color: var(--color-accent-700);
	}

	:global(.dark) .document-icon {
		background: color-mix(in oklab, var(--color-accent-900) 56%, transparent);
		color: var(--color-accent-300);
	}

	:global(.dark) .document-list :is(a, button) {
		color: var(--color-stone-100);
	}

	.document-copy {
		display: grid;
		min-width: 0;
		flex: 1;
		gap: 0.18rem;
	}

	.document-copy strong {
		overflow: hidden;
		font-size: 0.9rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.metadata {
		display: flex;
		flex-wrap: wrap;
		gap: 0.18rem;
		font-size: 0.7rem;
		color: var(--color-stone-500);
	}

	.create-error {
		margin: 0.5rem 0 0;
		color: var(--color-red-700);
		font-size: 0.75rem;
	}

	:global(.dark) .create-error {
		color: var(--color-red-300);
	}

	.create-form {
		display: grid;
		gap: 0.75rem;
		padding: 1rem 1.2rem max(1rem, env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
		background: var(--surface);
	}

	.create-form label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 650;
		color: var(--color-stone-500);
	}

	.create-form select {
		width: 100%;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--line);
		border-radius: 0.55rem;
		background: var(--surface);
		color: var(--color-stone-900);
		font-size: 0.82rem;
	}

	:global(.dark) .create-form select {
		color: var(--color-stone-100);
	}

	.create-button {
		display: inline-flex;
		min-height: 2.6rem;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		padding: 0.6rem 0.9rem;
		border-radius: 0.6rem;
		background: var(--color-accent-600);
		color: white;
		font-size: 0.82rem;
		font-weight: 700;
	}

	.create-button:hover,
	.create-button:focus-visible {
		background: var(--color-accent-700);
	}

	@media (max-width: 639px) {
		.reader-notes-panel {
			top: auto;
			width: 100%;
			max-height: min(88dvh, 44rem);
			border-top: 1px solid var(--line);
			border-left: 0;
			border-radius: 1rem 1rem 0 0;
			box-shadow: 0 -1rem 3rem rgb(28 25 23 / 0.2);
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.reader-notes-panel {
			animation: panel-in 150ms ease-out;
		}

		@keyframes panel-in {
			from {
				transform: translateX(1rem);
				opacity: 0;
			}
		}

		@media (max-width: 639px) {
			.reader-notes-panel {
				animation-name: sheet-in;
			}

			@keyframes sheet-in {
				from {
					transform: translateY(1rem);
					opacity: 0;
				}
			}
		}
	}
</style>
