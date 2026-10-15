import { MAX_DOCUMENT_MARKDOWN_BYTES, MAX_DOCUMENT_TITLE_LENGTH } from '../notes/documents';

export type AppEditorMode = 'edit' | 'read';
export type AppEditorStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
export type AppEditorSource = { title: string; markdown: string; revision: number };
export type AppEditorSnapshot = AppEditorSource & {
	status: AppEditorStatus;
	canUndo?: boolean;
	canRedo?: boolean;
};
export type AppEditorState = { snapshot: AppEditorSnapshot; savedSnapshot: AppEditorSource };
export type AppEditorHandle = {
	flush: () => Promise<boolean>;
	appSnapshot: () => AppEditorState;
	appRestore: (source: AppEditorSource) => void;
	appAcknowledge: (source: AppEditorSource) => void;
	appBlur: () => void;
	appPause: (paused: boolean) => void;
	appCommand: (command: 'undo' | 'redo') => boolean;
	appInsert: (kind: string) => boolean;
};

export function isAppEditorSource(value: unknown): value is AppEditorSource {
	if (!value || typeof value !== 'object') return false;
	const source = value as AppEditorSource;
	return (
		typeof source.title === 'string' &&
		Array.from(source.title).length <= MAX_DOCUMENT_TITLE_LENGTH &&
		typeof source.markdown === 'string' &&
		new TextEncoder().encode(source.markdown).length <= MAX_DOCUMENT_MARKDOWN_BYTES &&
		Number.isSafeInteger(source.revision) &&
		source.revision > 0
	);
}

/** A bounded command vocabulary, never JavaScript/eval supplied by the native host. */
export function createAppEditorBridge(options: {
	documentId: string;
	userId: string;
	instanceId: string;
	editor: () => AppEditorHandle;
	view: (mode: AppEditorMode, locked: boolean) => Promise<void>;
	post: (message: Record<string, unknown>) => void;
}) {
	let initialized = false;
	let mutation = false;
	let paused = false;
	let disposed = false;
	let mode: AppEditorMode = 'edit';
	let queue: Promise<void> = Promise.resolve();
	const post = (message: Record<string, unknown>) => {
		if (!disposed)
			options.post({
				protocol: 1,
				documentId: options.documentId,
				userId: options.userId,
				instanceId: options.instanceId,
				...message
			});
	};
	function requestedMode(value: unknown): AppEditorMode {
		if (value !== 'edit' && value !== 'read') throw new Error('invalidMode');
		return value;
	}
	async function execute(request: Record<string, unknown>) {
		const editor = options.editor();
		switch (request.method) {
			case 'snapshot':
				break;
			case 'restore':
				if (initialized || !isAppEditorSource(request.snapshot)) throw new Error('invalidRestore');
				editor.appRestore(request.snapshot);
				break;
			case 'initialize':
				if (initialized) throw new Error('alreadyInitialized');
				mode = requestedMode(request.mode ?? 'edit');
				initialized = true;
				await options.view(mode, false);
				break;
			case 'setMode':
				if (!initialized || paused) throw new Error('locked');
				mode = requestedMode(request.mode);
				editor.appBlur();
				await options.view(mode, mutation);
				break;
			case 'pause':
				if (!initialized) throw new Error('locked');
				mutation = false;
				paused = true;
				editor.appPause(true);
				editor.appBlur();
				await options.view(mode, true);
				break;
			case 'resume':
				if (!initialized || mutation) throw new Error('locked');
				paused = false;
				editor.appPause(false);
				await options.view(mode, false);
				break;
			case 'undo':
			case 'redo':
				if (!initialized || mutation || paused || mode !== 'edit') throw new Error('locked');
				if (!editor.appCommand(request.method)) throw new Error('unavailable');
				break;
			case 'insert':
				if (!initialized || mutation || paused || mode !== 'edit') throw new Error('locked');
				if (typeof request.kind !== 'string' || !editor.appInsert(request.kind))
					throw new Error('unavailable');
				break;
			case 'blur':
				editor.appBlur();
				break;
			case 'flush':
				if (!initialized || mutation || paused) throw new Error('locked');
				if (!(await editor.flush())) throw new Error('saveFailed');
				break;
			case 'prepareMutation':
				if (!initialized || mutation || paused) throw new Error('locked');
				mutation = true;
				editor.appBlur();
				await options.view(mode, true);
				try {
					if (!(await editor.flush())) throw new Error('saveFailed');
				} catch (caught) {
					mutation = false;
					await options.view(mode, false);
					throw caught;
				}
				break;
			case 'finishMutation': {
				if (!mutation) throw new Error('notPrepared');
				const document = request.document as Record<string, unknown> | undefined;
				const current = editor.appSnapshot().snapshot;
				const source = document
					? { title: document.title, markdown: document.bodyMarkdown, revision: document.revision }
					: { title: current.title, markdown: current.markdown, revision: request.revision };
				if (!isAppEditorSource(source) || source.revision < current.revision)
					throw new Error('invalidRevision');
				if (request.mode !== undefined) mode = requestedMode(request.mode);
				editor.appAcknowledge(source);
				mutation = false;
				await options.view(mode, false);
				break;
			}
			case 'cancelMutation':
				if (!mutation) throw new Error('notPrepared');
				mutation = false;
				await options.view(mode, false);
				break;
			default:
				throw new Error('unknownMethod');
		}
	}
	return {
		receive(value: unknown) {
			if (disposed || !value || typeof value !== 'object') return;
			const request = value as Record<string, unknown>;
			if (
				request.protocol !== 1 ||
				request.documentId !== options.documentId ||
				request.userId !== options.userId ||
				request.instanceId !== options.instanceId ||
				typeof request.id !== 'string' ||
				!request.id.length ||
				request.id.length > 100 ||
				typeof request.method !== 'string'
			)
				return;
			queue = queue
				.catch(() => {})
				.then(async () => {
					if (disposed) return;
					let ok = true;
					let error: string | undefined;
					try {
						await execute(request);
					} catch (caught) {
						ok = false;
						const code = caught instanceof Error ? caught.message : '';
						error = [
							'invalidMode',
							'invalidRestore',
							'alreadyInitialized',
							'locked',
							'saveFailed',
							'notPrepared',
							'invalidRevision',
							'unknownMethod',
							'unavailable'
						].includes(code)
							? code
							: 'operationFailed';
					}
					if (disposed) return;
					let state: AppEditorState | undefined;
					try {
						state = options.editor().appSnapshot();
					} catch {
						ok = false;
						error = 'operationFailed';
					}
					post({
						type: 'response',
						id: request.id,
						method: request.method,
						ok,
						...(error ? { error } : {}),
						...state
					});
				});
			return queue;
		},
		ready() {
			post({ type: 'ready', ...options.editor().appSnapshot() });
		},
		state(state: AppEditorState) {
			if (initialized) post({ type: 'state', ...state });
		},
		navigate(path: string): Promise<boolean> {
			const pending = queue
				.catch(() => {})
				.then(async () => {
					if (!initialized || mutation || paused || disposed) return false;
					mutation = true;
					await options.view(mode, true);
					try {
						if (!(await options.editor().flush()) || disposed) return false;
						options.editor().appBlur();
						post({ type: 'navigate', path, ...options.editor().appSnapshot() });
						return true;
					} finally {
						mutation = false;
						if (!disposed) await options.view(mode, false);
					}
				});
			queue = pending.then(
				() => {},
				() => {}
			);
			return pending;
		},
		dispose() {
			disposed = true;
		}
	};
}
