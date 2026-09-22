import type { WorkspacePersistenceToken } from './persistence';

const ID_KEY = 'akribos-reader-browser-tab';
const RESUME_KEY = 'akribos-reader-browser-view';
let initialized = false;
let ready = false;
let documentResume: string | null = null;
let browserTabId: string | null = null;
export function markReaderBrowserReady(): void {
	ready = true;
	delete document.documentElement.dataset.readerBootstrapping;
}
let sourceTabId: string | null = null;
let releaseIdentity: (() => void) | undefined;

/** sessionStorage survives reloads; Web Locks separates cloned sessionStorage in duplicated tabs. */
export async function initializeReaderBrowserTab(): Promise<void> {
	if (initialized) return;
	initialized = true;
	document.documentElement.dataset.readerBootstrapping = 'true';
	document.cookie = 'reader-browser-enabled=1; Path=/; SameSite=Lax';
	try {
		browserTabId = sessionStorage.getItem(ID_KEY);
		documentResume = sessionStorage.getItem(RESUME_KEY);
	} catch {
		/* Storage can be disabled. */
	}
	if (
		!browserTabId ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(browserTabId)
	)
		browserTabId = crypto.randomUUID();
	if (navigator.locks) {
		const claim = (id: string) =>
			new Promise<boolean>((resolve) => {
				void navigator.locks
					.request(`reader-tab:${id}`, { ifAvailable: true }, async (lock) => {
						if (!lock) {
							resolve(false);
							return;
						}
						await new Promise<void>((release) => {
							releaseIdentity = release;
							resolve(true);
						});
					})
					.catch(() => resolve(false));
			});
		if (!(await claim(browserTabId))) {
			sourceTabId = browserTabId;
			browserTabId = crypto.randomUUID();
			await claim(browserTabId);
		}
	}
	if (!navigator.locks) {
		sourceTabId = browserTabId;
		browserTabId = crypto.randomUUID();
	}
	try {
		sessionStorage.setItem(ID_KEY, browserTabId);
	} catch {
		/* In-memory isolation still works. */
	}
	window.addEventListener('pagehide', (event) => {
		if (!event.persisted) releaseIdentity?.();
	});
	const original = window.fetch;
	window.fetch = (input, init) => {
		const url = new URL(input instanceof Request ? input.url : input.toString(), location.href);
		if (url.origin !== location.origin) return original(input, init);
		const headers = new Headers(input instanceof Request ? input.headers : undefined);
		new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
		headers.set('x-reader-browser-tab', browserTabId!);
		if (sourceTabId) headers.set('x-reader-browser-source', sourceTabId);
		return original(input, { ...init, headers });
	};
	window.addEventListener('pageshow', (event) => {
		if (!event.persisted) return;
		// A cached document keeps its own lock and fetch closure. A later document in the same browser
		// tab may meanwhile have replaced sessionStorage, so restore only this document's bound view.
		ready = false;
		document.documentElement.dataset.readerBootstrapping = 'true';
		try {
			sessionStorage.setItem(ID_KEY, browserTabId!);
		} catch {
			/* Optional storage. */
		}
		void (async () => {
			const response = await fetch('/api/reader/workspaces');
			const selection = response.ok ? await response.json() : null;
			const resume = documentResume ? JSON.parse(documentResume) : null;
			if (
				!resume ||
				!selection ||
				resume.owner !== selection.ownerId ||
				resume.token.workspaceId !== selection.activeSavedWorkspaceId ||
				resume.token.workspaceVersion !== selection.activeSavedWorkspaceVersion ||
				resume.token.workspaceContentVersion !== selection.activeSavedWorkspaceContentVersion
			) {
				clearBrowserReaderResume();
				window.location.reload();
				return;
			}
			try {
				sessionStorage.setItem(RESUME_KEY, documentResume!);
			} catch {
				/* Optional storage. */
			}
			markReaderBrowserReady();
		})().catch(() => window.location.reload());
	});
}

export function rememberBrowserReaderView(
	owner: string | null,
	url: string,
	token: WorkspacePersistenceToken | null
): void {
	if (!ready || !owner || !token) return;
	try {
		documentResume = JSON.stringify({ owner, url, token });
		sessionStorage.setItem(RESUME_KEY, documentResume);
	} catch {
		/* Optional resume. */
	}
}
export function browserReaderResume(
	owner: string | null
): { url: string; token: WorkspacePersistenceToken } | null {
	try {
		const value = JSON.parse(sessionStorage.getItem(RESUME_KEY) ?? 'null');
		if (
			value?.owner !== owner ||
			typeof value?.url !== 'string' ||
			!value.url.startsWith('/') ||
			value.url.startsWith('//')
		)
			return null;
		return value;
	} catch {
		return null;
	}
}
export function clearBrowserReaderResume(): void {
	documentResume = null;
	try {
		sessionStorage.removeItem(RESUME_KEY);
	} catch {
		/* Optional resume. */
	}
}

/** Flush a synchronous scroll hint after a hard navigation interrupted the debounce. */
export async function restoreBrowserReaderResume(owner: string | null): Promise<string | null> {
	const resume = browserReaderResume(owner);
	if (!resume) return null;
	const url = new URL(resume.url, location.origin);
	const response = await fetch(`/api/reader/workspaces/${resume.token.workspaceId}/view`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			snapshot: { readerState: url.search.slice(1), layoutSizes: {} },
			...resume.token,
			resume: true
		})
	});
	// A replaced/deleted selection must never be reactivated by an old reading hint.
	return response.ok ? resume.url : null;
}
