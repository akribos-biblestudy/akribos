import { describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
	createAppEditorBridge,
	isAppEditorSource,
	type AppEditorHandle,
	type AppEditorState
} from './editor-bridge';

function setup() {
	let state: AppEditorState = {
		snapshot: { title: 'Titel', markdown: 'Server\n', revision: 3, status: 'saved' },
		savedSnapshot: { title: 'Titel', markdown: 'Server\n', revision: 3 }
	};
	const calls: string[] = [];
	const editor: AppEditorHandle = {
		appSnapshot: () => structuredClone(state),
		flush: vi.fn(async () => {
			calls.push('flush');
			return true;
		}),
		appRestore: vi.fn((source) => {
			state = { ...state, snapshot: { ...source, status: 'dirty' } };
		}),
		appAcknowledge: vi.fn((source) => {
			state = { snapshot: { ...source, status: 'saved' }, savedSnapshot: source };
		}),
		appBlur: vi.fn(),
		appPause: vi.fn(),
		appCommand: vi.fn(() => true),
		appInsert: vi.fn(() => true)
	};
	const messages: Record<string, unknown>[] = [];
	const bridge = createAppEditorBridge({
		documentId: 'doc',
		userId: 'user',
		instanceId: 'instance',
		editor: () => editor,
		view: async (mode, locked) => {
			calls.push(`${mode}:${locked}`);
		},
		post: (message) => messages.push(message)
	});
	let id = 0;
	const send = (method: string, extra: Record<string, unknown> = {}) =>
		bridge.receive({
			protocol: 1,
			id: String(++id),
			documentId: 'doc',
			userId: 'user',
			instanceId: 'instance',
			method,
			...extra
		});
	return { bridge, send, editor, messages, calls };
}

