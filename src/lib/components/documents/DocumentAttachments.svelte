<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { t } from '$lib/i18n';
	import {
		MAX_ATTACHMENT_BYTES,
		formatAttachmentSize,
		type DocumentAttachmentMetadata
	} from '$lib/notes/attachments';
	let {
		documentId,
		attachments,
		mutate
	}: {
		documentId: string;
		attachments: DocumentAttachmentMetadata[];
		mutate: (operation: (revision: number) => Promise<number>) => Promise<boolean>;
	} = $props();
	let files = $state(untrack(() => attachments));
	let fileInput: HTMLInputElement | undefined = $state();
	let busy = $state(false);
	let message = $state('');
	let failure = $state('');
	let removeId = $state<string | null>(null);
	$effect(() => {
		files = attachments;
		removeId = null;
	});
	const endpoint = $derived(`/api/documents/${documentId}/attachments`);

	async function responseRevision(response: Response): Promise<number> {
		const result = await response.json().catch(() => ({}));
		if (
			!response.ok ||
			!Number.isSafeInteger(result.revision) ||
			!Array.isArray(result.attachments)
		) {
			if (response.status === 409) throw new Error(t('documents.editor.conflict'));
			if (response.status === 413 || result.error === 'fileTooLarge')
				throw new Error(t('documents.attachments.tooLarge'));
			if (result.error === 'attachmentLimit') throw new Error(t('documents.attachments.limit'));
			if (result.error === 'invalidFile') throw new Error(t('documents.attachments.invalid'));
			throw new Error(t('documents.attachments.error'));
		}
		files = result.attachments;
		return result.revision;
	}

	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const selected = Array.from(input.files ?? []);
		if (busy || !selected.length) return;
		busy = true;
		failure = '';
		message = '';
		removeId = null;
		try {
			for (const file of selected) {
				if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(t('documents.attachments.tooLarge'));
				if (!file.size) throw new Error(t('documents.attachments.invalid'));
				message = t('documents.attachments.uploading', { filename: file.name });
				const saved = await mutate(async (revision) => {
					const form = new FormData();
					form.set('revision', String(revision));
					form.set('file', file);
					return responseRevision(await fetch(endpoint, { method: 'POST', body: form }));
				});
				if (!saved) throw new Error(t('documents.attachments.saveFirst'));
			}
			message = t('documents.attachments.uploaded');
		} catch (caught) {
			message = '';
			failure = caught instanceof Error ? caught.message : t('documents.attachments.error');
		} finally {
			busy = false;
			input.value = '';
		}
	}

	async function remove(id: string) {
		if (busy) return;
		busy = true;
		failure = '';
		message = '';
		try {
			const saved = await mutate(async (revision) =>
				responseRevision(
					await fetch(`${endpoint}/${id}?revision=${revision}`, { method: 'DELETE' })
				)
			);
			if (!saved) throw new Error(t('documents.attachments.saveFirst'));
			removeId = null;
			message = t('documents.attachments.removed');
		} catch (caught) {
			failure = caught instanceof Error ? caught.message : t('documents.attachments.error');
		} finally {
			busy = false;
		}
	}
</script>

<section
	class="rounded-2xl border border-stone-200 bg-[color:var(--surface)] p-4 dark:border-stone-700"
	data-testid="document-attachments"
	aria-labelledby="attachments-heading"
>
	<h2 id="attachments-heading" class="flex items-center gap-2 text-sm font-semibold">
		<Icon name="paperclip" class="size-4" />{t('documents.attachments.title')}
		<span class="font-normal text-stone-500">{files.length}</span>
	</h2>
	<p class="mt-2 text-xs text-stone-500 dark:text-stone-400">{t('documents.attachments.hint')}</p>
	{#if files.length}
		<ul class="mt-3 max-h-72 space-y-2 overflow-y-auto">
			{#each files as file (file.id)}
				<li class="rounded-lg border border-stone-200 p-2 dark:border-stone-700">
					<div class="flex items-center gap-2">
						<a
							class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-accent-700 hover:underline dark:text-accent-300"
							href={`${endpoint}/${file.id}`}
							download={file.filename}
							aria-label={t('documents.attachments.download', { filename: file.filename })}
						>
							<Icon name="download" class="size-4 shrink-0" /><span
								class="min-w-0 text-xs font-medium break-all">{file.filename}</span
							>
						</a>
						<button
							type="button"
							class="cursor-pointer rounded p-1 text-stone-500 hover:text-red-600 disabled:opacity-50"
							aria-label={t('documents.attachments.remove', { filename: file.filename })}
							onclick={() => (removeId = file.id)}
							disabled={busy}><Icon name="trash" class="size-4" /></button
						>
					</div>
					<p class="mt-1 text-xs text-stone-500">{formatAttachmentSize(file.sizeBytes)}</p>
					{#if removeId === file.id}
						<div class="mt-2 flex flex-wrap gap-2 text-xs">
							<button
								type="button"
								class="cursor-pointer rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-50 dark:text-red-300"
								disabled={busy}
								onclick={() => remove(file.id)}>{t('documents.attachments.confirmRemove')}</button
							>
							<button
								type="button"
								class="cursor-pointer rounded border border-stone-300 px-2 py-1 disabled:opacity-50 dark:border-stone-600"
								disabled={busy}
								onclick={() => (removeId = null)}>{t('action.cancel')}</button
							>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}<p class="mt-3 text-xs text-stone-500">{t('documents.attachments.empty')}</p>{/if}
	<input
		type="file"
		multiple
		bind:this={fileInput}
		onchange={upload}
		class="sr-only"
		tabindex="-1"
		aria-label={t('documents.attachments.select')}
		disabled={busy}
	/>
	<button
		type="button"
		class="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:hover:bg-stone-800"
		disabled={busy}
		onclick={() => fileInput?.click()}
		><Icon name="plus" class="size-4" />{t('documents.attachments.add')}</button
	>
	<p class="mt-2 text-xs text-stone-500" role="status">{message}</p>
	{#if failure}<p class="mt-2 text-xs text-red-700 dark:text-red-300" role="alert">
			{failure}
		</p>{/if}
</section>
