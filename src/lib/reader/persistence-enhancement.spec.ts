import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import { readerMutationEnhancement, type ReaderPersistencePage } from './persistence-enhancement';
import { createWorkspacePersistence, readWorkspacePersistence } from './persistence';
import type { ReaderWorkspaceCapture } from './saved-workspaces';
import { readerStateFromUrl } from './url-state';

vi.mock('svelte', () => ({ tick: vi.fn(async () => {}) }));

type SubmitInput = Parameters<SubmitFunction>[0];
type ResultCallback = Exclude<Awaited<ReturnType<SubmitFunction>>, void>;
type ResultInput = Parameters<ResultCallback>[0];

const originalState = 'layout=single&tab=1.1:SEEDDE:A:Joh1&active=1.1&focus=1';
const latestState = 'layout=single&tab=1.1:SEEDDE:A:Joh2,4&active=1.1&focus=1&search=1.1:Liebe';

/** Only the DOM operations used by the enhancement are modeled; FormData itself is native. */
class FakeFormElement {
	isConnected = true;
	hidden: Record<string, string> = {
		tileId: 'url-tile-1',
		tabId: 'url-tab-1-1',
		currentReference: 'Joh1',
		targetReference: 'Joh1'
	};

	querySelectorAll() {
		return Object.entries(this.hidden).map(([name, value]) => ({ name, value }));
	}
}

function submission() {
	const form = new FakeFormElement();
	const formData = new FormData();
	for (const [name, value] of Object.entries(form.hidden)) formData.set(name, value);
	formData.set('reference', 'Joh3,16');
	const cancel = vi.fn();
	const input: SubmitInput = {
		action: new URL(
			`https://akribos.test/Joh1?${originalState}&workspaceId=workspace-a&workspaceVersion=2&workspaceContentVersion=10&/setTabReference`
		),
		formData,
		formElement: form as unknown as HTMLFormElement,
		controller: new AbortController(),
		submitter: null,
		cancel
	};
	return { input, form, cancel };
}

function response(input: SubmitInput, contentVersion = 11): ResultInput {
	return {
		action: input.action,
		formData: input.formData,
		formElement: input.formElement,
		result: {
			type: 'success',
			status: 200,
			data: {
				saved: true,
				activeSavedWorkspaceId: 'workspace-a',
				activeSavedWorkspaceVersion: 2,
				activeSavedWorkspaceContentVersion: contentVersion,
				readerState: latestState,
				path: '/Joh2,4'
			}
		},
		update: vi.fn(async () => {})
	};
}

function setup() {
	const page: ReaderPersistencePage = {
		url: new URL(`https://akribos.test/Joh1?${originalState}`),
		data: {
			workspace: { layout: 'single' },
			activeSavedWorkspaceId: 'workspace-a',
			activeSavedWorkspaceVersion: 2,
			activeSavedWorkspaceContentVersion: 10,
			readerWorkspaceDetached: false
		},
		state: { readerState: originalState }
	};
	const persistence = createWorkspacePersistence(
		() => readWorkspacePersistence(page.data, page.state.readerWorkspacePersistence),
		(token) => {
			page.state.readerWorkspacePersistence = token;
		}
	);
	const flush = vi.fn<NonNullable<ReaderWorkspaceCapture['flush']>>(async () => {});
	const reportError = vi.fn();
	const capture: ReaderWorkspaceCapture = { capture: null, persistence, flush, reportError };
	const onResult = vi.fn<ResultCallback>(async () => {});
	const delegate = vi.fn<SubmitFunction>(() => onResult);
	const submit = readerMutationEnhancement(capture, () => page, delegate);
	return { page, persistence, flush, reportError, onResult, delegate, submit };
}

async function start(submit: SubmitFunction, input: SubmitInput): Promise<ResultCallback> {
	const callback = await submit(input);
	if (!callback) throw new Error('Expected the form to proceed to the network request.');
	return callback;
}

beforeEach(() => {
	vi.mocked(tick).mockReset().mockResolvedValue(undefined);
});

