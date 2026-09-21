/** Server-confirmed selection and complete snapshot revision; never part of a shared Reader URL. */
export type WorkspacePersistenceToken = {
	workspaceId: string;
	workspaceVersion: number;
	workspaceContentVersion: number;
};

export type WorkspacePersistenceData = {
	activeSavedWorkspaceId?: string | null;
	activeSavedWorkspaceVersion?: number | null;
	activeSavedWorkspaceContentVersion?: number | null;
};

function positiveVersion(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function sameWorkspaceSelection(
	left: WorkspacePersistenceToken | null,
	right: WorkspacePersistenceToken | null
): boolean {
	return left === null || right === null
		? left === right
		: left.workspaceId === right.workspaceId && left.workspaceVersion === right.workspaceVersion;
}

/** A shallow-state acknowledgement cannot reactivate an old selection after navigation/back. */
export function readWorkspacePersistence(
	data: WorkspacePersistenceData,
	override?: WorkspacePersistenceToken
): WorkspacePersistenceToken | null {
	if (
		!data.activeSavedWorkspaceId ||
		!positiveVersion(data.activeSavedWorkspaceVersion) ||
		!positiveVersion(data.activeSavedWorkspaceContentVersion)
	)
		return null;
	const token = {
		workspaceId: data.activeSavedWorkspaceId,
		workspaceVersion: data.activeSavedWorkspaceVersion,
		workspaceContentVersion: data.activeSavedWorkspaceContentVersion
	};
	return override &&
		sameWorkspaceSelection(token, override) &&
		positiveVersion(override.workspaceContentVersion) &&
		override.workspaceContentVersion > token.workspaceContentVersion
		? { ...override }
		: token;
}

export class WorkspaceConflictError extends Error {
	constructor(message = 'Der Arbeitsbereich wurde inzwischen geändert. Bitte öffne ihn erneut.') {
		super(message);
		this.name = 'WorkspaceConflictError';
	}
}

export class WorkspaceSelectionChangedError extends Error {
	constructor() {
		super('Die Ansicht des Arbeitsbereichs hat sich geändert. Bitte wiederhole die Aktion.');
		this.name = 'WorkspaceSelectionChangedError';
	}
}

/** Two independent locks: navigation may flush background writes without waiting on itself. */
function serialLease() {
	let tail = Promise.resolve();
	return async () => {
		const previous = tail;
		let release!: () => void;
		tail = new Promise<void>((resolve) => (release = resolve));
		await previous;
		return release;
	};
}

export type WorkspaceWriteLease = {
	token: WorkspacePersistenceToken | null;
	generation: number;
	release: () => void;
};

export function createWorkspacePersistence(
	read: () => WorkspacePersistenceToken | null,
	acknowledge: (token: WorkspacePersistenceToken) => void
) {
	const acquireMutation = serialLease();
	const acquireNetwork = serialLease();
	let generation = 0;
	let conflict: {
		error: WorkspaceConflictError;
		selection: WorkspacePersistenceToken | null;
	} | null = null;
	function currentConflict(): WorkspaceConflictError | null {
		if (conflict && !sameWorkspaceSelection(conflict.selection, read())) conflict = null;
		return conflict?.error ?? null;
	}
	return {
		read,
		acquireMutation,
		currentConflict,
		/** Explicit opening may abandon only an already identified workspace conflict. */
		discardConflict(): boolean {
			if (!currentConflict()) return false;
			conflict = null;
			generation += 1;
			return true;
		},
		async acquireWrite(expected = read()): Promise<WorkspaceWriteLease> {
			const queuedGeneration = generation;
			const release = await acquireNetwork();
			try {
				if (queuedGeneration !== generation || !sameWorkspaceSelection(expected, read()))
					throw new WorkspaceSelectionChangedError();
				const error = currentConflict();
				if (error) throw error;
				return { token: read(), generation, release };
			} catch (error) {
				release();
				throw error;
			}
		},
		acceptResponse(
			data: unknown,
			status: number,
			lease: WorkspaceWriteLease
		): 'saved' | 'detached' | 'ignored' {
			if (lease.generation !== generation || !sameWorkspaceSelection(lease.token, read()))
				return 'ignored';
			const result = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
			if (status === 409 && result.reason === 'conflict') {
				const error = new WorkspaceConflictError(
					typeof result.message === 'string' ? result.message : undefined
				);
				conflict = { error, selection: lease.token };
				throw error;
			}
			if (status < 200 || status >= 300)
				throw new Error(
					typeof result.message === 'string'
						? result.message
						: 'Änderungen am Arbeitsbereich konnten nicht gespeichert werden.'
				);
			const token = readWorkspacePersistence(result as WorkspacePersistenceData);
			const current = read();
			if (lease.token) {
				if (!token || !sameWorkspaceSelection(token, current)) return 'ignored';
				if (current && token.workspaceContentVersion < current.workspaceContentVersion)
					return 'ignored';
				acknowledge(token);
			}
			return result.saved === false && result.reason === 'detached' ? 'detached' : 'saved';
		}
	};
}

export type WorkspacePersistence = ReturnType<typeof createWorkspacePersistence>;
