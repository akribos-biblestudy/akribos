import { describe, expect, it, vi } from 'vitest';
import {
	createWorkspacePersistence,
	readWorkspacePersistence,
	WorkspaceConflictError,
	WorkspaceSelectionChangedError,
	type WorkspacePersistenceData,
	type WorkspacePersistenceToken
} from './persistence';

function token(overrides: Partial<WorkspacePersistenceToken> = {}): WorkspacePersistenceToken {
	return {
		workspaceId: 'workspace-a',
		workspaceVersion: 2,
		workspaceContentVersion: 10,
		...overrides
	};
}

function serverData(value: WorkspacePersistenceToken): WorkspacePersistenceData {
	return {
		activeSavedWorkspaceId: value.workspaceId,
		activeSavedWorkspaceVersion: value.workspaceVersion,
		activeSavedWorkspaceContentVersion: value.workspaceContentVersion
	};
}

function saved(value: WorkspacePersistenceToken) {
	return { ...serverData(value), saved: true };
}

function setup(initial: WorkspacePersistenceToken | null = token()) {
	let current = initial;
	const acknowledge = vi.fn((value: WorkspacePersistenceToken) => {
		current = { ...value };
	});
	const persistence = createWorkspacePersistence(() => current, acknowledge);
	return {
		persistence,
		acknowledge,
		current: () => current,
		select: (value: WorkspacePersistenceToken | null) => {
			current = value;
		}
	};
}