describe('reader mutation enhancement', () => {
	it('refreshes the already captured action and FormData after flushing the latest acknowledgement', async () => {
		const { page, persistence, flush, delegate, submit } = setup();
		const { input, form } = submission();
		const capturedAction = input.action;
		const capturedFormData = input.formData;
		const flushStarted = Promise.withResolvers<void>();
		const flushReleased = Promise.withResolvers<void>();
		flush.mockImplementationOnce(async () => {
			flushStarted.resolve();
			await flushReleased.promise;
			page.state.readerWorkspacePersistence = {
				workspaceId: 'workspace-a',
				workspaceVersion: 2,
				workspaceContentVersion: 11
			};
			page.state.readerState = latestState;
			page.data.readerWorkspaceDetached = true;
		});
		vi.mocked(tick).mockImplementationOnce(async () => {
			form.hidden.currentReference = 'Joh2,4';
			form.hidden.targetReference = 'Joh2,4';
		});
		const pending = start(submit, input);
		await flushStarted.promise;
		expect(delegate).not.toHaveBeenCalled();
		expect(capturedAction.searchParams.get('workspaceContentVersion')).toBe('10');
		expect(capturedFormData.get('currentReference')).toBe('Joh1');
		flushReleased.resolve();
		const callback = await pending;

		expect(input.action).toBe(capturedAction);
		expect(input.formData).toBe(capturedFormData);
		expect(capturedAction.searchParams.get('workspaceId')).toBe('workspace-a');
		expect(capturedAction.searchParams.get('workspaceVersion')).toBe('2');
		expect(capturedAction.searchParams.get('workspaceContentVersion')).toBe('11');
		expect(capturedAction.searchParams.get('workspaceDetached')).toBe('true');
		expect(capturedAction.searchParams.has('/setTabReference')).toBe(true);
		expect(readerStateFromUrl(capturedAction)).toBe(latestState);
		expect(capturedFormData.get('currentReference')).toBe('Joh2,4');
		expect(capturedFormData.get('targetReference')).toBe('Joh2,4');
		expect(capturedFormData.get('reference')).toBe('Joh3,16');
		expect(delegate.mock.calls[0]![0].action).toBe(capturedAction);
		expect(delegate.mock.calls[0]![0].formData).toBe(capturedFormData);
		expect(persistence.read()?.workspaceContentVersion).toBe(11);
		await callback(response(input, 12));
	});

	it('acknowledges the response and releases the network lease before the delegate can navigate', async () => {
		const { persistence, onResult, submit } = setup();
		const { input } = submission();
		const callback = await start(submit, input);
		const observed: number[] = [];
		onResult.mockImplementationOnce(async () => {
			observed.push(persistence.read()!.workspaceContentVersion);
			// Navigation can flush another background write while still holding the UI lease.
			const background = await persistence.acquireWrite();
			observed.push(background.token!.workspaceContentVersion);
			background.release();
		});
		await callback(response(input));
		expect(observed).toEqual([11, 11]);
		expect(onResult).toHaveBeenCalledOnce();
	});

	it.each(['disconnected form', 'different workspace object'])(
		'does not navigate on a delayed successful response after %s',
		async (change) => {
			const { page, onResult, submit } = setup();
			const { input, form } = submission();
			const callback = await start(submit, input);
			if (change === 'disconnected form') form.isConnected = false;
			else page.data.workspace = { layout: 'columns-2' };
			const result = response(input);
			await callback(result);
			expect(onResult).not.toHaveBeenCalled();
			expect(result.update).not.toHaveBeenCalled();
		}
	);

	it.each(
		(['disconnected form', 'different workspace object'] as const).flatMap((change) =>
			(['network error', 'server error', 'conflict'] as const).map((failure) => ({
				change,
				failure
			}))
		)
	)('does not apply a delayed $failure after $change', async ({ change, failure }) => {
		const { page, persistence, onResult, reportError, submit } = setup();
		const { input, form } = submission();
		const callback = await start(submit, input);
		if (change === 'disconnected form') form.isConnected = false;
		else page.data.workspace = { layout: 'columns-2' };
		const result = response(input);
		result.result =
			failure === 'network error'
				? { type: 'error', status: 500, error: new Error('fetch failed') }
				: {
						type: 'failure',
						status: failure === 'conflict' ? 409 : 503,
						data: {
							saved: false,
							reason: failure === 'conflict' ? 'conflict' : 'unavailable'
						}
					};
		await callback(result);
		expect(onResult).not.toHaveBeenCalled();
		expect(result.update).not.toHaveBeenCalled();
		expect(reportError).not.toHaveBeenCalled();
		// Neither UI nor network serialization may remain locked by an abandoned form.
		const releaseMutation = await persistence.acquireMutation();
		if (failure === 'conflict') persistence.discardConflict();
		const lease = await persistence.acquireWrite();
		lease.release();
		releaseMutation();
	});

	it('cancels a second queued submission whose tab structure changed during the first navigation', async () => {
		const { page, delegate, onResult, reportError, submit } = setup();
		const first = submission();
		const second = submission();
		const firstCallback = await start(submit, first.input);
		const secondPending = submit(second.input);
		const navigationStarted = Promise.withResolvers<void>();
		const navigationReleased = Promise.withResolvers<void>();
		onResult.mockImplementationOnce(async () => {
			navigationStarted.resolve();
			await navigationReleased.promise;
			page.data.workspace = { layout: 'columns-2' };
		});
		const firstResponse = firstCallback(response(first.input));
		await navigationStarted.promise;
		expect(delegate).toHaveBeenCalledOnce();
		expect(second.cancel).not.toHaveBeenCalled();
		navigationReleased.resolve();
		await firstResponse;
		expect(await secondPending).toBeUndefined();
		expect(second.cancel).toHaveBeenCalledOnce();
		expect(delegate).toHaveBeenCalledOnce();
		expect(reportError).toHaveBeenCalledWith(expect.stringContaining('Ansicht'));
	});

	it('releases both queues when the delegate cancels the native request', async () => {
		const { persistence, delegate, submit } = setup();
		const { input, cancel } = submission();
		delegate.mockImplementationOnce(({ cancel }) => cancel());
		expect(await submit(input)).toBeUndefined();
		expect(cancel).toHaveBeenCalledOnce();
		const releaseMutation = await persistence.acquireMutation();
		const lease = await persistence.acquireWrite();
		expect(lease.token?.workspaceContentVersion).toBe(10);
		lease.release();
		releaseMutation();
	});

	it('cancels before sending if the form disconnects while its flush is pending', async () => {
		const { flush, delegate, submit } = setup();
		const { input, form, cancel } = submission();
		const flushStarted = Promise.withResolvers<void>();
		const flushReleased = Promise.withResolvers<void>();
		flush.mockImplementationOnce(async () => {
			flushStarted.resolve();
			await flushReleased.promise;
		});
		const pending = submit(input);
		await flushStarted.promise;
		form.isConnected = false;
		flushReleased.resolve();
		const callback = await pending;
		if (callback) await callback(response(input));
		expect(cancel).toHaveBeenCalledOnce();
		expect(delegate).not.toHaveBeenCalled();
		expect(callback).toBeUndefined();
	});

	it('cancels before sending if the tab structure changes while waiting for the DOM update', async () => {
		const { page, delegate, submit } = setup();
		const { input, cancel } = submission();
		const tickStarted = Promise.withResolvers<void>();
		const tickReleased = Promise.withResolvers<void>();
		vi.mocked(tick).mockImplementationOnce(async () => {
			tickStarted.resolve();
			await tickReleased.promise;
		});
		const pending = submit(input);
		await tickStarted.promise;
		page.data.workspace = { layout: 'columns-2' };
		tickReleased.resolve();
		const callback = await pending;
		if (callback) await callback(response(input));
		expect(cancel).toHaveBeenCalledOnce();
		expect(delegate).not.toHaveBeenCalled();
		expect(callback).toBeUndefined();
	});

	it('cancels before sending if the tab structure changes while another network write finishes', async () => {
		const { page, persistence, delegate, submit } = setup();
		const { input, cancel } = submission();
		const background = await persistence.acquireWrite();
		const acquireWrite = persistence.acquireWrite;
		const writeStarted = Promise.withResolvers<void>();
		vi.spyOn(persistence, 'acquireWrite').mockImplementation((expected) => {
			writeStarted.resolve();
			return acquireWrite(expected);
		});
		const pending = submit(input);
		await writeStarted.promise;
		page.data.workspace = { layout: 'columns-2' };
		background.release();
		const callback = await pending;
		if (callback) await callback(response(input));
		expect(cancel).toHaveBeenCalledOnce();
		expect(delegate).not.toHaveBeenCalled();
		expect(callback).toBeUndefined();
	});
});