describe('native editor bridge', () => {
	it('replays the native lifecycle sequences against the actual command processor', async () => {
		const sequences = [
			{
				name: 'navigation',
				requests: [
					{ method: 'initialize' },
					{ method: 'prepareMutation' },
					{ method: 'pause' },
					{ method: 'resume' }
				]
			},
			{
				name: 'read-mode',
				requests: [
					{ method: 'initialize' },
					{ method: 'prepareMutation' },
					{ method: 'setMode', mode: 'read' },
					{ method: 'cancelMutation' }
				]
			},
			{
				name: 'metadata',
				requests: [
					{ method: 'initialize' },
					{ method: 'prepareMutation' },
					{ method: 'finishMutation', revision: 4 }
				]
			},
			{
				name: 'offline-keep',
				requests: [
					{ method: 'initialize' },
					{ method: 'prepareMutation' },
					{ method: 'snapshot' },
					{ method: 'pause' },
					{ method: 'resume' }
				]
			}
		];
		const scenarios = [];
		for (const sequence of sequences) {
			const { bridge, editor, messages, calls } = setup();
			if (sequence.name === 'offline-keep') vi.mocked(editor.flush).mockResolvedValue(false);
			const requests = sequence.requests.map((request, index) => ({
				protocol: 1,
				documentId: 'doc',
				userId: 'user',
				instanceId: 'instance',
				id: String(index + 1),
				...request
			}));
			bridge.ready();
			for (const request of requests) await bridge.receive(request);
			expect(
				messages.filter((message) => message.type === 'response').map((message) => message.ok)
			).toEqual(
				sequence.name === 'offline-keep'
					? [true, false, true, true, true]
					: sequence.requests.map(() => true)
			);
			scenarios.push({ name: sequence.name, requests, messages, viewCalls: calls });
		}
		if (process.env.AKRIBOS_EDITOR_TRANSCRIPT)
			writeFileSync(
				process.env.AKRIBOS_EDITOR_TRANSCRIPT,
				JSON.stringify({ protocol: 1, scenarios }, null, 2)
			);
	});
	it('silently rejects other identities and rejects unknown methods without invoking editor commands', async () => {
		const { send, messages, editor } = setup();
		await send('flush', { userId: 'other' });
		await send('flush', { documentId: 'other' });
		await send('flush', { protocol: 2 });
		await send('flush', { instanceId: 'old-instance' });
		expect(messages).toHaveLength(0);
		await send('eval', { script: 'alert(1)' });
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'unknownMethod' });
		expect(editor.flush).not.toHaveBeenCalled();
	});
	it('starts locked, restores exact old source and revision without saving, and cannot restore after initialize', async () => {
		const { bridge, send, messages, editor } = setup();
		bridge.ready();
		expect(messages[0]).toMatchObject({
			protocol: 1,
			type: 'ready',
			documentId: 'doc',
			userId: 'user'
		});
		await send('flush');
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'locked' });
		const draft = { title: 'Lokal', markdown: 'Original  \r\n', revision: 1 };
		await send('restore', { snapshot: draft });
		expect(messages.at(-1)).toMatchObject({
			snapshot: { ...draft, status: 'dirty' },
			savedSnapshot: { revision: 3 }
		});
		expect(editor.flush).not.toHaveBeenCalled();
		await send('initialize', { mode: 'read' });
		await send('restore', { snapshot: draft });
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'invalidRestore' });
	});
	it('locks before mutation flush and accepts a confirmed revision only while reserved', async () => {
		const { send, messages, calls } = setup();
		await send('initialize');
		await send('prepareMutation');
		expect(calls).toEqual(['edit:false', 'edit:true', 'flush']);
		await send('undo');
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'locked' });
		await send('finishMutation', { revision: 2 });
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'invalidRevision' });
		await send('finishMutation', {
			document: { title: 'Titel', bodyMarkdown: 'Server\n', revision: 4 }
		});
		expect(messages.at(-1)).toMatchObject({ ok: true, snapshot: { revision: 4, status: 'saved' } });
		expect(calls.at(-1)).toBe('edit:false');
		await send('finishMutation', { revision: 5 });
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'notPrepared' });
	});
	it('keeps failed saves navigationally blocked and releases only the metadata input lock', async () => {
		const { send, bridge, editor, messages, calls } = setup();
		vi.mocked(editor.flush).mockResolvedValue(false);
		await send('initialize');
		await send('prepareMutation');
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'saveFailed' });
		expect(calls.at(-1)).toBe('edit:false');
		expect(await bridge.navigate('/Joh3,16')).toBe(false);
		expect(messages.some((message) => message.type === 'navigate')).toBe(false);
	});
	it('read mode and pause reject mutations, while mode/pause/resume never save implicitly', async () => {
		const { send, editor, messages } = setup();
		await send('initialize', { mode: 'read' });
		await send('insert', { kind: 'table' });
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'locked' });
		await send('setMode', { mode: 'edit' });
		await send('pause');
		await send('undo');
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'locked' });
		await send('resume');
		await send('undo');
		expect(messages.at(-1)).toMatchObject({ ok: true });
		expect(editor.appPause).toHaveBeenNthCalledWith(1, true);
		expect(editor.appPause).toHaveBeenNthCalledWith(2, false);
		expect(editor.flush).not.toHaveBeenCalled();
	});

	it('performs the exact native navigation and mode transitions without releasing input early', async () => {
		const { send, calls, messages, editor } = setup();
		await send('initialize');
		await send('prepareMutation');
		await send('pause');
		expect(messages.at(-1)).toMatchObject({ ok: true });
		expect(calls.at(-1)).toBe('edit:true');
		await send('resume');
		expect(calls.at(-1)).toBe('edit:false');
		await send('prepareMutation');
		await send('setMode', { mode: 'read' });
		expect(calls.at(-1)).toBe('read:true');
		await send('cancelMutation');
		expect(calls.at(-1)).toBe('read:false');
		expect(messages.every((message) => message.ok === true)).toBe(true);
		expect(editor.flush).toHaveBeenCalledTimes(2);
	});
	it('permits encrypted draft preservation and pause after a failed prepare, with no retry on resume', async () => {
		const { send, messages, editor } = setup();
		vi.mocked(editor.flush).mockRejectedValueOnce(new Error('offline'));
		await send('initialize');
		await send('prepareMutation');
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'operationFailed' });
		await send('snapshot');
		await send('pause');
		await send('resume');
		expect(messages.slice(-3).every((message) => message.ok === true)).toBe(true);
		expect(editor.flush).toHaveBeenCalledTimes(1);
	});
	it('does not let a failing snapshot poison subsequent command processing', async () => {
		const { send, messages, editor } = setup();
		const snapshot = editor.appSnapshot;
		editor.appSnapshot = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new Error('parse');
			})
			.mockImplementation(snapshot);
		await send('snapshot');
		expect(messages.at(-1)).toMatchObject({ ok: false, error: 'operationFailed' });
		await send('snapshot');
		expect(messages.at(-1)).toMatchObject({ ok: true, snapshot: { revision: 3 } });
	});
	it('bounds restored source and rejects invalid revisions', () => {
		expect(isAppEditorSource({ title: 'A', markdown: '', revision: 1 })).toBe(true);
		expect(isAppEditorSource({ title: 'A', markdown: 'ü'.repeat(524289), revision: 1 })).toBe(
			false
		);
		expect(isAppEditorSource({ title: 'A', markdown: '', revision: -1 })).toBe(false);
	});
});