describe('readWorkspacePersistence', () => {
	it('uses a newer acknowledged content version for the same workspace selection', () => {
		const acknowledged = token({ workspaceContentVersion: 11 });
		const result = readWorkspacePersistence(serverData(token()), acknowledged);
		expect(result).toEqual(acknowledged);
		expect(result).not.toBe(acknowledged);
	});

	it.each([
		token({ workspaceId: 'workspace-b', workspaceContentVersion: 20 }),
		token({ workspaceVersion: 1, workspaceContentVersion: 20 }),
		token({ workspaceVersion: 3, workspaceContentVersion: 20 })
	])('does not restore another selection from an acknowledgement: %j', (acknowledged) => {
		expect(readWorkspacePersistence(serverData(token()), acknowledged)).toEqual(token());
	});

	it.each([9, 10, 0, -1, 10.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'ignores stale or invalid acknowledged content version %s',
		(workspaceContentVersion) => {
			expect(
				readWorkspacePersistence(serverData(token()), token({ workspaceContentVersion }))
			).toEqual(token());
		}
	);

	it.each<WorkspacePersistenceData>([
		{},
		{ ...serverData(token()), activeSavedWorkspaceId: null },
		{ ...serverData(token()), activeSavedWorkspaceVersion: 0 },
		{ ...serverData(token()), activeSavedWorkspaceContentVersion: null }
	])('requires a complete current selection before applying an acknowledgement: %j', (data) => {
		expect(readWorkspacePersistence(data, token({ workspaceContentVersion: 20 }))).toBeNull();
	});
});

describe('workspace write queue', () => {
	it('gives queued writes the latest acknowledgement only when their network lease starts', async () => {
		const { persistence, current, acknowledge } = setup();
		const first = await persistence.acquireWrite();
		const sent: WorkspacePersistenceToken[] = [first.token!];
		const secondPending = persistence.acquireWrite().then((lease) => {
			sent.push(lease.token!);
			return lease;
		});
		const thirdPending = persistence.acquireWrite().then((lease) => {
			sent.push(lease.token!);
			return lease;
		});

		expect(
			persistence.acceptResponse(saved(token({ workspaceContentVersion: 11 })), 200, first)
		).toBe('saved');
		expect(sent).toEqual([token()]);
		first.release();
		const second = await secondPending;
		expect(second.token).toEqual(token({ workspaceContentVersion: 11 }));
		expect(sent).toHaveLength(2);
		persistence.acceptResponse(saved(token({ workspaceContentVersion: 12 })), 200, second);
		second.release();
		const third = await thirdPending;
		expect(third.token).toEqual(token({ workspaceContentVersion: 12 }));
		third.release();
		expect(sent.map((value) => value.workspaceContentVersion)).toEqual([10, 11, 12]);
		expect(current()?.workspaceContentVersion).toBe(12);
		expect(acknowledge).toHaveBeenCalledTimes(2);
	});

	it('rejects queued writes after a selection change and releases their queue position', async () => {
		const { persistence, select } = setup();
		const first = await persistence.acquireWrite();
		const rejected = expect(persistence.acquireWrite()).rejects.toBeInstanceOf(
			WorkspaceSelectionChangedError
		);
		const destination = token({ workspaceId: 'workspace-b', workspaceVersion: 3 });
		select(destination);
		const next = persistence.acquireWrite();
		first.release();
		await rejected;
		const fresh = await next;
		expect(fresh.token).toEqual(destination);
		fresh.release();
	});

	it('blocks queued and future writes after a conflict without adopting the server conflict version', async () => {
		const { persistence, acknowledge, current } = setup();
		const first = await persistence.acquireWrite();
		const queuedRejection = expect(persistence.acquireWrite()).rejects.toBeInstanceOf(
			WorkspaceConflictError
		);
		const conflictResponse = {
			...serverData(token({ workspaceContentVersion: 99 })),
			saved: false,
			reason: 'conflict',
			message: 'In einem anderen Fenster geändert.'
		};
		expect(() => persistence.acceptResponse(conflictResponse, 409, first)).toThrow(
			'In einem anderen Fenster geändert.'
		);
		expect(persistence.currentConflict()).toBeInstanceOf(WorkspaceConflictError);
		expect(acknowledge).not.toHaveBeenCalled();
		expect(current()).toEqual(token());
		first.release();
		await queuedRejection;
		await expect(persistence.acquireWrite()).rejects.toBeInstanceOf(WorkspaceConflictError);
	});

	it('invalidates already queued old jobs when an explicit opening discards a conflict', async () => {
		const { persistence } = setup();
		const first = await persistence.acquireWrite();
		const oldJobs = [persistence.acquireWrite(), persistence.acquireWrite()];
		const rejections = oldJobs.map((job) =>
			expect(job).rejects.toBeInstanceOf(WorkspaceSelectionChangedError)
		);
		expect(() =>
			persistence.acceptResponse({ saved: false, reason: 'conflict' }, 409, first)
		).toThrow(WorkspaceConflictError);
		expect(persistence.discardConflict()).toBe(true);
		expect(persistence.currentConflict()).toBeNull();
		const next = persistence.acquireWrite();
		first.release();
		await Promise.all(rejections);
		const fresh = await next;
		expect(fresh.generation).not.toBe(first.generation);
		expect(fresh.token).toEqual(token());
		fresh.release();
	});

	it('does not discard valid pending writes when no conflict has been identified', async () => {
		const { persistence } = setup();
		const first = await persistence.acquireWrite();
		const next = persistence.acquireWrite();
		expect(persistence.discardConflict()).toBe(false);
		first.release();
		const second = await next;
		expect(second.generation).toBe(first.generation);
		second.release();
	});

	it('lets another selection write after the previous selection conflicted', async () => {
		const { persistence, select } = setup();
		const first = await persistence.acquireWrite();
		expect(() =>
			persistence.acceptResponse({ saved: false, reason: 'conflict' }, 409, first)
		).toThrow(WorkspaceConflictError);
		first.release();
		const reopened = token({ workspaceVersion: 3, workspaceContentVersion: 11 });
		select(reopened);
		const second = await persistence.acquireWrite();
		expect(second.token).toEqual(reopened);
		expect(persistence.currentConflict()).toBeNull();
		second.release();
	});

	it('allows background writes to finish while a UI mutation holds its navigation lock', async () => {
		const { persistence, current } = setup();
		const releaseNavigation = await persistence.acquireMutation();
		let nextMutationStarted = false;
		const nextMutation = persistence.acquireMutation().then((release) => {
			nextMutationStarted = true;
			return release;
		});
		const background = await persistence.acquireWrite();
		expect(
			persistence.acceptResponse(saved(token({ workspaceContentVersion: 11 })), 200, background)
		).toBe('saved');
		background.release();
		expect(current()?.workspaceContentVersion).toBe(11);
		expect(nextMutationStarted).toBe(false);
		releaseNavigation();
		const releaseNext = await nextMutation;
		expect(nextMutationStarted).toBe(true);
		releaseNext();
	});
});

describe('workspace write responses', () => {
	it.each([token({ workspaceId: 'workspace-b' }), token({ workspaceVersion: 3 })])(
		'ignores success and conflict responses from a previous selection: %j',
		async (destination) => {
			const { persistence, acknowledge, select, current } = setup();
			const lease = await persistence.acquireWrite();
			select(destination);
			expect(
				persistence.acceptResponse(saved(token({ workspaceContentVersion: 99 })), 200, lease)
			).toBe('ignored');
			expect(persistence.acceptResponse({ reason: 'conflict' }, 409, lease)).toBe('ignored');
			expect(persistence.currentConflict()).toBeNull();
			expect(acknowledge).not.toHaveBeenCalled();
			expect(current()).toEqual(destination);
			lease.release();
		}
	);

	it('ignores responses from a discarded generation even if their content version is newer', async () => {
		const { persistence, acknowledge, current } = setup();
		const old = await persistence.acquireWrite();
		expect(() =>
			persistence.acceptResponse({ saved: false, reason: 'conflict' }, 409, old)
		).toThrow(WorkspaceConflictError);
		expect(persistence.discardConflict()).toBe(true);
		old.release();
		const fresh = await persistence.acquireWrite();
		persistence.acceptResponse(saved(token({ workspaceContentVersion: 11 })), 200, fresh);
		fresh.release();
		expect(
			persistence.acceptResponse(saved(token({ workspaceContentVersion: 99 })), 200, old)
		).toBe('ignored');
		expect(persistence.acceptResponse({ reason: 'conflict' }, 409, old)).toBe('ignored');
		expect(persistence.currentConflict()).toBeNull();
		expect(current()).toEqual(token({ workspaceContentVersion: 11 }));
		expect(acknowledge).toHaveBeenCalledTimes(1);
	});

	it('does not move the acknowledged content version backwards', async () => {
		const { persistence, acknowledge, current } = setup();
		const lease = await persistence.acquireWrite();
		persistence.acceptResponse(saved(token({ workspaceContentVersion: 12 })), 200, lease);
		expect(
			persistence.acceptResponse(saved(token({ workspaceContentVersion: 11 })), 200, lease)
		).toBe('ignored');
		expect(current()).toEqual(token({ workspaceContentVersion: 12 }));
		expect(acknowledge).toHaveBeenCalledTimes(1);
		lease.release();
	});

	it.each([
		saved(token({ workspaceId: 'workspace-b' })),
		saved(token({ workspaceVersion: 3 })),
		{ saved: true },
		{ saved: false, reason: 'detached' }
	])(
		'ignores incomplete or mismatched response tokens for an authenticated selection: %j',
		async (data) => {
			const { persistence, acknowledge, current } = setup();
			const lease = await persistence.acquireWrite();
			expect(persistence.acceptResponse(data, 200, lease)).toBe('ignored');
			expect(acknowledge).not.toHaveBeenCalled();
			expect(current()).toEqual(token());
			lease.release();
		}
	);

	it('accepts a detached view without reporting a save failure or changing the selection', async () => {
		const { persistence, current } = setup();
		const lease = await persistence.acquireWrite();
		expect(
			persistence.acceptResponse(
				{ ...serverData(token()), saved: false, reason: 'detached' },
				200,
				lease
			)
		).toBe('detached');
		expect(persistence.currentConflict()).toBeNull();
		expect(current()).toEqual(token());
		lease.release();
		const next = await persistence.acquireWrite();
		expect(next.token).toEqual(token());
		next.release();
	});

	it('accepts a detached guest view without requiring an account token', async () => {
		const { persistence, acknowledge } = setup(null);
		const lease = await persistence.acquireWrite();
		expect(persistence.acceptResponse({ saved: false, reason: 'detached' }, 200, lease)).toBe(
			'detached'
		);
		expect(persistence.currentConflict()).toBeNull();
		expect(acknowledge).not.toHaveBeenCalled();
		lease.release();
	});

	it('reports an ordinary server failure without turning it into a persistent conflict', async () => {
		const { persistence, acknowledge } = setup();
		const lease = await persistence.acquireWrite();
		expect(() =>
			persistence.acceptResponse({ message: 'Bitte später erneut versuchen.' }, 503, lease)
		).toThrow('Bitte später erneut versuchen.');
		expect(persistence.currentConflict()).toBeNull();
		expect(acknowledge).not.toHaveBeenCalled();
		lease.release();
		const retry = await persistence.acquireWrite();
		expect(retry.token).toEqual(token());
		retry.release();
	});
});
