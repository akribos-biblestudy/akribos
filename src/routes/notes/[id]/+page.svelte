<script lang="ts">
	import { formatReference } from '$lib/bible/reference';
	import { verseHoverPopover } from '$lib/actions/verse-hover-popover';
	import { SERMON_FORMATS, sermonFormatLabel } from '$lib/notes/documents';
	import { tick, untrack } from 'svelte';
	import DocumentEditor from '$lib/components/documents/DocumentEditor.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { t, type MessageKey } from '$lib/i18n';
	import { formatGermanCalendarDate } from '$lib/notes/calendar-date';

	let { data, form } = $props();

	type EditorSaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
	type EditorHandle = { flush: () => Promise<boolean> };

	let editor: EditorHandle | undefined = $state();
	let workingDocument = $state(untrack(() => data.document));
	let currentRevision = $state(untrack(() => data.document.revision));
	let sermonSaving = $state(false);
	let sermonMessage = $state('');
	let exporting = $state(false);
	const germanDatePattern = '[0-9]{1,2}\\.[0-9]{1,2}\\.[0-9]{4}';

	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
	const publicationIsOutdated = $derived(
		data.publication && data.publication.publicationRevision !== currentRevision
	);

	$effect(() => {
		if (data.document.id !== workingDocument.id) {
			workingDocument = data.document;
			currentRevision = data.document.revision;
			sermonMessage = '';
			return;
		}
		if (data.document.revision > currentRevision) {
			currentRevision = data.document.revision;
			workingDocument = { ...workingDocument, ...data.document };
		}
	});

	function sourceLabel(source: string): string {
		if (source === 'obsidian') return t('documents.details.obsidian');
		if (source === 'legacy-verse-comment') return t('documents.details.legacy');
		return t('documents.details.native');
	}

	function sermonStatusLabel(status: string): string {
		return t(`sermons.status.${status}` as MessageKey);
	}

	function displayedKindLabel(kind: string): string {
		return t(`documents.kind.${kind}` as MessageKey);
	}

	function documentAction(name: string): string {
		const returnTo = data.returnTo ? `&returnTo=${encodeURIComponent(data.returnTo)}` : '';
		return `?/${name}${returnTo}`;
	}

	function backLabel(): string {
		const returnPath = data.returnTo?.split('?')[0];
		if (returnPath === '/sermons') return t('sermons.back');
		return returnPath && returnPath !== '/notes'
			? t('documents.returnToReader')
			: t('documents.editor.back');
	}

	function formErrorMessage(value: unknown): string {
		const error = String(value ?? '');
		if (error === 'invalidCollection') return 'Die Stellensammlung konnte nicht verknüpft werden.';
		if (error === 'conflict') return t('documents.editor.conflict');
		if (error === 'publishedConversion') return t('documents.convert.published');
		if (['tags', 'invalidTag', 'tooManyTags'].includes(error)) return t('documents.tags.error');
		if (
			[
				'passage',
				'invalidResource',
				'duplicatePassage',
				'passageNotFound',
				'tooManyPassages'
			].includes(error)
		) {
			return t('documents.passages.error');
		}
		if (['delivery', 'notSermon'].includes(error)) return t('sermons.deliveries.error');
		if (
			[
				'forbidden',
				'notPublishable',
				'visibility',
				'invalidSlug',
				'private',
				'authorNameRequired',
				'slugConflict'
			].includes(error)
		) {
			return t('documents.publication.error');
		}
		return t('documents.editor.actionError');
	}

	function onEditorSaved(document: {
		id: string;
		title: string;
		bodyMarkdown: string;
		bodyHtml: string;
		revision: number;
	}): void {
		workingDocument = { ...workingDocument, ...document };
		currentRevision = document.revision;
	}

	function onEditorState(state: { status: EditorSaveState; revision: number }): void {
		if (currentRevision !== state.revision) currentRevision = state.revision;
		if (workingDocument.revision !== state.revision) {
			workingDocument = { ...workingDocument, revision: state.revision };
		}
	}

	async function flushBeforeSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const target = event.currentTarget as HTMLFormElement;
		if (!(await editor?.flush())) return;
		await tick();
		// The browser has already run native constraint validation before the submit event. Calling
		// submit() here deliberately avoids dispatching this async handler a second time.
		target.submit();
	}

	async function saveSermonWorkflow(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const target = event.currentTarget as HTMLFormElement;
		const values = new FormData(target);
		if (!(await editor?.flush())) return;
		sermonSaving = true;
		sermonMessage = '';

		try {
			const response = await fetch(`/api/documents/${encodeURIComponent(workingDocument.id)}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify({
					revision: currentRevision,
					title: workingDocument.title,
					markdown: workingDocument.bodyMarkdown,
					sermonStatus: values.get('sermonStatus'),
					sermonDate: values.get('sermonDate') || null,
					sermonSeries: values.get('sermonSeries') || null,
					sermonFormat: values.get('sermonFormat')
				})
			});
			const result = (await response.json().catch(() => ({}))) as {
				document?: typeof data.document;
				error?: string;
			};
			if (!response.ok || !result.document) throw new Error(result.error ?? response.statusText);
			onEditorSaved(result.document);
			sermonMessage = t('documents.editor.saved');
		} catch {
			sermonMessage = t('documents.editor.saveError');
		} finally {
			sermonSaving = false;
		}
	}

	async function downloadExport(event: MouseEvent & { currentTarget: HTMLAnchorElement }) {
		event.preventDefault();
		if (exporting) return;
		const href = event.currentTarget.href;
		exporting = true;
		try {
			if (!(await editor?.flush())) return;
			const link = window.document.createElement('a');
			link.href = href;
			link.download = '';
			window.document.body.append(link);
			link.click();
			link.remove();
		} finally {
			exporting = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-7" data-testid="document-workspace">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
		<a
			href={data.returnTo ?? '/notes'}
			class="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
		>
			<Icon name="chevron-left" class="size-4" />
			{backLabel()}
		</a>
		<div class="flex items-center gap-2">
			<details class="export-menu">
				<summary
					class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 bg-[color:var(--surface-raised)] px-3 py-1.5 text-xs font-semibold shadow-sm hover:border-accent-400 dark:border-white/12"
				>
					<Icon name="download" class="size-3.5" />{t('action.export')}
				</summary>
				<div>
					{#each [['md', 'Markdown'], ['docx', 'Word (.docx)'], ['pdf', 'PDF']] as format (format[0])}
						<a
							href="/notes/{workingDocument.id}/export.{format[0]}"
							download
							data-sveltekit-reload
							onclick={downloadExport}>{format[1]}</a
						>
					{/each}
				</div>
			</details>
			<span
				class="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500 dark:bg-white/6 dark:text-stone-400"
			>
				{displayedKindLabel(workingDocument.kind)}
			</span>
		</div>
	</div>

	{#if form?.error}
		<p
			class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
			role="alert"
		>
			{formErrorMessage(form.error)}
		</p>
	{:else if form?.published}
		<p
			class="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/60 dark:text-green-200"
			role="status"
		>
			{t('documents.editor.saved')}
		</p>
	{/if}

	<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
		{#key workingDocument.id}
			<DocumentEditor
				bind:this={editor}
				document={workingDocument}
				bibleId={data.bibles[0]?.id ?? null}
				onSaved={onEditorSaved}
				onState={onEditorState}
			/>
		{/key}

		<aside
			class="space-y-4 xl:sticky xl:top-[calc(var(--header-height)+1rem)]"
			data-testid="document-details"
		>
			<section class="detail-card">
				<form
					method="POST"
					action={documentAction('changeKind')}
					onsubmit={flushBeforeSubmit}
					class="mb-4"
				>
					<input type="hidden" name="revision" value={currentRevision} />
					<input
						type="hidden"
						name="kind"
						value={workingDocument.kind === 'note' ? 'sermon' : 'note'}
					/>
					<button
						type="submit"
						class="secondary-small disabled:opacity-50"
						disabled={Boolean(data.publication) || sermonSaving}
					>
						{t(
							workingDocument.kind === 'note'
								? 'documents.convert.toSermon'
								: 'documents.convert.toNote'
						)}
					</button>
					<p class="mt-2 text-xs text-stone-500 dark:text-stone-400">
						{t(data.publication ? 'documents.convert.published' : 'documents.convert.hint')}
					</p>
				</form>
				<h2 class="detail-heading">
					<Icon name="info" class="size-4" />
					{t('documents.details.title')}
				</h2>
				<dl class="mt-3 space-y-2 text-xs">
					<div class="flex justify-between gap-3">
						<dt class="text-stone-500 dark:text-stone-400">{t('documents.details.source')}</dt>
						<dd class="text-right font-medium">{sourceLabel(workingDocument.source)}</dd>
					</div>
					{#if workingDocument.sourceFilename}
						<div class="flex justify-between gap-3">
							<dt class="text-stone-500 dark:text-stone-400">{t('documents.import.file')}</dt>
							<dd
								class="max-w-40 truncate text-right font-mono"
								title={workingDocument.sourceFilename}
							>
								{workingDocument.sourceFilename}
							</dd>
						</div>
					{/if}
					<div class="flex justify-between gap-3">
						<dt class="text-stone-500 dark:text-stone-400">
							{t('documents.library.updated', { date: '' }).replace(/\s+$/u, '')}
						</dt>
						<dd class="text-right">{dateFormat.format(new Date(workingDocument.updatedAt))}</dd>
					</div>
				</dl>
			</section>

			{#if workingDocument.kind === 'sermon'}
				<section
					class="detail-card"
					data-testid="preparation-collections"
					use:verseHoverPopover={{ bibleId: data.bibles[0]?.id ?? null }}
				>
					<h2 class="detail-heading"><Icon name="list" class="size-4" />Stellensammlungen</h2>
					<p class="mt-2 text-xs text-stone-500">
						Sammle Bibelstellen für deine Vorbereitung und behalte sie beim Schreiben im Blick.
					</p>
					{#each data.collections as collection (collection.id)}
						<div
							class="mt-3 border-t border-stone-200 pt-3 dark:border-stone-700"
							data-testid="preparation-collection"
						>
							<div class="flex items-center justify-between gap-2">
								<a
									class="text-sm font-semibold text-accent-700 dark:text-accent-300"
									href={`/lists/${collection.id}`}>{collection.title}</a
								>
								<form
									method="POST"
									action={documentAction('collection')}
									onsubmit={flushBeforeSubmit}
								>
									<input type="hidden" name="revision" value={currentRevision} /><input
										type="hidden"
										name="collectionAction"
										value="remove"
									/><input type="hidden" name="listId" value={collection.id} />
									<button
										class="secondary-small"
										aria-label={`${collection.title} lösen`}
										title="Verknüpfung lösen"><Icon name="x" class="size-3.5" /></button
									>
								</form>
							</div>
							<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
								{#each collection.verses as reference (`${reference.book}:${reference.chapter}:${reference.verse}`)}
									<a
										class="verse-ref text-accent-700 dark:text-accent-300"
										href={`/${formatReference(reference)}`}>{formatReference(reference)}</a
									>
								{:else}<span class="text-stone-500"
										>Noch keine Bibelstellen. Öffne die Sammlung, um Stellen hinzuzufügen.</span
									>{/each}
							</div>
						</div>
					{/each}
					<form
						class="mt-4 space-y-2"
						method="POST"
						action={documentAction('collection')}
						onsubmit={flushBeforeSubmit}
					>
						<input type="hidden" name="revision" value={currentRevision} /><input
							type="hidden"
							name="collectionAction"
							value="add"
						/>
						<label class="field-label"
							><span>Vorhandene Stellensammlung</span><select
								class="field-control"
								name="listId"
								required
								><option value="">Sammlung auswählen</option>
								{#each data.availableCollections.filter((candidate) => !data.collections.some((collection) => collection.id === candidate.id)) as candidate (candidate.id)}<option
										value={candidate.id}>{candidate.title}</option
									>{/each}
							</select></label
						>
						<button class="secondary-small">Stellensammlung verknüpfen</button>
					</form>
					<details class="mt-3">
						<summary class="cursor-pointer text-xs font-semibold text-stone-600 dark:text-stone-300"
							>Neue Stellensammlung anlegen</summary
						>
						<form
							class="mt-2 space-y-2"
							method="POST"
							action={documentAction('collection')}
							onsubmit={flushBeforeSubmit}
						>
							<input type="hidden" name="revision" value={currentRevision} /><input
								type="hidden"
								name="collectionAction"
								value="create"
							/>
							<label class="field-label"
								><span>Name der Stellensammlung</span><input
									class="field-control"
									name="title"
									required
									maxlength="200"
								/></label
							>
							<button class="secondary-small">Anlegen und verknüpfen</button>
						</form>
					</details>
				</section>
				<section class="detail-card" data-testid="sermon-workflow">
					<h2 class="detail-heading">
						<Icon name="calendar" class="size-4" />
						{t('sermons.status')}
					</h2>
					<form class="mt-3 space-y-3" onsubmit={saveSermonWorkflow}>
						<label class="field-label"
							><span id="document-format-label">Format</span><select
								aria-labelledby="document-format-label"
								name="sermonFormat"
								class="field-control"
								value={workingDocument.sermonFormat}
							>
								{#each SERMON_FORMATS as format (format)}<option value={format}
										>{sermonFormatLabel(format)}</option
									>{/each}
							</select></label
						>
						<label class="field-label">
							<span>{t('sermons.status')}</span>
							<select
								name="sermonStatus"
								class="field-control"
								value={workingDocument.sermonStatus}
							>
								{#each ['idea', 'research', 'outline', 'ready', 'delivered'] as status (status)}
									<option value={status}>{sermonStatusLabel(status)}</option>
								{/each}
							</select>
						</label>
						<label class="field-label">
							<span>{t('sermons.date')}</span>
							<input
								type="text"
								name="sermonDate"
								class="field-control"
								value={formatGermanCalendarDate(workingDocument.sermonDate)}
								placeholder="TT.MM.JJJJ"
								inputmode="numeric"
								pattern={germanDatePattern}
							/>
						</label>
						<label class="field-label">
							<span>{t('sermons.series')}</span>
							<input
								name="sermonSeries"
								class="field-control"
								value={workingDocument.sermonSeries ?? ''}
								placeholder={t('sermons.seriesPlaceholder')}
							/>
						</label>
						<div class="flex items-center justify-between gap-2">
							<span class="text-xs text-stone-500" role="status">{sermonMessage}</span>
							<button type="submit" class="primary-small" disabled={sermonSaving}>
								{t('sermons.saveWorkflow')}
							</button>
						</div>
					</form>
				</section>

				<section class="detail-card" data-testid="sermon-deliveries">
					<h2 class="detail-heading">
						<Icon name="map-pin" class="size-4" />
						{t('sermons.deliveries.title')}
					</h2>
					<p class="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
						{t('sermons.deliveries.hint')}
					</p>
					{#if data.sermonDeliveries.length > 0}
						<ul class="mt-3 space-y-2">
							{#each data.sermonDeliveries as delivery (delivery.id)}
								<li
									class="flex items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-2 dark:bg-white/4"
								>
									<div class="min-w-0 flex-1 text-xs">
										<p class="font-semibold">{formatGermanCalendarDate(delivery.date)}</p>
										<p class="truncate text-stone-500 dark:text-stone-400">{delivery.location}</p>
									</div>
									<form
										method="POST"
										action={documentAction('removeDelivery')}
										onsubmit={flushBeforeSubmit}
									>
										<input type="hidden" name="revision" value={currentRevision} />
										<input type="hidden" name="deliveryId" value={delivery.id} />
										<button
											type="submit"
											class="icon-button size-7"
											aria-label={t('sermons.deliveries.remove')}
										>
											<Icon name="x" class="size-3.5" />
										</button>
									</form>
								</li>
							{/each}
						</ul>
					{/if}
					<form
						method="POST"
						action={documentAction('addDelivery')}
						class="mt-3 space-y-2"
						onsubmit={flushBeforeSubmit}
					>
						<input type="hidden" name="revision" value={currentRevision} />
						<label class="field-label">
							<span>{t('sermons.deliveries.date')}</span>
							<input
								name="date"
								required
								class="field-control"
								placeholder="TT.MM.JJJJ"
								inputmode="numeric"
								pattern={germanDatePattern}
							/>
						</label>
						<label class="field-label">
							<span>{t('sermons.deliveries.location')}</span>
							<input
								name="location"
								required
								maxlength="200"
								class="field-control"
								placeholder={t('sermons.deliveries.locationPlaceholder')}
							/>
						</label>
						<button type="submit" class="secondary-small"
							><Icon name="plus" class="size-3.5" />{t('sermons.deliveries.add')}</button
						>
					</form>
				</section>
			{/if}

			<section class="detail-card">
				<h2 class="detail-heading">
					<Icon name="tag" class="size-4" />
					{t('documents.tags.title')}
				</h2>
				<form
					method="POST"
					action={documentAction('syncTags')}
					class="mt-3"
					onsubmit={flushBeforeSubmit}
				>
					<input type="hidden" name="revision" value={currentRevision} />
					<label class="field-label">
						<span class="sr-only">{t('documents.tags.title')}</span>
						<input
							name="tags"
							class="field-control"
							value={data.tags.map((tag) => tag.path).join(', ')}
							placeholder={t('documents.tags.placeholder')}
							list="known-document-tags"
						/>
					</label>
					<datalist id="known-document-tags">
						{#each data.tagTree as tag (tag.id)}<option value={tag.path}></option>{/each}
					</datalist>
					<p class="mt-1.5 text-[0.68rem] leading-relaxed text-stone-500 dark:text-stone-400">
						{t('documents.tags.hint')}
					</p>
					<button type="submit" class="secondary-small mt-3">{t('documents.tags.add')}</button>
				</form>
			</section>

			<section class="detail-card">
				<h2 class="detail-heading">
					<Icon name="book-open" class="size-4" />
					{t('documents.passages.title')}
				</h2>
				{#if data.passages.length > 0}
					<ul class="mt-3 space-y-2">
						{#each data.passages as passage (passage.id)}
							<li class="flex items-start gap-2 rounded-lg bg-stone-50 px-2.5 py-2 dark:bg-white/4">
								<div class="min-w-0 flex-1">
									<a
										href="/{encodeURIComponent(passage.reference)}"
										class="text-xs font-semibold text-accent-700 hover:underline dark:text-accent-300"
									>
										{passage.reference}
									</a>
									<p class="mt-0.5 truncate text-[0.65rem] text-stone-500 dark:text-stone-400">
										{passage.resourceId
											? t('documents.passages.translationSpecific', {
													translation:
														data.bibles.find((bible) => bible.id === passage.resourceId)
															?.tabTitle ?? passage.resourceId
												})
											: t('documents.passages.canonical')}
									</p>
								</div>
								<form
									method="POST"
									action={documentAction('removePassage')}
									onsubmit={flushBeforeSubmit}
								>
									<input type="hidden" name="revision" value={currentRevision} />
									<input type="hidden" name="passageId" value={passage.id} />
									<button
										type="submit"
										class="icon-button size-7"
										aria-label={t('documents.passages.remove')}
										title={t('documents.passages.remove')}
									>
										<Icon name="x" class="size-3.5" />
									</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}

				<form
					method="POST"
					action={documentAction('addPassage')}
					class="mt-3 space-y-2"
					onsubmit={flushBeforeSubmit}
				>
					<input type="hidden" name="revision" value={currentRevision} />
					<label class="field-label">
						<span class="sr-only">{t('documents.passages.reference')}</span>
						<input
							name="passage"
							required
							class="field-control"
							placeholder={t('documents.passages.placeholder')}
						/>
					</label>
					<label class="field-label">
						<span class="sr-only">{t('documents.passages.translation')}</span>
						<select name="resourceId" class="field-control">
							<option value="">{t('documents.passages.canonical')}</option>
							{#each data.bibles as bible (bible.id)}
								<option value={bible.id}>{bible.tabTitle ?? bible.abbrev}</option>
							{/each}
						</select>
					</label>
					<button type="submit" class="secondary-small">
						<Icon name="plus" class="size-3.5" />
						{t('documents.passages.add')}
					</button>
				</form>
			</section>

			{#if workingDocument.kind !== 'sermon'}
				<section class="detail-card" data-testid="publication-controls">
					<h2 class="detail-heading">
						<Icon name="globe" class="size-4" />
						{t('documents.publication.title')}
					</h2>
					{#if !data.isAdmin}
						<p class="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
							<Icon name="lock" class="mr-1 inline size-3.5" />
							{t('documents.publication.adminOnly')}
						</p>
					{:else}
						{#if data.publication}
							<div
								class="mt-3 rounded-lg border px-3 py-2.5 text-xs {publicationIsOutdated
									? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100'
									: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-200'}"
							>
								<p class="font-semibold">
									{t('documents.publication.current', {
										date: dateFormat.format(new Date(data.publication.publishedAt))
									})}
								</p>
								<p class="mt-1">
									{publicationIsOutdated
										? t('documents.publication.outdated')
										: t('documents.publication.currentCopy')}
								</p>
								<a
									href="/notes/published/{data.publication.slug}"
									class="mt-2 inline-flex items-center gap-1 font-semibold underline"
								>
									{t('documents.publication.open')}
									<Icon name="open-external" class="size-3" />
								</a>
							</div>
						{/if}

						<form
							method="POST"
							action={documentAction('publish')}
							class="mt-3 space-y-3"
							onsubmit={flushBeforeSubmit}
						>
							<input type="hidden" name="revision" value={currentRevision} />
							<label class="field-label">
								<span>{t('documents.details.visibility')}</span>
								<select
									name="visibility"
									class="field-control"
									value={workingDocument.visibility === 'unlisted' ? 'unlisted' : 'public'}
								>
									<option value="public">{t('documents.visibility.public')}</option>
									<option value="unlisted">{t('documents.visibility.unlisted')}</option>
								</select>
							</label>
							<label class="field-label">
								<span>{t('documents.publication.slug')}</span>
								<input
									name="slug"
									class="field-control font-mono"
									value={data.publication?.slug ?? workingDocument.title}
								/>
							</label>
							<label class="field-label">
								<span>{t('documents.publication.excerpt')}</span>
								<textarea name="excerpt" maxlength="500" rows="3" class="field-control resize-y"
									>{data.publication?.excerpt ?? ''}</textarea
								>
							</label>
							<button type="submit" class="primary-small w-full">
								{data.publication
									? t('documents.publication.update')
									: t('documents.publication.publish')}
							</button>
						</form>
						{#if data.publication}
							<form method="POST" action={documentAction('unpublish')} class="mt-2">
								<button type="submit" class="danger-small w-full">
									{t('documents.publication.unpublish')}
								</button>
							</form>
						{/if}
					{/if}
				</section>
			{/if}

			<section class="detail-card" data-tour-target="document-export">
				<h2 class="detail-heading">
					<Icon name="download" class="size-4" />
					{t('documents.export.title')}
				</h2>
				<p class="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
					{t('documents.export.hint')}
				</p>
				<div class="mt-3 grid grid-cols-3 gap-2">
					{#each [['md', 'Markdown'], ['docx', 'Word'], ['pdf', 'PDF']] as format (format[0])}
						<a
							href="/notes/{workingDocument.id}/export.{format[0]}"
							download
							data-sveltekit-reload
							onclick={downloadExport}
							class="secondary-small">{format[1]}</a
						>
					{/each}
				</div>
			</section>
		</aside>
	</div>
</main>

<style>
	.detail-card {
		border: 1px solid color-mix(in oklab, var(--color-stone-300) 68%, transparent);
		border-radius: 1rem;
		background: var(--surface);
		padding: 1rem;
		box-shadow: var(--shadow-soft);
	}
	.detail-heading {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.78rem;
		font-weight: 750;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-stone-600);
	}
	.field-label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--color-stone-600);
	}
	.field-control {
		width: 100%;
		min-height: 2.25rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.55rem;
		background: var(--surface-raised);
		padding: 0.42rem 0.6rem;
		color: var(--color-stone-900);
		font-size: 0.75rem;
		font-weight: 400;
		outline: none;
	}
	.field-control:focus {
		border-color: var(--color-accent-500);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-accent-500) 12%, transparent);
	}
	.export-menu {
		position: relative;
	}
	.export-menu > div {
		position: absolute;
		right: 0;
		z-index: 20;
		display: grid;
		min-width: 10rem;
		margin-top: 0.35rem;
		padding: 0.35rem;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		background: var(--surface-raised);
		box-shadow: var(--shadow-soft);
	}
	.export-menu a {
		border-radius: 0.4rem;
		padding: 0.45rem 0.6rem;
		font-size: 0.75rem;
		font-weight: 650;
	}
	.export-menu a:hover {
		background: var(--color-stone-100);
	}
	.primary-small,
	.secondary-small,
	.danger-small {
		display: inline-flex;
		min-height: 2rem;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		border-radius: 0.5rem;
		padding: 0.35rem 0.65rem;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.primary-small {
		background: var(--color-accent-600);
		color: white;
	}
	.primary-small:hover {
		background: var(--color-accent-700);
	}
	.secondary-small {
		border: 1px solid var(--color-stone-300);
		background: var(--surface-raised);
	}
	.secondary-small:hover {
		border-color: var(--color-accent-400);
	}
	.danger-small {
		color: var(--color-red-700);
	}
	.danger-small:hover {
		background: var(--color-red-50);
	}
	:global(.dark) .detail-card {
		border-color: color-mix(in oklab, white 8%, transparent);
	}
	:global(.dark) .detail-heading,
	:global(.dark) .field-label {
		color: var(--color-stone-300);
	}
	:global(.dark) .field-control {
		border-color: var(--color-stone-700);
		background: color-mix(in oklab, white 4%, transparent);
		color: var(--color-stone-100);
	}
	:global(.dark) .secondary-small {
		border-color: var(--color-stone-700);
	}
	:global(.dark) .danger-small {
		color: var(--color-red-300);
	}
</style>
