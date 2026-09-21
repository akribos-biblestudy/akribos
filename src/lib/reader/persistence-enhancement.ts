import { tick } from 'svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import type { ReaderWorkspaceCapture } from './saved-workspaces';
import {
	WorkspaceSelectionChangedError,
	sameWorkspaceSelection,
	type WorkspacePersistenceData,
	type WorkspacePersistenceToken,
	type WorkspaceWriteLease
} from './persistence';
import { readerActionUrl, readerStateFromPage, type ReaderNotesFilters } from './url-state';

export type ReaderPersistencePage = {
	url: URL;
	data: WorkspacePersistenceData & { workspace?: unknown; readerWorkspaceDetached?: boolean };
	state: {
		readerState?: string;
		readerNotesFilters?: ReaderNotesFilters;
		readerWorkspacePersistence?: WorkspacePersistenceToken;
	};
};

/** SvelteKit captures action and FormData before awaiting the SubmitFunction. */
export function readerMutationEnhancement(
	capture: ReaderWorkspaceCapture,
	getPage: () => ReaderPersistencePage,
	delegate: SubmitFunction
): SubmitFunction {
	return async (input) => {
		const persistence = capture.persistence;
		const expected = persistence.read();
		const workspace = getPage().data.workspace;
		const releaseMutation = await persistence.acquireMutation();
		let lease: WorkspaceWriteLease | undefined;
		let cancelled = false;
		const checkIntent = () => {
			if (
				!input.formElement.isConnected ||
				workspace !== getPage().data.workspace ||
				!sameWorkspaceSelection(expected, persistence.read())
			)
				throw new WorkspaceSelectionChangedError();
		};
		try {
			checkIntent();
			await capture.flush?.();
			checkIntent();
			lease = await persistence.acquireWrite(expected);
			checkIntent();
			const action = [...input.action.searchParams.keys()].find((key) => key.startsWith('/'));
			if (!action) throw new Error('Die Arbeitsbereich-Aktion konnte nicht bestimmt werden.');
			input.action.search = readerActionUrl(
				action.slice(1),
				readerStateFromPage(getPage()),
				lease.token,
				getPage().data.readerWorkspaceDetached
			).slice(1);
			// A scroll flushed above may have changed hidden current/target references.
			await tick();
			checkIntent();
			for (const hidden of input.formElement.querySelectorAll<HTMLInputElement>(
				'input[type="hidden"][name]'
			))
				input.formData.set(hidden.name, hidden.value);
			const callback = await delegate({
				...input,
				cancel: () => {
					cancelled = true;
					input.cancel();
				}
			});
			if (cancelled) {
				lease.release();
				releaseMutation();
				return;
			}
			return async (resultInput) => {
				try {
					const { result } = resultInput;
					if (result.type === 'success' || result.type === 'failure') {
						const outcome = persistence.acceptResponse(result.data, result.status, lease!);
						if (outcome === 'ignored') return;
					} else if (result.type === 'error') {
						throw new Error('Änderungen am Arbeitsbereich konnten nicht gespeichert werden.');
					}
					// Background writes can now complete during the following onNavigate flush.
					lease!.release();
					if (!input.formElement.isConnected || workspace !== getPage().data.workspace) return;
					if (callback) await callback(resultInput);
					else await resultInput.update();
				} catch (error) {
					if (!input.formElement.isConnected || workspace !== getPage().data.workspace) return;
					capture.reportError?.(
						error instanceof Error
							? error.message
							: 'Der Arbeitsbereich konnte nicht gespeichert werden.'
					);
					await resultInput.update({ reset: false, invalidateAll: false });
				} finally {
					lease!.release();
					releaseMutation();
				}
			};
		} catch (error) {
			input.cancel();
			lease?.release();
			releaseMutation();
			capture.reportError?.(
				error instanceof Error
					? error.message
					: 'Der Arbeitsbereich konnte nicht gespeichert werden.'
			);
		}
	};
}
