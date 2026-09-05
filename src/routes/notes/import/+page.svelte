<script lang="ts">
	import BibleReferenceProse from '$lib/components/documents/BibleReferenceProse.svelte';
	import DocumentAreaNav from '$lib/components/documents/DocumentAreaNav.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { t, type MessageKey } from '$lib/i18n';
	import type { ObsidianDocumentPreview } from '$lib/notes/document-markdown';

	let { data, form } = $props();
	type ImportActionResult = {
		error?: string;
		message?: string;
		filename?: string;
		fileErrors?: Array<{ filename: string; message: string }>;
		preview?: ObsidianDocumentPreview;
		previews?: ObsidianDocumentPreview[];
		source?: string;
		sourcePackage?: string;
		canImport?: boolean;
	};
	const importResult = $derived(form as unknown as ImportActionResult | null);
	const importPreviews = $derived(
		importResult?.previews ?? (importResult?.preview ? [importResult.preview] : [])
	);

	function kindLabel(kind: string): string {
		return t(`documents.kind.${kind}` as MessageKey);
	}
</script>

<main class="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 sm:py-10" data-testid="obsidian-import">
	<a
		href="/notes"
		class="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
	>
		<Icon name="chevron-left" class="size-4" />
		{t('documents.editor.back')}
	</a>

	<header class="mt-5">
		<p class="text-xs font-bold tracking-[0.16em] text-accent-700 uppercase dark:text-accent-300">
			Obsidian
		</p>
		<h1 class="mt-1 font-serif text-3xl font-semibold tracking-tight">
			{t('documents.import.title')}
		</h1>
		<p class="mt-2 max-w-2xl text-sm text-stone-500 dark:text-stone-400">
			{t('documents.import.subtitle')}
		</p>
	</header>
	<DocumentAreaNav active="notes" />

	<div class="mt-7 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
		<section
			class="overflow-hidden rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] shadow-[var(--shadow-soft)] dark:border-white/8"
		>
			<form
				method="POST"
				data-tour-target="import-upload"
				action="?/preview"
				enctype="multipart/form-data"
				class="border-b border-stone-200/80 p-5 sm:p-6 dark:border-white/8"
			>
				<label class="block">
					<span class="mb-2 block text-sm font-semibold">{t('documents.import.file')}</span>
					<input
						type="file"
						name="file"
						required
						multiple
						accept=".md,.zip,text/markdown,text/plain,application/zip"
						class="block w-full rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-accent-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-accent-800 hover:border-accent-400 dark:border-stone-700 dark:bg-white/3 dark:file:bg-accent-900/45 dark:file:text-accent-200"
					/>
				</label>
				<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
					<p class="text-xs text-stone-500 dark:text-stone-400">
						{t('documents.import.safe')}
					</p>
					<button
						type="submit"
						class="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-700"
					>
						<Icon name="search" class="size-4" />
						{t('documents.import.preview')}
					</button>
				</div>
			</form>

			{#if form?.error}
				<div
					class="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
					role="alert"
				>
					<p class="font-semibold">{t('documents.import.error')}</p>
					{#if importResult?.fileErrors?.length}
						<ul class="mt-2 space-y-2">
							{#each importResult.fileErrors as issue, index (index)}
								<li><strong class="font-mono">{issue.filename}</strong>: {issue.message}</li>
							{/each}
						</ul>
					{:else if importResult?.filename}
						<p class="mt-1 text-xs">
							Datei: <strong class="font-mono">{importResult.filename}</strong>
						</p>
					{/if}
					{#if form.message && !importResult?.fileErrors?.length}<p class="mt-1 text-xs">
							{form.message}
						</p>{/if}
				</div>
			{/if}

			{#if importPreviews.length > 0}
				<div class="p-5 sm:p-7" data-testid="import-preview">
					<p class="mb-4 text-xs font-semibold text-stone-500">
						{importPreviews.length === 1
							? t('documents.import.previewSingle')
							: t('documents.import.previewCount', { count: importPreviews.length })}
					</p>
					{#each importPreviews as preview, index (`${preview.sourceFilename}-${index}`)}
						<article class="import-preview-document">
							<div class="flex flex-wrap items-center gap-2 text-xs">
								<span
									class="rounded-full bg-accent-50 px-2.5 py-1 font-semibold text-accent-700 dark:bg-accent-900/35 dark:text-accent-300"
								>
									{kindLabel(preview.kind)}
								</span>
								<span class="font-mono text-stone-400">{preview.sourceFilename}</span>
								<span
									class="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-stone-500 dark:bg-white/6 dark:text-stone-400"
								>
									<Icon name="lock" class="size-3" />
									{t('documents.visibility.private')}
								</span>
							</div>
							<h2 class="mt-4 font-serif text-2xl font-semibold">{preview.title}</h2>

							{#if preview.tags.length > 0 || preview.passages.length > 0}
								<div class="mt-3 flex flex-wrap gap-1.5">
									{#each preview.tags as tag (tag)}
										<span class="metadata-chip"><Icon name="tag" class="size-3" />{tag}</span>
									{/each}
									{#each preview.passages as passage (passage.reference + passage.resourceId)}
										<span class="metadata-chip">
											<Icon name="book-open" class="size-3" />
											{passage.reference}{#if passage.resourceId}
												· {passage.resourceId}{/if}
										</span>
									{/each}
								</div>
							{/if}

							{#if preview.warnings.length > 0}
								<section
									class="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
								>
									<h3 class="text-sm font-semibold">{t('documents.import.warnings')}</h3>
									<ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
										{#each preview.warnings as warning, warningIndex (`${warning}-${warningIndex}`)}
											<li>{warning}</li>
										{/each}
									</ul>
								</section>
							{/if}

							<BibleReferenceProse
								html={preview.html}
								bibleId={data.bibles[0]?.id ?? null}
								tooltipId="import-bible-reference-preview"
								class="imported-prose prose-like mt-7 border-t border-stone-200 pt-6 dark:border-white/8"
							/>

							{#if index === importPreviews.length - 1}<form
									method="POST"
									action="?/confirm"
									enctype="multipart/form-data"
									class="mt-8 border-t border-stone-200 pt-5 dark:border-white/8"
								>
									<input type="hidden" name="filename" value={preview.sourceFilename} />
									<textarea class="hidden" name="source" aria-hidden="true"
										>{importResult?.source ?? ''}</textarea
									>
									<textarea class="hidden" name="sourcePackage" aria-hidden="true"
										>{importResult?.sourcePackage ?? ''}</textarea
									>
									<div class="flex flex-wrap items-center justify-between gap-3">
										<p class="max-w-md text-xs text-stone-500 dark:text-stone-400">
											{t('documents.import.safe')}
										</p>
										<button
											type="submit"
											disabled={!importResult?.canImport}
											class="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-45"
										>
											<Icon name="upload" class="size-4" />
											{t('documents.import.confirm')}
										</button>
									</div>
								</form>{/if}
						</article>
					{/each}
				</div>
			{/if}
		</section>

		<aside
			class="rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] p-5 shadow-[var(--shadow-soft)] lg:sticky lg:top-[calc(var(--header-height)+1rem)] dark:border-white/8"
		>
			<h2 class="flex items-center gap-2 text-sm font-semibold">
				<Icon name="info" class="size-4 text-accent-600" />
				{t('documents.import.warnings')}
			</h2>
			<p class="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
				{t('documents.import.limitations')}
			</p>
			<ul
				class="mt-4 list-disc space-y-2 pl-4 text-xs leading-relaxed text-stone-500 dark:text-stone-400"
			>
				{#each data.limitations as limitation (limitation)}
					<li>{limitation}</li>
				{/each}
			</ul>
			<p
				class="mt-4 border-t border-stone-200 pt-4 text-[0.68rem] leading-relaxed text-stone-400 dark:border-white/8"
			>
				{t('documents.import.sizeLimit', {
					bodyMiB: data.maxBodyBytes / 1024 / 1024,
					frontmatterKiB: data.maxFrontmatterBytes / 1024
				})}
				<br />
				{t('documents.import.passageLimit', { maximum: data.maxPassages })}
			</p>
		</aside>
	</div>
</main>

<style>
	.metadata-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		border-radius: 999px;
		background: var(--color-stone-100);
		padding: 0.25rem 0.55rem;
		color: var(--color-stone-600);
		font-size: 0.68rem;
	}
	.import-preview-document + .import-preview-document {
		margin-top: 2rem;
		padding-top: 2rem;
		border-top: 2px solid var(--line);
	}
	:global(.imported-prose > * + *) {
		margin-top: 0.8em;
	}
	:global(.imported-prose h1),
	:global(.imported-prose h2),
	:global(.imported-prose h3) {
		margin-top: 1.5em;
		font-weight: 700;
	}
	:global(.imported-prose ul),
	:global(.imported-prose ol) {
		padding-left: 1.5rem;
	}
	:global(.imported-prose ul) {
		list-style: disc;
	}
	:global(.imported-prose ol) {
		list-style: decimal;
	}
	:global(.dark) .metadata-chip {
		background: color-mix(in oklab, white 7%, transparent);
		color: var(--color-stone-300);
	}
</style>
